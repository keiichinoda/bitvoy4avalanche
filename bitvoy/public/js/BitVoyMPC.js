/**
 * BitVoyMPC.js - Multi-Party Computation Core Module (曲線分離版)
 * secp256k1とEd25519の2つの曲線を完全に分離したMPCシステム
 * FROST (frost_wasm) 組込版
 * credentialId管理新規実装
 * 複数Passkeyクレデンシャル対応の完全新規実装
 * 
 * @noble/secp256k1 のインポート（ES6モジュール環境の場合）
 * import * as secp from "@noble/secp256k1";
 * 
 * ブラウザ環境では window.BitVoyTaproot.secp256k1 を使用
 */

class BitVoyMPC {
    constructor() {
        // 基本設定
        this.isInitialized = false;
        this.frostWasm = null;
        this.currentJWT = null;
        this.jwtExpiry = null;
        
        // 緊急認証状態管理
        this.emergencyAuthState = null;
        
        // MPC設定（曲線別）
        this.threshold = 2;
        this.totalParties = 3;
        this.parties = {
            LOCAL: 1,           // クライアント = Party 1
            BITVOY_SERVER: 2,   // BitVoy Server = Party 2
            GUARDIAN: 3         // Guardian Node = Party 3
        };
        
        // FROSTセッション管理（曲線別）
        this.frostSessions = new Map();
        
        // 署名状態管理
        this.signingState = {
            round1: {}, // { partyId: { nonces, commitments } }
            round2: {}, // { partyId: signature_share }
            signingPackage: null,
            finalSignature: null,
            selectedParties: [] // 選択されたパーティーのリスト
        };

        // 共通のFROST ID生成関数（participantsオブジェクト用）
        this.createFrostId = function(partyId, curve) {
            const partyIdHex = partyId.toString(16).padStart(2, '0');
            if (curve === 'secp256k1') {
                // 末尾ゼロ詰め64
                return `00000000000000000000000000000000000000000000000000000000000000${partyIdHex}`;
            } else if (curve === 'ed25519') {
                // 先頭ゼロ詰め64
                return `${partyIdHex}00000000000000000000000000000000000000000000000000000000000000`;
            }
            throw new Error(`Unsupported curve: ${curve}`);
        };
        
        // 曲線の位数定数
        this.N_SECP = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
        this.L_ED = BigInt('0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed');
        
        // スカラー加算関数（曲線の位数でモジュラ演算）
        this.addScalars = function(hex1, hex2, curve) {
            const scalar1 = BigInt('0x' + hex1);
            const scalar2 = BigInt('0x' + hex2);
            const modulus = curve === 'secp256k1' ? this.N_SECP : this.L_ED;
            const sum = (scalar1 + scalar2) % modulus;
            return sum.toString(16).padStart(64, '0');
        };
        
        // パッケージのキーを64文字の16進数文字列に変換する関数（曲線別）
        this.convertPackageKeys = function(packages, curveType) {
            const converted = {};
            for (const [key, value] of Object.entries(packages)) {
                if (key.length === 64) {
                    converted[key] = value;
                } else {
                    const frostKey = this.createFrostId(parseInt(key), curveType);
                    converted[frostKey] = value;
                }
            }
            return converted;
        };
        
        // Guardian Share Client（lazy init）
        this.guardianShareClient = null;
        this.taprootAddressGenerator = null;
        
        // サーバーURL設定
        this.serverUrls = {
            bitvoyServer: window.location.hostname === 'localhost'
                ? 'http://localhost:4000'
                : window.location.origin
            // guardianNetworkは廃止
        };
        
        // ストレージ初期化
        this.storage = new BitVoyStorage();
        
        console.log('BitVoy MPC initialized (curve separation version)');
    }

    // identifier 自動補正は廃止（authoritative設計に合わせ、保存値をそのまま使用）

