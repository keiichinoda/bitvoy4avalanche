/**
 * MPC Endpoints - BitVoy Server
 * 
 * 分散鍵生成、署名、緊急復旧のためのREST APIエンドポイント
 */

const MPCServer = require('./mpc-server');
// グローバルインスタンスを使用
const mpcServer = global.mpcServer;
const { executeQuery, executeTransaction } = require('./utils/db-utils');

// MPC Serverの初期化
let isInitialized = false;

/**
 * サーバーの公開鍵パッケージを取得する関数
 */
async function getServerPublicKeyPackage(masterId, curve) {
    try {
        // データベースからサーバーの最新のpublic_key_packageを取得
        const query = `
            SELECT public_key_package 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        
        if (rows.length === 0) {
            console.log(`[Server] No public key package found for ${masterId} (${curve})`);
            return null;
        }
        
        const publicKeyPackage = rows[0].public_key_package;
        console.log(`[Server] Retrieved public key package for ${masterId} (${curve}): ${publicKeyPackage ? 'present' : 'null'}`);
        return publicKeyPackage;
    } catch (error) {
        console.error(`[Server] Error retrieving public key package for ${masterId} (${curve}):`, error);
        return null;
    }
}

/**
 * サーバーの既存署名キーを取得する関数
 */
async function getServerSigningKey(masterId, curve) {
    try {
        // データベースからサーバーの最新のkey_packageを取得
        const query = `
            SELECT key_package 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        
        if (rows.length === 0) {
            console.log(`[Server] No key package found for ${masterId} (${curve})`);
            return null;
        }
        
        const keyPackage = rows[0].key_package;
        if (!keyPackage || !keyPackage.signing_share) {
            console.log(`[Server] No signing share in key package for ${masterId} (${curve})`);
            return null;
        }
        
        // signing_shareから署名キーを取得
        const signingKey = keyPackage.signing_share;
        console.log(`[Server] Retrieved signing key for ${masterId} (${curve}): ${signingKey ? 'present' : 'null'}`);
        return signingKey;
    } catch (error) {
        console.error(`[Server] Error retrieving signing key for ${masterId} (${curve}):`, error);
        return null;
    }
}

/**
 * FROST IDを正規化する関数
 */
function normalizeFrostId(curve, partyId) {
    const asString = String(partyId);
    if (typeof asString === 'string' && asString.length === 64 && /^[0-9a-fA-F]+$/.test(asString)) {
        return asString;
    }
    const ed = {
        '1': '0100000000000000000000000000000000000000000000000000000000000000',
        '2': '0200000000000000000000000000000000000000000000000000000000000000',
        '3': '0300000000000000000000000000000000000000000000000000000000000000'
    };
    const secp = {
        '1': '0000000000000000000000000000000000000000000000000000000000000001',
        '2': '0000000000000000000000000000000000000000000000000000000000000002',
        '3': '0000000000000000000000000000000000000000000000000000000000000003'
    };
    return (curve === 'ed25519' ? ed[asString] : secp[asString]) || (curve === 'ed25519' ? ed['2'] : secp['2']);
}

async function initializeMPC() {
    if (!isInitialized) {
        await mpcServer.initialize();
        isInitialized = true;
        console.log('MPC Server initialized');
    }
}


/**
 * 分散鍵生成 Round 2 エンドポイント
 */
