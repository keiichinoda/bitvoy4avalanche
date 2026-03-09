import { WebSocketServer } from "ws";
import { upsertWallet, upsertWalletEcdsaTss, getWallet, logSign } from "./db.js";
import { P2KeyGen, P2Signature } from "@silencelaboratories/ecdsa-tss";
import { webcrypto } from "crypto";
import dotenv from "dotenv";
dotenv.config();
// HDWallet廃止により、mpcHdのimportは不要（deriveScalarFromPath、deriveP2EcdsaChildKeyShareは使用しない）
// Web Crypto APIを使用可能にする（Node.js 18+ではglobalThis.cryptoも利用可能）
const crypto = globalThis.crypto || webcrypto;
// frost-wasm の初期化（Node.js環境では動的インポートが必要）
let frostWasm = null;
async function initFrostWasm() {
    if (frostWasm)
        return frostWasm;
    try {
        // frost-wasm のパスを環境変数から取得、またはデフォルトパスを使用（Node.js用）
        // Node.js用の frost-wasm は app_wallet/rust/frost-wasm/pkg-node にある
        const frostWasmPath = process.env.FROST_WASM_PATH || "../../../../rust/frost-wasm/pkg-node/frost_wasm.js";
        // Node.js環境では require を使用して CommonJS モジュールとして読み込む
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        const path = await import("path");
        const url = await import("url");
        // 相対パスを絶対パスに変換
        const __filename = url.fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const absolutePath = path.resolve(__dirname, frostWasmPath);
        // CommonJS として読み込む（pkg-node版は読み込み時に即初期化される）
        const frostModule = require(absolutePath);
        frostWasm = frostModule;
        console.log("[P2] frost-wasm initialized successfully");
        return frostWasm;
    }
    catch (error) {
        console.error("[P2] Critical: frost-wasm initialization failed:", error);
        throw error;
    }
}
const wss = new WebSocketServer({ port: Number(process.env.PORT || 9502) });
console.log(`P2 server (FROST - Ed25519 & secp256k1 & ECDSA-TSS) listening on ws://0.0.0.0:${process.env.PORT || 9502}`);
// frost-wasm を初期化
initFrostWasm().catch(err => {
    console.error("[P2] Critical: frost-wasm initialization failed:", err);
    process.exit(1);
});
// WebSocketServer レベルのエラーハンドリング
wss.on("error", (error) => {
    console.error(`[P2] WebSocketServer error:`, error);
});
wss.on("connection", (ws, req) => {
    // sidはLBのスティッキーに使う想定（?sid=...）
    const url = new URL(req.url || "", "http://dummy");
    const sessionId = url.searchParams.get("sid") || crypto.randomUUID();
    const masterId = url.searchParams.get("uid") || "user_demo"; // uidパラメータはmaster_idとして扱う
    const messageHashHex = url.searchParams.get("mh"); // メッセージハッシュ（hex文字列、オプション）
    console.log(`[P2] New connection: sessionId=${sessionId}, masterId=${masterId}, url=${req.url}, messageHash=${messageHashHex ? messageHashHex.substring(0, 20) + '...' : 'not provided'}`);
    let purpose = "ed_keygen";
    ws.once("message", async (raw) => {
        console.log(`[P2] Received first message for sessionId=${sessionId}`);
        // 最初のメッセージからpurposeを取得
        const first = parseMsg(raw);
        console.log(`[P2] Parsed message: kind=${first.kind}, purpose=${first.purpose}, sessionId=${first.sessionId}`);
        if (first.kind !== "P1_TO_P2") {
            console.error(`[P2] Invalid first message: expected P1_TO_P2, got ${first.kind}`);
            ws.close(4400, "invalid first message");
            return;
        }
        purpose = first.purpose;
        if (purpose !== "ed_keygen" && purpose !== "ed_sign" && purpose !== "secp_keygen" && purpose !== "secp_sign" && purpose !== "ecdsa_tss_keygen" && purpose !== "ecdsa_tss_sign") {
            console.error(`[P2] Invalid purpose: ${purpose}`);
            ws.close(4400, `invalid purpose: ${purpose}`);
            return;
        }
        console.log(`[P2] Starting ${purpose} for sessionId=${sessionId}`);
        // frost-wasm が初期化されていることを確認（ECDSA-TSSの場合は不要）
        if (purpose !== "ecdsa_tss_keygen" && purpose !== "ecdsa_tss_sign" && !frostWasm) {
            await initFrostWasm();
        }
        try {
            if (purpose === "ed_keygen") {
                await ed_handleKeygen(ws, sessionId, masterId, first);
            }
            else if (purpose === "ed_sign") {
                await ed_handleSign(ws, sessionId, masterId, messageHashHex, first);
            }
            else if (purpose === "secp_keygen") {
                await secp_handleKeygen(ws, sessionId, masterId, first);
            }
            else if (purpose === "secp_sign") {
                await secp_handleSign(ws, sessionId, masterId, messageHashHex, first);
            }
            else if (purpose === "ecdsa_tss_keygen") {
                await ecdsa_tss_handleKeygen(ws, sessionId, masterId, first);
            }
            else if (purpose === "ecdsa_tss_sign") {
                await ecdsa_tss_handleSign(ws, sessionId, masterId, messageHashHex, first);
            }
        }
        catch (e) {
            console.error(`[P2] session error for sessionId=${sessionId}:`, e?.message || e);
            console.error(`[P2] Error stack:`, e?.stack);
            ws.close(1011, formatCloseReason(e?.message || String(e)));
        }
    });
    ws.on("error", (e) => {
        console.error(`[P2] WebSocket error for sessionId=${sessionId}:`, e);
    });
    ws.on("close", (code, reason) => {
        console.log(`[P2] Connection closed: sessionId=${sessionId}, code=${code}, reason=${reason.toString()}`);
    });
});
function parseMsg(raw) {
    const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : "";
    return JSON.parse(text);
}
function formatCloseReason(message) {
    if (!message)
        return "session error";
    const base = `session error: ${message}`;
    return base.length > 120 ? base.slice(0, 120) : base;
}
// ---- Ed25519 KeyGen（P2は保存する） ----
async function ed_handleKeygen(ws, sessionId, masterId, firstMessage) {
    if (!frostWasm)
        throw new Error("frost-wasm not initialized");
    console.log(`[P2] Starting KeyGen for sessionId=${sessionId}, masterId=${masterId}`);
    // 1) FROST DKG Round 1: P2 が独立してシェアを生成
    const round1Result = JSON.parse(frostWasm.ed_dkg_round1(2, 2, 2));
    const p2Round1Secret = round1Result.secret_package;
    // round1Result.package は JSON 文字列なので、オブジェクトにパースする
    const p2Round1Package = JSON.parse(round1Result.package);
    console.log(`[P2] Generated Round 1 package`);
    // 2) Round1（P1→P2）受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "ed_keygen" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const p1Round1Data = JSON.parse(m1.payload);
    // p1Round1Data.package はオブジェクトまたはJSON文字列の可能性がある
    const p1Round1PackageRaw = p1Round1Data.package;
    const p1Round1Package = typeof p1Round1PackageRaw === "string" ? JSON.parse(p1Round1PackageRaw) : p1Round1PackageRaw;
    console.log(`[P2] P1 Round1 package type: ${typeof p1Round1Package}, keys: ${p1Round1Package ? Object.keys(p1Round1Package).join(', ') : 'null'}`);
    // 3) FROST DKG Round 2: P2 が Round 2 を処理
    // round2Packages は { identifier: package_object } の形式で、package_object はオブジェクト
    const round2Packages = { "0100000000000000000000000000000000000000000000000000000000000000": p1Round1Package };
    console.log(`[P2] Round2 packages prepared: ${Object.keys(round2Packages).length} packages`);
    const round2Result = JSON.parse(frostWasm.ed_dkg_round2(p2Round1Secret, JSON.stringify(round2Packages)));
    const p2Round2Secret = round2Result.secret_package;
    // round2Result.package は JSON 文字列で、{ identifier: package_object } のマップ形式
    const p2Round2Package = JSON.parse(round2Result.package);
    console.log(`[P2] Generated Round 2 package (map with ${Object.keys(p2Round2Package).length} identifiers)`);
    // 4) Round2送信（P2のRound1 package + P2のRound2 package）
    // package はオブジェクトなので、JSON.stringify で文字列化して送信
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "ed_keygen",
        sessionId,
        payload: JSON.stringify({
            round1_package: p2Round1Package,
            round2_package: p2Round2Package
        })
    }));
    // 5) Round3（P1→P2）受信
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "ed_keygen" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    const p1Round2Data = JSON.parse(m3.payload);
    const p1Round2PackageRaw = p1Round2Data.package;
    // p1Round2PackageRaw は { identifier: package_object } のマップ形式
    const p1Round2PackageMap = typeof p1Round2PackageRaw === "string" ? JSON.parse(p1Round2PackageRaw) : p1Round2PackageRaw;
    // P2のIDでP1のRound2パッケージを取得
    const p2Id = "0200000000000000000000000000000000000000000000000000000000000000";
    const p1Round2PackageForP2 = p1Round2PackageMap[p2Id];
    if (!p1Round2PackageForP2) {
        throw new Error(`P1 Round2 package for P2 (${p2Id}) not found in package map`);
    }
    console.log(`[P2] Extracted P1 Round2 package for P2 from package map`);
    // 6) FROST DKG Round 3: P2 が Round 3 を処理
    // round1PackagesForRound3 は自分以外のPartyのRound 1 packageのみ（{ identifier: package_object } の形式）
    const round1PackagesForRound3 = {
        "0100000000000000000000000000000000000000000000000000000000000000": p1Round1Package
    };
    // round2PackagesForRound3 は自分宛てのRound 2 packageのみ（{ sender_identifier: package_object } の形式）
    // P1から受信したRound 2 packageで、P2宛てのもの
    const p1Id = "0100000000000000000000000000000000000000000000000000000000000000";
    const round2PackagesForRound3 = {
        [p1Id]: p1Round2PackageForP2
    };
    const round3Result = JSON.parse(frostWasm.ed_dkg_round3(p2Round2Secret, JSON.stringify(round1PackagesForRound3), JSON.stringify(round2PackagesForRound3)));
    console.log(`[P2] Generated Round 3 result`);
    // 7) key_package と public_key_package を DB 保存
    const keyPackage = round3Result.key_package;
    const publicKeyPackage = round3Result.public_key_package;
    const publicKey = publicKeyPackage.verifying_key || "";
    if (!keyPackage || !publicKeyPackage)
        throw new Error("key_package or public_key_package missing");
    console.log(`[P2] Saving key_package to database for masterId=${masterId}`);
    await upsertWallet(masterId, publicKey, keyPackage, publicKeyPackage, 'ed25519');
    console.log(`[P2] KeyGen completed successfully for sessionId=${sessionId}`);
    // 8) Round3送信（P2のRound1 package + P2のRound2 package）
    // P2のRound2 packageはマップ形式なので、そのまま送信
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "ed_keygen",
        sessionId,
        payload: JSON.stringify({
            round1_package: p2Round1Package,
            round2_package: p2Round2Package
        })
    }));
    ws.close(1000, "keygen done");
}
// ---- Ed25519 Sign（P2は保存済みkeyPackageを読み出す） ----
async function ed_handleSign(ws, sessionId, masterId, messageHashHex, firstMessage) {
    if (!frostWasm)
        throw new Error("frost-wasm not initialized");
    console.log(`[P2] Starting Ed25519 Sign for sessionId=${sessionId}, masterId=${masterId}`);
    // 1) DBからkeyPackage と publicKeyPackage を取得
    console.log(`[P2] Retrieving wallet from database for masterId=${masterId}`);
    const wallet = await getWallet(masterId, 'ed25519');
    if (!wallet)
        throw new Error(`wallet not found for masterId: ${masterId}`);
    console.log(`[P2] Wallet found: publicKey=${wallet.public_key.substring(0, 20)}...`);
    // keyPackageとpublicKeyPackageが文字列の場合はパースする
    let keyPackage = wallet.key_package;
    let publicKeyPackage = wallet.public_key_package;
    if (typeof keyPackage === "string") {
        keyPackage = JSON.parse(keyPackage);
    }
    if (typeof publicKeyPackage === "string") {
        publicKeyPackage = JSON.parse(publicKeyPackage);
    }
    // 2) メッセージハッシュを取得（クエリパラメータから、またはデフォルトで空のハッシュ）
    let messageHash;
    if (messageHashHex) {
        const hex = messageHashHex.replace(/^0x/, '');
        if (hex.length !== 64) {
            throw new Error(`Invalid message hash length: expected 64 hex chars (32 bytes), got ${hex.length}`);
        }
        messageHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            messageHash[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        console.log(`[P2] Using provided message hash: ${messageHashHex.substring(0, 20)}...`);
    }
    else {
        messageHash = new Uint8Array(32);
        console.warn(`[P2] Warning: No message hash provided, using empty hash (this may cause signature verification to fail)`);
    }
    await logSign(sessionId, masterId, messageHash, 'ed25519');
    // 3) Round1（P1→P2）を受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        console.log(`[P2] Waiting for P1 Round1 message`);
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "ed_sign" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const p1RoundData = JSON.parse(m1.payload);
    // p1Commitmentsが文字列の場合はパースする
    const p1CommitmentsRaw = p1RoundData.commitments;
    const p1Commitments = typeof p1CommitmentsRaw === "string" ? JSON.parse(p1CommitmentsRaw) : p1CommitmentsRaw;
    // 4) FROST Sign Round 1: P2 が nonce と commitment を生成
    // keyPackageは既にオブジェクトなので、JSON.stringifyする
    const round1Result = JSON.parse(frostWasm.ed_round1_commit(JSON.stringify(keyPackage)));
    const p2Nonces = round1Result.nonces;
    // commitmentsが文字列の場合はパースする
    const p2CommitmentsRaw = round1Result.commitments;
    const p2Commitments = typeof p2CommitmentsRaw === "string" ? JSON.parse(p2CommitmentsRaw) : p2CommitmentsRaw;
    console.log(`[P2] Generated Round 1 commitments`);
    // 5) Round2送信（P2のcommitments）
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "ed_sign",
        sessionId,
        payload: JSON.stringify({ round: 1, commitments: p2Commitments })
    }));
    console.log(`[P2] Sent Round2 message (P2 commitments)`);
    // 6) 署名パッケージを構築
    const messageHex = Array.from(messageHash).map(b => b.toString(16).padStart(2, '0')).join('');
    const messageBytes = new Uint8Array(messageHex.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []);
    const allCommitments = {
        "0100000000000000000000000000000000000000000000000000000000000000": p1Commitments,
        "0200000000000000000000000000000000000000000000000000000000000000": p2Commitments
    };
    const signingPackage = JSON.parse(frostWasm.ed_build_signing_package(messageBytes, JSON.stringify(allCommitments)));
    // 7) Round3（P1→P2）を受信（P1の署名シェア）
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "ed_sign" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    const p1Round3Data = JSON.parse(m3.payload);
    const p1SignatureShare = p1Round3Data.signature_share;
    // 8) FROST Sign Round 2: P2 が署名シェアを生成
    // keyPackageが文字列の場合はそのまま、オブジェクトの場合はJSON.stringifyする
    const keyPackageStrForSign = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
    // noncesが文字列の場合はそのまま、オブジェクトの場合はJSON.stringifyする
    const noncesStr = typeof p2Nonces === "string" ? p2Nonces : JSON.stringify(p2Nonces);
    const round2Result = JSON.parse(frostWasm.ed_round2_sign(keyPackageStrForSign, noncesStr, JSON.stringify(signingPackage)));
    // round2Resultは{signature_share: "..."}の形式で、signature_shareフィールドの中身が文字列化されたSignatureShare
    const p2SignatureShare = typeof round2Result.signature_share === "string"
        ? JSON.parse(round2Result.signature_share)
        : round2Result.signature_share;
    console.log(`[P2] Generated signature share`);
    // 9) Round3送信（P2の署名シェア）
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "ed_sign",
        sessionId,
        payload: JSON.stringify({ round: 2, signature_share: p2SignatureShare })
    }));
    console.log(`[P2] Sign completed successfully for sessionId=${sessionId}`);
    ws.close(1000, "sign done");
}
// ---- secp256k1 KeyGen（P2は保存する） ----
async function secp_handleKeygen(ws, sessionId, masterId, firstMessage) {
    if (!frostWasm)
        throw new Error("frost-wasm not initialized");
    console.log(`[P2] Starting secp256k1 KeyGen for sessionId=${sessionId}, masterId=${masterId}`);
    // 1) FROST DKG Round 1: P2 が独立してシェアを生成
    const round1Result = JSON.parse(frostWasm.secp_dkg_round1(2, 2, 2));
    const p2Round1Secret = round1Result.secret_package;
    // round1Result.package は JSON 文字列なので、オブジェクトにパースする
    const p2Round1Package = JSON.parse(round1Result.package);
    console.log(`[P2] Generated Round 1 package`);
    // 2) Round1（P1→P2）受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "secp_keygen" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const p1Round1Data = JSON.parse(m1.payload);
    // p1Round1Data.package はオブジェクトまたはJSON文字列の可能性がある
    const p1Round1PackageRaw = p1Round1Data.package;
    const p1Round1Package = typeof p1Round1PackageRaw === "string" ? JSON.parse(p1Round1PackageRaw) : p1Round1PackageRaw;
    console.log(`[P2] P1 Round1 package type: ${typeof p1Round1Package}, keys: ${p1Round1Package ? Object.keys(p1Round1Package).join(', ') : 'null'}`);
    // 3) FROST DKG Round 2: P2 が Round 2 を処理
    // round2Packages は { identifier: package_object } の形式で、package_object はオブジェクト
    const round2Packages = { "0000000000000000000000000000000000000000000000000000000000000001": p1Round1Package };
    console.log(`[P2] Round2 packages prepared: ${Object.keys(round2Packages).length} packages`);
    const round2Result = JSON.parse(frostWasm.secp_dkg_round2(p2Round1Secret, JSON.stringify(round2Packages)));
    const p2Round2Secret = round2Result.secret_package;
    // round2Result.package は JSON 文字列で、{ identifier: package_object } のマップ形式
    const p2Round2Package = JSON.parse(round2Result.package);
    console.log(`[P2] Generated Round 2 package (map with ${Object.keys(p2Round2Package).length} identifiers)`);
    // 4) Round2送信（P2のRound1 package + P2のRound2 package）
    // package はオブジェクトなので、JSON.stringify で文字列化して送信
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "secp_keygen",
        sessionId,
        payload: JSON.stringify({
            round1_package: p2Round1Package,
            round2_package: p2Round2Package
        })
    }));
    // 5) Round3（P1→P2）受信
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "secp_keygen" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    const p1Round2Data = JSON.parse(m3.payload);
    const p1Round2PackageRaw = p1Round2Data.package;
    // p1Round2PackageRaw は { identifier: package_object } のマップ形式
    const p1Round2PackageMap = typeof p1Round2PackageRaw === "string" ? JSON.parse(p1Round2PackageRaw) : p1Round2PackageRaw;
    // P2のIDでP1のRound2パッケージを取得
    const p2Id = "0000000000000000000000000000000000000000000000000000000000000002";
    const p1Round2PackageForP2 = p1Round2PackageMap[p2Id];
    if (!p1Round2PackageForP2) {
        throw new Error(`P1 Round2 package for P2 (${p2Id}) not found in package map`);
    }
    console.log(`[P2] Extracted P1 Round2 package for P2 from package map`);
    // 6) FROST DKG Round 3: P2 が Round 3 を処理
    // round1PackagesForRound3 は自分以外のPartyのRound 1 packageのみ（{ identifier: package_object } の形式）
    const round1PackagesForRound3 = {
        "0000000000000000000000000000000000000000000000000000000000000001": p1Round1Package
    };
    // round2PackagesForRound3 は自分宛てのRound 2 packageのみ（{ sender_identifier: package_object } の形式）
    // P1から受信したRound 2 packageで、P2宛てのもの
    const p1Id = "0000000000000000000000000000000000000000000000000000000000000001";
    const round2PackagesForRound3 = {
        [p1Id]: p1Round2PackageForP2
    };
    const round3Result = JSON.parse(frostWasm.secp_dkg_round3(p2Round2Secret, JSON.stringify(round1PackagesForRound3), JSON.stringify(round2PackagesForRound3)));
    console.log(`[P2] Generated Round 3 result`);
    // 7) key_package と public_key_package を DB 保存
    const keyPackage = round3Result.key_package;
    const publicKeyPackage = round3Result.public_key_package;
    const publicKey = publicKeyPackage.verifying_key || "";
    if (!keyPackage || !publicKeyPackage)
        throw new Error("key_package or public_key_package missing");
    console.log(`[P2] Saving key_package to database for masterId=${masterId}`);
    await upsertWallet(masterId, publicKey, keyPackage, publicKeyPackage, 'secp256k1');
    console.log(`[P2] KeyGen completed successfully for sessionId=${sessionId}`);
    // 8) Round3送信（P2のRound1 package + P2のRound2 package）
    // P2のRound2 packageはマップ形式なので、そのまま送信
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "secp_keygen",
        sessionId,
        payload: JSON.stringify({
            round1_package: p2Round1Package,
            round2_package: p2Round2Package
        })
    }));
    ws.close(1000, "keygen done");
}
// ---- secp256k1 Sign（P2は保存済みkeyPackageを読み出す） ----
async function secp_handleSign(ws, sessionId, masterId, messageHashHex, firstMessage) {
    if (!frostWasm)
        throw new Error("frost-wasm not initialized");
    console.log(`[P2] Starting secp256k1 Sign for sessionId=${sessionId}, masterId=${masterId}`);
    // 1) DBからkeyPackage と publicKeyPackage を取得
    console.log(`[P2] Retrieving wallet from database for masterId=${masterId}`);
    const wallet = await getWallet(masterId, 'secp256k1');
    if (!wallet)
        throw new Error(`wallet not found for masterId: ${masterId}`);
    console.log(`[P2] Wallet found: publicKey=${wallet.public_key.substring(0, 20)}...`);
    // keyPackageとpublicKeyPackageが文字列の場合はパースする
    let keyPackage = wallet.key_package;
    let publicKeyPackage = wallet.public_key_package;
    if (typeof keyPackage === "string") {
        keyPackage = JSON.parse(keyPackage);
    }
    if (typeof publicKeyPackage === "string") {
        publicKeyPackage = JSON.parse(publicKeyPackage);
    }
    // 2) メッセージハッシュを取得（クエリパラメータから、またはデフォルトで空のハッシュ）
    let messageHash;
    if (messageHashHex) {
        const hex = messageHashHex.replace(/^0x/, '');
        if (hex.length !== 64) {
            throw new Error(`Invalid message hash length: expected 64 hex chars (32 bytes), got ${hex.length}`);
        }
        messageHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            messageHash[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        console.log(`[P2] Using provided message hash: ${messageHashHex.substring(0, 20)}...`);
    }
    else {
        messageHash = new Uint8Array(32);
        console.warn(`[P2] Warning: No message hash provided, using empty hash (this may cause signature verification to fail)`);
    }
    await logSign(sessionId, masterId, messageHash, 'secp256k1');
    // 3) Round1（P1→P2）を受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        console.log(`[P2] Waiting for P1 Round1 message`);
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "secp_sign" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const p1RoundData = JSON.parse(m1.payload);
    // p1Commitmentsが文字列の場合はパースする
    const p1CommitmentsRaw = p1RoundData.commitments;
    const p1Commitments = typeof p1CommitmentsRaw === "string" ? JSON.parse(p1CommitmentsRaw) : p1CommitmentsRaw;
    // 4) FROST Sign Round 1: P2 が nonce と commitment を生成
    // keyPackageは既にオブジェクトなので、JSON.stringifyする
    const round1Result = JSON.parse(frostWasm.secp_round1_commit(JSON.stringify(keyPackage)));
    const p2Nonces = round1Result.nonces;
    // commitmentsが文字列の場合はパースする
    const p2CommitmentsRaw = round1Result.commitments;
    const p2Commitments = typeof p2CommitmentsRaw === "string" ? JSON.parse(p2CommitmentsRaw) : p2CommitmentsRaw;
    console.log(`[P2] Generated Round 1 commitments`);
    // 5) Round2送信（P2のcommitments）
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "secp_sign",
        sessionId,
        payload: JSON.stringify({ round: 1, commitments: p2Commitments })
    }));
    console.log(`[P2] Sent Round2 message (P2 commitments)`);
    // 6) 署名パッケージを構築
    const messageHex = Array.from(messageHash).map(b => b.toString(16).padStart(2, '0')).join('');
    const messageBytes = new Uint8Array(messageHex.match(/.{2}/g)?.map(x => parseInt(x, 16)) || []);
    const allCommitments = {
        "0000000000000000000000000000000000000000000000000000000000000001": p1Commitments,
        "0000000000000000000000000000000000000000000000000000000000000002": p2Commitments
    };
    const signingPackage = JSON.parse(frostWasm.secp_build_signing_package(messageBytes, JSON.stringify(allCommitments)));
    // 7) Round3（P1→P2）を受信（P1の署名シェア）
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "secp_sign" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    const p1Round3Data = JSON.parse(m3.payload);
    const p1SignatureShare = p1Round3Data.signature_share;
    // 8) FROST Sign Round 2: P2 が署名シェアを生成
    // keyPackageが文字列の場合はそのまま、オブジェクトの場合はJSON.stringifyする
    const keyPackageStrForSign = typeof keyPackage === "string" ? keyPackage : JSON.stringify(keyPackage);
    // noncesが文字列の場合はそのまま、オブジェクトの場合はJSON.stringifyする
    const noncesStr = typeof p2Nonces === "string" ? p2Nonces : JSON.stringify(p2Nonces);
    const round2Result = JSON.parse(frostWasm.secp_round2_sign(keyPackageStrForSign, noncesStr, JSON.stringify(signingPackage)));
    // round2Resultは{signature_share: "..."}の形式で、signature_shareフィールドの中身が文字列化されたSignatureShare
    const p2SignatureShare = typeof round2Result.signature_share === "string"
        ? JSON.parse(round2Result.signature_share)
        : round2Result.signature_share;
    console.log(`[P2] Generated signature share`);
    // 9) Round3送信（P2の署名シェア）
    ws.send(JSON.stringify({
        kind: "P2_TO_P1",
        purpose: "secp_sign",
        sessionId,
        payload: JSON.stringify({ round: 2, signature_share: p2SignatureShare })
    }));
    console.log(`[P2] Sign completed successfully for sessionId=${sessionId}`);
    ws.close(1000, "sign done");
}
// ---- ECDSA-TSS KeyGen（P2は保存する） ----
async function ecdsa_tss_handleKeygen(ws, sessionId, masterId, firstMessage) {
    console.log(`[P2] Starting ECDSA-TSS KeyGen for sessionId=${sessionId}, masterId=${masterId}`);
    // Round1（P1→P2）受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "ecdsa_tss_keygen" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const msg1 = m1.payload;
    // P2KeyGen を初期化し、Round1を処理→Round2送信
    console.log(`[P2] Initializing P2KeyGen for sessionId=${sessionId}`);
    const p2 = new P2KeyGen(sessionId, crypto.getRandomValues(new Uint8Array(32)));
    console.log(`[P2] Processing Round1 message`);
    const r2 = await p2.processMessage(msg1);
    console.log(`[P2] Sending Round2 message`);
    ws.send(JSON.stringify({ kind: "P2_TO_P1", purpose: "ecdsa_tss_keygen", sessionId, payload: r2.msg_to_send }));
    // Round3（P1→P2）受信 → 完了
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "ecdsa_tss_keygen" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    console.log(`[P2] Processing Round3 message`);
    const r4 = await p2.processMessage(m3.payload);
    // p2_key_share と public_key を DB 保存
    const p2KeyShare = r4.p2_key_share;
    if (!p2KeyShare?.public_key)
        throw new Error("p2_key_share missing");
    console.log(`[P2] Saving p2_key_share to database for masterId=${masterId}`);
    await upsertWalletEcdsaTss(masterId, p2KeyShare.public_key, p2KeyShare);
    console.log(`[P2] KeyGen completed successfully for sessionId=${sessionId}`);
    ws.close(1000, "keygen done");
}
// ---- ECDSA-TSS Sign（P2は保存済みkeyshareを読み出す） ----
async function ecdsa_tss_handleSign(ws, sessionId, masterId, messageHashHex, firstMessage) {
    console.log(`[P2] Starting ECDSA-TSS Sign for sessionId=${sessionId}, masterId=${masterId}`);
    // Round1（P1→P2）を受信（最初のメッセージが既に受信済みの場合はそれを使用）
    let m1;
    if (firstMessage) {
        m1 = firstMessage;
        console.log(`[P2] Using first message as Round1: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    else {
        console.log(`[P2] Waiting for P1 Round1 message`);
        m1 = await waitOne(ws);
        console.log(`[P2] Received Round1 message: purpose=${m1.purpose}, kind=${m1.kind}`);
    }
    if (m1.purpose !== "ecdsa_tss_sign" || m1.kind !== "P1_TO_P2")
        throw new Error("invalid round1");
    const msg1 = m1.payload;
    // HDWallet廃止により、pathパラメータは不要
    console.log(`[P2] HDWallet removed - using master key share directly`);
    // DBからP2 keyshare を取得（master 用）
    console.log(`[P2] Retrieving wallet from database for masterId=${masterId}`);
    const wallet = await getWallet(masterId, 'ecdsa_tss');
    if (!wallet)
        throw new Error(`wallet not found for masterId: ${masterId}`);
    console.log(`[P2] Wallet found: publicKey=${wallet.public_key.substring(0, 20)}...`);
    // メッセージハッシュを取得（クエリパラメータから、またはデフォルトで空のハッシュ）
    let messageHash;
    if (messageHashHex) {
        const hex = messageHashHex.replace(/^0x/, '');
        if (hex.length !== 64) {
            throw new Error(`Invalid message hash length: expected 64 hex chars (32 bytes), got ${hex.length}`);
        }
        messageHash = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            messageHash[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        console.log(`[P2] Using provided message hash: ${messageHashHex.substring(0, 20)}...`);
    }
    else {
        messageHash = new Uint8Array(32);
        console.warn(`[P2] Warning: No message hash provided, using empty hash (this may cause signature verification to fail)`);
    }
    await logSign(sessionId, masterId, messageHash, 'ecdsa_tss');
    // HDWallet廃止により、マスターシェアを直接使用（HD派生処理を削除）
    const p2MasterShare = wallet.p2_keyshare;
    // P2Signature 初期化 → Round1処理 → Round2送信
    console.log(`[P2] Initializing P2Signature for sessionId=${sessionId}`);
    const p2 = new P2Signature(sessionId, messageHash, p2MasterShare);
    console.log(`[P2] Processing Round1 message`);
    const r2 = await p2.processMessage(msg1);
    console.log(`[P2] Sending Round2 message`);
    ws.send(JSON.stringify({ kind: "P2_TO_P1", purpose: "ecdsa_tss_sign", sessionId, payload: r2.msg_to_send }));
    // Round3（P1→P2）受信 → Round4送信（SignMessage4）
    console.log(`[P2] Waiting for Round3 message`);
    const m3 = await waitOne(ws);
    console.log(`[P2] Received Round3 message: purpose=${m3.purpose}, kind=${m3.kind}`);
    if (m3.purpose !== "ecdsa_tss_sign" || m3.kind !== "P1_TO_P2")
        throw new Error("invalid round3");
    console.log(`[P2] Processing Round3 message`);
    const r4 = await p2.processMessage(m3.payload);
    console.log(`[P2] Round3 processed: hasMsgToSend=${!!r4.msg_to_send}, hasSignature=${!!r4.signature}`);
    // Round4: P2 → P1 (SignMessage4を送信)
    if (r4.msg_to_send) {
        console.log(`[P2] Sending Round4 message (SignMessage4)`);
        ws.send(JSON.stringify({ kind: "P2_TO_P1", purpose: "ecdsa_tss_sign", sessionId, payload: r4.msg_to_send }));
    }
    else {
        console.warn(`[P2] Warning: Round4 message (msg_to_send) is null`);
    }
    console.log(`[P2] Sign completed successfully for sessionId=${sessionId}`);
    ws.close(1000, "sign done");
}
function waitOne(ws, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const to = setTimeout(() => { cleanup(); reject(new Error("receive timeout")); }, timeoutMs);
        const onMsg = (raw) => { cleanup(); resolve(parseMsg(raw)); };
        const onErr = (e) => { cleanup(); reject(e); };
        const cleanup = () => {
            clearTimeout(to);
            ws.off("message", onMsg);
            ws.off("error", onErr);
        };
        ws.once("message", onMsg);
        ws.once("error", onErr);
    });
}