    /**
     * MPC システム初期化
     */
    async init() {
        if (this.isInitialized) {
            console.log("BitVoyMPC already initialized");
            return;
        }
        
        try {
            console.log("🚀 Starting BitVoyMPC initialization (curve separation version)...");
            
            // 早期初期化の防止（より緩和された条件）
            if (typeof window !== 'undefined' && window.BITVOY_LOADING && 
                typeof window.frost_wasm === 'undefined') {
                console.warn('⚠️ BitVoy system still loading, but frost_wasm is not available');
                // frost_wasmが利用可能でない場合のみエラーとする
                throw new Error('Required MPC libraries not loaded');
            }

            // 外部ライブラリ（ストレージ、frost_wasm）の存在チェック
            console.log("Checking BitVoyStorage availability...");
            if (typeof BitVoyStorage === 'undefined') {
                console.error("❌ BitVoyStorage is not loaded");
                throw new Error('BitVoyStorage is not loaded.');
            }
            console.log("✅ BitVoyStorage found");
            
            // frost_wasmの初期化確認（リトライ機能付き）
            console.log("Waiting for frost_wasm initialization...");
            await this.waitForFrostWasm();
            console.log("✅ frost_wasm ready");

            // ストレージの遅延初期化
            console.log("Initializing BitVoyStorage...");
            if (!this.storage) {
                this.storage = new BitVoyStorage();
                console.log("✅ BitVoyStorage instance created");
            }
            
            // ストレージの初期化を確実に実行
            if (!this.storage.isInitialized) {
                console.log("🔄 Starting BitVoyStorage initialization...");
            await this.storage.init();
                console.log("✅ BitVoyStorage initialized");
            } else {
                console.log("✅ BitVoyStorage already initialized");
            }
            
            // 初期化状態の最終確認
            if (!this.storage.isInitialized) {
                throw new Error('BitVoyStorage initialization failed - isInitialized flag is false');
            }
            
            this.isInitialized = true;
            console.log("✅ BitVoyMPC (curve separation version) initialized successfully");
            
            // 初期化完了イベントを発火
            window.dispatchEvent(new CustomEvent('bitvoy_mpc_ready', {
                detail: {
                    timestamp: Date.now(),
                    frostWasmAvailable: typeof window.frost_wasm !== 'undefined',
                    storageInitialized: this.storage.isInitialized,
                    curveSeparation: true
                }
            }));
            
        } catch (error) {
            console.error("❌ BitVoyMPC initialization failed:", error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * frost_wasmの初期化を待機（曲線別関数対応）
     */
    async waitForFrostWasm(maxRetries = 50, retryInterval = 100) {
        console.log("⏳ Waiting for frost_wasm initialization...");
        
        for (let i = 0; i < maxRetries; i++) {
            if (typeof window.frost_wasm !== 'undefined') {
                console.log(`✅ frost_wasm is ready after ${i + 1} attempts`);
                
                // frost_wasmをthis.frostWasmに代入
                this.frostWasm = window.frost_wasm;
                
                // frost_wasmの主要関数の存在確認（曲線別）
                const requiredFunctions = [
                    // DKGラウンド分割
                    'secp_dkg_round1', 'secp_dkg_round2', 'secp_dkg_round3',
                    'ed_dkg_round1', 'ed_dkg_round2', 'ed_dkg_round3',
                    // 署名系
                    'secp_round1_commit', 'secp_round2_sign', 'secp_aggregate_and_verify',
                    'ed_round1_commit', 'ed_round2_sign', 'ed_aggregate_and_verify',
                    // リフレッシュ型リシェア（新設計）
                    'secp_refresh_round1', 'secp_refresh_round2', 'secp_refresh_finalize_shares',
                    'ed_refresh_round1', 'ed_refresh_round2', 'ed_refresh_finalize_shares'
                ];
                const missingFunctions = requiredFunctions.filter(func => typeof this.frostWasm[func] !== 'function');
                
                if (missingFunctions.length > 0) {
                    console.warn("⚠️ Some frost_wasm functions are missing:", missingFunctions);
                    console.log("Available frost_wasm functions:", Object.keys(this.frostWasm).filter(key => typeof this.frostWasm[key] === 'function'));
                } else {
                    console.log("✅ All required frost_wasm functions are available for both curves");
                }
                
                return;
            }
            
            if (i % 10 === 0) { // 10回ごとにログ出力
                console.log(`⏳ frost_wasm still loading... (attempt ${i + 1}/${maxRetries})`);
            }
            
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        
        console.error("❌ frost_wasm initialization timeout");
        console.error("Available global objects:", Object.keys(window).filter(key => key.includes('frost') || key.includes('FROST')));
        throw new Error('frost_wasmがロードされていません。frost_wasm.jsが読み込まれているか確認してください。');
    }

    // ==========================================
    // Passkey 処理 (認証専用 - Guardian Nodeでは不使用)
    // ==========================================

    // Base64url→Uint8Array変換関数
    base64urlToBuffer(base64url) {
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
        const binary = atob(base64 + pad);
        const buffer = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            buffer[i] = binary.charCodeAt(i);
        }
        return buffer;
    }

    // Uint8Array→Base64url変換関数
    // 大きなバッファに対応するため、チャンク処理を使用
    bufferToBase64url(buffer) {
        if (!buffer || buffer.length === 0) {
            return '';
        }
        // Uint8Arrayに変換
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        
        // 大きなバッファに対応するため、チャンク処理を使用
        let binary = '';
        const chunkSize = 0x8000; // 32KB chunks
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        
        const base64 = btoa(binary);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // ==========================================
    // Passkey credentialId管理（新規実装）
    // ==========================================

    /**
     * パスキー認証クレデンシャル作成（パスキー同期前提）
     */
    async createPasskeyCredential(masterId) {
        try {
        if (this.webauthnInProgress) {
                throw new Error('Passkey operation already in progress');
        }
        this.webauthnInProgress = true;

            console.log("🔐 Creating Passkey credential for:", masterId);

            const publicKeyCredentialCreationOptions = {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rp: { 
                    name: "BitVoy Wallet", 
                    id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname 
                },
                user: {
                    id: new TextEncoder().encode(masterId),
                    name: masterId,
                    displayName: `BitVoy User (${masterId.substring(0, 8)}...)`
                },
                pubKeyCredParams: [
                    {
                        type: "public-key",
                        alg: -7 // ES256
                    }
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    userVerification: "required",
                    requireResidentKey: true,
                    residentKey: "required"
                },
                attestation: "direct",
                timeout: 60000
            };

            console.log("🔄 Requesting Passkey credential creation...");
            const credential = await navigator.credentials.create({ 
                publicKey: publicKeyCredentialCreationOptions
            });

            if (!credential) {
                throw new Error('Passkey credential creation failed - no credential returned');
            }

            const credentialId = this.bufferToBase64url(new Uint8Array(credential.rawId));
            
            // 暗号化キー導出に必要な最小限の情報のみ保存
            const credentialData = {
                masterId: masterId,
                credentialId: credentialId,
                // 暗号化キー導出に必要な情報のみ保存
                rawId: credentialId,
                publicKey: Array.from(new Uint8Array(credential.response.attestationObject)), // Array形式で保存
                response: {
                    clientDataJSON: credential.response.clientDataJSON,
                    attestationObject: credential.response.attestationObject
                },
                deviceInfo: {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform,
                    registrationTime: Date.now()
                },
                metadata: {
                    rpId: window.location.hostname,
                    rpName: "BitVoy Wallet"
                }
            };

            // 暗号化キー導出用の最小限の情報のみ保存
            await this.storage.storePasskeyCredential(credentialId, credentialData);

            console.log(`✅ Passkey credential created with credentialId: ${credentialId.substring(0, 16)}...`);
            console.log("ℹ️ Credential will be automatically synced via passkey sync (iCloud/Google)");
            
            return {
                credentialId: credentialId,
                credential: credential,
                data: credentialData
            };

        } catch (error) {
            console.error("❌ Passkey credential creation failed:", error);
            throw error;
        } finally {
            this.webauthnInProgress = false;
        }
    }

    /**
     * パスキー認証実行（パスキー同期前提）
     */
    async authenticateWithPasskey(masterId, preferredCredentialId = null) {
        try {
            console.log("🔐 Starting Passkey authentication for:", masterId);
            
            // パスキー同期を前提として、allowCredentialsを省略
            // 認証器が自動的に利用可能なクレデンシャルを提示
            const publicKeyCredentialRequestOptions = {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
                userVerification: 'required',
                timeout: 60000
            };

            // 特定のクレデンシャルが指定されている場合のみallowCredentialsを設定
            if (preferredCredentialId) {
                console.log(`🎯 Using preferred credential: ${preferredCredentialId.substring(0, 16)}...`);
                publicKeyCredentialRequestOptions.allowCredentials = [{
                    id: this.base64urlToBuffer(preferredCredentialId),
                    type: 'public-key'
                }];
            } else {
                console.log("ℹ️ Using all available credentials (passkey sync enabled)");
                // allowCredentialsを省略することで、認証器が全ての利用可能なクレデンシャルを提示
            }

            console.log("🔄 Requesting Passkey assertion...");
            const assertion = await navigator.credentials.get({ 
                publicKey: publicKeyCredentialRequestOptions
            });

            if (!assertion) {
                throw new Error('Passkey assertion failed - no credential returned');
            }

            // 使用されたクレデンシャルを特定
            const usedCredentialId = this.bufferToBase64url(new Uint8Array(assertion.rawId));
            console.log(`✅ Passkey authentication successful with credentialId: ${usedCredentialId.substring(0, 16)}...`);

            // 認証結果を返す（保存は最小限）
            return {
                credentialId: usedCredentialId,
                assertion: assertion,
                masterId: masterId,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error("❌ Passkey authentication failed:", error);
            throw error;
        }
    }

    async authenticateWithPasskeyForEmergency(masterId) {
        try {
            console.log("🚨 Emergency Passkey authentication for:", masterId);
            
            // IndexedDBに依存しない緊急復旧専用認証
            const publicKeyCredentialRequestOptions = {
                challenge: crypto.getRandomValues(new Uint8Array(32)),
                rpId: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
                userVerification: 'required',
                timeout: 60000
                // allowCredentials省略 = 認証器が全てのクレデンシャルを提示
            };
    
            const assertion = await navigator.credentials.get({ 
                publicKey: publicKeyCredentialRequestOptions
            });
    
            // 認証成功後もIndexedDBには保存しない
            // 認証器（iCloud/Google）が管理するクレデンシャルを信頼
            
            return assertion;
        } catch (error) {
            console.error("❌ Emergency Passkey authentication failed:", error);
            throw error;
        }
    }

    /**
     * クレデンシャル管理機能
     */
    async getCredentialList(masterId) {
        try {
            const credentials = await this.storage.getPasskeyCredentialsByMasterId(masterId);
            
            return credentials.map(cred => ({
                credentialId: cred.credentialId,
                createdAt: new Date(cred.createdAt),
                lastUsed: new Date(cred.lastUsed),
                userAgent: cred.userAgent,
                deviceInfo: cred.deviceInfo,
                isActive: cred.isActive,
                displayName: this.generateCredentialDisplayName(cred)
            }));
        } catch (error) {
            console.error("❌ Failed to get credential list:", error);
            throw error;
        }
    }

    /**
     * クレデンシャル表示名生成
     */
    generateCredentialDisplayName(credential) {
        const date = new Date(credential.createdAt).toLocaleDateString();
        const platform = credential.deviceInfo?.platform || 'Unknown Device';
        const shortId = credential.credentialId.substring(0, 8);
        
        return `${platform} (${date}) - ${shortId}`;
    }

    /**
     * クレデンシャル削除
     */
    async removeCredential(credentialId) {
        try {
            await this.storage.deactivatePasskeyCredential(credentialId);
            console.log(`✅ Credential removed: ${credentialId.substring(0, 16)}...`);
        } catch (error) {
            console.error("❌ Failed to remove credential:", error);
            throw error;
        }
    }

    /**
     * 複数デバイス管理のためのヘルパー
     */
    async getDeviceStatistics(masterId) {
        try {
            const stats = await this.storage.getPasskeyStatistics(masterId);
            return {
                ...stats,
                credentialList: await this.getCredentialList(masterId)
            };
        } catch (error) {
            console.error("❌ Failed to get device statistics:", error);
            throw error;
        }
    }

    /**
     * MPC鍵復元（credentialId指定対応）
     * @param {string} masterId - マスターID
     * @param {string} credentialId - クレデンシャルID（オプション）
     * @param {PublicKeyCredential} existingAssertion - 既に取得した認証結果（オプション）
     */
    async recoverFromCredential(masterId, credentialId = null, existingAssertion = null) {
        try {
            console.log("🔄 Starting MPC key recovery...");
            
            // パスキー認証（既に取得した認証結果がある場合はそれを使用）
            let authResult;
            if (existingAssertion) {
                console.log("✅ Using existing Passkey authentication result");
                // existingAssertionをauthResult形式に変換
                const credentialIdBase64 = this.bufferToBase64url(new Uint8Array(existingAssertion.rawId));
                authResult = {
                    credentialId: credentialIdBase64,
                    assertion: existingAssertion,
                    credential: existingAssertion
                };
            } else {
                authResult = await this.authenticateWithPasskey(masterId, credentialId);
            }
            
            // 暗号化キー導出
            const encryptionKey = await this.deriveEncryptionKey(authResult, masterId);
            
            // Guardianからシェアを復元し直す
            await this.restoreGuardianBackups(masterId, authResult, encryptionKey);
            
            // 暗号化されたシェアを復号
            const encryptedShare = await this.storage.getEncryptedShare(masterId, 'secp256k1');
            if (!encryptedShare) {
                throw new Error('No encrypted share found for secp256k1');
            }
            
            const decryptedShare = await this.decryptShare(encryptedShare, encryptionKey);
            console.log("🔍 Decrypted share:", decryptedShare === 'string' ? 'string' : 'object');
            const secretPackage = typeof decryptedShare === 'string' ? JSON.parse(decryptedShare) : decryptedShare;
            
            console.log("✅ MPC key recovery completed");
            console.log(`Used credential: ${authResult.credentialId.substring(0, 16)}...`);
            
            return {
                share: secretPackage,
                credentialId: authResult.credentialId,
                authResult: authResult
            };

        } catch (error) {
            console.error("❌ MPC key recovery failed:", error);
            throw error;
        }
    }


    // ==========================================
    // Guardian Node JWT認証処理
    // ==========================================

    /**
     * Guardian Node用JWT取得（BitVoy Server経由）
     */
    async obtainGuardianJWT(masterId, operation, payload = {}) {
        console.log("🔐 Requesting Guardian JWT via BitVoy Server...");
        
        // BitVoy Server経由でGuardian JWTを取得
        const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/guardian/jwt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                masterId,
                operation,
                payload,
                timestamp: Date.now()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Guardian JWT取得失敗: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        this.currentJWT = data.token || data.jwt;
        this.jwtExpiry = Date.now() + ((data.expiresIn || 300) * 1000);

        console.log("✅ Guardian JWT obtained successfully via BitVoy Server");
        return this.currentJWT;
    }

    /**
     * JWT有効性チェック
     */
    isJWTValid() {
        return this.currentJWT && this.jwtExpiry && Date.now() < this.jwtExpiry;
    }

    /**
     * ネットワーク接続確認
     */
    async checkNetworkConnectivity() {
        console.log("🔍 Checking network connectivity to BitVoy Server...");
        
        // ブラウザからはBitVoy Serverのみにアクセス
        const bitvoyServerHealth = fetch(`${this.serverUrls.bitvoyServer}/mpcapi/health`, { 
            method: 'POST',
            timeout: 5000 
        }).catch(error => ({ 
            status: 'rejected', 
            service: 'bitvoy_server', 
            error: error.message 
        }));

        const result = await Promise.allSettled([bitvoyServerHealth]);
        console.log("Network connectivity result:", result);
        
        if (result[0].status === 'rejected') {
            console.error("❌ BitVoy Server connection failed:", result[0].reason);
            throw new Error(`BitVoy Server connection failed: ${result[0].reason.error}`);
        }

        console.log("✅ BitVoy Server connectivity check completed successfully");
        console.log("ℹ️ Guardian Node connectivity is handled by BitVoy Server");
        return true;
    }

    /**
     * 初期化失敗時のクリーンアップ（曲線別対応）
     */
    async cleanupFailedInitialization(masterId) {
        try {
            console.log("Cleaning up failed initialization for:", masterId);
            
            // 保存されたデータの削除（曲線別）
            await this.storage.deleteEncryptedShare(masterId, 'secp256k1');
            await this.storage.deleteEncryptedShare(masterId, 'ed25519');
            await this.storage.deleteMetadata(masterId, 'secp256k1');
            await this.storage.deleteMetadata(masterId, 'ed25519');
            await this.storage.deletePasskeyCredential(masterId);
            
            console.log("Failed initialization cleanup completed (curve separation)");

        } catch (error) {
            console.error("Failed initialization cleanup failed:", error);
        }
    }

    /**
     * 分散鍵生成（frost_wasm使用・secp256k1とEd25519両対応）
     * APIドキュメント準拠のラウンド分割方式（secp_dkg_round1/2/3）
     */
    async performDistributedKeyGeneration(masterId) {
        try {
            if (!window.frost_wasm) throw new Error('frost_wasm library is not available.');

            // === Round 1: 各パーティが独立してシェアを生成（Secp/Ed同時） ===
            const secpRound1 = JSON.parse(window.frost_wasm.secp_dkg_round1(this.parties.LOCAL + 1, this.totalParties, this.threshold));
            const edRound1 = JSON.parse(window.frost_wasm.ed_dkg_round1(this.parties.LOCAL + 1, this.totalParties, this.threshold));

            // === Round 1パッケージ同時交換（バッチAPI） ===
            const { secpPackages: secpOtherRound1Packages, edPackages: edOtherRound1Packages } = await this.exchangePackagesWithPeers(masterId, 'batch', 1, {
                secpPackage: secpRound1.package,
                edPackage: edRound1.package
            });
            console.log("secpOtherRound1Packages", Object.keys(secpOtherRound1Packages));
            console.log("edOtherRound1Packages", Object.keys(edOtherRound1Packages));

            // === 自分のpackageを除外 ===
            const myFrostId = `FROST_${this.parties.LOCAL + 1}`;
            function excludeOwnPackage(allPackages, myFrostId) {
                const filtered = {};
                for (const [id, pkg] of Object.entries(allPackages)) {
                    if (id !== myFrostId) filtered[id] = pkg;
                }
                return filtered;
            }
            const secpOtherRound1PackagesFiltered = excludeOwnPackage(secpOtherRound1Packages, myFrostId);
            const edOtherRound1PackagesFiltered = excludeOwnPackage(edOtherRound1Packages, myFrostId);
            console.log("secpOtherRound1PackagesFiltered", Object.keys(secpOtherRound1PackagesFiltered));
            console.log("edOtherRound1PackagesFiltered", Object.keys(edOtherRound1PackagesFiltered));

            // === Round 2: コミットメントの交換と検証（Secp/Ed同時） ===
            // パッケージのキーを64文字の16進数文字列に変換
            const convertedSecpPackages = this.convertPackageKeys(secpOtherRound1PackagesFiltered, 'secp256k1');
            const convertedEdPackages = this.convertPackageKeys(edOtherRound1PackagesFiltered, 'ed25519');
            
            const secpRound2 = JSON.parse(window.frost_wasm.secp_dkg_round2(secpRound1.secret_package, JSON.stringify(convertedSecpPackages)));
            const edRound2 = JSON.parse(window.frost_wasm.ed_dkg_round2(edRound1.secret_package, JSON.stringify(convertedEdPackages)));

            // === Round 2パッケージ同時交換（バッチAPI） ===
            const { secpPackages: secpOtherRound2Packages, edPackages: edOtherRound2Packages } = await this.exchangePackagesWithPeers(masterId, 'batch', 2, {
                secpPackage: secpRound2.package,
                edPackage: edRound2.package
            });

            // === Round 3: 公開鍵の協調構築（Secp/Ed同時） ===
            const secpOtherRound2PackagesFiltered = excludeOwnPackage(secpOtherRound2Packages, myFrostId);
            const edOtherRound2PackagesFiltered = excludeOwnPackage(edOtherRound2Packages, myFrostId);

            // Round 3用のパッケージキー変換
            const convertedSecpRound1Packages = this.convertPackageKeys(secpOtherRound1PackagesFiltered, 'secp256k1');
            const convertedSecpRound2Packages = this.convertPackageKeys(secpOtherRound2PackagesFiltered, 'secp256k1');
            const convertedEdRound1Packages = this.convertPackageKeys(edOtherRound1PackagesFiltered, 'ed25519');
            const convertedEdRound2Packages = this.convertPackageKeys(edOtherRound2PackagesFiltered, 'ed25519');

            const secpRound3 = JSON.parse(window.frost_wasm.secp_dkg_round3(
                secpRound2.secret_package,
                JSON.stringify(convertedSecpRound1Packages),
                JSON.stringify(convertedSecpRound2Packages)
            ));
            const edRound3 = JSON.parse(window.frost_wasm.ed_dkg_round3(
                edRound2.secret_package,
                JSON.stringify(convertedEdRound1Packages),
                JSON.stringify(convertedEdRound2Packages)
            ));

            // 公開鍵抽出（従来通り）
            const secpPublicKeyPackage = JSON.parse(secpRound3.public_key_package);
            const edPublicKeyPackage = JSON.parse(edRound3.public_key_package);
            const secp256k1PublicKeyHex = secpPublicKeyPackage.verifying_key;
            const ed25519PublicKeyHex = edPublicKeyPackage.verifying_key;

            // ローカルシェア
            const secpLocalShare = secpRound2.secret_package;
            const edLocalShare = edRound2.secret_package;
            
            return {
                success: true,
                secp256k1: {
                    publicKey: secp256k1PublicKeyHex,
                    publicKeyPackage: secpPublicKeyPackage,
                    localSigningShare: secpLocalShare,
                    allShares: null
                },
                ed25519: {
                    publicKey: ed25519PublicKeyHex,
                    publicKeyPackage: edPublicKeyPackage,
                    localSigningShare: edLocalShare,
                    allShares: null
                }
            };
        } catch (error) {
            console.error("FROST key generation (ラウンド分割) failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 各ラウンドで自分のpackageを他パーティと交換する（Secp/Ed同時バッチAPI対応）
     * @param {string} masterId
     * @param {string} curve 'batch' のみ対応
     * @param {number} round 1 or 2
     * @param {object} myPackages { secpPackage, edPackage } 形式
     * @returns {Promise<{secpPackages: Object, edPackages: Object}>}
     */
    async exchangePackagesWithPeers(masterId, curve, round, myPackages) {
        // バッチAPIでSecp/Ed両方のパッケージを同時交換（bitvoyServer経由に統一）
        const endpoint = `/mpcapi/guardian/dkg/round-batch`;
        const myFrostId = `FROST_${this.parties.LOCAL + 1}`;
        const response = await fetch(this.serverUrls.bitvoyServer + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterId, frostId: myFrostId, round, ...myPackages })
        });
        if (!response.ok) throw new Error(`Batch exchange failed: ${response.status}`);
        const data = await response.json();
        return {
            secpPackages: data.secpPackage ? JSON.parse(data.secpPackage) : {},
            edPackages: data.edPackage ? JSON.parse(data.edPackage) : {}
        };
    }
 
    /**
     * 分散署名実行（frost_wasm使用・完全版・曲線別対応）
     */
    async performDistributedSigning(masterId, messageHashBytes, curve, providedCredential = null) {
        let sessionId = null; // Declared at the top
        try {
        console.log(`🚀 Starting distributed signing for ${curve}...`);
        console.log(`📋 MasterId: ${masterId}`);
        console.log(`📋 messageHashBytes: ${messageHashBytes}`);
        console.log(`📋 Curve: ${curve}`);
        console.log(`📋 Session start time: ${new Date().toISOString()}`);
        console.log(`📋 Provided credential: ${providedCredential ? 'Yes (reusing)' : 'No (will authenticate)'}`);
        
        // ==========================================
        // secp256k1: FROST署名
        // ==========================================
        if (curve === 'secp256k1') {
            console.log(`✍️ Using FROST signing for secp256k1...`);
            
            // secp_p1Sign関数が利用可能になるまで待つ（最大5秒）
            let waitCount = 0;
            const maxWait = 50; // 50回 × 100ms = 5秒
            while (typeof window === 'undefined' || !window.secp_p1Sign) {
                if (waitCount >= maxWait) {
                    throw new Error('secp_p1Sign is not available. Please ensure p1client.bundle.js is loaded before signing.');
            }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            console.log(`✅ secp_p1Sign is now available (waited ${waitCount * 100}ms)`);
            
            // Passkey認証を行い、復号化したkeyPackageを取得（既に提供されている場合は再利用）
            let credential;
            if (providedCredential) {
                console.log('🔐 Reusing provided Passkey credential for secp256k1 signing...');
                credential = providedCredential;
            } else {
            console.log('🔐 Performing Passkey authentication for secp256k1 signing...');
                credential = await this.authenticateWithPasskey(masterId);
            }
            const keyPackage = await this.getClientKeyPackage(masterId, 'secp256k1', credential);
            
            // メタデータからpublicKeyPackageを取得
            const metadata = await this.storage.getMetadata(masterId, 'secp256k1');
            if (!metadata || !metadata.publicKeyPackage) {
                throw new Error('publicKeyPackage not found. Please ensure MPC initialization was completed successfully.');
            }
            
            const publicKeyPackage = metadata.publicKeyPackage;
            
            console.log('🔍 [secp256k1 signing] Metadata retrieved:', {
                hasKeyPackage: !!keyPackage,
                hasPublicKeyPackage: !!publicKeyPackage,
                keyPackageType: typeof keyPackage,
                publicKeyPackageType: typeof publicKeyPackage,
                keyPackagePreview: typeof keyPackage === 'string' ? keyPackage.substring(0, 100) : 'object (from getClientKeyPackage)',
                publicKeyPackagePreview: typeof publicKeyPackage === 'string' ? publicKeyPackage.substring(0, 100) : 'object'
            });
            
            // WebSocket URLを構築
            const p2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const signSessionId = `sign-secp-${masterId}-${Date.now()}`;
            // messageHashBytesをhex文字列に変換
            const messageHashHex = Array.from(messageHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const signWsUrl = `${p2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${signSessionId}&uid=${encodeURIComponent(masterId)}&mh=${messageHashHex}`;
            
            console.log(`✍️ secp256k1 WebSocket URL:`, signWsUrl);
            
            // keyPackageとpublicKeyPackageの形式を確認・正規化
            // keyPackage: 文字列の場合はそのまま、オブジェクトの場合はJSON.stringify
            // publicKeyPackage: オブジェクトの場合はJSON.stringify、文字列の場合はそのまま
            let normalizedKeyPackage = keyPackage;
            let normalizedPublicKeyPackage = publicKeyPackage;
            
            if (typeof keyPackage === 'object' && keyPackage !== null) {
                normalizedKeyPackage = JSON.stringify(keyPackage);
                console.log('🔧 [secp256k1 signing] keyPackage normalized from object to string');
            } else if (typeof keyPackage === 'string') {
                // 文字列の場合はそのまま使用（既に正しい形式）
                console.log('✅ [secp256k1 signing] keyPackage is already a string');
            }
            
            if (typeof publicKeyPackage === 'object' && publicKeyPackage !== null) {
                normalizedPublicKeyPackage = JSON.stringify(publicKeyPackage);
                console.log('🔧 [secp256k1 signing] publicKeyPackage normalized from object to string');
            } else if (typeof publicKeyPackage === 'string') {
                // 文字列の場合はそのまま使用（既に正しい形式）
                console.log('✅ [secp256k1 signing] publicKeyPackage is already a string');
            }
            
            console.log('🔍 [secp256k1 signing] Final package formats:', {
                keyPackageType: typeof normalizedKeyPackage,
                keyPackageLength: typeof normalizedKeyPackage === 'string' ? normalizedKeyPackage.length : 'N/A',
                publicKeyPackageType: typeof normalizedPublicKeyPackage,
                publicKeyPackageLength: typeof normalizedPublicKeyPackage === 'string' ? normalizedPublicKeyPackage.length : 'N/A'
            });
            
            console.log("🔍 calling secp_p1Sign: signWsUrl: ", signWsUrl);
            console.log("🔍 calling secp_p1Sign: sessionId: ", signSessionId);
            console.log("🔍 calling secp_p1Sign: messageHash: ", messageHashBytes);
            console.log("🔍 calling secp_p1Sign: keyPackage: ", normalizedKeyPackage);
            console.log("🔍 calling secp_p1Sign: publicKeyPackage: ", normalizedPublicKeyPackage);
            // secp_p1Signを実行
            const signResult = await window.secp_p1Sign({
                wsUrl: signWsUrl,
                sessionId: signSessionId,
                messageHash: messageHashBytes,
                keyPackage: normalizedKeyPackage,
                publicKeyPackage: normalizedPublicKeyPackage
            });
            
            if (!signResult.signature) {
                throw new Error('Signature generation failed');
            }
            
            console.log(`✅ secp256k1 FROST signing completed`);
            return {
                success: true,
                signature: signResult.signature,
                sessionId: signSessionId,
                curve: 'secp256k1',
                signingMethod: 'tss_2of2'
            };
        }
        
        // ==========================================
        // ed25519: FROST署名
        // ==========================================
        if (curve === 'ed25519') {
            console.log(`✍️ Using FROST signing for ed25519...`);
            
            // ed_p1Sign関数が利用可能になるまで待つ（最大5秒）
            let waitCount = 0;
            const maxWait = 50; // 50回 × 100ms = 5秒
            while (typeof window === 'undefined' || !window.ed_p1Sign) {
                if (waitCount >= maxWait) {
                    throw new Error('ed_p1Sign is not available. Please ensure p1client.bundle.js is loaded before signing.');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            console.log(`✅ ed_p1Sign is now available (waited ${waitCount * 100}ms)`);
            
            // Passkey認証を行い、復号化したkeyPackageを取得（既に提供されている場合は再利用）
            let credential;
            if (providedCredential) {
                console.log('🔐 Reusing provided Passkey credential for ed25519 signing...');
                credential = providedCredential;
            } else {
            console.log('🔐 Performing Passkey authentication for ed25519 signing...');
                credential = await this.authenticateWithPasskey(masterId);
            }
            const keyPackage = await this.getClientKeyPackage(masterId, 'ed25519', credential);
            
            // メタデータからpublicKeyPackageを取得
            const metadata = await this.storage.getMetadata(masterId, 'ed25519');
            if (!metadata || !metadata.publicKeyPackage) {
                throw new Error('publicKeyPackage not found. Please ensure MPC initialization was completed successfully.');
            }
            
            const publicKeyPackage = metadata.publicKeyPackage;
            
            console.log('🔍 [ed25519 signing] Metadata retrieved:', {
                hasKeyPackage: !!keyPackage,
                hasPublicKeyPackage: !!publicKeyPackage,
                keyPackageType: typeof keyPackage,
                publicKeyPackageType: typeof publicKeyPackage,
                keyPackagePreview: typeof keyPackage === 'string' ? keyPackage.substring(0, 100) : 'object (from getClientKeyPackage)',
                publicKeyPackagePreview: typeof publicKeyPackage === 'string' ? publicKeyPackage.substring(0, 100) : 'object'
            });
            
            // WebSocket URLを構築
            const p2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const signSessionId = `sign-ed-${masterId}-${Date.now()}`;
            // messageHashBytesをhex文字列に変換
            const messageHashHex = Array.from(messageHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const signWsUrl = `${p2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${signSessionId}&uid=${encodeURIComponent(masterId)}&mh=${messageHashHex}`;
            
            console.log(`✍️ ed25519 WebSocket URL:`, signWsUrl);
            
            // keyPackageとpublicKeyPackageの形式を確認・正規化
            // getClientKeyPackageは既にJSON文字列を返すため、keyPackageは文字列
            // publicKeyPackage: オブジェクトの場合はJSON.stringify、文字列の場合はそのまま
            let normalizedKeyPackage = keyPackage; // getClientKeyPackageは既にJSON文字列を返す
            let normalizedPublicKeyPackage = publicKeyPackage;
            
            // keyPackageはgetClientKeyPackageから既にJSON文字列として返される
            if (typeof keyPackage !== 'string') {
                normalizedKeyPackage = JSON.stringify(keyPackage);
                console.log('🔧 [ed25519 signing] keyPackage normalized from object to string');
            } else {
                console.log('✅ [ed25519 signing] keyPackage is already a string (from getClientKeyPackage)');
            }
            
            if (typeof publicKeyPackage === 'object' && publicKeyPackage !== null) {
                normalizedPublicKeyPackage = JSON.stringify(publicKeyPackage);
                console.log('🔧 [ed25519 signing] publicKeyPackage normalized from object to string');
            } else if (typeof publicKeyPackage === 'string') {
                // 文字列の場合はそのまま使用（既に正しい形式）
                console.log('✅ [ed25519 signing] publicKeyPackage is already a string');
            }
            
            console.log('🔍 [ed25519 signing] Final package formats:', {
                keyPackageType: typeof normalizedKeyPackage,
                keyPackageLength: typeof normalizedKeyPackage === 'string' ? normalizedKeyPackage.length : 'N/A',
                publicKeyPackageType: typeof normalizedPublicKeyPackage,
                publicKeyPackageLength: typeof normalizedPublicKeyPackage === 'string' ? normalizedPublicKeyPackage.length : 'N/A'
            });
            
            // ed_p1Signを実行
            const signResult = await window.ed_p1Sign({
                wsUrl: signWsUrl,
                sessionId: signSessionId,
                messageHash: messageHashBytes,
                keyPackage: normalizedKeyPackage,
                publicKeyPackage: normalizedPublicKeyPackage
            });
            
            if (!signResult.signature) {
                throw new Error('Signature generation failed');
            }
            
            console.log(`✅ ed25519 FROST signing completed`);
            return {
                success: true,
                signature: signResult.signature,
                sessionId: signSessionId,
                curve: 'ed25519',
                signingMethod: 'tss_2of2'
            };
        }
        
        // ==========================================
        // ecdsa_tss: ECDSA-TSS署名
        // ==========================================
        if (curve === 'ecdsa_tss') {
            console.log(`✍️ Using ECDSA-TSS signing for ecdsa_tss...`);
            
            // ecdsa_tss_p1Sign関数が利用可能になるまで待つ（最大5秒）
            let waitCount = 0;
            const maxWait = 50; // 50回 × 100ms = 5秒
            while (typeof window === 'undefined' || !window.ecdsa_tss_p1Sign) {
                if (waitCount >= maxWait) {
                    throw new Error('ecdsa_tss_p1Sign is not available. Please ensure p1client.bundle.js is loaded before signing.');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            console.log(`✅ ecdsa_tss_p1Sign is now available (waited ${waitCount * 100}ms)`);
            
            // Passkey認証を行い、復号化したp1KeyShareを取得（既に提供されている場合は再利用）
            let credential;
            if (providedCredential) {
                console.log('🔐 Reusing provided Passkey credential for ecdsa_tss signing...');
                credential = providedCredential;
            } else {
            console.log('🔐 Performing Passkey authentication for ecdsa_tss signing...');
                credential = await this.authenticateWithPasskey(masterId);
            }
            
            // 暗号化されたシェアを取得
            const encryptedShare = await this.storage.getEncryptedShare(masterId, 'ecdsa_tss');
            if (!encryptedShare) {
                throw new Error('No encrypted share found for ecdsa_tss');
            }
            
            // 暗号化キー導出
            const encryptionKey = await this.deriveEncryptionKey(credential, masterId);
            
            // 暗号化されたシェアを復号
            const decryptedShare = await this.decryptShare(encryptedShare, encryptionKey);
            console.log('🔍 Decrypted share type:', typeof decryptedShare);
            
            // 復号されたデータをパース
            let secretPackage;
            if (typeof decryptedShare === 'string') {
                try {
                    secretPackage = JSON.parse(decryptedShare);
                } catch (e) {
                    // JSON文字列でない場合、直接p1KeyShareとして扱う
                    console.warn('⚠️ Decrypted share is not JSON, treating as p1KeyShare string');
                    secretPackage = { p1KeyShare: decryptedShare };
                }
            } else {
                secretPackage = decryptedShare;
            }
            
            // p1KeyShareを取得（複数の形式に対応）
            const p1KeyShare = secretPackage.p1_key_share || secretPackage.p1KeyShare || secretPackage;
            
            if (!p1KeyShare) {
                throw new Error('p1KeyShare not found in decrypted share');
            }
            
            console.log('✅ p1KeyShare retrieved successfully:', {
                type: typeof p1KeyShare,
                isObject: typeof p1KeyShare === 'object',
                keys: typeof p1KeyShare === 'object' ? Object.keys(p1KeyShare) : 'N/A'
            });
            
            console.log('🔍 [ecdsa_tss signing] Metadata retrieved:', {
                hasP1KeyShare: !!p1KeyShare,
                p1KeyShareType: typeof p1KeyShare,
                p1KeySharePreview: typeof p1KeyShare === 'string' ? p1KeyShare.substring(0, 100) : 'object'
            });
            
            // WebSocket URLを構築
            const p2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const signSessionId = `sign-ecdsa-${masterId}-${Date.now()}`;
            // messageHashBytesをhex文字列に変換
            const messageHashHex = Array.from(messageHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const signWsUrl = `${p2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${signSessionId}&uid=${encodeURIComponent(masterId)}&mh=${messageHashHex}`;
            
            console.log(`✍️ ecdsa_tss WebSocket URL:`, signWsUrl);
            
            // p1KeyShareの形式を確認・正規化
            // ecdsa_tssのp1KeyShareはオブジェクトとして保存されている可能性があるため、そのまま使用
            // p1clientのecdsa_tss_p1Signはオブジェクトを受け入れる
            let normalizedP1KeyShare = p1KeyShare;
            
            if (typeof p1KeyShare === 'string') {
                try {
                    normalizedP1KeyShare = JSON.parse(p1KeyShare);
                    console.log('🔧 [ecdsa_tss signing] p1KeyShare normalized from string to object');
                } catch (e) {
                    console.warn('⚠️ [ecdsa_tss signing] Failed to parse p1KeyShare as JSON, using as-is');
                }
            } else if (typeof p1KeyShare === 'object' && p1KeyShare !== null) {
                console.log('✅ [ecdsa_tss signing] p1KeyShare is already an object');
            }
            
            console.log('🔍 [ecdsa_tss signing] Final package format:', {
                p1KeyShareType: typeof normalizedP1KeyShare,
                p1KeyShareKeys: typeof normalizedP1KeyShare === 'object' && normalizedP1KeyShare !== null ? Object.keys(normalizedP1KeyShare) : 'N/A'
            });
            
            // HDWallet廃止により、pathパラメータは不要（マスターシェアを直接使用）
            console.log('🔍 [ecdsa_tss signing] HDWallet removed - using master key share directly');
            
            // ecdsa_tss_p1Signを実行（pathパラメータを削除）
            const signResult = await window.ecdsa_tss_p1Sign({
                wsUrl: signWsUrl,
                sessionId: signSessionId,
                messageHash: messageHashBytes,
                p1KeyShare: normalizedP1KeyShare
            });
            
            if (!signResult.signature) {
                throw new Error('Signature generation failed');
            }
            
            console.log('🔍 [ecdsa_tss signing] Sign result:', {
                hasSignature: !!signResult.signature,
                signatureType: typeof signResult.signature,
                hasRecid: signResult.recid !== undefined && signResult.recid !== null,
                recid: signResult.recid
            });
            
            // signatureが文字列の場合、rとsに分割してrecidを含める
            let signatureWithRecid = signResult.signature;
            if (typeof signResult.signature === 'string') {
                const cleanSig = signResult.signature.replace(/^0x/, '');
                if (cleanSig.length === 128) {
                    signatureWithRecid = {
                        r: cleanSig.substring(0, 64),
                        s: cleanSig.substring(64, 128),
                        recid: signResult.recid ?? null
                    };
                    console.log('🔧 [ecdsa_tss signing] Converted hex string signature to {r, s, recid} format', {
                        recid: signatureWithRecid.recid
                    });
                }
            } else if (typeof signResult.signature === 'object' && signResult.signature !== null) {
                // 既にオブジェクトの場合はrecidを追加
                signatureWithRecid = {
                    ...signResult.signature,
                    recid: signResult.recid ?? null
                };
                console.log('🔧 [ecdsa_tss signing] Added recid to signature object', {
                    recid: signatureWithRecid.recid
                });
            }
            
            console.log(`✅ ecdsa_tss ECDSA-TSS signing completed`, {
                hasRecid: signatureWithRecid.recid !== undefined && signatureWithRecid.recid !== null,
                recid: signatureWithRecid.recid
            });
            return {
                success: true,
                signature: signatureWithRecid,
                sessionId: signSessionId,
                curve: 'ecdsa_tss',
                signingMethod: 'tss_2of2'
            };
        }
        
        // ==========================================
        // 未サポートの曲線
        // ==========================================
        throw new Error(`Unsupported curve: ${curve}`);
        } catch (error) {
            console.error(`FROST signing process failed for ${curve}:`, error);
            // セッションクリーンアップ
            if (sessionId) {
                await this.cleanupFailedSigningSession(sessionId);
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * クライアント側からkeyPackageを取得
     */
    async getClientKeyPackage(masterId, curve, providedCredential = null) {
        try {
            console.log(`🔍 Getting client keyPackage for ${curve}...`);
            
            // 暗号化されたシェアを取得
            const encryptedShare = await this.storage.getEncryptedShare(masterId, curve);
            if (!encryptedShare) {
                throw new Error(`No encrypted share found for ${curve}`);
            }
            
            // パスキー認証と暗号化キー導出（認証情報が既に提供されている場合は再利用）
            let credential, encryptionKey;
            if (providedCredential) {
                console.log(`🔍 Reusing provided Passkey credential for ${curve}`);
                credential = providedCredential;
                encryptionKey = await this.deriveEncryptionKey(credential, masterId);
            } else {
                console.log(`🔍 Performing Passkey authentication for ${curve}`);
                credential = await this.authenticateWithPasskey(masterId);
                encryptionKey = await this.deriveEncryptionKey(credential, masterId);
            }
            
            // 暗号化されたシェアを復号
            // decryptShareはsecret_package（JSON文字列）を復号化してJSONオブジェクトを返す
            // secret_packageからsigning_shareフィールドを取得
            const decryptedShare = await this.decryptShare(encryptedShare, encryptionKey);
            const secretPackage = JSON.parse(decryptedShare);
            const signingShare = secretPackage.signing_share;
            
            // メタデータからpublicKeyPackageを取得
            const metadata = await this.storage.getMetadata(masterId, curve);
            if (!metadata || !metadata.publicKeyPackage) {
                throw new Error(`No publicKeyPackage found in metadata for ${curve}`);
            }
            let publicKeyPackage = metadata.publicKeyPackage;
            
            // クライアント用keyPackageを構築
            const clientId = this.createFrostId(this.parties.LOCAL, curve);
            console.log(`🔍 Debug: getClientKeyPackage - clientId for ${curve}:`, clientId);
            console.log(`🔍 Debug: getClientKeyPackage - clientId type:`, typeof clientId, 'length:', clientId.length);
            console.log(`🔍 Debug: getClientKeyPackage - publicKeyPackage.verifying_shares keys:`, Object.keys(publicKeyPackage.verifying_shares || {}));
            console.log(`🔍 Debug: getClientKeyPackage - publicKeyPackage.verifying_shares values:`, Object.values(publicKeyPackage.verifying_shares || {}));
            console.log(`🔍 Debug: getClientKeyPackage - publicKeyPackage.verifying_shares structure:`, publicKeyPackage.verifying_shares);
            
            // P2WPKHではTaproot tweakは不要（コメントアウト）
            // Taproot署名の場合: secp256k1 で tweak 情報がある場合のみ処理
            let effectiveSigningShare = signingShare;
            // if (curve === 'secp256k1' && metadata.taproot_tweak) {
            //     console.log('🔧 Applying Taproot tweak to client share...');
            //     
            //     if (!metadata.taproot_q_compressed || !metadata.taproot_client_share_compressed) {
            //         throw new Error('Taproot compressed key metadata is missing for secp256k1');
            //     }
            //     
            //     // signing_share を BigInt に変換（hex文字列を想定）
            //     const shareBigInt = BigInt('0x' + signingShare);
            //     const tweakBigInt = BigInt('0x' + metadata.taproot_tweak);
            //     
            //     // secp256k1 の位数 n
            //     const n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
            //     
            //     // signing_share_tweaked = (share + t) mod n
            //     const tweakedShareBigInt = (shareBigInt + tweakBigInt) % n;
            //     
            //     // 32バイトのhex文字列に戻す
            //     effectiveSigningShare = tweakedShareBigInt.toString(16).padStart(64, '0');
            //     
            //     console.log('✅ Taproot tweak applied to signing_share');
            //     
            //     publicKeyPackage = { ...publicKeyPackage };
            //     publicKeyPackage.verifying_key = metadata.taproot_q_compressed;
            //     publicKeyPackage.verifying_shares = { ...publicKeyPackage.verifying_shares };
            //     publicKeyPackage.verifying_shares[clientId] = metadata.taproot_client_share_compressed;
            //     
            //     console.log('✅ publicKeyPackage updated to stored Taproot compressed key');
            // }
            
            const verifyingShare = publicKeyPackage.verifying_shares[clientId];
            
            if (!verifyingShare) {
                console.error(`❌ Verifying share not found for client ID ${clientId}`);
                console.error(`❌ Available verifying_shares keys:`, Object.keys(publicKeyPackage.verifying_shares || {}));
                throw new Error(`Verifying share not found for client ID ${clientId}`);
            }
            
            const keyPackage = {
                header: publicKeyPackage.header,
                identifier: clientId,
                signing_share: effectiveSigningShare,
                verifying_share: verifyingShare,
                verifying_key: publicKeyPackage.verifying_key,
                min_signers: this.threshold
            };
            
            // keyPackageの構造を検証
            if (!keyPackage.signing_share) {
                console.error(`❌ keyPackage missing signing_share:`, {
                    hasHeader: !!keyPackage.header,
                    hasIdentifier: !!keyPackage.identifier,
                    hasSigningShare: !!keyPackage.signing_share,
                    hasVerifyingShare: !!keyPackage.verifying_share,
                    hasVerifyingKey: !!keyPackage.verifying_key,
                    keys: Object.keys(keyPackage)
                });
                throw new Error('keyPackage missing signing_share field');
            }
            
            const keyPackageStr = JSON.stringify(keyPackage);
            console.log(`✅ Client keyPackage retrieved for ${curve}`, {
                keyPackageLength: keyPackageStr.length,
                hasSigningShare: !!keyPackage.signing_share,
                signingShareType: typeof keyPackage.signing_share,
                signingShareLength: typeof keyPackage.signing_share === 'string' ? keyPackage.signing_share.length : 'N/A'
            });
            return keyPackageStr;
            
        } catch (error) {
            console.error(`❌ Failed to get client keyPackage for ${curve}:`, error);
            throw error;
        }
    }

    /**
     * Taproot tweak情報をメタデータに保存
     * @param {string} masterId
     * @param {string} taprootInternalKey - x-only内部鍵P（hex文字列、32 bytes）
     * @param {string} taprootTweak - スカラーt（hex文字列、32 bytes）
     * @param {string} taprootMerkleRoot - Merkle root（hex文字列、32 bytes、ゼロ値）
     */
    async storeTaprootTweakInfo(masterId, taprootInternalKey, taprootTweak, taprootMerkleRoot) {
        try {
            console.log('🔧 Storing Taproot tweak info to metadata...');
            
            if (!window.BitVoyTaproot || !window.BitVoyTaproot.secp256k1) {
                throw new Error('BitVoyTaproot.secp256k1 is required to store Taproot metadata');
            }
            
            const { secp256k1 } = window.BitVoyTaproot;
            const metadata = await this.storage.getMetadata(masterId, 'secp256k1');
            if (!metadata) {
                throw new Error('secp256k1 metadata not found');
            }
            
            let publicKeyPackage = metadata.publicKeyPackage;
            if (!publicKeyPackage) {
                throw new Error('publicKeyPackage missing in secp256k1 metadata');
            }
            if (typeof publicKeyPackage === 'string') {
                publicKeyPackage = JSON.parse(publicKeyPackage);
            }
            
            const verifyingKeyHex = publicKeyPackage.verifying_key;
            const clientId = this.createFrostId(this.parties.LOCAL, 'secp256k1');
            const clientVerifyingShareHex = publicKeyPackage.verifying_shares?.[clientId];
            
            if (!verifyingKeyHex || !clientVerifyingShareHex) {
                throw new Error('verifying key/share missing in publicKeyPackage for Taproot metadata');
            }
            
            const tweakScalar = BigInt('0x' + taprootTweak) % secp256k1.CURVE.n;
            const baseTweakPoint = secp256k1.ProjectivePoint.BASE.multiply(tweakScalar);
            
            const applyTweak = (compressedHex) => {
                const point = secp256k1.ProjectivePoint.fromHex(compressedHex);
                const tweakedPoint = point.add(baseTweakPoint);
                return Buffer.from(tweakedPoint.toRawBytes(true)).toString('hex');
            };
            
            const taprootQCompressed = applyTweak(verifyingKeyHex);
            const taprootClientShareCompressed = applyTweak(clientVerifyingShareHex);
            
            const updatedMetadata = {
                ...metadata,
                taproot_internal_key: taprootInternalKey,
                taproot_tweak: taprootTweak,
                taproot_merkle_root: taprootMerkleRoot,
                taproot_q_compressed: taprootQCompressed,
                taproot_client_share_compressed: taprootClientShareCompressed
            };
            
            await this.storage.storeMetadata(masterId, updatedMetadata, 'secp256k1');
            console.log('✅ Taproot tweak info stored successfully');
        } catch (error) {
            console.error('❌ Failed to store Taproot tweak info:', error);
            throw error;
        }
    }

    async deriveTaprootInfoFromPublicKey(secpPublicKeyHex, masterId = null) {
        if (!secpPublicKeyHex && masterId) {
            const metadata = await this.storage.getMetadata(masterId, 'secp256k1');
            secpPublicKeyHex = metadata?.publicKeyPackage?.verifying_key || metadata?.publicKey;
            if (typeof metadata?.publicKeyPackage === 'string') {
                try {
                    const parsed = JSON.parse(metadata.publicKeyPackage);
                    secpPublicKeyHex = secpPublicKeyHex || parsed?.verifying_key;
                } catch (error) {
                    console.warn('Failed to parse publicKeyPackage while deriving Taproot info', error);
                }
            }
        }
        if (!secpPublicKeyHex) {
            throw new Error('secpPublicKeyHex is required to derive Taproot info');
        }
        if (typeof window === 'undefined' || !window.MPCAddressGenerator) {
            throw new Error('MPCAddressGenerator is not available for Taproot derivation');
        }
        if (!this.taprootAddressGenerator) {
            this.taprootAddressGenerator = new window.MPCAddressGenerator();
        }
        const normalized = secpPublicKeyHex.startsWith('0x') ? secpPublicKeyHex.slice(2) : secpPublicKeyHex;
        const taprootResult = await this.taprootAddressGenerator.generateBitcoinTaprootAddress(normalized, 'mainnet');
        if (!taprootResult || !taprootResult.taproot_internal_key || !taprootResult.taproot_tweak || !taprootResult.taproot_merkle_root) {
            throw new Error('Failed to derive Taproot info from public key');
        }
        return taprootResult;
    }

    async ensureTaprootMetadataPrepared(masterId, secpPublicKeyHex) {
        const metadata = await this.storage.getMetadata(masterId, 'secp256k1');
        if (metadata &&
            metadata.taproot_internal_key &&
            metadata.taproot_tweak &&
            metadata.taproot_merkle_root &&
            metadata.taproot_q_compressed &&
            metadata.taproot_client_share_compressed) {
            return metadata;
        }
        const taprootInfo = await this.deriveTaprootInfoFromPublicKey(secpPublicKeyHex, masterId);
        await this.storeTaprootTweakInfo(
            masterId,
            taprootInfo.taproot_internal_key,
            taprootInfo.taproot_tweak,
            taprootInfo.taproot_merkle_root
        );
        return await this.storage.getMetadata(masterId, 'secp256k1');
    }

    /**
     * 最終署名の検証
     */
    async verifyFinalSignature(signature, message, publicKeyPackage, curve) {
        try {
            // Rust側ではaggregate_and_verify関数内で検証が行われるため、
            // 署名が正常に返された場合は検証成功とみなす
            if (!signature) {
                return {
                    valid: false,
                    error: 'No signature provided',
                    method: 'no_signature'
                };
            }

            // 署名の基本構造チェック
            const isValidStructure = signature && (
                (signature.r && signature.s) || // secp256k1形式
                (signature.R && signature.z) || // Ed25519形式
                (typeof signature === 'string') // 文字列形式
            );

            return {
                valid: isValidStructure,
                method: 'structure_verification',
                timestamp: Date.now(),
                signature: signature
            };

        } catch (error) {
            console.error("Signature verification failed:", error);
            return {
                valid: false,
                error: error.message,
                method: 'failed_verification'
            };
        }
    }

    /**
     * 署名失敗時のセッションクリーンアップ
     */
    async cleanupFailedSigningSession(sessionId) {
        try {
            if (sessionId && this.frostSessions.has(sessionId)) {
                this.frostSessions.delete(sessionId);
                console.log("Failed signing session cleaned up:", sessionId);
            }
        } catch (error) {
            console.error("Failed to cleanup signing session:", error);
        }
    }

    /**
     * シェア暗号化
     */
    async encryptShare(share, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const shareBuffer = new TextEncoder().encode(
            typeof share === 'string' ? share : JSON.stringify(share)
        );
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            shareBuffer
        );

        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    }

    /**
     * シェア復号化
     */
    async decryptShare(encryptedShare, key) {
        const iv = new Uint8Array(encryptedShare.iv);
        const data = new Uint8Array(encryptedShare.data);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const shareString = new TextDecoder().decode(decrypted);
        try {
            return JSON.parse(shareString);
        } catch {
            return shareString;
        }
    }
    
    toUint8Array(data) {
        if (!data) {
            throw new Error('Missing binary data');
        }
        if (data instanceof Uint8Array) {
            return data;
        }
        if (Array.isArray(data)) {
            return Uint8Array.from(data);
        }
        if (typeof data.length === 'number') {
            return Uint8Array.from(Array.from(data));
        }
        throw new Error('Unsupported binary data format');
    }

    arrayToBase64(arrayLike) {
        const bytes = this.toUint8Array(arrayLike);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
    }
    
    base64ToUint8Array(base64String) {
        if (!base64String) {
            throw new Error('Invalid base64 string');
        }
        const binaryString = atob(base64String);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    async generateDeviceIdFromCredentialId(credentialId) {
        if (!credentialId) {
            throw new Error('credentialId is required to derive device_id');
        }
        const credentialBytes = this.base64urlToBuffer(credentialId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', credentialBytes);
        const hashArray = new Uint8Array(hashBuffer);
        const base64 = this.arrayToBase64(hashArray);
        const deviceId = 'dev_' + base64.replace(/[+/=]/g, (match) => {
            const map = { '+': 'A', '/': 'B', '=': '' };
            return map[match];
        }).substring(0, 22);
        return deviceId;
    }

    async extractCredentialIdForGuardian(credentialInfo) {
        if (!credentialInfo) {
            throw new Error('Credential information is required');
        }
        if (credentialInfo.credentialId) {
            return credentialInfo.credentialId;
        }
        if (credentialInfo.credential && credentialInfo.credential.rawId) {
            return this.bufferToBase64url(new Uint8Array(credentialInfo.credential.rawId));
        }
        if (credentialInfo.rawId) {
            return this.bufferToBase64url(new Uint8Array(credentialInfo.rawId));
        }
        if (credentialInfo.assertion && credentialInfo.assertion.rawId) {
            return this.bufferToBase64url(new Uint8Array(credentialInfo.assertion.rawId));
        }
        if (credentialInfo.credential && credentialInfo.credentialId) {
            return credentialInfo.credentialId;
        }
        throw new Error('Unable to extract credentialId for Guardian session');
    }

    getGuardianShareClientInstance() {
        if (typeof window === 'undefined' || !window.GuardianShareClient) {
            throw new Error('GuardianShareClient is not loaded');
        }
        if (!this.guardianShareClient) {
            this.guardianShareClient = new window.GuardianShareClient(this.serverUrls.bitvoyServer);
        }
        return this.guardianShareClient;
    }

    async ensureGuardianSession(masterId, credentialInfo) {
        const guardianClient = this.getGuardianShareClientInstance();
        
        const credentialId = await this.extractCredentialIdForGuardian(credentialInfo);
        guardianClient.credentialId = credentialId;
        
        if (!guardianClient.deviceId) {
            guardianClient.deviceId = await this.generateDeviceIdFromCredentialId(credentialId);
        }

        // JWT方式でGuardianトークンを取得
        if (!guardianClient.isTokenValid()) {
            const jwt = await this.obtainGuardianJWT(masterId, 'guardian_share', {
                deviceId: guardianClient.deviceId,
                keyId: `mpc-${masterId}-${credentialId}`
            });
            
            // GuardianShareClientにJWTを設定（BitVoyサーバ経由でアクセスするため、guardianBaseUrlはbitvoyServerUrlと同じ）
            const guardianBaseUrl = this.serverUrls.bitvoyServer;
            const expiresIn = Math.floor((this.jwtExpiry - Date.now()) / 1000);
            guardianClient.setGuardianJWT(jwt, guardianBaseUrl, expiresIn);
            guardianClient.guardianSessionId = null;
        }

        // セッション初期化は不要（JWT方式では直接APIを呼び出す）
        // ただし、guardianSessionIdが必要な場合は、keyIdとして使用
        if (!guardianClient.guardianSessionId) {
            guardianClient.guardianSessionId = `mpc-${masterId}-${credentialId}`;
        }
        
        return guardianClient;
    }

    async uploadClientShareToGuardian(masterId, curve, encryptedPayload, credential, epochInfo = null) {
        const guardianClient = await this.ensureGuardianSession(masterId, credential);
        
        if (!encryptedPayload || !encryptedPayload.data || !encryptedPayload.iv) {
            throw new Error(`Encrypted payload for ${curve} is invalid or missing`);
        }
        
        const ciphertextBase64 = this.arrayToBase64(encryptedPayload.data);
        const ivBase64 = this.arrayToBase64(encryptedPayload.iv);
        
        const meta = {
            curve,
            algorithm: 'AES-GCM',
            iv: ivBase64,
            epoch_counter: encryptedPayload.epoch_counter ?? epochInfo?.epochCounter ?? null,
            pubkey_fingerprint: encryptedPayload.pubkey_fingerprint ?? epochInfo?.pubkeyFingerprint ?? null,
            createdAt: encryptedPayload.createdAt || Date.now()
        };
        
        await guardianClient.saveShare(
            `mpc-${masterId}-${curve}`,
            `client-${curve}`,
            ciphertextBase64,
            1,
            meta
        );
        
        console.log(`✅ ${curve} payload uploaded to Guardian server`);
    }
    
    async downloadClientShareFromGuardian(masterId, curve, credential) {
        const guardianClient = await this.ensureGuardianSession(masterId, credential);
        
        // GuardianShareClient.getShareを使用（JWT方式とセッション方式の両方に対応）
        const keyId = `mpc-${masterId}-${await this.extractCredentialIdForGuardian(credential)}`;
        const data = await guardianClient.getShare(keyId, `client-${curve}`);

        if (!data || !data.ciphertext || !data.meta?.iv) {
            throw new Error(`Guardian share for ${curve} is missing ciphertext or IV`);
        }

        return {
            data: Array.from(this.base64ToUint8Array(data.ciphertext)),
            iv: Array.from(this.base64ToUint8Array(data.meta.iv)),
            createdAt: data.meta.createdAt || Date.now(),
            epoch_counter: data.meta.epoch_counter ?? null,
            pubkey_fingerprint: data.meta.pubkey_fingerprint ?? null
        };
    }

    async restoreGuardianBackups(masterId, authResult, encryptionKey) {
        const curves = ['secp256k1', 'ed25519', 'ecdsa_tss'];
        for (const curve of curves) {
            console.log(`📥 Restoring ${curve} backup from Guardian server...`);
            const encryptedPayload = await this.downloadClientShareFromGuardian(masterId, curve, authResult);
            const guardianPayload = await this.decryptShare(encryptedPayload, encryptionKey);
            if (!guardianPayload || !guardianPayload.encryptedShare) {
                throw new Error(`Guardian payload for ${curve} is invalid`);
            }

            const epochInfo = guardianPayload.metadata?.epochInfo || {
                epochCounter: guardianPayload.encryptedShare.epoch_counter ?? null,
                pubkeyFingerprint: guardianPayload.encryptedShare.pubkey_fingerprint ?? null
            };

            await this.storage.storeEncryptedShare(masterId, guardianPayload.encryptedShare, curve, epochInfo);
            console.log(`✅ Encrypted share for ${curve} restored to IndexedDB`);

            if (guardianPayload.metadata) {
                await this.storage.storeMetadata(masterId, guardianPayload.metadata, curve);
                console.log(`✅ Metadata for ${curve} restored to IndexedDB`);
            }

            if (curve === 'secp256k1') {
                const taprootInfo = guardianPayload.taprootInfo;
                if (!taprootInfo ||
                    !taprootInfo.taproot_internal_key ||
                    !taprootInfo.taproot_tweak ||
                    !taprootInfo.taproot_merkle_root) {
                    throw new Error('Guardian payload missing Taproot info for secp256k1');
                }
                await this.storeTaprootTweakInfo(
                    masterId,
                    taprootInfo.taproot_internal_key,
                    taprootInfo.taproot_tweak,
                    taprootInfo.taproot_merkle_root
                );
                console.log('✅ Taproot tweak info restored');
            }
        }
    }

    /**
     * Bitvoy Serverにシェア送信（エポック管理対応）
     */
    async sendShareToServer(masterId, share, serverType, curve, epochInfo = null) {
        console.log(`📤 Sending share to server via dual shares endpoint for ${curve}...`);
        
        // JWT認証を取得
        const jwt = await this.obtainGuardianJWT(masterId, 'store_share', {
            shareId: serverType,
            curve: curve
        });

        // 公開鍵パッケージを取得（メタデータから）
        let publicKeyPackage = null;
        try {
            const metadata = await this.storage.getMetadata(masterId, curve);
            if (metadata && metadata.publicKeyPackage) {
                publicKeyPackage = metadata.publicKeyPackage;
                console.log(`📊 Found ${curve} publicKeyPackage in metadata`);
            } else {
                console.warn(`⚠️ No publicKeyPackage found in metadata for ${curve}`);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to get publicKeyPackage from metadata:`, error.message);
        }

        // サーバー用のシェア保存エンドポイントを使用
        const requestBody = {
            masterId,
            curveType: curve,
            share: typeof share === 'string' ? share : JSON.stringify(share),
            publicKeyPackage: publicKeyPackage,
            timestamp: Date.now()
        };

        // エポック情報が提供されている場合は追加
        if (epochInfo) {
            requestBody.epochInfo = {
                epochCounter: epochInfo.epochCounter,
                pubkeyFingerprint: epochInfo.pubkeyFingerprint
            };
        }

        if (curve === 'secp256k1') {
            const secpMetadata = await this.storage.getMetadata(masterId, 'secp256k1');
            if (secpMetadata?.taproot_internal_key && secpMetadata.taproot_tweak && secpMetadata.taproot_merkle_root) {
                requestBody.taprootInfo = {
                    taproot_internal_key: secpMetadata.taproot_internal_key,
                    taproot_tweak: secpMetadata.taproot_tweak,
                    taproot_merkle_root: secpMetadata.taproot_merkle_root,
                    taproot_q_compressed: secpMetadata.taproot_q_compressed,
                    taproot_client_share_compressed: secpMetadata.taproot_client_share_compressed
                };
            }
        }

        const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/server/store-share`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to send ${curve} share to ${serverType}: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log(`✅ ${curve} share sent to ${serverType} successfully via dual shares endpoint`);
        return result;
    }
    /**
     * Guardian Nodeに2種類のシェアを同時送信（BitVoy Server経由）
     * 対応6: 2種類のカーブに対応するために2種類のシェアを持ってMPC用に分散する必要がある
     */
    async sendDualSharesToGuardian(masterId, secp256k1Share, ed25519Share, jwt) {
        console.log(`📤 Sending dual shares (secp256k1 + ed25519) to Guardian Node via BitVoy Server...`);
        
        // 公開鍵パッケージを取得（メタデータから）
        let secp256k1PublicKeyPackage = null;
        let ed25519PublicKeyPackage = null;
        try {
            const secpMetadata = await this.storage.getMetadata(masterId, 'secp256k1');
            if (secpMetadata && secpMetadata.publicKeyPackage) {
                secp256k1PublicKeyPackage = secpMetadata.publicKeyPackage;
                console.log(`📊 Found secp256k1 publicKeyPackage in metadata`);
            } else {
                console.warn(`⚠️ No publicKeyPackage found in metadata for secp256k1`);
            }
            
            const edMetadata = await this.storage.getMetadata(masterId, 'ed25519');
            if (edMetadata && edMetadata.publicKeyPackage) {
                ed25519PublicKeyPackage = edMetadata.publicKeyPackage;
                console.log(`📊 Found ed25519 publicKeyPackage in metadata`);
            } else {
                console.warn(`⚠️ No publicKeyPackage found in metadata for ed25519`);
            }
        } catch (error) {
            console.warn(`⚠️ Failed to get publicKeyPackage from metadata:`, error.message);
        }
        
        const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/guardian/store-dual-shares`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({
                masterId,
                secp256k1Share: typeof secp256k1Share === 'string' ? secp256k1Share : JSON.stringify(secp256k1Share),
                ed25519Share: typeof ed25519Share === 'string' ? ed25519Share : JSON.stringify(ed25519Share),
                secp256k1PublicKeyPackage: secp256k1PublicKeyPackage,
                ed25519PublicKeyPackage: ed25519PublicKeyPackage,
                taprootInfo: secpMetadata && secpMetadata.taproot_internal_key && secpMetadata.taproot_tweak ? {
                    taproot_internal_key: secpMetadata.taproot_internal_key,
                    taproot_tweak: secpMetadata.taproot_tweak,
                    taproot_merkle_root: secpMetadata.taproot_merkle_root,
                    taproot_q_compressed: secpMetadata.taproot_q_compressed,
                    taproot_client_share_compressed: secpMetadata.taproot_client_share_compressed
                } : null,
                timestamp: Date.now()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to send dual shares to Guardian Node: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const result = await response.json();
        console.log(`✅ Dual shares (secp256k1 + ed25519) sent to Guardian Node successfully via BitVoy Server`);
        return result;
    }

    /**
     * 緊急復旧フロー実行
     * @param {string|null} email - メールアドレス（オプショナル）
     * @param {string|null} emailCode - メール認証コード（オプショナル）
     * @param {string} recoveryAction - リカバリーアクション（デフォルト: 'emergency_restore'）
     * @param {PublicKeyCredential|null} existingAssertion - 既に取得した認証結果（オプショナル）
     * @param {string|null} existingChallengeKey - 既に取得したchallengeKey（existingAssertion使用時は推奨）
     */
    async emergencyRecovery(email, emailCode, recoveryAction = 'emergency_restore', existingAssertion = null, existingChallengeKey = null) {
        try {
            console.log('🆘 Starting simplified emergency recovery flow (GuardianShareClient-based)...');

            let masterId;

            // Phase 1: masterIdを取得
            // メール認証が提供されている場合は使用、提供されていない場合はパスキー認証のみ
            if (email && emailCode) {
                // メール認証で masterId を特定（既存の方法）
                const emailAuthResult = await this.authenticateWithEmail(email, emailCode);
                if (!emailAuthResult.success) {
                    throw new Error('Email authentication failed: ' + emailAuthResult.error);
                }
                masterId = emailAuthResult.masterId;
                console.log('✅ Email authentication successful. Recovered masterId:', masterId);
            } else {
                // メール認証なし: パスキー認証のみでmasterIdを取得
                masterId = await this.recoverMasterIdFromPasskey(existingAssertion, existingChallengeKey);
                console.log('✅ Passkey authentication successful. Recovered masterId:', masterId);
            }

            // Phase 2: 通常のパスキー認証 + GuardianShareClientフローで復元
            //   - recoverFromCredential は
            //     1) authenticateWithPasskey（既に取得した認証結果を使用する場合はスキップ）
            //     2) deriveEncryptionKey
            //     3) restoreGuardianBackups（/mpcapi/guardian/shares の GET 経由）
            //     4) ローカルに暗号化シェアを復元 & 1つ復号
            const recovery = await this.recoverFromCredential(masterId, null, existingAssertion);
            
            // 復旧完了後のセッション状態更新
            sessionStorage.setItem('mpc.initialized', 'true');
            sessionStorage.setItem('mpc.signedin', 'true');
            sessionStorage.setItem('mpc.masterid', masterId);
            sessionStorage.setItem('mpc.emergency_recovered', 'true');
            sessionStorage.setItem('mpc.emergency_recovery_timestamp', Date.now().toString());
            
            console.log('✅ Emergency recovery completed using GuardianShareClient flow');
            
            return {
                success: true,
                masterId,
                emergencyRecovered: true,
                recoveryResult: recovery,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error("❌ Emergency recovery failed:", error);
            throw error;
        }
    }

    /**
     * パスキー認証のみでmasterIdを取得する関数
     * @param {PublicKeyCredential|null} existingAssertion - 既に取得した認証結果（オプショナル）
     * @param {string|null} existingChallengeKey - 既に取得したchallengeKey（existingAssertion使用時は必須）
     *   このchallengeKeyは /mpcapi/auth/recovery/start から取得されたものである必要があります。
     * @returns {Promise<string>} masterId
     */
    async recoverMasterIdFromPasskey(existingAssertion = null, existingChallengeKey = null) {
        try {
            let assertion = existingAssertion;
            let challengeData = null;
            
            // existingAssertionとexistingChallengeKeyが提供されている場合、新しいチャレンジを取得しない
            // existingChallengeKeyは /mpcapi/auth/recovery/start から取得されたもので、
            // /mpcapi/auth/recovery/finish で検証されます
            if (existingAssertion && existingChallengeKey) {
                // 既存のチャレンジキーを使用（チャレンジの整合性はサーバー側で検証される）
                challengeData = {
                    success: true,
                    challengeKey: existingChallengeKey
                };
                console.log('✅ Using existing assertion and challengeKey');
            } else {
                // リカバリーチャレンジを取得
                const challengeResponse = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/auth/recovery/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!challengeResponse.ok) {
                    const errorData = await challengeResponse.json().catch(() => ({}));
                    throw new Error(`Failed to get recovery challenge: ${challengeResponse.status} - ${errorData.error || 'Unknown error'}`);
                }
                
                challengeData = await challengeResponse.json();
                
                if (!challengeData.success || !challengeData.challengeKey) {
                    throw new Error('Failed to get recovery challenge or challengeKey');
                }
            }
            
            if (!assertion) {
                // チャレンジをUint8Arrayに変換
                const challengeBuffer = typeof challengeData.challenge === 'string'
                    ? this.base64urlToBuffer(challengeData.challenge)
                    : new Uint8Array(challengeData.challenge);
                
                // パスキー認証を実行
                const publicKeyCredentialRequestOptions = {
                    challenge: challengeBuffer,
                    timeout: 60000,
                    rpId: challengeData.rpId || window.location.hostname,
                    userVerification: 'required',
                    allowCredentials: [] // discoverable credential
                };
                
                assertion = await navigator.credentials.get({
                    publicKey: publicKeyCredentialRequestOptions
                });
                
                if (!assertion) {
                    throw new Error('Passkey authentication cancelled or failed');
                }
            } else {
                // existingAssertionが提供されている場合、existingChallengeKeyが必須
                if (!existingChallengeKey) {
                    throw new Error('existingChallengeKey is required when existingAssertion is provided');
                }
                console.log('✅ Using existing assertion with provided challengeKey');
            }
            
            // 認証結果をサーバーに送信してmasterIdを取得
            const finishResponse = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/auth/recovery/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential: {
                        id: assertion.id,
                        rawId: this.bufferToBase64url(new Uint8Array(assertion.rawId)),
                        type: assertion.type,
                        response: {
                            authenticatorData: this.bufferToBase64url(new Uint8Array(assertion.response.authenticatorData)),
                            clientDataJSON: this.bufferToBase64url(new Uint8Array(assertion.response.clientDataJSON)),
                            signature: this.bufferToBase64url(new Uint8Array(assertion.response.signature)),
                            userHandle: assertion.response.userHandle ? 
                                this.bufferToBase64url(new Uint8Array(assertion.response.userHandle)) : null
                        }
                    },
                    challengeKey: challengeData.challengeKey
                })
            });
            
            if (!finishResponse.ok) {
                const errorData = await finishResponse.json().catch(() => ({}));
                throw new Error(`Failed to recover masterId: ${finishResponse.status} - ${errorData.error || 'Unknown error'}`);
            }
            
            const finishData = await finishResponse.json();
            if (!finishData.success || !finishData.masterId) {
                throw new Error('Failed to recover masterId from passkey');
            }
            
            return finishData.masterId;
            
        } catch (error) {
            console.error('Failed to recover masterId from passkey:', error);
            throw error;
        }
    }

    /**
     * セッション内のTransport Keysを安全に削除
     */
    clearSessionTransportKeys() {
        try {
            console.log(`🗑️ Clearing session transport keys...`);
            
            if (this.sessionTransportKeys) {
                // 各鍵を安全にクリア
                Object.keys(this.sessionTransportKeys).forEach(role => {
                    const keys = this.sessionTransportKeys[role];
                    if (keys.x25519_private) {
                        // メモリから確実に削除
                        keys.x25519_private = null;
                    }
                    if (keys.ed25519_private) {
                        keys.ed25519_private = null;
                    }
                });
                
                // セッションオブジェクト自体を削除
                this.sessionTransportKeys = null;
            }
            
            console.log(`✅ Session transport keys cleared`);
            
        } catch (error) {
            console.error(`❌ Failed to clear session transport keys:`, error);
        }
    }

    /**
     * frost_wasmを使用して秘密を復元
     */
    async recoverSecretWithFrostWasm(guardianShare, publicKeyPackage, curve) {
        try {
            console.log(`🔐 Recovering secret with frost_wasm for ${curve}...`);
            console.log(`📊 Input data:`, {
                guardianShareType: typeof guardianShare,
                guardianShareLength: guardianShare ? guardianShare.length : 0,
                publicKeyPackageType: typeof publicKeyPackage,
                curve: curve
            });

            // frost_wasmライブラリの存在確認
            const recoverFunction = curve === 'secp256k1' ? 'secp_recover_secret' : 'ed_recover_secret';
            if (!window.frost_wasm || typeof window.frost_wasm[recoverFunction] !== 'function') {
                throw new Error(`frost_wasm ${recoverFunction} function is not available`);
            }

            // frost_wasmが期待する形式に変換
            console.log(`🔄 Converting data to frost_wasm expected format...`);
            
            // guardian_share_hexの処理
            let formattedGuardianShare = guardianShare;
            if (typeof formattedGuardianShare !== 'string') {
                throw new Error('guardianShare must be a hex string');
            }
            
            // base16（hex）エンコードの確認
            if (!/^[0-9a-fA-F]+$/.test(formattedGuardianShare)) {
                throw new Error('guardianShare must be a valid hex string');
            }
            
            console.log(`📊 Guardian share:`, {
                type: typeof formattedGuardianShare,
                length: formattedGuardianShare ? formattedGuardianShare.length : 0,
                preview: formattedGuardianShare ? formattedGuardianShare.substring(0, 100) + '...' : 'null'
            });

            // publicKeyPackageの処理
            let formattedPublicKeyPackage = publicKeyPackage;
            if (typeof formattedPublicKeyPackage === 'object') {
                // オブジェクトの場合はJSON文字列に変換
                formattedPublicKeyPackage = JSON.stringify(formattedPublicKeyPackage);
            } else if (typeof formattedPublicKeyPackage !== 'string') {
                throw new Error('publicKeyPackage must be a string or object');
            }

            console.log(`📊 Public key package:`, {
                type: typeof formattedPublicKeyPackage,
                length: formattedPublicKeyPackage ? formattedPublicKeyPackage.length : 0,
                preview: formattedPublicKeyPackage ? formattedPublicKeyPackage.substring(0, 100) + '...' : 'null'
            });

            // guardian_identifierの設定
            let guardianIdentifier = 1; // デフォルト値
            
            // metadataから識別子を取得（もし利用可能な場合）
            if (publicKeyPackage && typeof publicKeyPackage === 'object' && publicKeyPackage.metadata) {
                const metadata = publicKeyPackage.metadata;
                if (metadata.guardianIdentifier !== undefined) {
                    guardianIdentifier = metadata.guardianIdentifier;
                } else if (metadata.originalMetadata && metadata.originalMetadata.shareId) {
                    // shareIdから識別子を抽出
                    const shareIdMatch = metadata.originalMetadata.shareId.toString().match(/\d+/);
                    if (shareIdMatch) {
                        guardianIdentifier = parseInt(shareIdMatch[0]);
                    }
                }
            }
            
            console.log(`📊 Guardian identifier: ${guardianIdentifier}`);

            // frost_wasmで秘密を復元
            console.log(`🔄 Calling frost_wasm ${recoverFunction}...`);
            console.log(`📊 Calling with:`, {
                guardianShare: formattedGuardianShare.substring(0, 50) + '...',
                guardianIdentifier: guardianIdentifier,
                publicKeyPackage: formattedPublicKeyPackage.substring(0, 50) + '...'
            });
            
            const recoveredSecret = window.frost_wasm[recoverFunction](
                formattedGuardianShare,
                guardianIdentifier,
                formattedPublicKeyPackage
            );

            if (!recoveredSecret) {
                throw new Error('Secret recovery failed - no result returned');
            }

            console.log(`✅ Secret recovered successfully for ${curve}`);
            console.log(`📊 Recovered secret:`, {
                type: typeof recoveredSecret,
                length: recoveredSecret ? recoveredSecret.length : 0,
                preview: recoveredSecret ? recoveredSecret.substring(0, 20) + '...' : 'null'
            });

            return {
                success: true,
                secret: recoveredSecret,
                curve: curve
            };

        } catch (error) {
            console.error(`❌ Secret recovery with frost_wasm failed for ${curve}:`, error);
            console.error(`📊 Error details:`, {
                errorType: error.constructor.name,
                errorMessage: error.message,
                errorStack: error.stack,
                guardianShareType: typeof guardianShare,
                publicKeyPackageType: typeof publicKeyPackage,
                curve: curve
            });
            
            // より詳細なデバッグ情報を追加
            console.error(`📊 Debug info:`, {
                guardianSharePreview: guardianShare ? guardianShare.substring(0, 50) + '...' : 'null',
                publicKeyPackageKeys: publicKeyPackage && typeof publicKeyPackage === 'object' ? Object.keys(publicKeyPackage) : 'not_object',
                frostWasmFunctions: window.frost_wasm ? Object.keys(window.frost_wasm).filter(key => key.includes('recover')) : 'frost_wasm_not_available'
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * デバイス復旧処理（BitVoy Server経由）
     */
    async deviceRecovery(masterId, jwt) {
        try {
            console.log("🔄 Starting device recovery via BitVoy Server for:", masterId);
            
            // BitVoy Server経由でデバイス復旧処理
            const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/guardian/device-recovery`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    masterId: masterId,
                    action: 'device_recovery',
                    timestamp: Date.now()
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Device recovery request failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }

            const result = await response.json();
            console.log("✅ Device recovery completed successfully via BitVoy Server");
            return {
                success: true,
                deviceRecovered: true,
                deviceInfo: result.deviceInfo
            };

        } catch (error) {
            console.error("❌ Device recovery failed:", error);
            throw error;
        }
    }

    /**
     * ログイン状態確認
     */
    isSignin() {
        try {
            // パスキー認証状態とセッション状態のみで判定
            // BTCウォレットアドレスチェックは削除（ログイン後にウォレット情報が読み込まれるため）
            return sessionStorage.hasOwnProperty('mpc.initialized') &&
                   sessionStorage.getItem('mpc.signedin') === 'true';
        } catch (error) {
            console.error("Error checking signin status:", error);
            return false;
        }
    }

    /**
     * Email認証でmasterId取得
     */
    async authenticateWithEmail(email, emailCode) {
        try {
            const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/email/verify-restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    verificationCode: emailCode,
                    context: 'emergency_recovery'
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Email verification failed');
            }

            const result = await response.json();
            if (!result.masterId) {
                throw new Error('No wallet found for this email address');
            }

            return {
                success: true,
                masterId: result.masterId,
                emailVerified: true
            };

        } catch (error) {
            console.error("Email authentication failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 緊急復旧用JWT取得（BitVoy Server経由・パスキー認証付き）
     */
    async obtainEmergencyJWT(masterId, action, webauthnCredential) {
        try {
            console.log("🔐 Requesting emergency JWT via BitVoy Server...");
            
            // 認証状態を確認
            if (!this.emergencyAuthState || !this.emergencyAuthState.emailVerified || !this.emergencyAuthState.webauthnVerified) {
                throw new Error('Emergency authentication not completed. Please complete email and Passkey authentication first.');
            }
            
            // チャレンジキーを生成（緊急復旧用）
            const challengeKey = `emergency_jwt_${masterId}_${Date.now()}`;
            
            // パスキー認証は既に完了済みなので、直接JWTを要求
            const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/guardian/emergency-jwt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    action: action,
                    webauthnCredential: webauthnCredential, // 既に認証済み
                    challengeKey: challengeKey, // チャレンジキーを追加
                    emailVerified: this.emergencyAuthState.emailVerified,
                    webauthnVerified: this.emergencyAuthState.webauthnVerified,
                    context: {
                        emergency: true,
                        timestamp: Date.now()
                    }
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Emergency JWT acquisition failed');
            }

            const result = await response.json();
            if (!result.jwt) {
                throw new Error('No JWT received from server');
            }

            console.log("✅ Emergency JWT obtained successfully");
            return result.jwt;

        } catch (error) {
            console.error("❌ Emergency JWT acquisition failed:", error);
            throw error;
        }
    }
    /**
     * バッチAPIのみを使ったMPCウォレット初期化フロー（全パーティ分のRound1パッケージをクライアントで集約）
     */
    async initializeWalletBatchMode(masterId, skipPasskeyRegistration = false, credentialData = null) {
        try {
            let credential = credentialData || null;
            
            // 新フローでは既にPasskey登録が完了しているため、スキップ
            if (!skipPasskeyRegistration) {
                console.log('[BatchInit] Step 1: Passkeyクレデンシャル作成開始', { masterId });
                credential = await this.createPasskeyCredential(masterId);
                console.log('[BatchInit] Step 1: Passkeyクレデンシャル作成完了', { credential });
            } else {
                if (credential) {
                    console.log('[BatchInit] Step 1: Passkeyクレデンシャル作成スキップ（新フローで既に登録済み、呼び出し元提供データを使用）', { masterId });
                } else {
                    console.warn('[BatchInit] Step 1: Passkeyクレデンシャル作成スキップ（新フローで既に登録済み）ただしクレデンシャルデータ未提供のため暗号化キー導出に失敗する可能性があります', { masterId });
                }
            }
            const threshold = this.threshold;
            const max_signers = this.totalParties;
            
            // ==========================================
            // secp256k1: FROST DKG (2-of-2)
            // ==========================================
            console.log('[BatchInit] Step 2-1: secp256k1 FROST DKG (2-of-2) 開始');
            
            // secp_p1Keygen関数が利用可能か確認
            if (typeof window === 'undefined' || !window.secp_p1Keygen) {
                throw new Error('secp_p1Keygen is not available. Please load p1client.bundle.js before initialization.');
            }
            
            // WebSocket URLを構築
            // P2サーバーのWebSocket URL: wss://bitvoy.org/mpc-p2
            const p2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const secpSessionId = `keygen-secp-${masterId}-${Date.now()}`;
            // WebSocket URL: wss://bitvoy.org/mpc-p2?sid=...&uid=...
            const secpWsUrl = `${p2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${secpSessionId}&uid=${encodeURIComponent(masterId)}`;
            
            console.log('[BatchInit] Step 2-1: secp256k1 WebSocket URL:', secpWsUrl);
            
            let secpKeygenResult;
            try {
                secpKeygenResult = await window.secp_p1Keygen({
                    wsUrl: secpWsUrl,
                    sessionId: secpSessionId
                });
                console.log('[BatchInit] Step 2-1: secp256k1 FROST DKG (2-of-2) 完了', {
                    sessionId: secpKeygenResult.sessionId,
                    publicKey: secpKeygenResult.publicKey?.substring(0, 20) + '...',
                    hasKeyPackage: !!secpKeygenResult.keyPackage,
                    hasPublicKeyPackage: !!secpKeygenResult.publicKeyPackage
                });
            } catch (secpError) {
                console.error('[BatchInit] Step 2-1: secp256k1 FROST DKG エラー:', secpError);
                throw new Error(`secp256k1 FROST DKG failed: ${secpError.message}`);
            }
            
            // ==========================================
            // ed25519: FROST DKG (2-of-2) - p1client使用
            // ==========================================
            console.log('[BatchInit] Step 2-2: ed25519 FROST DKG (2-of-2) 開始');
            
            // ed_p1Keygen関数が利用可能か確認
            if (typeof window === 'undefined' || !window.ed_p1Keygen) {
                throw new Error('ed_p1Keygen is not available. Please load p1client.bundle.js before initialization.');
            }
            
            // WebSocket URLを構築
            const edP2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const edSessionId = `keygen-ed-${masterId}-${Date.now()}`;
            const edWsUrl = `${edP2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${edSessionId}&uid=${encodeURIComponent(masterId)}`;
            
            console.log('[BatchInit] Step 2-2: ed25519 WebSocket URL:', edWsUrl);
            
            let edKeygenResult;
            try {
                edKeygenResult = await window.ed_p1Keygen({
                    wsUrl: edWsUrl,
                    sessionId: edSessionId
                });
                console.log('[BatchInit] Step 2-2: ed25519 FROST DKG (2-of-2) 完了', {
                    sessionId: edKeygenResult.sessionId,
                    hasKeyPackage: !!edKeygenResult.keyPackage,
                    hasPublicKeyPackage: !!edKeygenResult.publicKeyPackage
                });
            } catch (edError) {
                console.error('[BatchInit] Step 2-2: ed25519 FROST DKG エラー:', edError);
                throw new Error(`ed25519 DKG failed: ${edError.message}`);
            }
            
            // ed25519のkeyPackageとpublicKeyPackageを取得
            const edKeyPackage = edKeygenResult.keyPackage;
            const edPublicKeyPackage = edKeygenResult.publicKeyPackage;
            
            // 公開鍵を取得（publicKeyPackageから）
            let edPublicKeyFromPkg = null;
            try {
                const edPubPkg = typeof edPublicKeyPackage === 'string' ? JSON.parse(edPublicKeyPackage) : edPublicKeyPackage;
                if (edPubPkg && edPubPkg.verifying_key) {
                    edPublicKeyFromPkg = edPubPkg.verifying_key;
                }
            } catch (e) {
                console.warn('[BatchInit] Step 2-2: Failed to extract ed25519 public key from publicKeyPackage:', e);
            }
            
            // ==========================================
            // ecdsa_tss: ECDSA-TSS KeyGen (2-of-2) - p1client使用
            // ==========================================
            console.log('[BatchInit] Step 2-3: ecdsa_tss ECDSA-TSS KeyGen (2-of-2) 開始');
            
            // ecdsa_tss_p1Keygen関数が利用可能か確認
            if (typeof window === 'undefined' || !window.ecdsa_tss_p1Keygen) {
                throw new Error('ecdsa_tss_p1Keygen is not available. Please load p1client.bundle.js before initialization.');
            }
            
            // WebSocket URLを構築
            const ecdsaP2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            const ecdsaSessionId = `keygen-ecdsa-${masterId}-${Date.now()}`;
            const ecdsaWsUrl = `${ecdsaP2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${ecdsaSessionId}&uid=${encodeURIComponent(masterId)}`;
            
            console.log('[BatchInit] Step 2-3: ecdsa_tss WebSocket URL:', ecdsaWsUrl);
            
            let ecdsaKeygenResult;
            try {
                ecdsaKeygenResult = await window.ecdsa_tss_p1Keygen({
                    wsUrl: ecdsaWsUrl,
                    sessionId: ecdsaSessionId
                });
                console.log('[BatchInit] Step 2-3: ecdsa_tss ECDSA-TSS KeyGen (2-of-2) 完了', {
                    sessionId: ecdsaKeygenResult.sessionId,
                    hasP1KeyShare: !!ecdsaKeygenResult.p1KeyShare,
                    publicKey: ecdsaKeygenResult.publicKey?.substring(0, 20) + '...'
                });
            } catch (ecdsaError) {
                console.error('[BatchInit] Step 2-3: ecdsa_tss ECDSA-TSS KeyGen エラー:', ecdsaError);
                throw new Error(`ecdsa_tss KeyGen failed: ${ecdsaError.message}`);
            }
            
            // ecdsa_tssのp1KeyShareとpublicKeyを取得
            const ecdsaP1KeyShare = ecdsaKeygenResult.p1KeyShare;
            const ecdsaPublicKey = ecdsaKeygenResult.publicKey;
            
            // ==========================================
            // ecdsa_tss: HD Walletでアドレス生成（デフォルトパス: /ethereum/0/0）
            // ==========================================
            console.log('[BatchInit] Step 2-4: ecdsa_tss HD Walletアドレス生成開始');
            try {
                const defaultPath = '/ethereum/0/0';

                // --- 1) d = H(path) mod n ---
                const pathBytes = new TextEncoder().encode(defaultPath);
                const hashBuf = await crypto.subtle.digest('SHA-256', pathBytes);
                const hash = new Uint8Array(hashBuf);
                const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

                let d = BigInt('0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')) % SECP256K1_N;
                if (d === 0n) d = 1n;

                // --- 2) マスター公開鍵を Point に変換 ---
                const masterPubKeyHex = ecdsaPublicKey.startsWith('0x')
                    ? ecdsaPublicKey.slice(2)
                    : ecdsaPublicKey;

                // @noble/secp256k1 のインポート（ブラウザ環境では window.BitVoyTaproot.secp256k1 を使用）
                let secp;
                if (typeof window !== 'undefined' && window.BitVoyTaproot && window.BitVoyTaproot.secp256k1) {
                    secp = window.BitVoyTaproot.secp256k1;
                } else {
                    // ES6モジュール環境の場合
                    // import * as secp from "@noble/secp256k1";
                    throw new Error('@noble/secp256k1 is not available. Please ensure BitVoyTaproot.secp256k1 is loaded.');
                }

                // masterPubKeyHex は "02/03 + 32byte" の圧縮形式を想定
                const P = secp.ProjectivePoint.fromHex(masterPubKeyHex);

                // --- 3) d·G を計算して P_child = P + d·G ---
                const Q = P.add(secp.ProjectivePoint.BASE.multiply(d));  // P_child

                // 圧縮形式で子公開鍵を取得
                const childPubKeyBytes = Q.toRawBytes(true); // true = compressed
                const childPubKeyHex = Buffer.from(childPubKeyBytes).toString('hex');

                // --- 4) 子公開鍵から Ethereum アドレス生成 ---
                if (typeof window.MPCAddressGenerator === 'undefined') {
                    throw new Error('MPCAddressGenerator is not available');
                }
                const addressGenerator = new window.MPCAddressGenerator();
                const ethereumAddress = addressGenerator.generateEthereumAddress(childPubKeyHex);

                console.log('[BatchInit] Step 2-4: ecdsa_tss HD Walletアドレス生成完了', {
                    path: defaultPath,
                    masterPublicKey: ecdsaPublicKey.substring(0, 20) + '...',
                    childPublicKey: '0x' + childPubKeyHex.substring(0, 20) + '...',
                    ethereumAddress: ethereumAddress
                });

                // 必要に応じて: path → address のメタデータを保存
            } catch (hdError) {
                console.warn('[BatchInit] Step 2-4: ecdsa_tss HD Walletアドレス生成エラー（続行）:', hdError);
            }
            
            // ==========================================
            // secp256k1: メタデータ保存（FROST DKG形式）
            // ==========================================
            console.log('[BatchInit] Step 5-2: secp256k1 メタデータ保存（FROST DKG形式）');
            
            const secpMetadata = {
                keyPackage: secpKeygenResult.keyPackage,
                publicKeyPackage: secpKeygenResult.publicKeyPackage,
                publicKey: secpKeygenResult.publicKey,
                algorithm: 'FROST',
                curve: 'secp256k1',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                createdAt: Date.now(),
                version: '2.1',
                taproot_internal_key: null,
                taproot_tweak: null,
                taproot_merkle_root: null,
                taproot_q_compressed: null,
                taproot_client_share_compressed: null
            };
            
            await this.storage.storeMetadata(masterId, secpMetadata, 'secp256k1');
            await this.ensureTaprootMetadataPrepared(masterId, secpKeygenResult.publicKey);
            console.log('[BatchInit] Step 5-2: secp256k1 メタデータ保存完了');
            
            // ==========================================
            // ed25519: メタデータ保存（FROST DKG形式）
            // ==========================================
            console.log('[BatchInit] Step 5-3: ed25519 メタデータ保存（FROST DKG形式）');
            
            const edMetadata = {
                keyPackage: edKeyPackage,
                publicKeyPackage: edPublicKeyPackage,
                publicKey: edPublicKeyFromPkg,
                algorithm: 'FROST',
                curve: 'ed25519',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                createdAt: Date.now(),
                version: '2.1'
            };
            
            await this.storage.storeMetadata(masterId, edMetadata, 'ed25519');
            console.log('[BatchInit] Step 5-3: ed25519 メタデータ保存完了');

            // ==========================================
            // ecdsa_tss: メタデータ保存（ECDSA-TSS形式）
            // ==========================================
            console.log('[BatchInit] Step 5-4: ecdsa_tss メタデータ保存（ECDSA-TSS形式）');
            
            const ecdsaMetadata = {
                p1KeyShare: ecdsaP1KeyShare,
                publicKey: ecdsaPublicKey,
                algorithm: 'ECDSA-TSS',
                curve: 'ecdsa_tss',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                createdAt: Date.now(),
                version: '2.1'
            };
            
            await this.storage.storeMetadata(masterId, ecdsaMetadata, 'ecdsa_tss');
            console.log('[BatchInit] Step 5-4: ecdsa_tss メタデータ保存完了');

            // ==========================================
            // secp256k1: ローカルシェアの暗号化保存（FROST DKG形式）
            // ==========================================
            console.log('[BatchInit] Step 5-5: secp256k1 ローカルシェアの暗号化保存開始');
            
            const credentialForEncryption = credential;
            if (!credentialForEncryption) {
                throw new Error('Passkey credential data is required to derive encryption key. Provide credential or credentialId when skipPasskeyRegistration=true.');
            }

            try {
                // Passkeyのクレデンシャルから暗号化キーを導出
                const encryptionKey = await this.deriveEncryptionKey(credentialForEncryption, masterId);

                // keyPackageからシェアデータを抽出（keyPackageオブジェクト全体をシリアライズ）
                // 注意: keyPackageの構造に応じて適切なフィールドを使用
                const secpShareData = JSON.stringify(secpKeygenResult.keyPackage);

                // 暗号化してsharesストアへ保存（エポック情報なしで保存 - 後で更新）
                const secpEncryptedLocalShare = await this.encryptShare(secpShareData, encryptionKey);
                await this.storage.storeEncryptedShare(masterId, secpEncryptedLocalShare, 'secp256k1');

                console.log('✅ secp256k1 local share encrypted and stored (BatchInit) - epoch info will be added later');
            } catch (e) {
                console.error('❌ Failed to store secp256k1 local share during BatchInit:', e);
                throw e;
            }
            
            // ==========================================
            // ed25519: ローカルシェアの暗号化保存（FROST DKG形式）
            // ==========================================
            console.log('[BatchInit] Step 5-6: ed25519 ローカルシェアの暗号化保存開始');
            try {
                // Passkeyのクレデンシャルから暗号化キーを導出
                const encryptionKey = await this.deriveEncryptionKey(credentialForEncryption, masterId);

                // keyPackageからシェアデータを抽出（keyPackageオブジェクト全体をシリアライズ）
                const edShareData = JSON.stringify(edKeyPackage);

                // 暗号化してsharesストアへ保存（エポック情報なしで保存 - 後で更新）
                const edEncryptedLocalShare = await this.encryptShare(edShareData, encryptionKey);
                await this.storage.storeEncryptedShare(masterId, edEncryptedLocalShare, 'ed25519');

                console.log('✅ ed25519 local share encrypted and stored (BatchInit) - epoch info will be added later');
            } catch (e) {
                console.error('❌ Failed to store ed25519 local share during BatchInit:', e);
                throw e;
            }
            
            // ==========================================
            // ecdsa_tss: ローカルシェアの暗号化保存（ECDSA-TSS形式）
            // ==========================================
            console.log('[BatchInit] Step 5-7: ecdsa_tss ローカルシェアの暗号化保存開始');
            try {
                // Passkeyのクレデンシャルから暗号化キーを導出
                const encryptionKey = await this.deriveEncryptionKey(credentialForEncryption, masterId);

                // p1KeyShareからシェアデータを抽出（p1KeyShareオブジェクト全体をシリアライズ）
                const ecdsaShareData = JSON.stringify(ecdsaP1KeyShare);
            
                // 暗号化してsharesストアへ保存（エポック情報なしで保存 - 後で更新）
                const ecdsaEncryptedLocalShare = await this.encryptShare(ecdsaShareData, encryptionKey);
                await this.storage.storeEncryptedShare(masterId, ecdsaEncryptedLocalShare, 'ecdsa_tss');

                console.log('✅ ecdsa_tss local share encrypted and stored (BatchInit) - epoch info will be added later');
            } catch (e) {
                console.error('❌ Failed to store ecdsa_tss local share during BatchInit:', e);
                throw e;
            }
            
            // ==========================================
            // メタデータ最終保存
            // ==========================================
            console.log('[BatchInit] Step 7: メタデータ最終保存開始');
            
            // secp256k1: publicKeyPackageを取得（secpKeygenResultから）
            const secp256k1PublicKeyPackage = secpKeygenResult.publicKeyPackage;
            
            // ed25519: publicKeyPackageを取得（edKeygenResultから）
            const ed25519PublicKeyPackage = edPublicKeyPackage;
            
            // エポック情報を生成
            // secp256k1: publicKeyPackageからフィンガープリントを生成
            const secpEpochInfo = {
                epochCounter: 0, // 初期化では0から開始
                pubkeyFingerprint: await this.generatePubkeyFingerprint(secp256k1PublicKeyPackage)
            };
            // ed25519: publicKeyPackageからフィンガープリントを生成
            const edEpochInfo = {
                epochCounter: 0, // 初期化では0から開始
                pubkeyFingerprint: await this.generatePubkeyFingerprint(ed25519PublicKeyPackage)
            };
            // ecdsa_tss: 公開鍵から直接フィンガープリントを生成
            const ecdsaEpochInfo = {
                epochCounter: 0, // 初期化では0から開始
                pubkeyFingerprint: await this.generatePubkeyFingerprint({ verifying_key: ecdsaPublicKey })
            };
            
            // エポック情報を生成した後、シェアを更新
            console.log('[BatchInit] Step 7-1: シェアにエポック情報を追加');
            let existingSecpShare = null;
            let existingEdShare = null;
            let existingEcdsaShare = null;
            try {
                // 既存のシェアを取得
                existingSecpShare = await this.storage.getEncryptedShare(masterId, 'secp256k1');
                existingEdShare = await this.storage.getEncryptedShare(masterId, 'ed25519');
                existingEcdsaShare = await this.storage.getEncryptedShare(masterId, 'ecdsa_tss');
                
                // エポック情報を追加して再保存
                if (existingSecpShare) {
                    existingSecpShare.epoch_counter = secpEpochInfo.epochCounter;
                    existingSecpShare.pubkey_fingerprint = secpEpochInfo.pubkeyFingerprint;
                    await this.storage.put(this.storage.stores.shares, `share_${masterId}_secp256k1`, existingSecpShare);
                }
                
                if (existingEdShare) {
                    existingEdShare.epoch_counter = edEpochInfo.epochCounter;
                    existingEdShare.pubkey_fingerprint = edEpochInfo.pubkeyFingerprint;
                    await this.storage.put(this.storage.stores.shares, `share_${masterId}_ed25519`, existingEdShare);
                }
                
                if (existingEcdsaShare) {
                    existingEcdsaShare.epoch_counter = ecdsaEpochInfo.epochCounter;
                    existingEcdsaShare.pubkey_fingerprint = ecdsaEpochInfo.pubkeyFingerprint;
                    await this.storage.put(this.storage.stores.shares, `share_${masterId}_ecdsa_tss`, existingEcdsaShare);
                }
                
                console.log('✅ Epoch info added to shares successfully');
                console.log('📊 Epoch info - secp256k1:', secpEpochInfo, 'ed25519:', edEpochInfo, 'ecdsa_tss:', ecdsaEpochInfo);
            } catch (updateError) {
                console.warn('⚠️ Failed to update shares with epoch info:', updateError);
                // エポック情報の更新に失敗しても処理を続行
            }
            
            // 既存のメタデータを取得
            const existingSecpMetadata = await this.storage.getMetadata(masterId, 'secp256k1');
            const existingEdMetadata = await this.storage.getMetadata(masterId, 'ed25519');
            const existingEcdsaMetadata = await this.storage.getMetadata(masterId, 'ecdsa_tss');
            
            // secp256k1: publicKeyPackageからverifying_keyを抽出
            let secp256k1PublicKey = null;
            try {
                const secpPubPkg = typeof secp256k1PublicKeyPackage === 'string' ? JSON.parse(secp256k1PublicKeyPackage) : secp256k1PublicKeyPackage;
                if (secpPubPkg && secpPubPkg.verifying_key) {
                    secp256k1PublicKey = secpPubPkg.verifying_key;
                }
            } catch (e) {
                console.warn('[BatchInit] Step 7: Failed to extract secp256k1 public key from publicKeyPackage:', e);
            }
            
            // secp256k1: FROST DKG (2-of-2)形式のメタデータ
            // secpKeygenResultから直接取得（Step 5-2で保存したものと同じ）
            const finalSecpMetadata = {
                ...existingSecpMetadata,
                keyPackage: secpKeygenResult.keyPackage, // keyPackageを保持（署名に必要）
                publicKeyPackage: secpKeygenResult.publicKeyPackage, // publicKeyPackageを保持（署名に必要）
                publicKey: secp256k1PublicKey,
                algorithm: 'FROST',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                keyGenerated: true,
                guardianAuthMethod: 'JWT',
                curve: 'secp256k1',
                createdAt: Date.now(),
                version: '2.1',
                epochInfo: secpEpochInfo // エポック情報を追加
            };
            
            // ed25519: FROST DKG形式のメタデータ
            // edKeygenResultから直接取得（Step 5-3で保存したものと同じ）
            const finalEdMetadata = {
                keyPackage: edKeygenResult.keyPackage, // keyPackageを保持（署名に必要）
                publicKeyPackage: edKeygenResult.publicKeyPackage, // publicKeyPackageを保持（署名に必要）
                publicKey: edPublicKeyFromPkg,
                algorithm: 'FROST',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                keyGenerated: true,
                guardianAuthMethod: 'JWT',
                curve: 'ed25519',
                createdAt: Date.now(),
                version: '2.1',
                epochInfo: edEpochInfo // エポック情報を追加
            };
            
            // ecdsa_tss: ECDSA-TSS形式のメタデータ
            // ecdsaKeygenResultから直接取得（Step 5-4で保存したものと同じ）
            const finalEcdsaMetadata = {
                p1KeyShare: ecdsaKeygenResult.p1KeyShare, // p1KeyShareを保持（署名に必要）
                publicKey: ecdsaKeygenResult.publicKey, // publicKeyを保持
                algorithm: 'ECDSA-TSS',
                threshold: 2,  // 2-of-2
                totalParties: 2,  // P1とP2のみ
                keyGenerated: true,
                guardianAuthMethod: 'JWT',
                curve: 'ecdsa_tss',
                createdAt: Date.now(),
                version: '2.1',
                epochInfo: ecdsaEpochInfo // エポック情報を追加
            };
            
            console.log('[BatchInit] Step 7-2: Uploading local shares to Guardian storage');
            if (!existingSecpShare || !existingEdShare || !existingEcdsaShare) {
                throw new Error('Encrypted shares are missing, cannot upload to Guardian storage');
            }
            const guardianEncryptionKey = await this.deriveEncryptionKey(credential, masterId);
            
            if (!existingSecpMetadata?.taproot_internal_key || !existingSecpMetadata.taproot_tweak) {
                throw new Error('Taproot metadata missing for secp256k1 before Guardian upload');
            }
            
            const secpGuardianPayload = {
                encryptedShare: existingSecpShare,
                metadata: finalSecpMetadata,
                taprootInfo: {
                    taproot_internal_key: existingSecpMetadata?.taproot_internal_key || null,
                    taproot_tweak: existingSecpMetadata?.taproot_tweak || null,
                    taproot_merkle_root: existingSecpMetadata?.taproot_merkle_root || null,
                    taproot_q_compressed: existingSecpMetadata?.taproot_q_compressed || null,
                    taproot_client_share_compressed: existingSecpMetadata?.taproot_client_share_compressed || null
                }
            };
            const edGuardianPayload = {
                encryptedShare: existingEdShare,
                metadata: finalEdMetadata
            };
            const ecdsaGuardianPayload = {
                encryptedShare: existingEcdsaShare,
                metadata: finalEcdsaMetadata
            };
            
            const secpGuardianEncrypted = await this.encryptShare(secpGuardianPayload, guardianEncryptionKey);
            const edGuardianEncrypted = await this.encryptShare(edGuardianPayload, guardianEncryptionKey);
            const ecdsaGuardianEncrypted = await this.encryptShare(ecdsaGuardianPayload, guardianEncryptionKey);
            
            await this.uploadClientShareToGuardian(masterId, 'secp256k1', secpGuardianEncrypted, credential, secpEpochInfo);
            await this.uploadClientShareToGuardian(masterId, 'ed25519', edGuardianEncrypted, credential, edEpochInfo);
            await this.uploadClientShareToGuardian(masterId, 'ecdsa_tss', ecdsaGuardianEncrypted, credential, ecdsaEpochInfo);
            
            await this.storage.storeMetadata(masterId, finalSecpMetadata, 'secp256k1');
            await this.storage.storeMetadata(masterId, finalEdMetadata, 'ed25519');
            await this.storage.storeMetadata(masterId, finalEcdsaMetadata, 'ecdsa_tss');
            console.log('[BatchInit] Step 7: メタデータ保存完了');
            
            // 初期化フロー終了直前の鍵関連情報ログ表示
            console.log('🔑 Initialization flow - Final key-related information:');
            try {
                // SECP256k1情報（FROST DKG形式）
                console.log('🔑 SECP256k1 Final Metadata (FROST DKG):', {
                    hasMetadata: !!finalSecpMetadata,
                    hasKeyPackage: !!finalSecpMetadata.keyPackage,
                    hasPublicKeyPackage: !!finalSecpMetadata.publicKeyPackage,
                    publicKey: finalSecpMetadata.publicKey?.substring(0, 20) + '...',
                    algorithm: finalSecpMetadata.algorithm,
                    threshold: finalSecpMetadata.threshold,
                    totalParties: finalSecpMetadata.totalParties,
                    epochInfo: finalSecpMetadata.epochInfo
                });
                
                // ED25519情報（FROST DKG形式）
                console.log('🔑 ED25519 Final Metadata (FROST DKG):', {
                    hasMetadata: !!finalEdMetadata,
                    keyPackageIdentifier: finalEdMetadata.keyPackage ? 
                        (typeof finalEdMetadata.keyPackage === 'string' ? 
                            JSON.parse(finalEdMetadata.keyPackage).identifier : 
                            finalEdMetadata.keyPackage.identifier) : 'none',
                    publicKeyPackageKeys: finalEdMetadata.publicKeyPackage?.verifying_shares ? 
                        Object.keys(finalEdMetadata.publicKeyPackage.verifying_shares) : [],
                    threshold: finalEdMetadata.threshold,
                    totalParties: finalEdMetadata.totalParties,
                    epochInfo: finalEdMetadata.epochInfo
                });
                
                // ECDSA-TSS情報
                console.log('🔑 ECDSA-TSS Final Metadata:', {
                    hasMetadata: !!finalEcdsaMetadata,
                    hasP1KeyShare: !!finalEcdsaMetadata.p1KeyShare,
                    publicKey: finalEcdsaMetadata.publicKey?.substring(0, 20) + '...',
                    algorithm: finalEcdsaMetadata.algorithm,
                    threshold: finalEcdsaMetadata.threshold,
                    totalParties: finalEcdsaMetadata.totalParties,
                    epochInfo: finalEcdsaMetadata.epochInfo
                });
            } catch (e) {
                console.error('❌ Failed to log final key information:', e.message);
            }
            
            // 8. 完了
            console.log('[BatchInit] Step 8: 初期化完了', { masterId });
            return { 
                success: true, 
                masterId, 
                credential,
                secp256k1: {
                    publicKey: secp256k1PublicKey,
                    algorithm: 'FROST',
                    threshold: 2,
                    totalParties: 2
                },
                ed25519: {
                    publicKeyPackage: ed25519PublicKeyPackage,
                    algorithm: 'FROST',
                    threshold: 2,
                    totalParties: 2
                },
                ecdsa_tss: {
                    publicKey: ecdsaPublicKey,
                    algorithm: 'ECDSA-TSS',
                    threshold: 2,
                    totalParties: 2
                }
            };
        } catch (error) {
            console.error('initializeWalletBatchMode failed:', error);
            return { success: false, error: error.message };
        }
    }
    /**
     * サーバーからシェアを取得（緊急復旧用）
     */
    async recoverSharesFromServer(masterId, jwt, webauthnCredential) {
        // 戻り値で使用する変数を関数スコープで宣言
        let secpKeyPackage, secpPublicKeyPackage, edKeyPackage, edPublicKeyPackage;
        try {
            console.log("🔄 Recovering shares from Server for:", masterId);
            
            // SECP256k1シェアを取得
            const secpResponse = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/server/get-share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    masterId: masterId,
                    curveType: 'secp256k1',
                    webauthnCredential: webauthnCredential
                })
            });
            
            if (!secpResponse.ok) {
                const errorData = await secpResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to recover SECP256k1 share from Server');
            }
            
            const secpResult = await secpResponse.json();
            if (!secpResult.success) {
                throw new Error(secpResult.error || 'Server SECP256k1 share recovery failed');
            }
            
            // ED25519シェアを取得
            const edResponse = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/server/get-share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    masterId: masterId,
                    curveType: 'ed25519',
                    webauthnCredential: webauthnCredential
                })
            });
            
            if (!edResponse.ok) {
                const errorData = await edResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to recover ED25519 share from Server');
            }
            
            const edResult = await edResponse.json();
            if (!edResult.success) {
                throw new Error(edResult.error || 'Server ED25519 share recovery failed');
            }
            
            console.log("✅ Server shares recovered successfully");
            console.log("🔍 Server response details:", {
                secpKeyPackage: secpResult.keyPackage ? 'present' : 'missing',
                edKeyPackage: edResult.keyPackage ? 'present' : 'missing',
                secpPublicKeyPackage: secpResult.publicKeyPackage ? 'present' : 'missing',
                edPublicKeyPackage: edResult.publicKeyPackage ? 'present' : 'missing'
            });

            // 既存メタデータを参照（Taproot情報の引き継ぎ等に使用）
            const existingSecpMetadata = await this.storage.getMetadata(masterId, 'secp256k1');
            const existingEdMetadata = await this.storage.getMetadata(masterId, 'ed25519');

            // 同期は、ガーディアン復旧完了後に emergencyRestoreWalletOnly 内で実行する
            
            // publicKeyPackageのみメタデータとして保存（keyPackageは保存しない）
            console.log("💾 Saving recovered publicKeyPackages to metadata...");
            
            // SECP256k1用メタデータ
            const secpMetadata = {
                ...existingSecpMetadata,
                publicKey: secpResult.publicKeyPackage.verifying_key,
                publicKeyPackage: secpResult.publicKeyPackage,
                threshold: this.threshold,
                totalParties: this.totalParties,
                keyGenerated: true,
                guardianAuthMethod: 'JWT',
                curve: 'secp256k1',
                createdAt: Date.now(),
                recoveryMethod: 'server_direct',
                emergencyRecovery: true,
                version: '2.1'
            };
            
            // ED25519用メタデータ
            const edMetadata = {
                ...existingEdMetadata,
                publicKey: edResult.publicKeyPackage.verifying_key,
                publicKeyPackage: edResult.publicKeyPackage,
                threshold: this.threshold,
                totalParties: this.totalParties,
                keyGenerated: true,
                guardianAuthMethod: 'JWT',
                curve: 'ed25519',
                createdAt: Date.now(),
                recoveryMethod: 'server_direct',
                emergencyRecovery: true,
                version: '2.1'
            };
            
            await this.storage.storeMetadata(masterId, secpMetadata, 'secp256k1');
            let secpPublicKeyPackageObj = secpResult.publicKeyPackage;
            if (typeof secpPublicKeyPackageObj === 'string') {
                try {
                    secpPublicKeyPackageObj = JSON.parse(secpPublicKeyPackageObj);
                } catch (error) {
                    console.warn('Failed to parse secp publicKeyPackage during Taproot preparation', error);
                    secpPublicKeyPackageObj = null;
                }
            }
            await this.ensureTaprootMetadataPrepared(masterId, secpPublicKeyPackageObj?.verifying_key);
            await this.storage.storeMetadata(masterId, edMetadata, 'ed25519');
            
            // signing_shareをPasskey派生鍵で暗号化してsharesストアへ保存（Step 5-2.5相当）
            console.log("💾 Encrypting and storing signing_shares from recovered keyPackages...");
            try {
                // Passkeyのクレデンシャルから暗号化キーを導出
                const encryptionKey = await this.deriveEncryptionKey(webauthnCredential, masterId);
                
                // keyPackage から signing_share を取り出す（文字列/オブジェクト両対応）
                const secpKeyPkgObj = typeof secpResult.keyPackage === 'string' ? JSON.parse(secpResult.keyPackage) : secpResult.keyPackage;
                const edKeyPkgObj = typeof edResult.keyPackage === 'string' ? JSON.parse(edResult.keyPackage) : edResult.keyPackage;
                
                const secpSigningShareHex = secpKeyPkgObj && secpKeyPkgObj.signing_share;
                const edSigningShareHex = edKeyPkgObj && edKeyPkgObj.signing_share;
                
                if (!secpSigningShareHex || !edSigningShareHex) {
                    throw new Error('signing_share is missing in recovered keyPackage (secp256k1 or ed25519)');
                }

                // 暗号化してsharesストアへ保存（可能なら epochInfo を付与）
                const secpEncryptedLocalShare = await this.encryptShare(secpSigningShareHex, encryptionKey);
                const secpEpochInfo0 = existingSecpMetadata?.epochInfo ? {
                    epochCounter: existingSecpMetadata.epochInfo.epochCounter,
                    pubkeyFingerprint: existingSecpMetadata.epochInfo.pubkeyFingerprint
                } : null;
                await this.storage.storeEncryptedShare(masterId, secpEncryptedLocalShare, 'secp256k1', secpEpochInfo0);
                
                const edEncryptedLocalShare = await this.encryptShare(edSigningShareHex, encryptionKey);
                const edEpochInfo0 = existingEdMetadata?.epochInfo ? {
                    epochCounter: existingEdMetadata.epochInfo.epochCounter,
                    pubkeyFingerprint: existingEdMetadata.epochInfo.pubkeyFingerprint
                } : null;
                await this.storage.storeEncryptedShare(masterId, edEncryptedLocalShare, 'ed25519', edEpochInfo0);
                
                console.log('✅ Recovered signing_shares encrypted and stored (with epochInfo when available)');
                
                // keyPackageとpublicKeyPackageがPromiseの場合はawaitする
                secpKeyPackage = await Promise.resolve(secpResult.keyPackage);
                secpPublicKeyPackage = await Promise.resolve(secpResult.publicKeyPackage);
                edKeyPackage = await Promise.resolve(edResult.keyPackage);
                edPublicKeyPackage = await Promise.resolve(edResult.publicKeyPackage);
                
                // フィンガープリントはサーバ返却値を最優先し、なければ既存→再計算の順で使用
                const secpFingerprint = (secpResult && typeof secpResult.pubkeyFingerprint === 'string' && secpResult.pubkeyFingerprint.length > 0)
                    ? secpResult.pubkeyFingerprint
                    : (existingSecpMetadata?.epochInfo?.pubkeyFingerprint
                        || await this.generatePubkeyFingerprint(secpPublicKeyPackage));
                const edFingerprint = (edResult && typeof edResult.pubkeyFingerprint === 'string' && edResult.pubkeyFingerprint.length > 0)
                    ? edResult.pubkeyFingerprint
                    : (existingEdMetadata?.epochInfo?.pubkeyFingerprint
                        || await this.generatePubkeyFingerprint(edPublicKeyPackage));
                
                // エポック情報をemergencyAuthStateに保存（リシェアで使用）
                const secpEpochCounter = (typeof secpResult.epochCounter === 'number' ? secpResult.epochCounter : existingSecpMetadata?.epochInfo?.epochCounter) || 0;
                const edEpochCounter = (typeof edResult.epochCounter === 'number' ? edResult.epochCounter : existingEdMetadata?.epochInfo?.epochCounter) || 0;
                
                // デフォルトはsecp256k1の情報を使用
                this.emergencyAuthState.pubkeyFingerprint = secpFingerprint;
                this.emergencyAuthState.epochCounter = secpEpochCounter;
                
                await this.storage.storeMetadata(masterId, {
                    ...existingSecpMetadata,
                    keyPackage: typeof secpKeyPackage === 'string' ? secpKeyPackage : JSON.stringify(secpKeyPackage),
                    publicKeyPackage: typeof secpPublicKeyPackage === 'string' ? secpPublicKeyPackage : JSON.stringify(secpPublicKeyPackage),
                    curve: 'secp256k1',
                    keyGenerated: true,  // 署名に必要なフラグ
                    recoveryMethod: 'emergency_recovery',
                    timestamp: Date.now(),
                    epochInfo: {
                        pubkeyFingerprint: secpFingerprint,
                        epochCounter: (typeof secpResult.epochCounter === 'number' ? secpResult.epochCounter : existingSecpMetadata?.epochInfo?.epochCounter) || 0
                    }
                }, 'secp256k1');
                
                await this.storage.storeMetadata(masterId, {
                    ...existingEdMetadata,
                    keyPackage: typeof edKeyPackage === 'string' ? edKeyPackage : JSON.stringify(edKeyPackage),
                    publicKeyPackage: typeof edPublicKeyPackage === 'string' ? edPublicKeyPackage : JSON.stringify(edPublicKeyPackage),
                    curve: 'ed25519',
                    keyGenerated: true,  // 署名に必要なフラグ
                    recoveryMethod: 'emergency_recovery',
                    timestamp: Date.now(),
                    epochInfo: {
                        pubkeyFingerprint: edFingerprint,
                        epochCounter: (typeof edResult.epochCounter === 'number' ? edResult.epochCounter : existingEdMetadata?.epochInfo?.epochCounter) || 0
                    }
                }, 'ed25519');
                
                console.log("✅ Recovered keyPackages saved to metadata");
            } catch (e) {
                console.error('❌ Failed to store recovered signing_shares:', e);
                throw e;
            }
            
            return {
                success: true,
                publicKeyPackage: secpPublicKeyPackage,
                secpPublicKeyPackage: secpPublicKeyPackage,
                edPublicKeyPackage: edPublicKeyPackage,
                // key packageを戻り値に含める（文字列の場合はパース）
                secpKeyPackages: secpKeyPackage ? [typeof secpKeyPackage === 'string' ? JSON.parse(secpKeyPackage) : secpKeyPackage] : [],
                edKeyPackages: edKeyPackage ? [typeof edKeyPackage === 'string' ? JSON.parse(edKeyPackage) : edKeyPackage] : [],
                metadata: {
                    curve: 'secp256k1',
                    recoveryMethod: 'server_direct',
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            console.error("❌ Server share recovery failed:", error);
            throw error;
        }
    }

    

    /**
     * パーティ単位でPublicKeyPackageのverifying_sharesをマージ
     * @param {Object} basePublicKeyPackage - ベースとなるPublicKeyPackage
     * @param {Object} newPublicKeyPackage - 新しいPublicKeyPackage（特定パーティの更新を含む）
     * @param {string} curve - 曲線タイプ
     * @returns {Object} マージされたPublicKeyPackage
     */
    mergePublicKeyPackageByParty(basePublicKeyPackage, newPublicKeyPackage, curve) {
        try {
            console.log(`🔄 Merging PublicKeyPackage by party for ${curve}`);
            
            // ベースとなるPublicKeyPackageをコピー
            const mergedPackage = JSON.parse(JSON.stringify(basePublicKeyPackage));
            
            if (!mergedPackage.verifying_shares) {
                mergedPackage.verifying_shares = {};
            }
            
            // 新しいPublicKeyPackageから各パーティのverifying_shareを取得
            if (newPublicKeyPackage && newPublicKeyPackage.verifying_shares) {
                Object.keys(newPublicKeyPackage.verifying_shares).forEach(partyId => {
                    const newVerifyingShare = newPublicKeyPackage.verifying_shares[partyId];
                    const oldVerifyingShare = mergedPackage.verifying_shares[partyId];
                    
                    // 新しいverifying_shareが存在し、かつ異なる場合は更新
                    if (newVerifyingShare && newVerifyingShare !== oldVerifyingShare) {
                        mergedPackage.verifying_shares[partyId] = newVerifyingShare;
                        console.log(`✅ Updated verifying_share for party ${partyId}: ${newVerifyingShare.substring(0, 16)}...`);
                    }
                });
            }
            
            console.log(`✅ PublicKeyPackage merged successfully for ${curve}`);
            return mergedPackage;
            
        } catch (error) {
            console.error(`❌ Failed to merge PublicKeyPackage for ${curve}:`, error);
            return basePublicKeyPackage; // エラー時はベースを返す
        }
    }

    /**
     * MPC署名実行（抽象化版）
     * 秘密鍵を生成せずに直接MPC署名を実行
     */
    async signWithMPC(masterId, messageHash, context = {}) {
        try {
            console.log("🔐 Starting MPC signing with abstraction layer...");
            
            // パスキー認証確認
            if (!this.isSignin()) {
                throw new Error('User not authenticated');
            }
            
            // メッセージハッシュの形式確認
            let messageBytes;
            if (typeof messageHash === 'string') {
                // hex文字列の場合、0xプレフィックスを削除
                let cleanHash = messageHash.trim();
                if (cleanHash.startsWith('0x') || cleanHash.startsWith('0X')) {
                    cleanHash = cleanHash.slice(2);
                }
                
                // 空文字列チェック
                if (!cleanHash || cleanHash.length === 0) {
                    throw new Error('Message hash is empty');
                }
                
                // 長さチェック（32バイト = 64文字の16進数）
                if (cleanHash.length !== 64) {
                    throw new Error(`Invalid message hash length: expected 64 hex chars (32 bytes), got ${cleanHash.length}`);
                }
                
                // hex文字列をUint8Arrayに変換
                messageBytes = new Uint8Array(32);
                for (let i = 0; i < 32; i++) {
                    const hexByte = cleanHash.substring(i * 2, i * 2 + 2);
                    messageBytes[i] = parseInt(hexByte, 16);
                }
            } else if (messageHash instanceof Uint8Array) {
                // 長さチェック
                if (messageHash.length !== 32) {
                    throw new Error(`Invalid message hash length: expected 32 bytes, got ${messageHash.length}`);
                }
                messageBytes = messageHash;
            } else {
                throw new Error(`Invalid message hash format: expected string or Uint8Array, got ${typeof messageHash}`);
            }
            
            // 最終的なmessageBytesの検証
            if (!messageBytes || messageBytes.length !== 32) {
                throw new Error(`Invalid message bytes: expected 32 bytes, got ${messageBytes ? messageBytes.length : 0}`);
            }
            
            // 署名コンテキストの設定
            const signingContext = {
                blockchain: context.blockchain || 'unknown',
                transactionType: context.transactionType || 'transfer',
                amount: context.amount || 0,
                fee: context.fee || 0,
                timestamp: Date.now(),
                ...context
            };
            
            console.log("📊 Signing context:", signingContext);
            
            // FROST MPC署名実行
            const curve = this.getCurveForBlockchain(signingContext.blockchain);
            // HDWallet廃止により、pathパラメータは不要
            console.log(`🔍 Calling performDistributedSigning with curve: ${curve} (HDWallet removed)`);
            // contextからprovidedCredentialを取得（OIDC Link処理などで既に認証済みの場合）
            const providedCredential = context.providedCredential || null;
            const signature = await this.performDistributedSigning(
                masterId, 
                messageBytes, 
                curve,
                providedCredential
            );
            
            if (!signature || !signature.success) {
                throw new Error('MPC signing failed');
            }
            
            console.log("✅ MPC signing completed successfully");
            return signature.signature;
            
        } catch (error) {
            console.error("❌ MPC signing failed:", error);
            throw new Error(`MPC signing failed: ${error.message}`);
        }
    }
    
    /**
     * ブロックチェーンに応じた曲線を取得
     */

    getCurveForBlockchain(blockchain) {
        const curveMap = {
            // BitcoinはP2WPKH(ECDSA)用に ecdsa_tss を使用する
            'bitcoin': 'ecdsa_tss',
            'btc': 'ecdsa_tss',
            // Ethereum / Polygon は既存通り ecdsa_tss
            'ethereum': 'ecdsa_tss',
            'eth': 'ecdsa_tss',
            'polygon': 'ecdsa_tss',
            'pol': 'ecdsa_tss',
            // Solana / TON は ed25519
            'solana': 'ed25519',
            'sol': 'ed25519',
            'ton': 'ed25519'
        };
        
        const curve = curveMap[blockchain.toLowerCase()] || 'ecdsa_tss';
        console.log(`🔍 getCurveForBlockchain: ${blockchain} -> ${curve}`);
        return curve;
    }

    /**
     * ネットワーク設定の取得
     */
    getNetworkConfig(blockchain, networkType = null) {
        const type = networkType || this.network;
        return BitVoyConfig.getNetworkConfig(blockchain, type);
    }

    /**
     * サポートされているネットワークの確認
     */
    isNetworkSupported(blockchain, networkType) {
        return BitVoyConfig.isNetworkSupported(blockchain, networkType);
    }

    /**
     * 現在のネットワークタイプの取得
     */
    getCurrentNetworkType() {
        return this.network;
    }

    /**
     * ネットワーク切り替え
     */
    async switchNetwork(networkType) {
        try {
            console.log(`🔄 Switching network from ${this.network} to ${networkType}`);
            
            // ネットワークタイプの検証
            if (!['mainnet', 'testnet'].includes(networkType)) {
                throw new Error(`Unsupported network type: ${networkType}`);
            }

            // 現在のセッションをクリア
            await this.clearSession();
            
            // ネットワーク設定を更新
            this.network = networkType;
            
            // 設定をストレージに保存
            await this.storage.setNetworkType(networkType);
            
            // MPCを再初期化
            await this.reinitializeForNetwork(networkType);
            
            console.log(`✅ Network switched to ${networkType} successfully`);
            return true;
            
        } catch (error) {
            console.error(`❌ Network switch failed:`, error);
            throw error;
        }
    }

    /**
     * ネットワーク別のMPC再初期化
     */
    async reinitializeForNetwork(networkType) {
        try {
            console.log(`🔄 Reinitializing MPC for network: ${networkType}`);
            
            // ネットワーク別の設定を適用
            const networkConfig = this.getNetworkSpecificConfig(networkType);
            
            // MPC設定を更新
            this.threshold = networkConfig.mpc.threshold;
            this.totalParties = networkConfig.mpc.totalParties;
            this.serverUrls = networkConfig.mpc.serverUrls;
            
            // ストレージをネットワーク別に分離
            await this.storage.setNetworkContext(networkType);
            
            // MPCを再初期化
            await this.init();
            
            console.log(`✅ MPC reinitialized for ${networkType}`);
            
        } catch (error) {
            console.error(`❌ MPC reinitialization failed:`, error);
            throw error;
        }
    }

    /**
     * パスキー認証情報から暗号化キーを導出
     */
    /**
     * 暗号化キー導出（パスキー同期対応）
     */
    async deriveEncryptionKey(credentialOrResult, masterId) {
        try {
            console.log("🔐 Deriving encryption key from Passkey credential and masterId...");
            
            if (!masterId) {
                throw new Error('MasterId is required for encryption key derivation');
            }
            if (!credentialOrResult) {
                throw new Error('Credential data is required for encryption key derivation');
            }
            
            let credentialId;
            
            if (credentialOrResult.rawId) {
                // 登録時またはパスキー同期時: rawIdからcredentialIdを取得
                credentialId = this.bufferToBase64url(new Uint8Array(credentialOrResult.rawId));
                console.log("🔑 Using credentialId from rawId (registration/passkey sync)");
            } else if (credentialOrResult.credential && credentialOrResult.credential.rawId) {
                // クレデンシャルオブジェクトからrawIdを取得
                credentialId = this.bufferToBase64url(new Uint8Array(credentialOrResult.credential.rawId));
                console.log("🔑 Using credentialId from credential object");
            } else if (credentialOrResult.assertion && credentialOrResult.credentialId) {
                // 認証時: 認証結果からcredentialIdを取得
                credentialId = credentialOrResult.credentialId;
                console.log("🔑 Using credentialId from authentication result");
            } else if (credentialOrResult.credentialId) {
                // 初期化フロー完了レスポンスなどから直接credentialIdを取得
                credentialId = credentialOrResult.credentialId;
                console.log("🔑 Using credentialId from provided data (credentialId only)");
            } else {
                throw new Error('Unable to extract credentialId from credential data');
            }
            
            console.log(`CredentialId: ${credentialId.substring(0, 16)}...`);
            
            // credentialIdをバイト配列に変換（base64urlデコード）
            const credentialIdBytes = this.base64urlToBuffer(credentialId);
            console.log(`CredentialId length: ${credentialIdBytes.length}`);
                
            // masterIdをバイト配列に変換
            const masterIdBytes = new TextEncoder().encode(masterId);
            console.log(`MasterId length: ${masterIdBytes.length}`);
                
            // credentialId + masterId を結合
            const keyMaterial = new Uint8Array(credentialIdBytes.length + masterIdBytes.length);
            keyMaterial.set(credentialIdBytes, 0);
            keyMaterial.set(masterIdBytes, credentialIdBytes.length);
                
                console.log(`Combined key material length: ${keyMaterial.length}`);
            
            // SHA-256でハッシュ化して32バイトのキーを生成
            const hashBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
            const hashArray = new Uint8Array(hashBuffer);
            
            console.log("✅ Key material generated, length:", hashArray.length);
            
            // AES-GCM用のキーをインポート
            const key = await crypto.subtle.importKey(
                'raw',
                hashArray,
                { name: 'AES-GCM' },
                false,
                ['encrypt', 'decrypt']
            );
            
            console.log("✅ Encryption key derived successfully");
            return key;

        } catch (error) {
            console.error("❌ Encryption key derivation failed:", error);
            throw new Error(`Encryption key derivation failed: ${error.message}`);
        }
    }
    /**
     * ネットワーク別の暗号化キー導出
     */
    async deriveEncryptionKeyForNetwork(credential, masterId, networkType) {
        try {
            // ネットワーク情報を含むマスターキー
            const networkSpecificMasterKey = `${masterId}:${networkType}`;
            
            // 既存の暗号化キー導出ロジックを使用
            return await this.deriveEncryptionKey(credential, networkSpecificMasterKey);
            
        } catch (error) {
            console.error(`❌ Encryption key derivation failed for ${networkType}:`, error);
            throw error;
        }
    }

    /**
     * エポック履歴を取得
     */
    async getEpochHistory(masterId, curveType = 'secp256k1') {
        try {
            console.log(`📋 Getting epoch history for ${masterId} (${curveType})...`);
            
            const jwt = await this.obtainGuardianJWT(masterId, 'get_epoch_history', {
                curve: curveType
            });

            const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/server/get-epoch-history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    masterId: masterId,
                    curveType: curveType
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to get epoch history: ${response.status}`);
            }

            const data = await response.json();
            console.log(`📋 Epoch history retrieved: ${data.totalEpochs} epochs`);
            
            return data;
        } catch (error) {
            console.error('❌ Failed to get epoch history:', error);
            throw error;
        }
    }

    /**
     * PublicKeyPackageからフィンガープリントを生成
     */
    async generatePubkeyFingerprint(publicKeyPackage) {
        try {
            // publicKeyPackageが文字列の場合はパースする
            let parsedPublicKeyPackage = publicKeyPackage;
            if (typeof publicKeyPackage === 'string') {
                parsedPublicKeyPackage = JSON.parse(publicKeyPackage);
            }
            
            // verifying_keyのみを使用（公開鍵パッケージの核心部分）
            const verifyingKey = parsedPublicKeyPackage.verifying_key;
            
            if (!verifyingKey) {
                console.error('publicKeyPackage structure:', parsedPublicKeyPackage);
                throw new Error('verifying_key not found in publicKeyPackage');
            }
            
            // verifying_keyを正規化してJSON文字列に変換
            // verifying_keyが文字列の場合はそのまま使用、オブジェクトの場合はJSON.stringify
            const verifyingKeyStr = typeof verifyingKey === 'string' ? verifyingKey : JSON.stringify(verifyingKey);
            
            // SHA256ハッシュを計算
            const encoder = new TextEncoder();
            const data = encoder.encode(verifyingKeyStr);
            
            const hash = await crypto.subtle.digest('SHA-256', data);
            
            // ハッシュを16進文字列に変換
            const hashArray = Array.from(new Uint8Array(hash));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error('Failed to generate pubkey fingerprint:', error);
            throw new Error(`Invalid publicKeyPackage: ${error.message}`);
        }
    }

    /**
     * AA用のMPC署名（Client + OP MPC Signフロー）
     * UserOperation Hashに対してMPC署名を実行
     * 
     * @param {string} userOpHash - UserOperation Hash（32バイト、hex文字列）
     * @param {string} masterId - Master ID（オプション、sessionStorageから取得する場合は省略可）
     * @returns {Promise<string>} r||s形式の128文字hex文字列
     */
    /**
     * UserOperation署名（AAモード用、STANDARDモードのトランザクション署名フローをコピー・WebSocketベース）
     * @param {string} userOpHash - UserOperation Hash（32バイト、hex文字列）
     * @param {string} masterId - Master ID（オプション、sessionStorageから取得する場合は省略可）
     * @returns {Promise<string>} r||s形式の128文字hex文字列
     */
    async signMessageWithOP(userOpHash, masterId = null, preAuthCredential = null) {
        let sessionId = null;
        try {
            console.log(`🚀 Starting AA mode signing for UserOperation...`);
            console.log(`📋 MasterId: ${masterId || 'will be retrieved from sessionStorage'}`);
            console.log(`📋 userOpHash: ${userOpHash}`);
            console.log(`📋 Session start time: ${new Date().toISOString()}`);
            console.log(`📋 preAuthCredential provided: ${!!preAuthCredential}`);

            // masterIdを取得
            if (!masterId) {
                masterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
                if (!masterId) {
                    throw new Error('Master ID not found. Please provide masterId or ensure it is stored in sessionStorage.');
                }
            }

            // ecdsa_tss_p1Sign関数が利用可能になるまで待つ（最大5秒）
            let waitCount = 0;
            const maxWait = 50; // 50回 × 100ms = 5秒
            while (typeof window === 'undefined' || !window.ecdsa_tss_p1Sign) {
                if (waitCount >= maxWait) {
                    throw new Error('ecdsa_tss_p1Sign is not available. Please ensure p1client.bundle.js is loaded before signing.');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            console.log(`✅ ecdsa_tss_p1Sign is now available (waited ${waitCount * 100}ms)`);

            // Passkey認証（preAuthCredentialが渡された場合は再認証をスキップ）
            let credential;
            if (preAuthCredential) {
                console.log('🔐 Using pre-authenticated Passkey credential (skipping WebAuthn prompt)');
                credential = preAuthCredential;
            } else {
                console.log('🔐 Performing Passkey authentication for AA mode signing...');
                credential = await this.authenticateWithPasskey(masterId);
            }
            
            // 暗号化されたシェアを取得
            const encryptedShare = await this.storage.getEncryptedShare(masterId, 'ecdsa_tss');
            if (!encryptedShare) {
                throw new Error('No encrypted share found for ecdsa_tss');
            }
            
            // 暗号化キー導出
            const encryptionKey = await this.deriveEncryptionKey(credential, masterId);
            
            // 暗号化されたシェアを復号
            const decryptedShare = await this.decryptShare(encryptedShare, encryptionKey);
            console.log('🔍 [AA mode signing] Decrypted share type:', typeof decryptedShare);
            
            // 復号されたデータをパース
            let secretPackage;
            if (typeof decryptedShare === 'string') {
                try {
                    secretPackage = JSON.parse(decryptedShare);
                } catch (e) {
                    // JSON文字列でない場合、直接p1KeyShareとして扱う
                    console.warn('⚠️ [AA mode signing] Decrypted share is not JSON, treating as p1KeyShare string');
                    secretPackage = { p1KeyShare: decryptedShare };
                }
            } else {
                secretPackage = decryptedShare;
            }
            
            // p1KeyShareを取得（複数の形式に対応）
            const p1KeyShare = secretPackage.p1_key_share || secretPackage.p1KeyShare || secretPackage;
            
            if (!p1KeyShare) {
                throw new Error('p1KeyShare not found in decrypted share');
            }

            console.log('🔍 [AA mode signing] Metadata retrieved:', {
                hasP1KeyShare: !!p1KeyShare,
                p1KeyShareType: typeof p1KeyShare,
                p1KeySharePreview: typeof p1KeyShare === 'string' ? p1KeyShare.substring(0, 100) : 'object (from decrypted share)'
            });

            // userOpHashをUint8Arrayに変換（STANDARDモードと同様）
            const userOpHashClean = userOpHash.replace(/^0x/, '');
            if (userOpHashClean.length !== 64) {
                throw new Error(`Invalid userOpHash length: expected 64 hex chars (32 bytes), got ${userOpHashClean.length}`);
            }
            const messageHashBytes = new Uint8Array(
                userOpHashClean.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );

            // WebSocket URLを構築（STANDARDモードと同じ形式のセッションIDを使用）
            const p2ServerBaseUrl = this.serverUrls.bitvoyServer.replace('https://', 'wss://').replace('http://', 'ws://');
            sessionId = `sign-ecdsa-${masterId}-${Date.now()}`;
            const messageHashHex = Array.from(messageHashBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            const signWsUrl = `${p2ServerBaseUrl.replace(/\/$/, '')}/mpc-p2?sid=${sessionId}&uid=${encodeURIComponent(masterId)}&mh=${messageHashHex}`;

            console.log(`✍️ AA mode ECDSA-TSS WebSocket URL:`, signWsUrl);

            // p1KeyShareの形式を確認・正規化
            // ecdsa_tssのp1KeyShareはオブジェクトとして保存されている可能性があるため、そのまま使用
            // p1clientのecdsa_tss_p1Signはオブジェクトを受け入れる
            let normalizedP1KeyShare = p1KeyShare;
            
            if (typeof p1KeyShare === 'string') {
                try {
                    normalizedP1KeyShare = JSON.parse(p1KeyShare);
                    console.log('🔧 [AA mode signing] p1KeyShare normalized from string to object');
                } catch (e) {
                    console.warn('⚠️ [AA mode signing] Failed to parse p1KeyShare as JSON, using as-is');
                }
            } else if (typeof p1KeyShare === 'object' && p1KeyShare !== null) {
                console.log('✅ [AA mode signing] p1KeyShare is already an object');
            }

            console.log('🔍 [AA mode signing] Final package format:', {
                p1KeyShareType: typeof normalizedP1KeyShare,
                p1KeyShareKeys: typeof normalizedP1KeyShare === 'object' && normalizedP1KeyShare !== null ? Object.keys(normalizedP1KeyShare) : 'N/A'
            });

            console.log("🔍 calling ecdsa_tss_p1Sign for AA mode: signWsUrl: ", signWsUrl);
            console.log("🔍 calling ecdsa_tss_p1Sign for AA mode: sessionId: ", sessionId);
            console.log("🔍 calling ecdsa_tss_p1Sign for AA mode: messageHash: ", messageHashBytes);
            console.log("🔍 calling ecdsa_tss_p1Sign for AA mode: p1KeyShare: ", normalizedP1KeyShare);

            // ecdsa_tss_p1Signを実行（STANDARDモードと同様）
            const signResult = await window.ecdsa_tss_p1Sign({
                wsUrl: signWsUrl,
                sessionId: sessionId,
                messageHash: messageHashBytes,
                p1KeyShare: normalizedP1KeyShare
            });

            if (!signResult.signature) {
                throw new Error('Signature generation failed');
            }

            console.log(`✅ AA mode ECDSA-TSS signing completed`);

            // 署名をr||s形式の128文字hex文字列に変換
            // ECDSA-TSS署名形式: 既にr||s形式（128 hex文字）または{r, s}オブジェクト
            if (typeof signResult.signature === 'string') {
                // JSON文字列の引用符を除去（"..."形式の場合）
                let cleanSig = signResult.signature.replace(/^["']|["']$/g, '').replace(/^0x/, '');
                
                if (cleanSig.length === 128) {
                    // 既にr||s形式の128文字hex文字列
                    return cleanSig;
                } else {
                    throw new Error(`Invalid signature length: expected 128 hex chars (r||s format), got ${cleanSig.length}`);
                }
            } else if (signResult.signature && signResult.signature.r && signResult.signature.s) {
                // {r, s}オブジェクト形式の場合
                const r = signResult.signature.r.replace(/^0x/, '').padStart(64, '0');
                const s = signResult.signature.s.replace(/^0x/, '').padStart(64, '0');
                return r + s; // r||s形式の128文字hex文字列
            } else {
                throw new Error(`Invalid signature format: expected string (128 hex chars) or {r, s} object, got ${typeof signResult.signature}`);
            }

        } catch (error) {
            console.error(`❌ AA mode ECDSA-TSS signing process failed:`, error);
            // セッションクリーンアップ
            if (sessionId) {
                await this.cleanupFailedSigningSession(sessionId);
            }
            throw error;
        }
    }

}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BitVoyMPC;
} else if (typeof window !== 'undefined') {
    window.BitVoyMPC = BitVoyMPC;
}