async function handleDkgRound2(req, res) {
    try {
        
        const { partyId, sessionId, round2Data, allPackages } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        console.log(`Received DKG Round 2 from party ${partyId}`);
        
        // allPackagesからSECP256k1とED25519のパッケージを個別に取得
        const secpPackages = allPackages.secp256k1 || allPackages;
        const edPackages = allPackages.ed25519 || allPackages;
        
        // 自分のRound 2を実行（セッション依存）
        const serverRound2Batch = await mpcServer.dkgRound2Batch(
            sessionId,
            secpPackages,
            edPackages
        );
        
        // Guardian Nodeに中継する際に、SECP256k1とED25519の両方のRound 2結果を含める
        const guardianRound2 = await mpcServer.relayToGuardian('/mpc/dkg/batch/round2', {
            partyId: mpcServer.partyId,
            round2Data: {
                secp256k1: serverRound2Batch.secpPackage,
                ed25519: serverRound2Batch.edPackage
            },
            allPackages: {
                secp256k1: secpPackages,  // SECP256k1のパッケージ
                ed25519: edPackages       // ED25519のパッケージ
            }
        });
        
        res.json({
            success: true,
            package: {
                secp256k1: serverRound2Batch.secpPackage,
                ed25519: serverRound2Batch.edPackage
            },
            guardianPackage: guardianRound2.package
        });
        
    } catch (error) {
        console.error('DKG Round 2 endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}


// Removed: handleSignRound1 (unused)

// Removed: handleSignRound2 (unused)

/**
 * 緊急復旧エンドポイント
 */
async function handleEmergencyRecovery(req, res) {
    try {
        
        const { otherKeyPackages } = req.body;
        console.log('Received emergency recovery request');
        
        // 緊急復旧を実行
        const secretHex = await mpcServer.emergencyRecovery(otherKeyPackages);
        
        res.json({
            success: true,
            secretHex: secretHex
        });
        
    } catch (error) {
        console.error('Emergency recovery endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 状態取得エンドポイント
 */
async function handleGetState(req, res) {
    try {
        
        const dkgState = mpcServer.getDkgState();
        const signingState = mpcServer.getSigningState();
        
        res.json({
            success: true,
            dkgState: dkgState,
            signingState: signingState,
            hasKeyPackage: !!mpcServer.getKeyPackage()
        });
        
    } catch (error) {
        console.error('Get state endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// DB保存・集約用関数（PostgreSQL Poolインスタンスdbが必要）
async function saveDkgPackageToDB(db, masterId, round, frostId, packageObj) {
    await db.query(
        `INSERT INTO dkg_packages (master_id, round, frost_id, package_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE package_json = VALUES(package_json)`,
        [masterId, round, frostId, JSON.stringify(packageObj)]
    );
}
async function getAllDkgPackagesFromDB(db, masterId, round) {
    const [result] = await db.query(
        `SELECT frost_id, package_json FROM dkg_packages WHERE master_id = ? AND round = ?`,
        [masterId, round]
    );
    const rows = result || [];
    const allPackages = {};
    for (const row of rows) {
        allPackages[row.frost_id] = row.package_json;
    }
    return allPackages;
}

let db = null;
function setDB(pool) { db = pool; }

// バッチAPI共通化
async function handleDkgRoundBatch(req, res) {
    try {
        const { masterId, frostId, round, secpPackage, edPackage } = req.body;
        // DB Poolインスタンスはグローバルまたはapp/dbから取得
        if (secpPackage) await saveDkgPackageToDB(db, masterId, round, frostId, JSON.parse(secpPackage));
        // edPackageも同様に保存可能
        const allPackages = await getAllDkgPackagesFromDB(db, masterId, round);
        res.json({
            success: true,
            secpPackage: JSON.stringify(allPackages)
        });
    } catch (error) {
        console.error('handleDkgRoundBatch error:', error, 'req.body:', req.body);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * バッチ分散鍵生成 Round 1 エンドポイント（セッション対応）
 */
async function handleDkgBatchRound1(req, res) {
    try {
        console.log('[Server] /dkg/batch/round1 リクエスト', req.body);
        const { participant_id, threshold, max_signers, masterId } = req.body;

        // セッション作成（sessionId/curveTypeは不要）: 初期json_contentを外側で構成
        const initialJsonContent = {
            secp256k1: {
                keyPackage: null,
                publicKeyPackage: null,
                dkgState: { round1: null, round2: null, round3: null },
                signingState: { round1: null, round2: null }
            },
            ed25519: {
                keyPackage: null,
                publicKeyPackage: null,
                dkgState: { round1: null, round2: null, round3: null },
                signingState: { round1: null, round2: null }
            }
        };
        const currentSessionId = await mpcServer.createSession(masterId, null, initialJsonContent);

        // SECP256k1とED25519の両方のRound 1を同時実行
        const batchResult = await mpcServer.dkgRound1Batch(currentSessionId);
        
        console.log('[Server] SECP256k1 Round 1 completed, package length:', batchResult.secpPackage ? batchResult.secpPackage.length : 'undefined');
        console.log('[Server] ED25519 Round 1 completed, package length:', batchResult.edPackage ? batchResult.edPackage.length : 'undefined');
        
        // パッケージ配列をmap形式に変換
        const secpMap = batchResult.secpPackage ? { 2: JSON.parse(batchResult.secpPackage) } : {};
        const edMap = batchResult.edPackage ? { 2: JSON.parse(batchResult.edPackage) } : {};

        console.log('[Server] /dkg/batch/round1 レスポンス', { secp256k1: secpMap, ed25519: edMap });
        res.json({ success: true, sessionId: currentSessionId, secp256k1: secpMap, ed25519: edMap });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * バッチ分散鍵生成 Round 2 エンドポイント
 */
async function handleDkgBatchRound2(req, res) {
    try {
        console.log('[Server] /dkg/batch/round2 リクエスト', req.body);
        const { participant_id, sessionId, allPackages = {} } = req.body;
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        
        // デバッグ: allPackagesの内容を確認
        console.log('[Server] allPackages.secp256k1:', allPackages.secp256k1 ? JSON.stringify(allPackages.secp256k1, null, 2) : '(skipped - handled by P2 server)');
        console.log('[Server] allPackages.ed25519:', allPackages.ed25519 ? JSON.stringify(allPackages.ed25519, null, 2) : 'undefined');
        
        // allPackages.secp256k1, allPackages.ed25519が配列ならmapに変換
        const secpSource = allPackages.secp256k1 || {};
        const edSource = allPackages.ed25519 || {};
        const secpPackages = Array.isArray(secpSource) ? arrayToMap(secpSource) : secpSource;
        const edPackages = Array.isArray(edSource) ? arrayToMap(edSource) : edSource;
        
        // デバッグ: 変換後のpackagesを確認
        if (secpPackages && Object.keys(secpPackages).length > 0) {
            console.log('[Server] secpPackages after arrayToMap:', JSON.stringify(secpPackages, null, 2));
        } else {
            console.log('[Server] secpPackages after arrayToMap: (skipped - handled by P2 server)');
        }
        console.log('[Server] edPackages after arrayToMap:', JSON.stringify(edPackages, null, 2));
        
        // 自分以外のパッケージのみを抽出（サーバーはpartyId: 2）
        const otherSecpPackages = {};
        const otherEdPackages = {};
        
        if (secpPackages && Object.keys(secpPackages).length > 0) {
            for (const [partyId, pkg] of Object.entries(secpPackages)) {
                if (partyId !== '2') {
                    otherSecpPackages[partyId] = pkg;
                }
            }
        }
        
        for (const [partyId, pkg] of Object.entries(edPackages)) {
            if (partyId !== '2') {
                otherEdPackages[partyId] = pkg;
            }
        }
        
        console.log('[Server] otherSecpPackages (excluding party 2):', JSON.stringify(otherSecpPackages, null, 2));
        console.log('[Server] otherEdPackages (excluding party 2):', JSON.stringify(otherEdPackages, null, 2));
        
        // セッションからRound1のsecret_packageを取得
        const session = await mpcServer.getSession(sessionId);
        const secpSecretPackage = session?.secp256k1?.dkgState?.round1?.secret_package;
        const edSecretPackage = session?.ed25519?.dkgState?.round1?.secret_package;
        console.log('[Server] SECP256k1 Round 1 secret_package exists:', !!secpSecretPackage);
        console.log('[Server] ED25519 Round 1 secret_package exists:', !!edSecretPackage);
        
        console.log('[Server] SECP256k1 secret_package found:', !!secpSecretPackage);
        console.log('[Server] ED25519 secret_package found:', !!edSecretPackage);
        
        if (edSecretPackage) {
            console.log('[Server] ED25519 Round 1 secret_package preview:', JSON.stringify(edSecretPackage).substring(0, 200) + '...');
        }
        
        const serverRound2Batch = await mpcServer.dkgRound2Batch(
            sessionId,
            otherSecpPackages,
            otherEdPackages
        );
        
        // Round 2のレスポンス：FROST WASMが生成した他のパーティ宛のシークレットシェアをそのまま返す
        const secpRound2Package = serverRound2Batch.secpPackage ? JSON.parse(serverRound2Batch.secpPackage) : {};
        const edRound2Package = JSON.parse(serverRound2Batch.edPackage);
        if (secpRound2Package && Object.keys(secpRound2Package).length > 0) {
            console.log('[Server] secpRound2Package keys:', Object.keys(secpRound2Package));
        } else {
            console.log('[Server] secpRound2Package keys: (skipped - handled by P2 server)');
        }
        console.log('[Server] edRound2Package keys:', Object.keys(edRound2Package));
        
        // 自分自身のRound 2パッケージも含める（他のパーティが期待する形式）
        const myEdId = mpcServer.createFrostId(2, 'ed25519');
        
        // 自分自身のRound 2パッケージを作成（他のパーティ宛のシェアを含む）
        const myEdRound2Package = {};
        
        // 他のパーティのFrost IDを取得
        const otherSecpIds = Object.keys(secpRound2Package || {});
        const otherEdIds = Object.keys(edRound2Package);
        
        // 自分自身のRound 2パッケージに他のパーティ宛のシェアを追加
        for (const otherId of otherEdIds) {
            myEdRound2Package[otherId] = edRound2Package[otherId];
        }
        
        // FROST WASMが生成したシークレットシェアをそのまま返す（自分宛のシェアは含まれない）
        console.log('[Server] /dkg/batch/round2 レスポンス', { 
            ed25519: JSON.stringify(myEdRound2Package) 
        });
        res.json({ 
            success: true, 
            ed25519: JSON.stringify(myEdRound2Package) 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * バッチ分散鍵生成 Round 3 エンドポイント
 */
async function handleDkgBatchRound3(req, res) {
    try {
        console.log('[Server] /dkg/batch/round3 リクエスト', req.body);
        const { participant_id, sessionId, allPackages, masterId } = req.body; // sessionId必須
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        
        // Round 1とRound 2のパッケージを分離
        const round1Packages = allPackages.round1 || {};
        const round2Packages = allPackages.round2 || {};
        
        console.log('[Server] round1Packages:', Object.keys(round1Packages));
        console.log('[Server] round2Packages:', Object.keys(round2Packages));
        console.log('[Server] masterId:', masterId); // masterIdをログ出力
        
        // デバッグ: リクエストの詳細を確認
        console.log('[Server] Round 3 request details:');
        console.log('[Server] - participant_id:', participant_id);
        console.log('[Server] - masterId:', masterId);
        console.log('[Server] - allPackages structure:', JSON.stringify(allPackages, null, 2));
        
        // Round 1パッケージの処理
        let secpRound1Packages, edRound1Packages;
        if (round1Packages.secp256k1) {
            // 配列の場合は結合
            if (Array.isArray(round1Packages.secp256k1)) {
                secpRound1Packages = {};
                round1Packages.secp256k1.forEach((pkg, index) => {
                    if (pkg) {
                        Object.assign(secpRound1Packages, pkg);
                    }
                });
            } else {
                secpRound1Packages = round1Packages.secp256k1;
            }
        }
        
        if (round1Packages.ed25519) {
            // 配列の場合は結合
            if (Array.isArray(round1Packages.ed25519)) {
                edRound1Packages = {};
                round1Packages.ed25519.forEach((pkg, index) => {
                    if (pkg) {
                        Object.assign(edRound1Packages, pkg);
                    }
                });
            } else {
                edRound1Packages = round1Packages.ed25519;
            }
        }
        
        // Round 2パッケージの処理
        let secpRound2Packages, edRound2Packages;
        try {
            if (round2Packages.secp256k1) {
                if (typeof round2Packages.secp256k1 === 'string') {
                    secpRound2Packages = JSON.parse(round2Packages.secp256k1);
                } else {
                    secpRound2Packages = round2Packages.secp256k1;
                }
                
                // Round 2パッケージのキーを64桁16進文字列に変換
                const convertedSecpRound2Packages = {};
                for (const [partyId, pkg] of Object.entries(secpRound2Packages)) {
                    let frostKey;
                    if (partyId.length === 64) {
                        // 既に64桁16進文字列の場合はそのまま使用
                        frostKey = partyId;
                    } else {
                        // 数値の場合は変換
                        frostKey = mpcServer.createFrostId(parseInt(partyId), 'secp256k1');
                    }
                    convertedSecpRound2Packages[frostKey] = pkg;
                }
                secpRound2Packages = convertedSecpRound2Packages;
            }
            
            if (round2Packages.ed25519) {
                if (typeof round2Packages.ed25519 === 'string') {
                    edRound2Packages = JSON.parse(round2Packages.ed25519);
                } else {
                    edRound2Packages = round2Packages.ed25519;
                }
                
                // Round 2パッケージのキーを64桁16進文字列に変換
                const convertedEdRound2Packages = {};
                for (const [partyId, pkg] of Object.entries(edRound2Packages)) {
                    let frostKey;
                    if (partyId.length === 64) {
                        // 既に64桁16進文字列の場合はそのまま使用
                        frostKey = partyId;
                    } else {
                        // 数値の場合は変換
                        frostKey = mpcServer.createFrostId(parseInt(partyId), 'ed25519');
                    }
                    convertedEdRound2Packages[frostKey] = pkg;
                }
                edRound2Packages = convertedEdRound2Packages;
            }
        } catch (error) {
            console.error('[Server] Error processing Round 2 packages:', error);
            throw new Error(`Round 2 packages processing failed: ${error.message}`);
        }
        
        console.log('[Server] secpRound2Packages keys:', Object.keys(secpRound2Packages || {}));
        console.log('[Server] edRound2Packages keys:', Object.keys(edRound2Packages || {}));
        
        // 自分以外のパッケージのみを抽出（サーバーはpartyId: 2）
        const otherSecpRound1Packages = {};
        const otherEdRound1Packages = {};
        const otherSecpRound2Packages = {};
        const otherEdRound2Packages = {};
        
        if (secpRound1Packages) {
            for (const [partyId, pkg] of Object.entries(secpRound1Packages)) {
                if (partyId !== '2') {
                    // Round 1パッケージのキーも64文字16進数形式に変換
                    const frostKey = mpcServer.createFrostId(parseInt(partyId), 'secp256k1');
                    otherSecpRound1Packages[frostKey] = pkg;
                }
            }
        }
        
        if (edRound1Packages) {
            for (const [partyId, pkg] of Object.entries(edRound1Packages)) {
                if (partyId !== '2') {
                    // Round 1パッケージのキーも64文字16進数形式に変換
                    const frostKey = mpcServer.createFrostId(parseInt(partyId), 'ed25519');
                    otherEdRound1Packages[frostKey] = pkg;
                }
            }
        }
        
        if (secpRound2Packages) {
            // Round 2パッケージは他のパーティが自分宛に送ったシェア
            // 他のパーティのRound 2パッケージから自分宛のシェアを抽出
            const mySecpId = mpcServer.createFrostId(2, 'secp256k1');
            console.log('[Server] Extracting SECP256k1 shares for party ID:', mySecpId);
            console.log('[Server] SECP256k1 Round 2 packages structure:', JSON.stringify(secpRound2Packages, null, 2));
            
            for (const [partyId, pkg] of Object.entries(secpRound2Packages)) {
                console.log(`[Server] Processing SECP256k1 Round 2 package from party ${partyId}:`, JSON.stringify(pkg, null, 2));
                if (partyId !== mySecpId && pkg[mySecpId]) { // 自分以外のパーティのパッケージから自分宛のシェアを取得
                    otherSecpRound2Packages[partyId] = pkg[mySecpId];
                    console.log(`[Server] Found SECP256k1 share from party ${partyId} for party 2`);
                } else {
                    console.log(`[Server] No SECP256k1 share found from party ${partyId} for party 2 (partyId !== mySecpId: ${partyId !== mySecpId}, pkg[mySecpId] exists: ${!!pkg[mySecpId]})`);
                }
            }
            
            // デバッグ: 抽出されたパッケージの数を確認
            console.log('[Server] SECP256k1 Round 2 packages extracted:', Object.keys(otherSecpRound2Packages).length);
            console.log('[Server] Expected SECP256k1 Round 2 packages: 2 (from party 1 and 3)');
        }
        
        if (edRound2Packages) {
            // Round 2パッケージは他のパーティが自分宛に送ったシェア
            // 他のパーティのRound 2パッケージから自分宛のシェアを抽出
            const myEdId = mpcServer.createFrostId(2, 'ed25519');
            console.log('[Server] Extracting ED25519 shares for party ID:', myEdId);
            console.log('[Server] ED25519 Round 2 packages structure:', JSON.stringify(edRound2Packages, null, 2));
            
            for (const [partyId, pkg] of Object.entries(edRound2Packages)) {
                console.log(`[Server] Processing ED25519 Round 2 package from party ${partyId}:`, JSON.stringify(pkg, null, 2));
                if (partyId !== myEdId && pkg[myEdId]) { // 自分以外のパーティのパッケージから自分宛のシェアを取得
                    otherEdRound2Packages[partyId] = pkg[myEdId];
                    console.log(`[Server] Found ED25519 share from party ${partyId} for party 2`);
                } else {
                    console.log(`[Server] No ED25519 share found from party ${partyId} for party 2 (partyId !== myEdId: ${partyId !== myEdId}, pkg[myEdId] exists: ${!!pkg[myEdId]})`);
                }
            }
            
            // デバッグ: 抽出されたパッケージの数を確認
            console.log('[Server] ED25519 Round 2 packages extracted:', Object.keys(otherEdRound2Packages).length);
            console.log('[Server] Expected ED25519 Round 2 packages: 2 (from party 1 and 3)');
        }
        
        console.log('[Server] otherSecpRound1Packages keys:', Object.keys(otherSecpRound1Packages));
        console.log('[Server] otherSecpRound2Packages keys:', Object.keys(otherSecpRound2Packages));
        console.log('[Server] otherEdRound1Packages keys:', Object.keys(otherEdRound1Packages));
        console.log('[Server] otherEdRound2Packages keys:', Object.keys(otherEdRound2Packages));

        // 直接mpcServer.dkgRound3Batchを呼び出し（セッション対応）
        const round3Result = await mpcServer.dkgRound3Batch(
            sessionId,
            otherSecpRound1Packages,
            otherEdRound1Packages,
            otherSecpRound2Packages,
            otherEdRound2Packages
        );
        
        // masterIdが提供されている場合、サーバーのシェアをデータベースに保存
        if (masterId) {
            console.log(`[Server] Saving server shares for masterId: ${masterId}`);
            console.log(`[Server] Round 3 result structure:`, {
                hasSecpPackage: !!round3Result.secpPackage,
                hasEdPackage: !!round3Result.edPackage,
                secpPackageKeys: round3Result.secpPackage ? Object.keys(round3Result.secpPackage) : [],
                edPackageKeys: round3Result.edPackage ? Object.keys(round3Result.edPackage) : []
            });
            
            try {
                // SECP256k1シェアを保存（nullチェック付き）
                if (round3Result.secpPackage && 
                    round3Result.secpPackage.key_package && 
                    round3Result.secpPackage.public_key_package) {
                    
                await mpcServer.saveShareToDatabase(db, masterId, 'secp256k1', {
                    key_package: round3Result.secpPackage.key_package,
                    public_key_package: round3Result.secpPackage.public_key_package
                });
                    console.log(`[Server] SECP256k1 share saved successfully for masterId: ${masterId}`);
                } else {
                    console.warn(`[Server] SECP256k1 package incomplete, skipping save:`, {
                        hasSecpPackage: !!round3Result.secpPackage,
                        hasKeyPackage: !!(round3Result.secpPackage && round3Result.secpPackage.key_package),
                        hasPublicKeyPackage: !!(round3Result.secpPackage && round3Result.secpPackage.public_key_package)
                    });
                }
                
                // ED25519シェアを保存（nullチェック付き）
                if (round3Result.edPackage && 
                    round3Result.edPackage.key_package && 
                    round3Result.edPackage.public_key_package) {
                    
                await mpcServer.saveShareToDatabase(db, masterId, 'ed25519', {
                    key_package: round3Result.edPackage.key_package,
                    public_key_package: round3Result.edPackage.public_key_package
                });
                    console.log(`[Server] ED25519 share saved successfully for masterId: ${masterId}`);
                } else {
                    console.warn(`[Server] ED25519 package incomplete, skipping save:`, {
                        hasEdPackage: !!round3Result.edPackage,
                        hasKeyPackage: !!(round3Result.edPackage && round3Result.edPackage.key_package),
                        hasPublicKeyPackage: !!(round3Result.edPackage && round3Result.edPackage.public_key_package)
                    });
                }
                
                console.log(`[Server] Server shares saved successfully for masterId: ${masterId}`);
            } catch (error) {
                console.error(`[Server] Failed to save server shares for masterId: ${masterId}:`, error);
                console.error(`[Server] Error details:`, {
                    message: error.message,
                    stack: error.stack,
                    masterId: masterId,
                    dbAvailable: !!db
                });
                // シェア保存に失敗した場合はエラーとして処理
                throw new Error(`Failed to save server shares: ${error.message}`);
            }
        } else {
            console.error('[Server] masterId is required for DKG Round 3');
            console.error('[Server] Request body keys:', Object.keys(req.body));
            console.error('[Server] Available request body:', req.body);
            throw new Error('masterId is required for DKG Round 3');
        }
        
        console.log('[Server] /dkg/batch/round3 レスポンス', round3Result);
        res.json({ 
            success: true, 
            secp256k1: round3Result.secpPackage, 
            ed25519: round3Result.edPackage 
        });
    } catch (error) {
        console.error('[Server] /dkg/batch/round3 エラー:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * バッチ公開鍵パッケージ取得
 */
async function handleGetBatchPublicKeyPackage(req, res) {
    try {
        const { sessionId } = req.body || {};
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'sessionId is required' });
        }
        // secp256k1（P2サーバで生成されるため存在しない可能性あり）
        let secp = null;
        try {
            secp = await mpcServer.getPublicKeyPackage(sessionId, 'secp256k1');
        } catch (error) {
            console.warn('[Server] getPublicKeyPackage(secp256k1) skipped:', error.message);
        }
        // ed25519
        const ed = await mpcServer.getPublicKeyPackage(sessionId, 'ed25519');
        res.json({ success: true, secp256k1: secp, ed25519: ed, sessionId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

// Removed: handleSignBatchRound1 (unused)

// Removed: handleSignBatchRound2 (unused)

/**
 * バッチ復旧エンドポイント
 */
async function handleBatchRecoveryRequestShare(req, res) {
    try {
        const { curves, ...rest } = req.body;
        const results = {};
        for (const curve_type of curves) {
            const recoveryReq = { body: { curve_type, ...rest } };
            const recoveryRes = {};
            await handleEmergencyRecovery(recoveryReq, recoveryRes);
            results[curve_type] = recoveryRes.json;
        }
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * バッチ公開鍵復旧パッケージ取得（セッション対応）
 */
async function handleGetBatchRecoveryPublicKeyPackage(req, res) {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ success: false, error: 'Session ID required' });
        }
        
        const secp = await mpcServer.getPublicKeyPackage(sessionId, 'secp256k1');
        const ed = await mpcServer.getPublicKeyPackage(sessionId, 'ed25519');
        res.json({ success: true, secp256k1: secp, ed25519: ed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * サーバーのシェア取得エンドポイント（緊急復旧用）
 */
async function handleGetServerShare(req, res) {
    try {
        
        const { masterId, curveType = 'secp256k1' } = req.body;
        console.log(`[Server] /mpcapi/server/get-share リクエスト: masterId=${masterId}, curveType=${curveType}`);
        
        if (!masterId) {
            return res.status(400).json({
                success: false,
                error: 'masterId is required'
            });
        }
        
        // データベースからサーバーのシェアを読み込み
        const serverShare = await mpcServer.loadShareFromDatabase(db, masterId, curveType);
        
        if (!serverShare) {
            return res.status(404).json({
                success: false,
                error: `Server share not found for masterId: ${masterId}, curveType: ${curveType}`
            });
        }
        
        console.log(`[Server] Server share retrieved for masterId: ${masterId}, curveType: ${curveType}`);
        
        res.json({
            success: true,
            masterId: masterId,
            curveType: curveType,
            partyId: serverShare.partyId,
            keyPackage: serverShare.keyPackage,
            publicKeyPackage: serverShare.publicKeyPackage,
            epochCounter: serverShare.epochCounter,
            pubkeyFingerprint: serverShare.pubkeyFingerprint,
            createdAt: serverShare.createdAt
        });
        
    } catch (error) {
        console.error('[Server] Get server share endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * サーバーのシェア保存エンドポイント（緊急復旧用）
 */
async function handleStoreServerShare(req, res) {
    try {
        
        const { masterId, curveType = 'secp256k1', share, publicKeyPackage, epochInfo = null } = req.body;
        console.log(`[Server] /mpcapi/server/store-share リクエスト: masterId=${masterId}, curveType=${curveType}, epochInfo=${epochInfo ? JSON.stringify(epochInfo) : 'latest'}`);
        console.log(`[Server] Debug: share present=${!!share}, publicKeyPackage present=${!!publicKeyPackage}`);
        
        if (!masterId || !share || !publicKeyPackage) {
            console.log(`[Server] Validation failed: masterId=${!!masterId}, share=${!!share}, publicKeyPackage=${!!publicKeyPackage}`);
            return res.status(400).json({
                success: false,
                error: 'masterId, share, and publicKeyPackage are required'
            });
        }
        
        // シェアをデータベースに保存
        const round3Data = {
            key_package: share,
            public_key_package: publicKeyPackage
        };
        
        const saveResult = await mpcServer.saveShareToDatabase(db, masterId, curveType, round3Data, epochInfo);
        
        console.log(`[Server] Server share saved for masterId: ${masterId}, curveType: ${curveType}`);
        
        res.json({
            success: true,
            masterId: masterId,
            curveType: curveType,
            epochCounter: saveResult.epochCounter,
            pubkeyFingerprint: saveResult.pubkeyFingerprint,
            message: 'Server share saved successfully'
        });
        
    } catch (error) {
        console.error('[Server] Store server share endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * バッチヘルスチェック
 */
async function handleBatchHealth(req, res) {
    try {
        res.json({ success: true, health: {
            secp256k1: { status: 'ok' },
            ed25519: { status: 'ok' }
        }});
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * エポック履歴取得エンドポイント
 */
async function handleGetEpochHistory(req, res) {
    try {
        
        const { masterId, curveType = 'secp256k1' } = req.body;
        console.log(`[Server] /mpcapi/server/get-epoch-history リクエスト: masterId=${masterId}, curveType=${curveType}`);
        
        if (!masterId) {
            return res.status(400).json({
                success: false,
                error: 'masterId is required'
            });
        }
        
        // エポック履歴を取得
        const query = `
            SELECT epoch_counter, pubkey_fingerprint, created_at
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ?
            ORDER BY epoch_counter DESC
        `;
        
        const [result] = await db.query(query, [masterId, curveType]);
        const rows = Array.isArray(result) ? result : [];
        
        const epochHistory = rows.map(row => ({
            epochCounter: row.epoch_counter,
            pubkeyFingerprint: row.pubkey_fingerprint,
            createdAt: row.created_at,
            epochId: `${masterId}_${curveType}_${row.epoch_counter}_${row.pubkey_fingerprint}`
        }));
        
        console.log(`[Server] Epoch history retrieved for masterId: ${masterId}, curveType: ${curveType}, count: ${epochHistory.length}`);
        
        res.json({
            success: true,
            masterId: masterId,
            curveType: curveType,
            epochHistory: epochHistory,
            totalEpochs: epochHistory.length
        });
        
    } catch (error) {
        console.error('[Server] Get epoch history endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 特定エポックのシェア取得エンドポイント
 */
async function handleGetEpochShare(req, res) {
    try {
        
        const { masterId, curveType = 'secp256k1', epochCounter, pubkeyFingerprint } = req.body;
        console.log(`[Server] /mpcapi/server/get-epoch-share リクエスト: masterId=${masterId}, curveType=${curveType}, epochCounter=${epochCounter}, pubkeyFingerprint=${pubkeyFingerprint}`);
        
        if (!masterId || epochCounter === undefined || !pubkeyFingerprint) {
            return res.status(400).json({
                success: false,
                error: 'masterId, epochCounter, and pubkeyFingerprint are required'
            });
        }
        
        // 特定エポックのシェアを取得
        const query = `
            SELECT key_package, public_key_package, party_id, created_at
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? AND epoch_counter = ? AND pubkey_fingerprint = ?
        `;
        
        const [result] = await db.query(query, [masterId, curveType, epochCounter, pubkeyFingerprint]);
        const rows = Array.isArray(result) ? result : [];
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Epoch share not found for masterId: ${masterId}, curveType: ${curveType}, epochCounter: ${epochCounter}`
            });
        }
        
        const shareData = rows[0];
        
        // キーパッケージをオブジェクトとして読み込み
        let keyPackage = shareData.key_package;
        if (typeof keyPackage === 'string') {
            try {
                keyPackage = JSON.parse(keyPackage);
            } catch (parseError) {
                console.warn(`Server: Failed to parse keyPackage for epoch ${epochCounter}:`, parseError.message);
            }
        }

        let publicKeyPackage = shareData.public_key_package;
        if (typeof publicKeyPackage === 'string') {
            try {
                publicKeyPackage = JSON.parse(publicKeyPackage);
            } catch (parseError) {
                console.warn(`Server: Failed to parse publicKeyPackage for epoch ${epochCounter}:`, parseError.message);
            }
        }
        
        console.log(`[Server] Epoch share retrieved for masterId: ${masterId}, curveType: ${curveType}, epochCounter: ${epochCounter}`);
        
        res.json({
            success: true,
            masterId: masterId,
            curveType: curveType,
            epochCounter: epochCounter,
            pubkeyFingerprint: pubkeyFingerprint,
            partyId: shareData.party_id,
            keyPackage: keyPackage,
            publicKeyPackage: publicKeyPackage,
            createdAt: shareData.created_at,
            epochId: `${masterId}_${curveType}_${epochCounter}_${pubkeyFingerprint}`
        });
        
    } catch (error) {
        console.error('[Server] Get epoch share endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}


/**
 * MPC署名 Round 1 コミットメント取得エンドポイント（エポック管理対応）
 */
async function handleMpcRound1Commit(req, res) {
    try {
        
        const { masterId, message_bytes, sessionId, curve = 'secp256k1', epochInfo, clientCommitments, clientFrostId } = req.body;
        console.log(`[MPC Signing] Round 1 commit request: masterId=${masterId}, sessionId=${sessionId}, curve=${curve}, epochInfo=${epochInfo ? JSON.stringify(epochInfo) : 'missing'}`);
        
        if (!masterId || !message_bytes || !sessionId || !epochInfo) {
            return res.status(400).json({
                success: false,
                error: 'masterId, message_bytes, sessionId, and epochInfo are required'
            });
        }
        
        // epochCounter は 0 を正当な値として許容する（falsy 判定だと 0 が弾かれる）
        if (epochInfo == null || epochInfo.pubkeyFingerprint == null || epochInfo.epochCounter === undefined || epochInfo.epochCounter === null) {
            return res.status(400).json({
                success: false,
                error: 'epochInfo must contain epochCounter and pubkeyFingerprint'
            });
        }
        
        // クライアントのcommitmentsとFROST IDが必須（2-of-2 の整合性のため）
        if (!clientCommitments || !clientFrostId) {
            return res.status(400).json({
                success: false,
                error: 'clientCommitments and clientFrostId are required in Round1'
            });
        }

        // サーバーのkeyPackageを取得（指定されたepochInfoで検索）
        const query = `
            SELECT key_package, public_key_package, party_id, epoch_counter, pubkey_fingerprint, created_at
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? AND epoch_counter = ? AND pubkey_fingerprint = ?
        `;
        const [result] = await db.query(query, [masterId, curve, epochInfo.epochCounter, epochInfo.pubkeyFingerprint]);
        const rows = Array.isArray(result) ? result : [];
        
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Epoch share not found for masterId: ${masterId}, curve: ${curve}, epoch: ${epochInfo.epochCounter}`
            });
        }
        
        const shareData = rows[0];
        const serverShare = {
            masterId: masterId,
            curveType: curve,
            partyId: shareData.party_id,
            keyPackage: typeof shareData.key_package === 'string' ? JSON.parse(shareData.key_package) : shareData.key_package,
            publicKeyPackage: typeof shareData.public_key_package === 'string' ? JSON.parse(shareData.public_key_package) : shareData.public_key_package,
            epochCounter: shareData.epoch_counter,
            pubkeyFingerprint: shareData.pubkey_fingerprint,
            createdAt: shareData.created_at
        };
        
        console.log(`[MPC Signing] Debug - serverShare.keyPackage type: ${typeof serverShare.keyPackage}`);
        console.log(`[MPC Signing] Debug - serverShare.keyPackage preview: ${typeof serverShare.keyPackage === 'string' ? serverShare.keyPackage.substring(0, 200) : JSON.stringify(serverShare.keyPackage).substring(0, 200)}...`);
        
        // サーバーのkeyPackageでRound 1を実行（成功例に合わせて文字列として使用）
        let keyPackage;
        if (typeof serverShare.keyPackage === 'string') {
            keyPackage = serverShare.keyPackage;
        } else {
            // オブジェクトの場合は文字列に変換
            keyPackage = JSON.stringify(serverShare.keyPackage);
        }
        
        console.log(`[MPC Signing] Debug - keyPackage type: ${typeof keyPackage}`);
        console.log(`[MPC Signing] Debug - keyPackage length: ${keyPackage.length}`);
        console.log(`[MPC Signing] Debug - keyPackage preview: ${keyPackage.substring(0, 200)}...`);
        // 🧪 DEV Round1 INPUT (raw, sensitive)
        try { console.log('[DEV] Round1 INPUT keyPackage (raw):', keyPackage); } catch(_) {}
         
         const round1Function = curve === 'secp256k1' ? 'secp_round1_commit' : 'ed_round1_commit';
         const round1Result = mpcServer.frostWasm[round1Function](keyPackage);
         
         // 結果をパース
         const parsedResult = JSON.parse(round1Result);
        // 🧪 DEV Round1 OUTPUT (raw, sensitive)
        try {
            console.log('[DEV] Round1 OUTPUT nonces (raw):', parsedResult.nonces);
            console.log('[DEV] Round1 OUTPUT commitments (raw):', parsedResult.commitments);
        } catch(_) {}
        
        // 詳細なセッションキーを生成（全要素連結、epochInfoを含む）
        const detailedSessionKey = masterId + "|" + curve + "|" + sessionId + "|" + 
            epochInfo.pubkeyFingerprint + "|" + epochInfo.epochCounter + "|" +
            '0200000000000000000000000000000000000000000000000000000000000000';
        
        console.log(`[MPC Signing] Round 1 - Generated detailed session key: ${detailedSessionKey}`);
        
        // セッション情報を保存（詳細キー使用、nonces再利用禁止・session一意を強制）
        mpcServer.signingSessions = mpcServer.signingSessions || {};
        
        // 既存の同一詳細キーのセッションを削除（nonces再利用防止）
        Object.keys(mpcServer.signingSessions).forEach(existingSessionId => {
            const existingSession = mpcServer.signingSessions[existingSessionId];
            if (existingSession.detailedSessionKey === detailedSessionKey) {
                console.log(`[MPC Signing] Round 1 - Removing existing session with same detailed key: ${existingSessionId}`);
                delete mpcServer.signingSessions[existingSessionId];
            }
        });
        
        // クライアントコミットメントのSHA-256を保存（Round2で照合）
        let clientCommitmentsHash = null;
        try {
            const ccStr = typeof clientCommitments === 'string' ? clientCommitments : JSON.stringify(clientCommitments);
            clientCommitmentsHash = require('crypto').createHash('sha256').update(ccStr).digest('hex');
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Failed to hash clientCommitments' });
        }

        mpcServer.signingSessions[sessionId] = {
            detailedSessionKey,  // 詳細キーを保存
            masterId,
            messageBytes: message_bytes,
            curve,
            epochInfo: epochInfo,  // リクエストで受信したepochInfoを保存
            round1: {
                nonces: parsedResult.nonces,
                commitments: parsedResult.commitments  // 文字列のまま保存（一貫性のため）
            },
            // クライアントのコミットメントを保存（Round2でsigning_commitmentsへ反映）
            clientCommitments: clientCommitments,
            clientFrostId: clientFrostId,
            clientCommitmentsHash: clientCommitmentsHash,
            createdAt: Date.now(),
            serverFrostId: '0200000000000000000000000000000000000000000000000000000000000000'  // 固定識別子
        };
        
        // Round1で生成されたnoncesの詳細を記録
        console.log(`[MPC Signing] Round 1 - Generated nonces details:`, {
            sessionId: sessionId,
            noncesLength: parsedResult.nonces.length,
            noncesPreview: parsedResult.nonces.substring(0, 50) + '...',
            noncesHash: require('crypto').createHash('sha256').update(parsedResult.nonces).digest('hex').substring(0, 16),
            commitmentsLength: parsedResult.commitments.length,
            commitmentsPreview: parsedResult.commitments.substring(0, 50) + '...',
            commitmentsHash: require('crypto').createHash('sha256').update(parsedResult.commitments).digest('hex').substring(0, 16)
        });
        
        console.log(`[MPC Signing] Round 1 commit completed for sessionId: ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            serverFrostId: normalizeFrostId(serverShare.curveType || 'secp256k1', serverShare.partyId), // サーバーのfrostIdを明示
            epochInfo: epochInfo,  // リクエストで受信したepochInfoをエコーバック
            bitvoyCommitment: {
                nonces: parsedResult.nonces,
                commitments: typeof parsedResult.commitments === 'string' ? JSON.parse(parsedResult.commitments) : parsedResult.commitments
            }
        });
        
    } catch (error) {
        console.error('[MPC Signing] Round 1 commit endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * MPC署名 Round 2 部分署名取得・集約エンドポイント（エポック管理対応）
 */
async function handleMpcRound2Sign(req, res) {
    try {
        
        const { masterId, sessionId, localPartialSignature, clientFrostId, clientSigningPackage, curve = 'secp256k1', epochInfo } = req.body;
        console.log(`[MPC Signing] Round 2 sign request: masterId=${masterId}, sessionId=${sessionId}, curve=${curve}, epochInfo=${epochInfo ? JSON.stringify(epochInfo) : 'missing'}`);
        
        if (!masterId || !sessionId || !clientFrostId || !clientSigningPackage || !epochInfo) {
            return res.status(400).json({
                success: false,
                error: 'masterId, sessionId, clientFrostId, clientSigningPackage, and epochInfo are required'
            });
        }
        
        // epochCounter は 0 を正当な値として許容する
        if (epochInfo == null || epochInfo.pubkeyFingerprint == null || epochInfo.epochCounter === undefined || epochInfo.epochCounter === null) {
            return res.status(400).json({
                success: false,
                error: 'epochInfo must contain epochCounter and pubkeyFingerprint'
            });
        }
        
        // localPartialSignatureは任意パラメータに変更（暫定署名を避けるため）
        console.log(`[MPC Signing] Round 2 - localPartialSignature provided: ${!!localPartialSignature}`);
        console.log(`[MPC Signing] Round 2 - masterId: ${masterId}, curve: ${curve}, sessionId: ${sessionId}`);
        console.log(`[MPC Signing] Round 2 - epochInfo: ${JSON.stringify(epochInfo)}`);
        
        // セッション情報を取得（詳細キーで検索）
        const session = mpcServer.signingSessions[sessionId];
        if (!session) {
            return res.status(404).json({
                success: false,
                error: `Session not found: ${sessionId}`
            });
        }
        
        // セッション保存epochInfoとリクエストepochInfoの完全一致を強制
        if (!session.epochInfo || 
            session.epochInfo.epochCounter !== epochInfo.epochCounter || 
            session.epochInfo.pubkeyFingerprint !== epochInfo.pubkeyFingerprint) {
            return res.status(400).json({
                success: false,
                error: `Epoch info mismatch: session=${JSON.stringify(session.epochInfo)}, request=${JSON.stringify(epochInfo)}`
            });
        }
        
        // サーバーのkeyPackageを取得（セッションのエポック情報を使用）
        let serverShare;
        const targetEpochInfo = session.epochInfo;
        
        // 詳細なセッションキーを生成（Round1と同じ形式、epochInfoを含む）
        const detailedSessionKey = masterId + "|" + curve + "|" + sessionId + "|" + 
            targetEpochInfo.pubkeyFingerprint + "|" + targetEpochInfo.epochCounter + "|" +
            '0200000000000000000000000000000000000000000000000000000000000000';
        
        console.log(`[MPC Signing] Round 2 - Looking for session with detailed key: ${detailedSessionKey}`);
        
        // 詳細キーの一致を確認
        if (session.detailedSessionKey !== detailedSessionKey) {
            console.log(`[MPC Signing] Round 2 - Session key mismatch: expected=${detailedSessionKey}, actual=${session.detailedSessionKey}`);
            return res.status(400).json({
                success: false,
                error: `Session key mismatch: expected=${detailedSessionKey}, actual=${session.detailedSessionKey}`
            });
        }
        
        console.log(`[MPC Signing] Round 2 - Session found with matching detailed key`);
        
        if (targetEpochInfo && targetEpochInfo.epochCounter !== undefined && targetEpochInfo.pubkeyFingerprint) {
            // 特定エポックのシェアを取得
            const query = `
                SELECT key_package, public_key_package, party_id, epoch_counter, pubkey_fingerprint, created_at
                FROM server_shares 
                WHERE master_id = ? AND curve_type = ? AND epoch_counter = ? AND pubkey_fingerprint = ?
            `;
            const [result] = await db.query(query, [masterId, curve, targetEpochInfo.epochCounter, targetEpochInfo.pubkeyFingerprint]);
            const rows = Array.isArray(result) ? result : [];
            console.log(`[MPC Signing] Round 2 - Database query result: ${rows.length} rows found`);
            console.log(`[MPC Signing] Round 2 - Query parameters: masterId=${masterId}, curve=${curve}, epochCounter=${targetEpochInfo.epochCounter}, pubkeyFingerprint=${targetEpochInfo.pubkeyFingerprint}`);
            
            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: `Epoch share not found for masterId: ${masterId}, curve: ${curve}, epoch: ${targetEpochInfo.epochCounter}`
                });
            }
            
            const shareData = rows[0];
            console.log(`[MPC Signing] Round 2 - shareData.key_package type: ${typeof shareData.key_package}`);
            console.log(`[MPC Signing] Round 2 - shareData.key_package length: ${shareData.key_package ? (typeof shareData.key_package === 'string' ? shareData.key_package.length : 'N/A (object)') : 'N/A'}`);
            console.log(`[MPC Signing] Round 2 - shareData.key_package preview: ${shareData.key_package ? (typeof shareData.key_package === 'string' ? shareData.key_package.substring(0, 200) + '...' : JSON.stringify(shareData.key_package).substring(0, 200) + '...') : 'N/A'}`);
            console.log(`[MPC Signing] Round 2 - shareData.key_package raw: ${JSON.stringify(shareData.key_package)}`);
            
            // JSONパースを試行してエラーをキャッチ
            let parsedKeyPackage;
            try {
                parsedKeyPackage = typeof shareData.key_package === 'string' ? JSON.parse(shareData.key_package) : shareData.key_package;
                console.log(`[MPC Signing] Round 2 - keyPackage parsed successfully`);
            } catch (error) {
                console.error(`[MPC Signing] Round 2 - JSON parse error: ${error.message}`);
                console.error(`[MPC Signing] Round 2 - Raw key_package: ${shareData.key_package}`);
                console.error(`[MPC Signing] Round 2 - This appears to be a FROST ID instead of a KeyPackage JSON`);
                
                // データベースの状態を確認
                console.error(`[MPC Signing] Round 2 - Database state issue: key_package contains FROST ID instead of KeyPackage JSON`);
                console.error(`[MPC Signing] Round 2 - Expected: JSON object with header, identifier, min_signers, signing_share`);
                console.error(`[MPC Signing] Round 2 - Actual: FROST ID string`);
                
                return res.status(500).json({
                    success: false,
                    error: `Database state issue: key_package contains FROST ID instead of KeyPackage JSON. Please check database integrity.`
                });
            }
            
            // publicKeyPackageの解析も試行
            let parsedPublicKeyPackage;
            try {
                parsedPublicKeyPackage = typeof shareData.public_key_package === 'string' ? JSON.parse(shareData.public_key_package) : shareData.public_key_package;
                console.log(`[MPC Signing] Round 2 - publicKeyPackage parsed successfully`);
            } catch (error) {
                console.error(`[MPC Signing] Round 2 - publicKeyPackage JSON parse error: ${error.message}`);
                console.error(`[MPC Signing] Round 2 - Raw public_key_package: ${shareData.public_key_package}`);
                return res.status(500).json({
                    success: false,
                    error: `Invalid public_key_package format: ${error.message}`
                });
            }
            
            serverShare = {
                masterId: masterId,
                curveType: curve,
                partyId: shareData.party_id,
                keyPackage: parsedKeyPackage,
                publicKeyPackage: parsedPublicKeyPackage,
                epochCounter: shareData.epoch_counter,
                pubkeyFingerprint: shareData.pubkey_fingerprint,
                createdAt: shareData.created_at
            };
        } else {
            // 最新エポックのシェアを取得
            serverShare = await mpcServer.loadShareFromDatabase(db, masterId, curve);
        }
        if (!serverShare) {
            return res.status(404).json({
                success: false,
                error: `Server share not found for masterId: ${masterId}, curve: ${curve}`
            });
        }
        
        // サーバーのkeyPackageでRound 2を実行
        console.log(`[MPC Signing] Round 2 - serverShare.keyPackage type: ${typeof serverShare.keyPackage}`);
        console.log(`[MPC Signing] Round 2 - serverShare.keyPackage length: ${serverShare.keyPackage ? (typeof serverShare.keyPackage === 'string' ? serverShare.keyPackage.length : 'N/A (object)') : 'N/A'}`);
        console.log(`[MPC Signing] Round 2 - serverShare.keyPackage preview: ${serverShare.keyPackage ? (typeof serverShare.keyPackage === 'string' ? serverShare.keyPackage.substring(0, 200) + '...' : JSON.stringify(serverShare.keyPackage).substring(0, 200) + '...') : 'N/A'}`);
        
        // keyPackageの解析を試行
        let keyPackage;
        try {
            keyPackage = typeof serverShare.keyPackage === 'string' 
                ? JSON.parse(serverShare.keyPackage) 
                : serverShare.keyPackage;
            console.log(`[MPC Signing] Round 2 - keyPackage parsed successfully`);
        } catch (error) {
            console.error(`[MPC Signing] Round 2 - keyPackage JSON parse error: ${error.message}`);
            console.error(`[MPC Signing] Round 2 - Raw keyPackage: ${serverShare.keyPackage}`);
            console.error(`[MPC Signing] Round 2 - This appears to be a FROST ID instead of a KeyPackage JSON`);
            
            return res.status(500).json({
                success: false,
                error: `Database state issue: key_package contains FROST ID instead of KeyPackage JSON. Please check database integrity.`
            });
        }
        
        // サイナー集合を{01,02}に固定（DKGで配布したものとバイト完全一致）
        const serverFrostId = '0200000000000000000000000000000000000000000000000000000000000000';
        console.log(`[MPC Signing] Round 2 - Fixed signer set: {01, 02}, serverFrostId: ${serverFrostId}`);
        
        // keyPackageのidentifierを02に強制修正（ラグランジュ係数計算時に{01,02}の昇順を使用）
        console.log(`[MPC Signing] Round 2 - keyPackage.identifier before correction: ${keyPackage.identifier}`);
        if (keyPackage && keyPackage.identifier !== serverFrostId) {
            console.log(`[MPC Signing] Round 2 - FORCING keyPackage identifier from ${keyPackage.identifier} to ${serverFrostId} (Lagrange coefficient calculation: {01,02} ascending order)`);
            keyPackage.identifier = serverFrostId;
        }
        console.log(`[MPC Signing] Round 2 - keyPackage.identifier after correction: ${keyPackage.identifier}`);
        
        console.log(`[MPC Signing] Round 2 - keyPackage type: ${typeof keyPackage}, length: ${JSON.stringify(keyPackage).length}`);
        console.log(`[MPC Signing] Round 2 - keyPackage identifier: ${keyPackage.identifier}`);
        console.log(`[MPC Signing] Round 2 - nonces type: ${typeof session.round1.nonces}, length: ${session.round1.nonces.length}`);
        console.log(`[MPC Signing] Round 2 - commitments type: ${typeof session.round1.commitments}, length: ${JSON.stringify(session.round1.commitments).length}`);
        
        // クライアントのcommitmentsを取得（Round1で保存済み）- 必須
        const sessionClientCommitments = session.clientCommitments;
        const sessionClientFrostId = session.clientFrostId || clientFrostId;
        if (!sessionClientCommitments || !sessionClientFrostId) {
            return res.status(400).json({
                success: false,
                error: 'Missing client commitments or clientFrostId from session. Round1 must provide both.'
            });
        }
        // Round1保存のハッシュと一致するか検証
        try {
            const ccStrNow = typeof sessionClientCommitments === 'string' ? sessionClientCommitments : JSON.stringify(sessionClientCommitments);
            const ccHashNow = require('crypto').createHash('sha256').update(ccStrNow).digest('hex');
            if (!session.clientCommitmentsHash || session.clientCommitmentsHash !== ccHashNow) {
                return res.status(400).json({ success: false, error: 'Client commitments hash mismatch (Round1 vs Round2)' });
            }
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Failed to compute client commitments hash' });
        }

        // クライアントから送られた signingPackage から message_bytes を取得
        let messageHex;
        try {
            const clientSpObj = typeof clientSigningPackage === 'string' ? JSON.parse(clientSigningPackage) : clientSigningPackage;
            // message_bytes のみ許容（後方互換は削除）
            messageHex = clientSpObj.message_bytes;
        } catch (e) {
            console.error(`[MPC Signing] Round 2 - Failed to parse clientSigningPackage: ${e.message}`);
        }
        if (!messageHex) {
            return res.status(400).json({ success: false, error: 'clientSigningPackage.message_bytes is required' });
        }

        // signing_commitments をクライアント(LOCAL)とサーバ(SERVER)で再構築
        const signingCommitments = {};
        if (sessionClientCommitments && sessionClientFrostId) {
            signingCommitments[sessionClientFrostId] = typeof sessionClientCommitments === 'string'
                ? JSON.parse(sessionClientCommitments)
                : sessionClientCommitments;
        }
        signingCommitments[serverFrostId] = typeof session.round1.commitments === 'string'
            ? JSON.parse(session.round1.commitments)
            : session.round1.commitments;

        // 追加検証: signing_commitments[clientId] が Round1 保存のハッシュと一致すること
        try {
            const scCli = signingCommitments[sessionClientFrostId];
            const scCliStr = typeof scCli === 'string' ? scCli : JSON.stringify(scCli);
            const scCliHash = require('crypto').createHash('sha256').update(scCliStr).digest('hex');
            if (scCliHash !== session.clientCommitmentsHash) {
                return res.status(400).json({ success: false, error: 'signing_commitments[client] hash mismatch' });
            }
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Failed to verify signing_commitments[client] hash' });
        }

        const serverSigningPackageObj = {
            header: {
                version: 0,
                ciphersuite: curve === 'ed25519' ? 'FROST-ED25519-SHA512-v1' : 'FROST-secp256k1-SHA256-v1'
            },
            signing_commitments: signingCommitments,
            // WASM expects 'message' (hex). Do not include unknown keys.
            message: messageHex
        };

        const signingPackage = JSON.stringify(serverSigningPackageObj);
        console.log(`[MPC Signing] Round 2 - Built serverSigningPackage with client+server commitments. length=${signingPackage.length}`);
        
        // サーバーのFROST識別子
        // const serverFrostId = serverShare.partyId || '0000000000000000000000000000000000000000000000000000000000000002'; // Party 2
        
        // Round1→Round2のnonces一貫性: セッションID単位でone-shot、Round1で返したコミットメントと対になっているもののみ使用
        const serverNonces = session.round1.nonces;
        console.log(`[MPC Signing] Round 2 - Round1→Round2 nonces consistency: sessionId=${sessionId}, detailedKey=${detailedSessionKey}, nonces length: ${serverNonces.length}`);
        console.log(`[MPC Signing] Round 2 - Server nonces preview: ${serverNonces.substring(0, 100)}...`);
        console.log(`[MPC Signing] Round 2 - Using nonces paired with Round1 commitments (one-shot per session with detailed key)`);
        
        // Round1で保存されたnoncesとの一致確認
        console.log(`[MPC Signing] Round 2 - Nonces consistency check:`, {
            sessionId: sessionId,
            round1NoncesLength: session.round1.nonces.length,
            round1NoncesPreview: session.round1.nonces.substring(0, 50) + '...',
            round1NoncesHash: require('crypto').createHash('sha256').update(session.round1.nonces).digest('hex').substring(0, 16),
            round1CommitmentsLength: session.round1.commitments.length,
            round1CommitmentsPreview: session.round1.commitments.substring(0, 50) + '...',
            round1CommitmentsHash: require('crypto').createHash('sha256').update(session.round1.commitments).digest('hex').substring(0, 16)
        });
        
        console.log(`[MPC Signing] Round 2 - serverNonces type: ${typeof serverNonces}, length: ${serverNonces.length}`);
        
        // クライアント送付のsigningPackage（参照用）
        const signingPackageFromClient = clientSigningPackage;
        // メッセージの同一性のみを検証（SHA-256ハッシュで比較）
        try {
            const spClientObj = typeof signingPackageFromClient === 'string' ? JSON.parse(signingPackageFromClient) : signingPackageFromClient;
            const clientMsgHex = spClientObj?.message_bytes || spClientObj?.message;
            const serverMsgHex = serverSigningPackageObj?.message;
            if (typeof clientMsgHex === 'string' && typeof serverMsgHex === 'string') {
                const crypto = require('crypto');
                const clientMsgHash = crypto.createHash('sha256').update(Buffer.from(clientMsgHex, 'hex')).digest('hex');
                const serverMsgHash = crypto.createHash('sha256').update(Buffer.from(serverMsgHex, 'hex')).digest('hex');
                console.log(`[MPC Signing] Round 2 - Message consistency (hash):`, {
                    clientMessageSha256Hex: clientMsgHash,
                    serverMessageSha256Hex: serverMsgHash,
                    hashesMatch: clientMsgHash === serverMsgHash
                });
            } else {
                console.warn('[MPC Signing] Round 2 - Message consistency check skipped: invalid message fields');
            }
        } catch (_) {}
        console.log(`[MPC Signing] Round 2 - Using server-built signingPackage, length: ${signingPackage.length}`);
        // 🧪 DEV Round2 INPUT (raw, sensitive)
        try {
            console.log('[DEV] Round2 INPUT keyPackage (raw):', JSON.stringify(keyPackage));
            console.log('[DEV] Round2 INPUT nonces (raw):', serverNonces);
            console.log('[DEV] Round2 INPUT signingPackage (raw):', signingPackage);
        } catch(_) {}
         
         const round2Function = curve === 'secp256k1' ? 'secp_round2_sign' : 'ed_round2_sign';
         console.log(`[MPC Signing] Round 2 - Calling ${round2Function}`);
         
         const serverPartialSignature = mpcServer.frostWasm[round2Function](
             JSON.stringify(keyPackage),
             serverNonces,
             signingPackage
         );
        // 🧪 DEV Round2 OUTPUT (raw, sensitive)
        try { console.log('[DEV] Round2 OUTPUT serverPartialSignature (raw):', serverPartialSignature); } catch(_) {}
         
         console.log(`[MPC Signing] Round 2 - serverPartialSignature type: string`);

        // サーバーの部分署名のみを返す（集約はクライアント側で行う）
        console.log(`[MPC Signing] Round 2 sign completed for sessionId: ${sessionId}`);
        
        // セッションをクリーンアップ
        delete mpcServer.signingSessions[sessionId];
        
        // サーバーのpublicKeyPackageを取得（同じエポックから）
        const serverPublicKeyPackage = serverShare.publicKeyPackage;
        
        // 署名シェアのハッシュを計算（厳密一致チェック用）
        const signatureShareHash = require('crypto').createHash('sha256').update(serverPartialSignature).digest('hex');
        const signingPackageHash = require('crypto').createHash('sha256').update(signingPackage).digest('hex');
        
        // message_bytes_sha256_hexを計算（messageの扱い統一）
        const signingPackageObj = JSON.parse(signingPackage);
        const messageBytes = Buffer.from(signingPackageObj.message, 'hex');
        const messageBytesSha256Hex = require('crypto').createHash('sha256').update(messageBytes).digest('hex');
        
        res.json({
            success: true,
            sessionId: sessionId,
            epochInfo: serverShare ? {
                epochCounter: serverShare.epochCounter,
                pubkeyFingerprint: serverShare.pubkeyFingerprint
            } : null,
            serverPartialSignature: JSON.parse(serverPartialSignature),
            serverSigningPackage: signingPackage,  // サーバーで使用したsigningPackageを返す
            serverPublicKeyPackage: serverPublicKeyPackage,  // サーバーのpublicKeyPackageを返す
            // 厳密一致チェック用の情報
            serverSignerId: serverFrostId,  // サーバーの識別子（02固定）
            signatureShareHash: signatureShareHash,  // 署名シェアのハッシュ
            signingPackageHash: signingPackageHash,  // 署名パッケージのハッシュ
            messageBytesSha256Hex: messageBytesSha256Hex  // message_bytes_sha256_hex（messageの扱い統一）
        });
        
    } catch (error) {
        console.error('[MPC Signing] Round 2 sign endpoint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// 配列をmap形式に変換するユーティリティ関数
function arrayToMap(arr) {
    const map = {};
    arr.forEach((pkg, idx) => {
        if (pkg) {
            // pkgがオブジェクトの場合、そのキーをpartyIdとして使用
            const partyIds = Object.keys(pkg);
            partyIds.forEach(partyId => {
                if (pkg[partyId]) {
                    // pkg[partyId]がJSON文字列の場合はパースしてオブジェクトに変換
                    const packageObj = typeof pkg[partyId] === 'string' ? JSON.parse(pkg[partyId]) : pkg[partyId];
                    map[partyId] = packageObj;
                }
            });
        }
    });
    return map;
}







// ========================
// リフレッシュ型リシェア（新設計）エンドポイント
// ========================

/**
 * リフレッシュ型リシェア初期化エンドポイント
 * POST /mpcapi/<role>/reshare/init
 */
async function handleRefreshReshareInit(req, res) {
    try {
        
        const { 
            masterId, 
            curve, 
            sessionId, 
            currentEpoch, 
            targetEpoch, 
            verifyingKeyFingerprint, 
            participants 
        } = req.body;
        
        console.log(`[Server] Refresh reshare init: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || currentEpoch === undefined || targetEpoch === undefined || !verifyingKeyFingerprint || !participants) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, currentEpoch, targetEpoch, verifyingKeyFingerprint, participants'
            });
        }
        
        // 曲線の検証
        if (!['secp256k1', 'ed25519'].includes(curve)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid curve. Must be secp256k1 or ed25519'
            });
        }
        
        // エポックの検証
        if (targetEpoch !== currentEpoch + 1) {
            return res.status(400).json({
                success: false,
                error: 'targetEpoch must be currentEpoch + 1'
            });
        }
        
        // 参加者の検証
        const expectedRoles = ['client', 'server', 'guardian'];
        const participantIds = Object.keys(participants);
        
        if (participantIds.length !== 3) {
            return res.status(400).json({
                success: false,
                error: 'Must have exactly 3 participants'
            });
        }
        
        for (const [id, participant] of Object.entries(participants)) {
            console.log(`[Server] Validating participant ${id}:`, {
                role: participant.role,
                hasTransportPubkey: !!participant.transport_pubkey,
                hasTransportKeyEpoch: participant.transport_key_epoch !== undefined,
                transportKeyEpoch: participant.transport_key_epoch,
                transportPubkeyLength: participant.transport_pubkey ? participant.transport_pubkey.length : 0
            });
            
            if (!expectedRoles.includes(participant.role)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid role: ${participant.role}. Must be one of: ${expectedRoles.join(', ')}`
                });
            }
            if (!participant.transport_pubkey || participant.transport_key_epoch === undefined || participant.transport_key_epoch === null) {
                console.log(`[Server] Validation failed for participant ${id}:`, {
                    transport_pubkey: participant.transport_pubkey,
                    transport_key_epoch: participant.transport_key_epoch,
                    transport_pubkey_type: typeof participant.transport_pubkey,
                    transport_key_epoch_type: typeof participant.transport_key_epoch
                });
                return res.status(400).json({
                    success: false,
                    error: 'Each participant must have transport_pubkey and transport_key_epoch'
                });
            }
        }
        
        // データベースとの突合検証
        const dbVerification = await verifyDatabaseConsistency(masterId, curve, currentEpoch, verifyingKeyFingerprint, participants);
        if (!dbVerification.valid) {
            return res.status(412).json({
                success: false,
                error: 'PRECONDITION_FAILED',
                details: dbVerification.error
            });
        }
        
        // セッション重複チェック（クリーンアップして新規作成）
        const existingSession = await checkExistingSession(masterId, curve);
        if (existingSession) {
            console.log(`[Server] Refresh reshare init: existing session found for masterId=${masterId}, curve=${curve}, status=${existingSession.status}. Clearing and creating a new session.`);
            await clearExistingRefreshSessions(masterId, curve);
        }
        
        // セッション作成
        await createRefreshSession(sessionId, masterId, curve, currentEpoch, targetEpoch, verifyingKeyFingerprint, participants);
        
        // サーバーのFROST IDを取得
        const myFrostId = normalizeFrostId(curve, 2); // サーバーは常にパーティ2
        
        // サーバーのトランスポート公開鍵を取得
        const myTransportPubkey = participants[myFrostId]?.transport_pubkey;
        
        res.json({
            success: true,
            role: 'server',
            myFrostId: myFrostId,
            curve: curve,
            sessionId: sessionId,
            currentEpoch: currentEpoch,
            targetEpoch: targetEpoch,
            verifyingKeyFingerprint: verifyingKeyFingerprint,
            transport_pubkey: myTransportPubkey,
            policy: {
                public_key_package: 'no_change',
                newKeyPackages: false
            }
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare init failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * データベースとの整合性を検証
 */
async function verifyDatabaseConsistency(masterId, curve, currentEpoch, verifyingKeyFingerprint, participants) {
    try {
        // 現在のエポックとフィンガープリントを取得
        const query = `
            SELECT epoch_counter, pubkey_fingerprint 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        
        if (rows.length === 0) {
            return {
                valid: false,
                error: 'No existing shares found for this masterId and curve'
            };
        }
        
        const dbEpoch = rows[0].epoch_counter;
        const dbFingerprint = rows[0].pubkey_fingerprint;
        
        console.log(`[Server] Database consistency check:`, {
            masterId: masterId,
            curve: curve,
            currentEpoch: currentEpoch,
            dbEpoch: dbEpoch,
            verifyingKeyFingerprint: verifyingKeyFingerprint,
            dbFingerprint: dbFingerprint,
            epochMatch: dbEpoch === currentEpoch,
            fingerprintMatch: dbFingerprint === verifyingKeyFingerprint
        });
        
        if (dbEpoch !== currentEpoch) {
            return {
                valid: false,
                error: `Epoch mismatch: expected ${currentEpoch}, found ${dbEpoch}`
            };
        }
        
        if (dbFingerprint !== verifyingKeyFingerprint) {
            return {
                valid: false,
                error: `Fingerprint mismatch: expected ${verifyingKeyFingerprint}, found ${dbFingerprint}`
            };
        }
        
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: `Database verification failed: ${error.message}`
        };
    }
}

/**
 * 既存セッションのチェック
 */
async function checkExistingSession(masterId, curve) {
    try {
        const query = `
            SELECT session_id, status 
            FROM refresh_sessions 
            WHERE master_id = ? AND curve = ? AND status IN ('created', 'round1_completed', 'delivery_in_progress')
        `;
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('[Server] Error checking existing session:', error);
        return null;
    }
}

/**
 * 既存のリフレッシュセッションと関連インボックスのクリーンアップ
 */
async function clearExistingRefreshSessions(masterId, curve) {
    try {
        // 関連インボックスを先に削除
        const selQuery = `
            SELECT session_id FROM refresh_sessions WHERE master_id = ? AND curve = ?
        `;
        const [selResult] = await executeQuery(selQuery, [masterId, curve]);
        const selRows = selResult || [];
        const sessionIds = selRows.map(r => r.session_id);
        if (sessionIds.length > 0) {
            // MySQLではIN句に配列を直接渡す
            const placeholders = sessionIds.map(() => '?').join(',');
            const delInboxQuery = `
                DELETE FROM reshare_inbox WHERE session_id IN (${placeholders})
            `;
            try {
                await executeQuery(delInboxQuery, sessionIds);
            } catch (err) {
                if (err && err.code === '42P01') {
                    console.warn('[Server] reshare_inbox table not found. Skipping inbox cleanup.');
                } else {
                    throw err;
                }
            }
        }

        // セッション本体を削除
        const delSessionQuery = `
            DELETE FROM refresh_sessions WHERE master_id = ? AND curve = ?
        `;
        await executeQuery(delSessionQuery, [masterId, curve]);

        console.log(`[Server] Cleared existing refresh sessions for masterId=${masterId}, curve=${curve}`);
    } catch (error) {
        console.error('[Server] Error clearing existing refresh sessions:', error);
        throw error;
    }
}

/**
 * リフレッシュセッションの作成
 */
async function createRefreshSession(sessionId, masterId, curve, currentEpoch, targetEpoch, verifyingKeyFingerprint, participants) {
    try {
        const query = `
            INSERT INTO refresh_sessions (
                session_id, master_id, curve, current_epoch, target_epoch, 
                verifying_key_fingerprint, participants, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', NOW())
        `;
        await executeQuery(query, [
            sessionId, masterId, curve, currentEpoch, targetEpoch, 
            verifyingKeyFingerprint, JSON.stringify(participants)
        ]);
    } catch (error) {
        console.error('[Server] Error creating refresh session:', error);
        throw error;
    }
}

/**
 * リフレッシュ型リシェア Round1 エンドポイント
 * POST /mpcapi/<role>/reshare/round1
 */
async function handleRefreshReshareRound1(req, res) {
    try {
        
        const { masterId, curve, sessionId, targetEpoch } = req.body;
        
        console.log(`[Server] Refresh reshare round1: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || targetEpoch === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, targetEpoch'
            });
        }
        
        // セッションの存在確認と状態検証
        const session = await getRefreshSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        if (session.status !== 'created') {
            return res.status(409).json({
                success: false,
                error: 'CONFLICT',
                details: `Session is in ${session.status} state, expected 'created'`
            });
        }
        
        if (session.target_epoch !== targetEpoch) {
            return res.status(400).json({
                success: false,
                error: 'targetEpoch mismatch'
            });
        }
        
        // WASM 環境の保証
        if (!mpcServer || !mpcServer.frostWasm) {
            return res.status(503).json({
                success: false,
                error: 'FROST WASM is not available on server'
            });
        }

        // 現在の署名シェアを取得
        const currentSigningShareData = await getCurrentSigningShare(masterId, curve);
        if (!currentSigningShareData || !currentSigningShareData.keyPackage) {
            return res.status(404).json({
                success: false,
                error: 'Current signing share not found'
            });
        }
        const currentSigningShare = currentSigningShareData.keyPackage.signing_share;
        
        // WASM関数を呼び出してRound1を実行
        const partyId = 2; // サーバーは常にパーティ2
        const maxSigners = 3;
        const minSigners = 2;
        
        let round1Result;
        if (curve === 'secp256k1') {
            round1Result = JSON.parse(mpcServer.frostWasm.secp_refresh_round1(partyId, maxSigners, minSigners));
        } else if (curve === 'ed25519') {
            round1Result = JSON.parse(mpcServer.frostWasm.ed_refresh_round1(partyId, maxSigners, minSigners));
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid curve'
            });
        }
        
        // ローカル秘密を安全に保存（データベースには保存しない）
        const localSecret = round1Result.local_secret;
        await storeLocalSecret(sessionId, localSecret);
        
        // セッション状態を更新
        await updateRefreshSessionStatus(sessionId, 'round1_completed');
        
        // サーバーのFROST IDを取得
        const partyFrostId = normalizeFrostId(curve, partyId);
        
        res.json({
            success: true,
            partyFrostId: partyFrostId,
            commitment: round1Result.commitment
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare round1 failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * リフレッシュ型リシェア Round1 コミットメント配布エンドポイント
 * POST /mpcapi/server/reshare/round1/distribute-commitments
 */
async function handleRefreshReshareDistributeCommitments(req, res) {
    try {
        const { masterId, curve, sessionId, allCommitments } = req.body;
        
        console.log(`[Server] Refresh reshare distribute commitments: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || !allCommitments) {
            console.log(`[Server] 🔧 handleRefreshReshareDistributeCommitments called - URL: ${req.url}, Method: ${req.method}`);
            console.log(`[Server] 🔧 handleRefreshReshareDistributeCommitments request body:`, JSON.stringify(req.body, null, 2));
            console.log(`[Server] 400 Error - Missing parameters:`, {
                masterId: !!masterId,
                curve: !!curve,
                sessionId: !!sessionId,
                allCommitments: !!allCommitments,
                requestBody: req.body
            });
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, allCommitments'
            });
        }
        
        // セッションの存在確認と状態検証
        const session = await getRefreshSession(sessionId);
        if (!session) {
            console.log(`[Server] 404 Error - Session not found:`, { sessionId });
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        console.log(`[Server] Session found:`, { 
            sessionId, 
            status: session.status, 
            expectedStatus: 'round1_completed',
            statusMatch: session.status === 'round1_completed'
        });
        
        if (session.status !== 'round1_completed') {
            console.log(`[Server] 409 Error - Session status mismatch:`, { 
                sessionId, 
                actualStatus: session.status, 
                expectedStatus: 'round1_completed' 
            });
            return res.status(409).json({
                success: false,
                error: 'CONFLICT',
                details: `Session is in ${session.status} state, expected 'round1_completed'`
            });
        }
        
        // targetEpochはセッションから取得して検証
        const targetEpoch = session.target_epoch;
        if (!targetEpoch) {
            return res.status(400).json({
                success: false,
                error: 'targetEpoch not found in session'
            });
        }
        
        // コミットメントの検証
        if (!allCommitments || typeof allCommitments !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid allCommitments format'
            });
        }
        
        // 期待されるパーティのコミットメントが含まれているかチェック
        // secp256k1とed25519でFROST IDの形式が異なる
        let expectedParties;
        if (curve === 'secp256k1') {
            expectedParties = ['0000000000000000000000000000000000000000000000000000000000000001', // クライアント
                              '0000000000000000000000000000000000000000000000000000000000000002', // サーバー
                              '0000000000000000000000000000000000000000000000000000000000000003']; // ガーディアン
        } else if (curve === 'ed25519') {
            expectedParties = ['0100000000000000000000000000000000000000000000000000000000000000', // クライアント
                              '0200000000000000000000000000000000000000000000000000000000000000', // サーバー
                              '0300000000000000000000000000000000000000000000000000000000000000']; // ガーディアン
        } else {
            return res.status(400).json({
                success: false,
                error: `Unsupported curve: ${curve}`
            });
        }
        
        const missingParties = expectedParties.filter(partyId => !allCommitments[partyId]);
        if (missingParties.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Missing commitments for parties: ${missingParties.join(', ')}`
            });
        }
        
        // サーバーのコミットメントを保存（データベースに保存）
        const serverPartyId = curve === 'secp256k1' ? '0000000000000000000000000000000000000000000000000000000000000002' : '0200000000000000000000000000000000000000000000000000000000000000';
        const serverCommitments = allCommitments[serverPartyId];
        if (serverCommitments) {
            try {
                const query = `
                    INSERT INTO reshare_commitments (session_id, party_id, curve_type, commitments, nonces)
                    VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        commitments = VALUES(commitments),
                        nonces = VALUES(nonces),
                        created_at = NOW()
                `;
                await executeQuery(query, [sessionId, 2, curve, JSON.stringify(serverCommitments), JSON.stringify({})]);
                console.log(`[Server] Saved server commitments for session: ${sessionId}`);
            } catch (error) {
                console.error('[Server] Failed to save server commitments:', error);
            }
        }
        
        // 全員分のコミットメントを保存（Round2で使用するため）
        try {
            const query = `
                INSERT INTO reshare_all_commitments (session_id, curve_type, all_commitments)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    all_commitments = VALUES(all_commitments),
                    created_at = NOW()
            `;
            await executeQuery(query, [sessionId, curve, JSON.stringify(allCommitments)]);
            console.log(`[Server] Saved all commitments for session: ${sessionId}`);
        } catch (error) {
            console.error('[Server] Failed to save all commitments:', error);
        }
        
        // セッション状態を更新（既存の許可されたステータスを使用）
        await updateRefreshSessionStatus(sessionId, 'round1_completed');
        
        res.json({
            success: true,
            message: 'Commitments distributed successfully',
            receivedCommitments: allCommitments,
            totalParties: Object.keys(allCommitments).length
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare distribute commitments failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * リフレッシュ型リシェア Round1 ガーディアンコミットメント配布エンドポイント
 * POST /mpcapi/guardian/reshare/round1/distribute-commitments
 */
async function handleGuardianRefreshReshareDistributeCommitments(req, res) {
    try {
        const { masterId, curve, sessionId, targetEpoch, allCommitments } = req.body;
        
        console.log(`[Server] Guardian refresh reshare distribute commitments: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || targetEpoch === undefined || !allCommitments) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, targetEpoch, allCommitments'
            });
        }
        
        // ガーディアンサービスに中継
        const guardianService = require('./services/GuardianService');
        const guardianServiceInstance = new guardianService({}, console);
        
        const result = await guardianServiceInstance.handleReshareDistributeCommitments({
            masterId,
            curve,
            sessionId,
            targetEpoch,
            allCommitments,
            authHeader: req.headers.authorization
        });
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
        
    } catch (error) {
        console.error('[Server] Guardian refresh reshare distribute commitments failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * リフレッシュ型リシェア用テーブルの作成
 * 注意: テーブル作成SQLは docs/README-db.md に移動されました
 * 本番環境では事前にテーブルを作成してください
 */
async function createRefreshTables() {
    console.log('[Server] Refresh reshare tables should be created using SQL in docs/README-db.md');
    console.log('[Server] Skipping table creation in code - tables should exist in database');
}

/**
 * リフレッシュセッションの取得
 */
async function getRefreshSession(sessionId) {
    try {
        const query = `
            SELECT * FROM refresh_sessions WHERE session_id = ?
        `;
        const [result] = await executeQuery(query, [sessionId]);
        const rows = result || [];
        if (rows.length > 0) {
            const session = rows[0];
            // participantsをJSON文字列からオブジェクトにパース
            if (session.participants && typeof session.participants === 'string') {
                session.participants = JSON.parse(session.participants);
            }
            return session;
        }
        return null;
    } catch (error) {
        if (error.code === '42P01') { // relation does not exist
            console.warn('[Server] refresh_sessions table does not exist, creating it...');
            await createRefreshTables();
            return null; // テーブル作成後は空の結果を返す
        }
        console.error('[Server] Error getting refresh session:', error);
        return null;
    }
}



/**
 * ローカル秘密の保存（メモリまたは短期ストレージ）
 */
async function storeLocalSecret(sessionId, localSecret) {
    try {
        // 実際の実装では、セキュアなメモリストレージまたは暗号化された短期ストレージを使用
        // ここでは簡易的にセッションテーブルに保存（本番では別の安全な方法を使用）
        const query = `
            UPDATE refresh_sessions 
            SET local_secret = ?, updated_at = NOW() 
            WHERE session_id = ?
        `;
        await executeQuery(query, [localSecret, sessionId]);
    } catch (error) {
        console.error('[Server] Error storing local secret:', error);
        throw error;
    }
}

/**
 * リフレッシュセッション状態の更新
 */
async function updateRefreshSessionStatus(sessionId, status) {
    try {
        const query = `
            UPDATE refresh_sessions 
            SET status = ?, updated_at = NOW() 
            WHERE session_id = ?
        `;
        await executeQuery(query, [status, sessionId]);
    } catch (error) {
        console.error('[Server] Error updating refresh session status:', error);
        throw error;
    }
}

/**
 * リフレッシュ型リシェア Round2 エンドポイント
 * POST /mpcapi/<role>/reshare/round2
 */
async function handleRefreshReshareRound2(req, res) {
    try {
        console.log(`[Server] 🔧 handleRefreshReshareRound2 called - URL: ${req.url}, Method: ${req.method}`);
        console.log(`[Server] 🔧 handleRefreshReshareRound2 request body:`, JSON.stringify(req.body, null, 2));
        
        const { masterId, curve, sessionId, commitments } = req.body;
        
        console.log(`[Server] Refresh reshare round2: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || !commitments) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, commitments'
            });
        }
        
        // セッションの存在確認と状態検証
        const session = await getRefreshSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        if (session.status !== 'round1_completed') {
            return res.status(409).json({
                success: false,
                error: 'CONFLICT',
                details: `Session is in ${session.status} state, expected 'round1_completed'`
            });
        }
        
        // ローカル秘密を取得
        const localSecret = session.local_secret;
        if (!localSecret) {
            return res.status(404).json({
                success: false,
                error: 'Local secret not found'
            });
        }
        
        // WASM 環境の保証
        if (!mpcServer || !mpcServer.frostWasm) {
            return res.status(503).json({
                success: false,
                error: 'FROST WASM is not available on server'
            });
        }

        // WASM関数を呼び出してRound2を実行
        let round2Result;
        if (curve === 'secp256k1') {
            round2Result = JSON.parse(mpcServer.frostWasm.secp_refresh_round2(localSecret, JSON.stringify(commitments)));
        } else if (curve === 'ed25519') {
            round2Result = JSON.parse(mpcServer.frostWasm.ed_refresh_round2(localSecret, JSON.stringify(commitments)));
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid curve'
            });
        }
        
        // round2Resultの全体構造を詳細にログ出力
        console.log(`[Server] ===== round2Result FULL STRUCTURE =====`);
        console.log(`[Server] round2Result type:`, typeof round2Result);
        console.log(`[Server] round2Result keys:`, Object.keys(round2Result || {}));
        console.log(`[Server] round2Result full content:`, JSON.stringify(round2Result, null, 2));
        console.log(`[Server] ===== END round2Result STRUCTURE =====`);
        
        // セッションからparticipantsを取得
        const sessionParticipants = session.participants;
        if (!sessionParticipants) {
            return res.status(400).json({
                success: false,
                error: 'Participants not found in session'
            });
        }
        
        console.log(`[Server] Refresh reshare round2 participants:`, sessionParticipants);
        
        // round2Resultの詳細をログ出力
        console.log(`[Server] round2Result:`, JSON.stringify(round2Result, null, 2));
        console.log(`[Server] round2Result.outbox keys:`, Object.keys(round2Result.outbox || {}));
        console.log(`[Server] round2Result.outbox content:`, round2Result.outbox);
        
        // 受取人別の暗号化ペイロードを生成
        console.log(`[Server] Generating encrypted outbox for session ${sessionId}`);
        const encryptedOutbox = await generateEncryptedOutbox(round2Result.outbox, sessionParticipants, session);
        console.log(`[Server] Encrypted outbox generated successfully for session ${sessionId}`);
        
        // inbox payloadsを保存
        console.log(`[Server] Saving inbox payloads for session ${sessionId}`);
        await saveInboxPayloads(sessionId, round2Result.outbox, sessionParticipants, session);
        console.log(`[Server] Inbox payloads saved successfully for session ${sessionId}`);
        
        // セッション状態を更新
        console.log(`[Server] Updating session ${sessionId} status to delivery_in_progress`);
        await updateRefreshSessionStatus(sessionId, 'delivery_in_progress');
        console.log(`[Server] Session ${sessionId} status updated successfully`);
        
        // サーバーのFROST IDを取得
        const partyFrostId = normalizeFrostId(curve, 2);
        
        // 正規仕様: クライアントは shares を必須で期待する。暗号化配布形式を shares 名で返す
        res.json({
            success: true,
            from: partyFrostId,
            shares: encryptedOutbox
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare round2 failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * 暗号化されたアウトボックスを生成
 */
async function generateEncryptedOutbox(outbox, participants, session) {
    const encryptedOutbox = {};
    
    for (const [recipientId, payload] of Object.entries(outbox)) {
        // 自分宛は返さない
        if (recipientId === normalizeFrostId(session.curve, 2)) {
            continue;
        }
        
        // 受取人のトランスポート公開鍵を取得
        const recipient = participants[recipientId];
        if (!recipient || !recipient.transport_pubkey) {
            console.warn(`[Server] No transport pubkey for recipient ${recipientId}`);
            continue;
        }
        
        // 平文ペイロードを構築
        const plaintextPayload = {
            header: payload.header,
            signing_share: payload.evaluation,
            sessionId: session.session_id,
            curve: session.curve,
            targetEpoch: session.target_epoch,
            from: payload.from,
            to: payload.to,
            ciphersuite: session.curve === 'secp256k1' ? 'FROST-secp256k1-SHA256-v1' : 'FROST-Ed25519-SHA512-v1'
        };
        
        // 暗号化（簡易実装 - 本番ではHPKE/X25519を使用）
        const encryptedPayload = await encryptPayload(plaintextPayload, recipient.transport_pubkey, session);
        
        encryptedOutbox[recipientId] = encryptedPayload;
    }
    
    return encryptedOutbox;
}

/**
 * inbox payloadsを保存
 */
async function saveInboxPayloads(sessionId, outbox, participants, session) {
    console.log(`[Server] saveInboxPayloads called for session ${sessionId}`);
    console.log(`[Server] outbox keys:`, Object.keys(outbox));
    console.log(`[Server] participants keys:`, Object.keys(participants));
    
    for (const [wasmFrostId, payload] of Object.entries(outbox)) {
        console.log(`[Server] Processing WASM FrostId: ${wasmFrostId}`);
        
        // 自分宛は保存しない
        const serverFrostId = normalizeFrostId(session.curve, 2);
        if (wasmFrostId === serverFrostId) {
            console.log(`[Server] Skipping self-payload for server ${serverFrostId}`);
            continue;
        }
        
        // 受取人のトランスポート公開鍵を取得
        // WASM関数の出力キーをそのまま使用
        const recipient = participants[wasmFrostId];
        if (!recipient || !recipient.transport_pubkey) {
            console.warn(`[Server] No transport pubkey for recipient ${wasmFrostId}`);
            continue;
        }
        
        console.log(`[Server] Saving inbox payload for recipient ${wasmFrostId}`);
        
        // 平文ペイロードを構築
        const plaintextPayload = {
            header: payload.header,
            signing_share: payload.evaluation,
            sessionId: session.session_id,
            curve: session.curve,
            targetEpoch: session.target_epoch,
            from: payload.from,
            to: payload.to,
            ciphersuite: session.curve === 'secp256k1' ? 'FROST-secp256k1-SHA256-v1' : 'FROST-Ed25519-SHA512-v1'
        };
        
        // inboxに保存
        await saveInboxPayload(sessionId, payload.from, payload.to, plaintextPayload);
    }
}

/**
 * ペイロードの暗号化（簡易実装）
 */
async function encryptPayload(plaintextPayload, recipientPubkey, session) {
    try {
        // 実際の実装では、HPKE (RFC9180) または X25519 + ChaCha20-Poly1305 を使用
        // ここでは簡易的にBase64エンコードを使用（本番では適切な暗号化を実装）
        const plaintext = JSON.stringify(plaintextPayload);
        const ciphertext = Buffer.from(plaintext).toString('base64');
        
        // AAD（追加認証データ）を構築
        const aad = {
            masterId: session.master_id,
            sessionId: session.session_id,
            curve: session.curve,
            targetEpoch: session.target_epoch,
            from: plaintextPayload.from,
            to: plaintextPayload.to,
            ciphersuite: plaintextPayload.ciphersuite,
            purpose: 'frost-reshare-round2'
        };
        
        // 簡易的な署名（本番ではEd25519署名を使用）
        const signature = Buffer.from(JSON.stringify(aad)).toString('base64');
        
        return {
            alg: 'HPKE-X25519-CHACHA20POLY1305', // 実際のアルゴリズム
            sender_pub: 'B64...', // 送信者の公開鍵
            nonce: 'B64...', // ノンス
            ciphertext: ciphertext,
            sig: signature
        };
    } catch (error) {
        console.error('[Server] Error encrypting payload:', error);
        throw error;
    }
}

/**
 * 現在の署名シェアを取得
 */
async function getCurrentSigningShare(masterId, curve) {
    try {
        console.log(`[Server] getCurrentSigningShare called with:`, {
            masterId,
            curve,
            masterIdType: typeof masterId,
            curveType: typeof curve,
            masterIdLength: masterId ? masterId.length : 0,
            curveLength: curve ? curve.length : 0
        });
        
        const query = `
            SELECT key_package, epoch_counter, pubkey_fingerprint
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        
        console.log(`[Server] Executing query:`, {
            query: query,
            parameters: [masterId, curve],
            masterId,
            curve
        });
        
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        
        console.log(`[Server] getCurrentSigningShare query result:`, {
            masterId,
            curve,
            rowCount: rows.length,
            hasRows: rows.length > 0,
            query: query,
            parameters: [masterId, curve],
            resultRows: rows
        });
        
        if (rows.length > 0) {
            console.log(`[Server] Found existing share:`, {
                epochCounter: rows[0].epoch_counter,
                pubkeyFingerprint: rows[0].pubkey_fingerprint,
                hasKeyPackage: !!rows[0].key_package
            });
        }
        
        if (rows.length === 0) {
            console.log(`[Server] No existing shares found for masterId: ${masterId}, curve: ${curve}`);
            return null;
        }
        
        const row = rows[0];
        console.log(`[Server] Retrieved row from database:`, {
            epochCounter: row.epoch_counter,
            pubkeyFingerprint: row.pubkey_fingerprint,
            pubkeyFingerprintType: typeof row.pubkey_fingerprint,
            hasKeyPackage: !!row.key_package
        });
        
                const keyPackage = typeof row.key_package === 'string' 
                    ? JSON.parse(row.key_package) 
                    : row.key_package;
                
                console.log(`[Server] Parsed keyPackage:`, {
                    masterId,
                    curve,
                    keyPackageType: typeof keyPackage,
                    keyPackageKeys: keyPackage ? Object.keys(keyPackage) : null,
                    signingShare: keyPackage ? keyPackage.signing_share : null,
                    signingShareType: keyPackage ? typeof keyPackage.signing_share : null,
                    hasSigningShare: keyPackage ? !!keyPackage.signing_share : false
                });
                    
                return {
                    keyPackage,
                    epochCounter: row.epoch_counter,
                    pubkeyFingerprint: row.pubkey_fingerprint
                };
    } catch (error) {
        console.error('[Server] Error getting current signing share:', error);
        throw error;
    }
}


/**
 * ペイロードを復号化
 */
async function decryptPayload(encryptedPayload, session) {
    try {
        // 暫定HPKE互換: alg/sender_pub/nonce/ciphertext/sig を受け取り、ciphertext を Base64→JSON
        if (!encryptedPayload || typeof encryptedPayload !== 'object') {
            throw new Error('Invalid encrypted payload');
        }

        const { alg, sender_pub, nonce, ciphertext, sig } = encryptedPayload;
        if (!ciphertext) throw new Error('ciphertext missing');
        // TODO: alg/sender_pub/nonce/sig の検証（将来実装）。現状は ciphertext のみ使用
        const decrypted = Buffer.from(ciphertext, 'base64').toString('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('[Server] Error decrypting payload:', error);
        throw error;
    }
}

/**
 * インボックスにペイロードを保存
 */
async function saveInboxPayload(sessionId, fromParty, toParty, payload) {
    try {
        console.log(`[Server] saveInboxPayload called: session=${sessionId}, from=${fromParty}, to=${toParty}`);
        console.log(`[Server] payload content:`, JSON.stringify(payload, null, 2));
        
        const query = `
            INSERT INTO reshare_inbox (session_id, from_party, to_party, payload)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
                payload = VALUES(payload), 
                created_at = CURRENT_TIMESTAMP
        `;
        
        await executeQuery(query, [sessionId, fromParty, toParty, JSON.stringify(payload)]);
        
        console.log(`[Server] Inbox payload saved successfully: session=${sessionId}, from=${fromParty}, to=${toParty}`);
    } catch (error) {
        console.error('[Server] Error saving inbox payload:', error);
        throw error;
    }
}

/**
 * リフレッシュ型リシェア Receive エンドポイント
 * POST /mpcapi/<role>/reshare/receive
 */
async function handleRefreshReshareReceive(req, res) {
    try {
        
        const { masterId, curve, sessionId, to, from, payload } = req.body;
        
        console.log(`[Server] Refresh reshare receive: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}, from=${from}, to=${to}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || !to || !from || !payload) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, to, from, payload'
            });
        }
        
        // セッションの存在確認
        const session = await getRefreshSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        // ペイロードを復号化
        const decryptedPayload = await decryptPayload(payload, session);
        
        // インボックスに保存
        await saveInboxPayload(sessionId, from, to, decryptedPayload);
        
        // インボックス内のペイロード数を取得
        const countQuery = `
            SELECT COUNT(*) as count
            FROM reshare_inbox 
            WHERE session_id = ? AND to_party = ?
        `;
        const [countResult] = await executeQuery(countQuery, [sessionId, to]);
        const countRows = countResult || [];
        const count = countRows[0]?.count || 0;
        
        res.json({
            success: true,
            accepted: true,
            inboxCount: parseInt(countResult.rows[0].count)
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare receive error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * リフレッシュ型リシェア Status エンドポイント
 * GET /mpcapi/<role>/reshare/status
 */
async function handleRefreshReshareStatus(req, res) {
    try {
        
        const { sessionId } = req.query;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'sessionId is required'
            });
        }
        
        // セッションの存在確認
        const session = await getRefreshSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        // インボックス内のペイロード数を取得
        const countQuery = `
            SELECT COUNT(*) as count
            FROM reshare_inbox 
            WHERE session_id = ?
        `;
        const countResult = await executeQuery(countQuery, [sessionId]);
        
        res.json({
            success: true,
            curve: session.curve,
            sessionId: sessionId,
            status: session.status,
            epoch: session.target_epoch,
            group: {
                verifying_key_fingerprint: session.verifying_key_fingerprint
            },
            policy: {
                public_key_package: "no_change"
            },
            inboxCount: parseInt(countResult.rows[0].count)
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare status error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * リフレッシュ型リシェア Finalize エンドポイント
 * POST /mpcapi/<role>/reshare/finalize
 */
async function handleRefreshReshareFinalize(req, res) {
    try {
        
        const { masterId, curve, sessionId, expectFrom } = req.body;
        
        console.log(`[Server] Refresh reshare finalize: masterId=${masterId}, curve=${curve}, sessionId=${sessionId}`);
        
        // 必須パラメータの検証
        if (!masterId || !curve || !sessionId || !expectFrom) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters: masterId, curve, sessionId, expectFrom'
            });
        }
        
        // テーブルが存在しない場合は作成
        try {
            await executeQuery('SELECT 1 FROM refresh_sessions LIMIT 1');
        } catch (error) {
            if (error.code === '42P01') { // relation does not exist
                console.warn('[Server] refresh_sessions table does not exist, creating it...');
                await createRefreshTables();
            }
        }

        // セッションを取得
        const session = await getRefreshSession(sessionId);
        console.log(`[Server] Retrieved session for ${sessionId}:`, session ? { status: session.status, hasLocalSecret: !!session.local_secret } : 'null');
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        
        // セッションからtargetEpochを取得
        const targetEpoch = session.target_epoch;
        const epochCounter = targetEpoch; // リシェアではtargetEpochで保存
        console.log(`[Server] Refresh reshare: using session targetEpoch ${targetEpoch}, epochCounter ${epochCounter}`);
        
        if (session.status !== 'delivery_in_progress') {
            return res.status(409).json({
                success: false,
                error: 'CONFLICT',
                details: `Session is in ${session.status} state, expected 'delivery_in_progress'`
            });
        }
        
        // インボックスから期待される送信者からのペイロードを取得
        const inboxPayloads = await getInboxPayloads(sessionId, expectFrom);
        console.log(`[Server] Finalize inbox payloads check:`, {
            sessionId,
            expectFrom,
            expectFromLength: expectFrom.length,
            inboxPayloadsLength: inboxPayloads.length,
            inboxPayloads: inboxPayloads
        });
        
        if (inboxPayloads.length !== expectFrom.length) {
            return res.status(422).json({
                success: false,
                error: 'Insufficient inbox payloads',
                details: `Expected ${expectFrom.length}, found ${inboxPayloads.length}`
            });
        }
        
        // ローカル秘密を取得
        const localSecret = session.local_secret;
        if (!localSecret) {
            return res.status(404).json({
                success: false,
                error: 'Local secret not found'
            });
        }
        
        // 現在の署名シェアを取得
        const currentSigningShareData2 = await getCurrentSigningShare(masterId, curve);
        if (!currentSigningShareData2 || !currentSigningShareData2.keyPackage) {
            return res.status(404).json({
                success: false,
                error: 'Current signing share not found'
            });
        }
        const currentSigningShare = currentSigningShareData2.keyPackage.signing_share;
        
        // 4. 評価値統合: 全パーティからの評価値の加算
        console.log(`[Server] Starting evaluation value integration process...`);
        
        // 数学的処理: スカラー加算関数（曲線の位数でモジュラ演算）
        const N_SECP = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
        const L_ED = BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed');
        const hexToBigInt = (h) => (h && h.length ? BigInt('0x' + h) : 0n);
        const toFixedHex = (x) => x.toString(16).padStart(64, '0');
        
        const addScalars = (hex1, hex2, curve) => {
            const scalar1 = hexToBigInt(hex1);
            const scalar2 = hexToBigInt(hex2);
            const modulus = curve === 'secp256k1' ? N_SECP : L_ED;
            const sum = (scalar1 + scalar2) % modulus;
            return toFixedHex(sum);
        };
        
        // セッションから参加パーティを取得
        const sessionParticipantsObj = session.participants || {};
        console.log(`[Server] Session participants for evaluation integration:`, sessionParticipantsObj);
        
        // 参加パーティのIDを配列として取得
        const sessionParticipants = Object.keys(sessionParticipantsObj);
        console.log(`[Server] Session participant IDs:`, sessionParticipants);
        
        // 各受信者(toFrostId)について、全送信者(from)からの evaluation を加算（曲線の位数でモジュラ）
        const combinedInbox = {};
        sessionParticipants.forEach(toPid => {
            const toFrostId = normalizeFrostId(curve, toPid);
            let acc = 0n;
            sessionParticipants.forEach(fromPid => {
                const payload = inboxPayloads.find(p => 
                    normalizeFrostId(curve, p.from) === normalizeFrostId(curve, fromPid) &&
                    normalizeFrostId(curve, p.to) === toFrostId
                );
                if (payload && payload.evaluation) {
                    acc += hexToBigInt(payload.evaluation);
                }
            });
            acc = curve === 'secp256k1' ? (acc % N_SECP) : (acc % L_ED);
            combinedInbox[toFrostId] = {
                from: toFrostId,
                to: toFrostId,
                evaluation: toFixedHex(acc),
                header: { ciphersuite: curve }
            };
        });
        
        console.log(`[Server] Combined inbox for evaluation integration:`, {
            combinedInboxKeys: Object.keys(combinedInbox),
            firstEntry: combinedInbox[Object.keys(combinedInbox)[0]]
        });
        
        // インボックスをWASM関数用の形式に変換（統合された評価値を使用）
        const inboxMap = combinedInbox;
        
        // WASM 環境の保証
        if (!mpcServer || !mpcServer.frostWasm) {
            return res.status(503).json({
                success: false,
                error: 'FROST WASM is not available on server'
            });
        }

        // round1パッケージを取得（データベースから取得）
        const round1Packages = await mpcServer.getAllReshareCommitments(sessionId, curve);
        console.log(`[Server] Round1 packages from database:`, {
            hasRound1Packages: !!round1Packages,
            round1PackagesKeys: round1Packages ? Object.keys(round1Packages) : [],
            round1PackagesCount: round1Packages ? Object.keys(round1Packages).length : 0
        });
        
        if (!round1Packages || Object.keys(round1Packages).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Round1 packages not found in database'
            });
        }
        
        // WASM関数を呼び出してFinalizeを実行
        console.log(`[Server] Calling WASM finalize function for curve: ${curve}`);
        console.log(`[Server] Input parameters:`, {
            localSecretType: typeof localSecret,
            localSecretLength: localSecret ? localSecret.length : 0,
            localSecretPreview: localSecret ? localSecret.substring(0, 100) + '...' : 'null',
            round1PackagesKeys: Object.keys(round1Packages),
            round1PackagesSize: Object.keys(round1Packages).length,
            round1PackagesPreview: JSON.stringify(round1Packages).substring(0, 200) + '...',
            inboxMapKeys: Object.keys(inboxMap),
            inboxMapSize: Object.keys(inboxMap).length,
            inboxMapPreview: JSON.stringify(inboxMap).substring(0, 200) + '...'
        });
        
        let finalizeResult;
        try {
            if (curve === 'secp256k1') {
                console.log(`[Server] Calling secp_refresh_finalize_shares`);
                const round1PackagesStr = JSON.stringify(round1Packages);
                const inboxMapStr = JSON.stringify(inboxMap);
                console.log(`[Server] secp_refresh_finalize_shares arguments:`, {
                    localSecretLength: localSecret ? localSecret.length : 0,
                    localSecretPreview: localSecret ? localSecret.substring(0, 64) + '...' : 'null',
                    round1PackagesStrLength: round1PackagesStr.length,
                    round1PackagesStrPreview: round1PackagesStr.substring(0, 200) + '...',
                    inboxMapStrLength: inboxMapStr.length,
                    inboxMapStrPreview: inboxMapStr.substring(0, 200) + '...'
                });
                finalizeResult = mpcServer.frostWasm.secp_refresh_finalize_shares(
                    localSecret, // secret_package_str
                    round1PackagesStr, // round1_packages_str (データベースから取得)
                    inboxMapStr // round2_packages_str (受信箱)
                );
                console.log(`[Server] secp_refresh_finalize_shares completed successfully`);
            } else if (curve === 'ed25519') {
                console.log(`[Server] Calling ed_refresh_finalize_shares`);
                const round1PackagesStr = JSON.stringify(round1Packages);
                const inboxMapStr = JSON.stringify(inboxMap);
                console.log(`[Server] ed_refresh_finalize_shares arguments:`, {
                    localSecretLength: localSecret ? localSecret.length : 0,
                    localSecretPreview: localSecret ? localSecret.substring(0, 64) + '...' : 'null',
                    round1PackagesStrLength: round1PackagesStr.length,
                    round1PackagesStrPreview: round1PackagesStr.substring(0, 200) + '...',
                    inboxMapStrLength: inboxMapStr.length,
                    inboxMapStrPreview: inboxMapStr.substring(0, 200) + '...'
                });
                finalizeResult = mpcServer.frostWasm.ed_refresh_finalize_shares(
                    localSecret, // secret_package_str
                    round1PackagesStr, // round1_packages_str (データベースから取得)
                    inboxMapStr // round2_packages_str (受信箱)
                );
                console.log(`[Server] ed_refresh_finalize_shares completed successfully`);
            } else {
                console.error(`[Server] Invalid curve: ${curve}`);
                return res.status(400).json({
                    success: false,
                    error: 'Invalid curve'
                });
            }
        } catch (wasmError) {
            console.error(`[Server] WASM function call failed:`, wasmError);
            console.error(`[Server] WASM error details:`, {
                errorMessage: wasmError.message,
                errorStack: wasmError.stack,
                curve: curve,
                localSecretLength: localSecret ? localSecret.length : 0,
                localSecretPreview: localSecret ? localSecret.substring(0, 64) + '...' : 'null',
                round1PackagesSize: Object.keys(round1Packages).length,
                round1PackagesPreview: JSON.stringify(round1Packages).substring(0, 200) + '...',
                inboxMapSize: Object.keys(inboxMap).length,
                inboxMapPreview: JSON.stringify(inboxMap).substring(0, 200) + '...'
            });
            return res.status(500).json({
                success: false,
                error: `WASM function call failed: ${wasmError.message}`
            });
        }
        
        // 新しい署名シェアをパース
        console.log(`[Server] Finalize result:`, {
            type: typeof finalizeResult,
            length: finalizeResult ? finalizeResult.length : 'N/A',
            preview: finalizeResult ? finalizeResult.substring(0, 200) + '...' : 'N/A'
        });
        
        let newSigningShareData;
        try {
            newSigningShareData = JSON.parse(finalizeResult);
            console.log(`[Server] Successfully parsed finalize result`);
        } catch (parseError) {
            console.error(`[Server] Failed to parse finalize result:`, parseError);
            console.error(`[Server] Raw result:`, finalizeResult);
            return res.status(500).json({
                success: false,
                error: `Failed to parse finalize result: ${parseError.message}`
            });
        }
        
        console.log(`[Server] Parsed newSigningShareData:`, {
            type: typeof newSigningShareData,
            keys: Object.keys(newSigningShareData),
            preview: JSON.stringify(newSigningShareData).substring(0, 200) + '...'
        });
        
        // 2. 署名シェア更新: 旧シェア + デルタ = 新シェア
        console.log(`[Server] Starting signing share update process...`);
        
        // 現在の署名シェアを取得
        const currentSigningShareData = await getCurrentSigningShare(masterId, curve);
        console.log(`[Server] getCurrentSigningShare result in finalize:`, {
            hasCurrentSigningShareData: !!currentSigningShareData,
            currentSigningShareDataKeys: currentSigningShareData ? Object.keys(currentSigningShareData) : 'null',
            keyPackage: currentSigningShareData ? currentSigningShareData.keyPackage : null,
            keyPackageType: currentSigningShareData ? typeof currentSigningShareData.keyPackage : null,
            signingShare: currentSigningShareData && currentSigningShareData.keyPackage ? currentSigningShareData.keyPackage.signing_share : null,
            signingShareType: currentSigningShareData && currentSigningShareData.keyPackage ? typeof currentSigningShareData.keyPackage.signing_share : null
        });
        
        if (!currentSigningShareData) {
            console.error(`[Server] Current signing share not found for masterId: ${masterId}, curve: ${curve}`);
            return res.status(404).json({
                success: false,
                error: 'Current signing share not found'
            });
        }
        
        // デルタ（新しい署名シェア）を取得
        const delta = newSigningShareData.signing_share;
        if (!delta) {
            console.error(`[Server] Delta (new signing share) not found in finalize result`);
            return res.status(400).json({
                success: false,
                error: 'Delta signing share not found in finalize result'
            });
        }
        
        // スカラー加算で新しい署名シェアを計算
        const oldSigningShare = currentSigningShareData.keyPackage.signing_share;
        const newSigningShare = addScalars(oldSigningShare, delta, curve);
        console.log(`[Server] Signing share update:`, {
            oldSigningShare: oldSigningShare ? oldSigningShare.substring(0, 16) + '...' : 'null',
            delta: delta ? delta.substring(0, 16) + '...' : 'null',
            newSigningShare: newSigningShare ? newSigningShare.substring(0, 16) + '...' : 'null'
        });
        
        // 3. Verifying Share計算: 新しい署名シェアからの検証シェア計算
        console.log(`[Server] Calculating verifying share from new signing share...`);
        let calculatedVerifyingShare;
        try {
            if (curve === 'secp256k1') {
                calculatedVerifyingShare = mpcServer.frostWasm.secp_calculate_verifying_share(newSigningShare);
            } else {
                calculatedVerifyingShare = mpcServer.frostWasm.ed_calculate_verifying_share(newSigningShare);
            }
            console.log(`[Server] Verifying share calculated successfully:`, {
                verifyingShare: calculatedVerifyingShare ? calculatedVerifyingShare.substring(0, 16) + '...' : 'null'
            });
        } catch (verifyingError) {
            console.error(`[Server] Failed to calculate verifying share:`, verifyingError);
            return res.status(500).json({
                success: false,
                error: `Failed to calculate verifying share: ${verifyingError.message}`
            });
        }
        
        // newSigningShareDataにverifying_shareを追加
        newSigningShareData.verifying_share = calculatedVerifyingShare;
        console.log(`[Server] Added verifying_share to newSigningShareData`);
        
        // 5. PublicKeyPackage更新: 更新された検証シェアの反映
        console.log(`[Server] Starting PublicKeyPackage update process...`);
        
        // 現在のPublicKeyPackageを取得
        const currentPublicKeyPackage = await getCurrentPublicKeyPackage(masterId, curve);
        if (!currentPublicKeyPackage) {
            console.error(`[Server] Current PublicKeyPackage not found for masterId: ${masterId}, curve: ${curve}`);
            return res.status(404).json({
                success: false,
                error: 'Current PublicKeyPackage not found'
            });
        }
        
        console.log(`[Server] Current PublicKeyPackage found:`, {
            type: typeof currentPublicKeyPackage,
            length: currentPublicKeyPackage.length,
            preview: currentPublicKeyPackage.substring(0, 100) + '...'
        });
        
        // WASM関数でPublicKeyPackageを更新（統合された評価値を使用）
        let updatedPublicKeyPackageStr;
        const combinedInboxJson = JSON.stringify(combinedInbox);
        try {
            if (curve === 'secp256k1') {
                updatedPublicKeyPackageStr = mpcServer.frostWasm.secp_update_pubkey_package(
                    currentPublicKeyPackage, 
                    combinedInboxJson
                );
            } else {
                updatedPublicKeyPackageStr = mpcServer.frostWasm.ed_update_pubkey_package(
                    currentPublicKeyPackage, 
                    combinedInboxJson
                );
            }
            console.log(`[Server] PublicKeyPackage updated successfully`);
        } catch (updateError) {
            console.error(`[Server] Failed to update PublicKeyPackage:`, updateError);
            return res.status(500).json({
                success: false,
                error: `Failed to update PublicKeyPackage: ${updateError.message}`
            });
        }
        
        // 更新されたPublicKeyPackageをパース
        let updatedPublicKeyPackageObj;
        try {
            updatedPublicKeyPackageObj = JSON.parse(updatedPublicKeyPackageStr);
        } catch (parseError) {
            console.error(`[Server] Failed to parse updated PublicKeyPackage:`, parseError);
            return res.status(500).json({
                success: false,
                error: `Failed to parse updated PublicKeyPackage: ${parseError.message}`
            });
        }
        
        // サーバ（Party2）の検証シェアを更新
        const serverFrostId = normalizeFrostId(curve, '2'); // Party2
        const updatedVerifyingShare = updatedPublicKeyPackageObj.verifying_shares[serverFrostId];
        if (updatedVerifyingShare) {
            console.log(`[Server] Updating server verifying share for Party2`);
            // PublicKeyPackage（WASM更新結果）由来の値で key_package 側も必ず同期
            try {
                newSigningShareData.verifying_share = updatedVerifyingShare;
                console.log(`[Server] Synced newSigningShareData.verifying_share from updated PublicKeyPackage: ${updatedVerifyingShare.substring(0,16)}...`);
            } catch(_) {}
            // 既存のsaveNewSigningShare関数を拡張してPublicKeyPackageも保存
            await saveNewSigningShareWithPublicKeyPackage(
                masterId, 
                curve, 
                epochCounter, 
                newSigningShareData, 
                updatedPublicKeyPackageStr
            );
        } else {
            console.warn(`[Server] No updated verifying share found for Party2`);
            // PublicKeyPackageが見つからない場合でも署名シェアは保存
            await saveNewSigningShare(masterId, curve, epochCounter, newSigningShareData);
        }
        
        // セッション状態を完了に更新
        await updateRefreshSessionStatus(sessionId, 'finalized');
        
        // インボックスをクリア
        await clearInbox(sessionId);
        
        res.json({
            success: true,
            finalized: true,
            epoch: epochCounter,
            publicKeyPackageChanged: false
        });
        
    } catch (error) {
        console.error('[Server] Refresh reshare finalize failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * インボックスからペイロードを取得
 */
async function getInboxPayloads(sessionId, expectFrom) {
    try {
        const query = `
            SELECT payload 
            FROM reshare_inbox 
            WHERE session_id = ? AND from_party IN (?)
        `;
        // MySQLではIN句に配列を直接渡すため、配列を展開
        const placeholders = Array.isArray(expectFrom) ? expectFrom.map(() => '?').join(',') : '?';
        const queryWithPlaceholders = query.replace('IN (?)', `IN (${placeholders})`);
        const params = Array.isArray(expectFrom) ? [sessionId, ...expectFrom] : [sessionId, expectFrom];
        const [result] = await executeQuery(queryWithPlaceholders, params);
        const rows = result || [];
        return rows.map(row => {
            try { return JSON.parse(row.payload); } catch { return null; }
        }).filter(v => !!v);
    } catch (error) {
        console.error('[Server] Error getting inbox payloads:', error);
        return [];
    }
}

/**
 * 現在のPublicKeyPackageを取得
 */
async function getCurrentPublicKeyPackage(masterId, curve) {
    try {
        const query = `
            SELECT public_key_package 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC 
            LIMIT 1
        `;
        const [result] = await executeQuery(query, [masterId, curve]);
        const rows = result || [];
        
        if (rows.length === 0) {
            console.log(`[Server] No PublicKeyPackage found for masterId: ${masterId}, curve: ${curve}`);
            return null;
        }
        
        const publicKeyPackage = rows[0].public_key_package;
        console.log(`[Server] Retrieved PublicKeyPackage for masterId: ${masterId}, curve: ${curve}`);
        console.log(`[Server] PublicKeyPackage type: ${typeof publicKeyPackage}, length: ${publicKeyPackage ? publicKeyPackage.length : 0}`);
        
        // PublicKeyPackageが文字列形式でない場合は、JSON.stringifyで文字列に変換
        let publicKeyPackageStr;
        if (typeof publicKeyPackage === 'string') {
            publicKeyPackageStr = publicKeyPackage;
        } else {
            publicKeyPackageStr = JSON.stringify(publicKeyPackage);
        }
        
        console.log(`[Server] PublicKeyPackage string type: ${typeof publicKeyPackageStr}, length: ${publicKeyPackageStr.length}`);
        return publicKeyPackageStr;
        
    } catch (error) {
        console.error(`[Server] Error getting PublicKeyPackage for masterId: ${masterId}, curve: ${curve}:`, error);
        return null;
    }
}

/**
 * 新しい署名シェアとPublicKeyPackageを原子的に保存
 */
async function saveNewSigningShareWithPublicKeyPackage(masterId, curve, targetEpoch, newSigningShareData, publicKeyPackageStr) {
    try {
        console.log(`[Server] saveNewSigningShareWithPublicKeyPackage called with:`, {
            masterId,
            curve,
            targetEpoch,
            newSigningShareDataType: typeof newSigningShareData,
            newSigningShareDataKeys: newSigningShareData ? Object.keys(newSigningShareData) : 'N/A',
            publicKeyPackageStrType: typeof publicKeyPackageStr,
            publicKeyPackageStrLength: publicKeyPackageStr ? publicKeyPackageStr.length : 0
        });
        
        // 現在のシェアからpubkey_fingerprintを取得
        const currentShareResult = await getCurrentSigningShare(masterId, curve);
        const currentShare = currentShareResult ? {
            keyPackage: currentShareResult.keyPackage,
            pubkeyFingerprint: currentShareResult.pubkeyFingerprint,
            epochCounter: currentShareResult.epochCounter
        } : null;
        console.log(`[Server] getCurrentSigningShare result:`, {
            hasCurrentShare: !!currentShare,
            currentShareKeys: currentShare ? Object.keys(currentShare) : 'null',
            pubkeyFingerprint: currentShare ? currentShare.pubkeyFingerprint : 'null',
            pubkeyFingerprintType: currentShare ? typeof currentShare.pubkeyFingerprint : 'null',
            keyPackage: currentShare ? currentShare.keyPackage : null,
            keyPackageType: currentShare ? typeof currentShare.keyPackage : null,
            signingShare: currentShare && currentShare.keyPackage ? currentShare.keyPackage.signing_share : null,
            signingShareType: currentShare && currentShare.keyPackage ? typeof currentShare.keyPackage.signing_share : null,
            epochCounter: currentShare ? currentShare.epochCounter : null
        });
        
        const pubkeyFingerprint = currentShare ? currentShare.pubkeyFingerprint : 'unknown';
        
        // 完全なkeyPackage構造を作成
        const currentKeyPackage = currentShare ? currentShare.keyPackage : null;
        if (!currentKeyPackage) {
            throw new Error('Current key package not found for creating complete structure');
        }
        
        // 新しい署名シェアと検証シェアで完全なkeyPackageを構築（identifier は既存のものを保持）
        const completeKeyPackage = {
            header: currentKeyPackage.header,
            identifier: currentKeyPackage.identifier,
            min_signers: currentKeyPackage.min_signers,
            signing_share: newSigningShareData.signing_share,
            verifying_share: newSigningShareData.verifying_share,
            verifying_key: currentKeyPackage.verifying_key
        };
        
        const signingShareStr = JSON.stringify(completeKeyPackage);
        
        // サーバー（Party2）のparty_idを設定
        const partyId = curve === 'secp256k1' ? '0000000000000000000000000000000000000000000000000000000000000002' : '0200000000000000000000000000000000000000000000000000000000000000';
        
        // 既存PKPを取得してParty3をキャリーオーバー
        let mergedPublicKeyPackageStr = publicKeyPackageStr;
        try {
            const [prevRowResult] = await executeQuery(
                `SELECT public_key_package 
                 FROM server_shares 
                 WHERE master_id=? AND curve_type=? 
                 ORDER BY epoch_counter DESC, created_at DESC 
                 LIMIT 1`,
                [masterId, curve]
            );
            const prevRows = prevRowResult || [];
            if (prevRows.length > 0) {
                const prevPkpRaw = prevRows[0].public_key_package;
                let prevPkp = typeof prevPkpRaw === 'string' ? JSON.parse(prevPkpRaw) : prevPkpRaw;
                let newPkp = typeof publicKeyPackageStr === 'string' ? JSON.parse(publicKeyPackageStr) : publicKeyPackageStr;
                const p3 = curve === 'ed25519' 
                    ? '0300000000000000000000000000000000000000000000000000000000000000' 
                    : '0000000000000000000000000000000000000000000000000000000000000003';
                const p2 = curve === 'ed25519' 
                    ? '0200000000000000000000000000000000000000000000000000000000000000' 
                    : '0000000000000000000000000000000000000000000000000000000000000002';
                newPkp.verifying_shares = newPkp.verifying_shares || {};
                prevPkp.verifying_shares = prevPkp.verifying_shares || {};
                const beforeP3 = newPkp.verifying_shares[p3];
                // キャリーオーバー: Party3は常に既存値を採用
                if (prevPkp.verifying_shares[p3]) {
                    newPkp.verifying_shares[p3] = prevPkp.verifying_shares[p3];
                }
                console.log(`[Server] PKP merge before save: carry-over P3. beforeP3=${beforeP3 ? beforeP3.substring(0,16)+'...' : 'null'} afterP3=${newPkp.verifying_shares[p3] ? newPkp.verifying_shares[p3].substring(0,16)+'...' : 'null'} keep P2=${newPkp.verifying_shares[p2] ? newPkp.verifying_shares[p2].substring(0,16)+'...' : 'null'}`);
                mergedPublicKeyPackageStr = JSON.stringify(newPkp);
            }
        } catch (mergeErr) {
            console.warn('[Server] Warning merging PKP with carry-over P3 failed, saving original PKP:', mergeErr.message);
        }

        // データベースに保存
        const insertQuery = `
            INSERT INTO server_shares (master_id, curve_type, party_id, epoch_counter, key_package, public_key_package, pubkey_fingerprint, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                key_package = VALUES(key_package),
                public_key_package = VALUES(public_key_package),
                updated_at = NOW()
        `;
        
        await executeQuery(insertQuery, [
            masterId,
            curve,
            partyId,
            targetEpoch,
            signingShareStr,
            mergedPublicKeyPackageStr,
            pubkeyFingerprint
        ]);
        
        console.log(`[Server] Successfully saved new signing share with PublicKeyPackage for masterId: ${masterId}, curve: ${curve}, epoch: ${targetEpoch}`);
        
    } catch (error) {
        console.error(`[Server] Error saving new signing share with PublicKeyPackage for masterId: ${masterId}, curve: ${curve}:`, error);
        throw error;
    }
}

/**
 * 新しい署名シェアを原子的に保存
 */
async function saveNewSigningShare(masterId, curve, targetEpoch, newSigningShareData) {
    try {
        console.log(`[Server] saveNewSigningShare called with:`, {
            masterId,
            curve,
            targetEpoch,
            newSigningShareDataType: typeof newSigningShareData,
            newSigningShareDataKeys: newSigningShareData ? Object.keys(newSigningShareData) : 'N/A',
            newSigningShareDataPreview: newSigningShareData ? JSON.stringify(newSigningShareData).substring(0, 200) + '...' : 'N/A'
        });
        
        // トランザクションで原子的に更新
        await executeTransaction(async (client) => {
        
        // 既存のキーパッケージと公開キーパッケージから完全な構造を取得
        const existingQuery = `
            SELECT key_package, public_key_package 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        const [existingResult] = await client.query(existingQuery, [masterId, curve]);
        const existingRows = Array.isArray(existingResult) ? existingResult : [];
        
        if (existingRows.length === 0) {
            throw new Error('No existing key package found to base new package on');
        }
        
        const existingKeyPackage = existingRows[0].key_package;
        const existingPublicKeyPackage = existingRows[0].public_key_package;
        console.log(`[Server] Existing key package structure:`, {
            hasHeader: !!existingKeyPackage.header,
            hasIdentifier: !!existingKeyPackage.identifier,
            hasMinSigners: !!existingKeyPackage.min_signers,
            hasSigningShare: !!existingKeyPackage.signing_share,
            hasVerifyingShare: !!existingKeyPackage.verifying_share
        });
        console.log(`[Server] Existing public key package structure:`, {
            hasHeader: !!existingPublicKeyPackage?.header,
            hasIdentifier: !!existingPublicKeyPackage?.identifier,
            hasMinSigners: !!existingPublicKeyPackage?.min_signers,
            hasVerifyingShare: !!existingPublicKeyPackage?.verifying_share
        });
        
        // 既存のキーパッケージをベースに、新しい署名シェアで更新
        const newKeyPackage = {
            ...existingKeyPackage, // 既存の構造を維持
            signing_share: newSigningShareData.signing_share // 新しい署名シェアで更新
        };
        
        console.log(`[Server] New key package structure:`, {
            hasHeader: !!newKeyPackage.header,
            hasIdentifier: !!newKeyPackage.identifier,
            hasMinSigners: !!newKeyPackage.min_signers,
            hasSigningShare: !!newKeyPackage.signing_share,
            hasVerifyingShare: !!newKeyPackage.verifying_share,
            identifier: newKeyPackage.identifier,
            signingShareLength: newKeyPackage.signing_share ? newKeyPackage.signing_share.length : 0
        });
        
        // 新しい署名シェアを保存
        const insertQuery = `
            INSERT INTO server_shares (
                master_id, curve_type, party_id, epoch_counter, key_package, 
                public_key_package, pubkey_fingerprint, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        
        // フィンガープリントは変更されない（公開キーパッケージは維持）
        const fingerprintQuery = `
            SELECT pubkey_fingerprint 
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ? 
            ORDER BY epoch_counter DESC, created_at DESC 
            LIMIT 1
        `;
        const fingerprintResult = await client.query(fingerprintQuery, [masterId, curve]);
        const pubkeyFingerprint = fingerprintResult.rows[0]?.pubkey_fingerprint || 'unknown';
        
        // サーバーのparty_idを設定（Frost ID形式）
        // ed25519: 0200000000000000000000000000000000000000000000000000000000000000
        // secp256k1: 0000000000000000000000000000000000000000000000000000000000000002
        const serverPartyId = curve === 'ed25519' ? '0200000000000000000000000000000000000000000000000000000000000000' : '0000000000000000000000000000000000000000000000000000000000000002';
        
        await client.query(insertQuery, [
            masterId, curve, serverPartyId, targetEpoch, newKeyPackage, // オブジェクトとして保存（初期化フローと統一）
            existingPublicKeyPackage, // オブジェクトとして保存（初期化フローと統一）
            pubkeyFingerprint
        ]);
        });
        
    } catch (error) {
        console.error('[Server] Error saving new signing share:', error);
        throw error;
    }
}

/**
 * インボックスをクリア
 */
async function clearInbox(sessionId) {
    try {
        const query = `
            DELETE FROM reshare_inbox WHERE session_id = ?
        `;
        await executeQuery(query, [sessionId]);
    } catch (error) {
        console.error('[Server] Error clearing inbox:', error);
        throw error;
    }
}

module.exports = {
    setDB,
    initializeMPC,
    handleDkgRound2,
    handleEmergencyRecovery,
    handleGetState,
    // バッチAPIを追加
    handleDkgRoundBatch,
    // 新規バッチAPI
    handleDkgBatchRound1,
    handleDkgBatchRound2,
    handleDkgBatchRound3,
    handleGetBatchPublicKeyPackage,
    handleBatchRecoveryRequestShare,
    handleGetBatchRecoveryPublicKeyPackage,
    handleGetServerShare, // サーバーのシェア取得エンドポイントを追加
    handleStoreServerShare, // サーバーのシェア保存エンドポイントを追加
    handleBatchHealth,
    // MPC署名フロー用エンドポイント
    handleMpcRound1Commit,
    handleMpcRound2Sign,
    // エポック管理用エンドポイント
    handleGetEpochHistory,
    // handleGetCurrentEpoch, // 削除: STANDARDモードはWebSocketベースのため不要
    handleGetEpochShare,
    // リシェア用エンドポイント（リフレッシュ型リシェアで使用するもののみ）
    // handleReshareRound2 は handleRefreshReshareRound2 として使用
    // リフレッシュ型リシェア（新設計）エンドポイント
    handleRefreshReshareInit,
    handleRefreshReshareRound1,
    handleRefreshReshareDistributeCommitments,
    handleGuardianRefreshReshareDistributeCommitments,
    handleRefreshReshareRound2,
    handleRefreshReshareReceive,
    handleRefreshReshareStatus,
    handleRefreshReshareFinalize
}; 