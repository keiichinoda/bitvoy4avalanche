/**
 * MPC Server - 真の分散鍵生成対応（エポック管理対応）
 * 
 * このモジュールは、クライアントとGuardian Nodeと協調して
 * 真の分散鍵生成、署名、緊急復旧を実行するBitVoy Server実装です。
 * エポック管理機能により、シェアの履歴管理とバージョニングをサポートします。
 */

const { spawn } = require('child_process');
const path = require('path');
const { 
    generatePubkeyFingerprint, 
    getNextEpochCounter, 
    validateEpochInfo 
} = require('./utils/epoch-utils');
const { executeQuery } = require('./utils/db-utils');

class MPCServer {
    constructor(dbClient = null, logger = null) {
        this.partyId = 2; // BitVoy ServerはParty 2
        this.maxSigners = 3;
        this.minSigners = 2;
        this.frostWasm = null;
        this.dbClient = dbClient;
        this.logger = logger;
        
        // データベース中心のセッション管理
        this.sessionTimeout = 30 * 60 * 1000; // 30分
        
        // 定期的なクリーンアップ（データベース）
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000); // 5分ごと
        
        // FROST用Identifier（64桁16進文字列）変換関数（曲線別）
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
    }
    
    /**
     * セッション作成（server_session: session_id, json_content）
     */
    async createSession(masterId, customSessionId = null, jsonContentInput = null) {
        const nowMs = Date.now();
        const sessionId = customSessionId || `dkg_${masterId}_${nowMs}`;
        try {
            const jsonContent = jsonContentInput || {};
            const mergedContent = {
                ...jsonContent,
                createdAt: nowMs,
                updatedAt: nowMs
            };
            const query = `
                INSERT INTO server_session (session_id, json_content)
                VALUES (?, ?)
            `;
            await executeQuery(query, [sessionId, JSON.stringify(mergedContent)]);
            console.log(`[MPCServer] Session created in server_session: ${sessionId}`);
            return sessionId;
        } catch (error) {
            console.error(`[MPCServer] Failed to create session: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * セッション取得（server_session）
     */
    async getSession(sessionId) {
        try {
            const query = `
                SELECT json_content FROM server_session 
                WHERE session_id = ?
            `;
            const [result] = await executeQuery(query, [sessionId]);
            const rows = result || [];
            if (rows.length === 0) {
                return null;
            }
            const jsonContent = typeof rows[0].json_content === 'string'
                ? JSON.parse(rows[0].json_content)
                : rows[0].json_content;
            return jsonContent;
        } catch (error) {
            console.error(`[MPCServer] Failed to get session: ${error.message}`);
            return null;
        }
    }
    
    /**
     * セッション状態保存（server_session）
     */
    async saveSessionState(sessionId, stateData) {
        try {
            const nowMs = Date.now();
            // 現在のjson_contentを取得してマージ
            const [currentResult] = await executeQuery('SELECT json_content FROM server_session WHERE session_id = ?', [sessionId]);
            const currentContent = currentResult && currentResult.length > 0 ? JSON.parse(currentResult[0].json_content || '{}') : {};
            const updatedContent = {
                ...currentContent,
                stateData: stateData,
                updatedAt: nowMs
            };
            const query = `
                UPDATE server_session 
                SET json_content = ?
                WHERE session_id = ?
            `;
            await executeQuery(query, [JSON.stringify(updatedContent), sessionId]);
            console.log(`[MPCServer] Session state saved: ${sessionId}`);
        } catch (error) {
            console.error(`[MPCServer] Failed to save session state: ${error.message}`);
            throw error;
        }
    }

    /**
     * セッション全体を保存（json_content 丸ごと）
     */
    async saveSessionJson(sessionId, jsonContent) {
        try {
            const nowMs = Date.now();
            const mergedContent = {
                ...jsonContent,
                updatedAt: nowMs
            };
            const query = `
                UPDATE server_session 
                SET json_content = ?
                WHERE session_id = ?
            `;
            await executeQuery(query, [JSON.stringify(mergedContent), sessionId]);
            console.log(`[MPCServer] Session json saved: ${sessionId}`);
        } catch (error) {
            console.error(`[MPCServer] Failed to save session json: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * セッション削除（server_session）
     */
    async cleanupSession(sessionId) {
        try {
            const query = `
                DELETE FROM server_session 
                WHERE session_id = ?
            `;
            await executeQuery(query, [sessionId]);
            console.log(`[MPCServer] Session ${sessionId} deleted`);
        } catch (error) {
            console.error(`[MPCServer] Failed to cleanup session: ${error.message}`);
        }
    }
    
    /**
     * 期限切れセッションのクリーンアップ（server_session; updatedAtで判定）
     */
    async cleanupExpiredSessions() {
        try {
            const timeoutMs = this.sessionTimeout;
            const nowMs = Date.now();
            const threshold = nowMs - timeoutMs;
            const query = `
                DELETE FROM server_session
                WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(json_content, '$.updatedAt')) AS UNSIGNED) < ?
            `;
            const [result] = await executeQuery(query, [threshold]);
            const rows = result || [];
            const rowCount = rows.length;
            if (rowCount > 0) {
                console.log(`[MPCServer] ${rowCount} expired sessions deleted`);
            }
        } catch (error) {
            console.error(`[MPCServer] Failed to cleanup expired sessions: ${error.message}`);
        }
    }
    
    // パッケージのキーを64文字の16進数文字列に変換する関数（曲線別）
    convertPackageKeys(packages, curveType) {
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
    }

    /**
     * FROST WASMモジュールを初期化
     */
    async initialize() {
        try {
            // FROST WASMモジュールを読み込み
            const frostWasmPath = path.join(__dirname, './rust/frost-wasm/pkg-node/frost_wasm.js');
            this.frostWasm = require(frostWasmPath);
            //await this.frostWasm.default();
            console.log('FROST WASM initialized on server');
        } catch (error) {
            console.error('Failed to initialize FROST WASM on server:', error);
            throw error;
        }
    }






    /**
     * 署名フロー Round 1: nonceとcommitmentを生成
     */
    async signRound1() {
        try {
            console.log('Server: Starting signing Round 1...');
            
            const result = this.frostWasm.secp_round1_commit(this.keyPackage);
            const round1Data = JSON.parse(result);
            this.signingState.round1 = round1Data;
            
            console.log('Server: Signing Round 1 completed');
            return round1Data;
        } catch (error) {
            console.error('Server: Signing Round 1 failed:', error);
            throw error;
        }
    }

    /**
     * 署名フロー Round 2: 署名シェアを生成
     */
    async signRound2(message, nonces, signingPackage) {
        try {
            console.log('Server: Starting signing Round 2...');
            
            const keyPackageObj = JSON.parse(this.keyPackage);
            
            const result = this.frostWasm.secp_round2_sign(
                JSON.stringify(keyPackageObj.identifier),
                this.keyPackage,
                this.publicKeyPackage,
                nonces,
                signingPackage,
                this.minSigners
            );
            
            const signatureShare = JSON.parse(result);
            this.signingState.round2 = signatureShare;
            
            console.log('Server: Signing Round 2 completed');
            return signatureShare;
        } catch (error) {
            console.error('Server: Signing Round 2 failed:', error);
            throw error;
        }
    }

    /**
     * 署名パッケージを構築
     */
    async buildSigningPackage(message, commitments, curve = 'secp256k1') {
        try {
            const buildSigningPackageFunction = curve === 'secp256k1' ? 'secp_build_signing_package' : 'ed_build_signing_package';
            
            // secp256k1の場合は32バイトのHEX文字列に調整
            let messageForSigning = message;
            if (curve === 'secp256k1') {
                // 32バイト（64文字）のHEX文字列に調整
                if (message.length > 64) {
                    // SHA-256ハッシュを計算して32バイトに縮小
                    const messageBytes = Buffer.from(message, 'hex');
                    const crypto = require('crypto');
                    const hashBuffer = crypto.createHash('sha256').update(messageBytes).digest();
                    messageForSigning = hashBuffer.toString('hex');
                } else if (message.length < 64) {
                    // 32バイト未満の場合は0でパディング
                    messageForSigning = message.padEnd(64, '0');
                }
                console.log(`Server: secp256k1 message adjusted to 32 bytes: ${messageForSigning}`);
            }
            
            const result = this.frostWasm[buildSigningPackageFunction](
                messageForSigning,
                JSON.stringify(commitments)
            );
            
            return JSON.parse(result);
        } catch (error) {
            console.error(`Server: Failed to build signing package for ${curve}:`, error);
            throw error;
        }
    }

    /**
     * 署名を集約して検証
     */
    aggregateAndVerify(signingPackage, signatureShares) {
        try {
            const result = this.frostWasm.secp_aggregate_and_verify(
                signingPackage,
                JSON.stringify(signatureShares),
                this.publicKeyPackage
            );
            
            return JSON.parse(result);
        } catch (error) {
            console.error('Server: Failed to aggregate and verify signature:', error);
            throw error;
        }
    }

    /**
     * 緊急復旧: 3分の2シェアから秘密を復元
     */
    async emergencyRecovery(otherKeyPackages) {
        try {
            console.log('Server: Starting emergency recovery...');
            
            // Client（Party 1）のKeyPackageを除外して他のシェアを組み合わせ
            const filteredOtherKeyPackages = otherKeyPackages.filter(pkg => {
                const pkgObj = typeof pkg === 'string' ? JSON.parse(pkg) : pkg;
                // Client（Party 1）のidentifierを除外
                return pkgObj.identifier !== '0000000000000000000000000000000000000000000000000000000000000001';
            });
            
            // 自分のキーパッケージとフィルタリングされた他のシェアを組み合わせ
            const allKeyPackages = [this.keyPackage, ...filteredOtherKeyPackages];
            
            const secretHex = this.frostWasm.secp_emergency_recovery(
                JSON.stringify(allKeyPackages)
            );
            
            console.log('Server: Emergency recovery completed');
            return secretHex;
        } catch (error) {
            console.error('Server: Emergency recovery failed:', error);
            throw error;
        }
    }

    /**
     * 緊急復旧後のreshare
     */
    async emergencyReshare(otherKeyPackages, newMaxSigners, newMinSigners, newPartyId) {
        try {
            console.log('Server: Starting emergency reshare...');
            
            // 自分のキーパッケージと他のシェアを組み合わせ
            const allKeyPackages = [this.keyPackage, ...otherKeyPackages];
            
            const result = this.frostWasm.secp_emergency_reshare(
                JSON.stringify(allKeyPackages),
                newMaxSigners,
                newMinSigners,
                newPartyId
            );
            
            const reshareData = JSON.parse(result);
            console.log('Server: Emergency reshare completed');
            
            return reshareData;
        } catch (error) {
            console.error('Server: Emergency reshare failed:', error);
            throw error;
        }
    }

    /**
     * Guardian Nodeへの中継処理
     */
    async relayToGuardian(endpoint, data) {
        try {
            // 1. bootstrapノードに問い合わせてGuardian Nodeを選択
            const bootstrapUrl = process.env.BOOTSTRAP_ENDPOINT || 'http://localhost:4000/bootstrap';
            console.log("select-guardian", `${bootstrapUrl}/select-guardian`);
            const selectRes = await fetch(`${bootstrapUrl}/select-guardian`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint, data })
            });
            if (!selectRes.ok) throw new Error('Bootstrap node selection failed');
            const { guardianUrl } = await selectRes.json();

            console.log('Relaying to Guardian Node:', `${guardianUrl}${endpoint}`);
            console.log('Relaying data:', data);
            // 2. 選択されたGuardian Nodeにリレー
            const response = await fetch(`${guardianUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!response.ok) throw new Error(`Guardian relay failed: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('Server: Guardian relay failed:', error);
            throw error;
        }
    }

    /**
     * 鍵パッケージの取得
     */
    getKeyPackage() {
        return this.keyPackage;
    }

    /**
     * 公開鍵パッケージの取得（曲線別・データベース対応）
     */
    async getPublicKeyPackage(sessionId, curveType = 'secp256k1') {
        console.log(`[MPCServer] getPublicKeyPackage - sessionId: ${sessionId}, curveType: ${curveType}`);
        const session = await this.getSession(sessionId);
        if (!session) {
            console.log(`[MPCServer] getPublicKeyPackage - session not found`);
            throw new Error(`Session ${sessionId} not found`);
        }

        // json_content は { ed25519: { dkgState: { round1|2|3 }, ... }, secp256k1: { ... } } 構造
        const curveKey = curveType === 'ed25519' ? 'ed25519' : 'secp256k1';
        const curveNode = session && session[curveKey];
        const round3 = curveNode && curveNode.dkgState && curveNode.dkgState.round3;
        const pkp = round3 && (round3.public_key_package || round3.publicKeyPackage);
        console.log(`[MPCServer] getPublicKeyPackage - ${curveKey} round3 exists: ${!!round3}`);
        console.log(`[MPCServer] getPublicKeyPackage - ${curveKey} PKP present: ${!!pkp}`);
        return pkp || null;
    }

    /**
     * DKG状態の取得（データベース対応）
     */
    async getDkgState(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return session.stateData.dkgState;
    }

    /**
     * 署名状態の取得（データベース対応）
     */
    async getSigningState(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return session.stateData.signingState;
    }

    /**
     * シェアをデータベースに保存（エポック管理対応）
     */
    async saveShareToDatabase(db, masterId, curveType, round3Data, providedEpochInfo = null) {
        try {
            if (!db) {
                throw new Error('Database connection not available');
            }

            // masterIdを取得（key_packageからidentifierを抽出）
            let actualMasterId = masterId;
            if (!actualMasterId && round3Data.key_package && round3Data.key_package.identifier) {
                actualMasterId = round3Data.key_package.identifier;
            }

            if (!actualMasterId) {
                throw new Error(`MasterId is required for saving share. curveType: ${curveType}`);
            }

            let epochCounter, pubkeyFingerprint;
            
            if (providedEpochInfo && providedEpochInfo.pubkeyFingerprint) {
                // 提供されたpubkeyFingerprintを使用（緊急復旧フローなど）
                console.log(`Server: Using provided pubkeyFingerprint for ${actualMasterId} (${curveType}):`, providedEpochInfo);
                pubkeyFingerprint = providedEpochInfo.pubkeyFingerprint;
                // 新しいepochCounterを生成（既存の最大値 + 1）
                epochCounter = await getNextEpochCounter(db, actualMasterId, curveType);
            } else {
                // 新しいepochInfoを生成（通常のDKGフロー）
                console.log(`Server: Generating new epochInfo for ${actualMasterId} (${curveType})`);
                
                // public_key_packageが文字列の場合はパースする
                let publicKeyPackageObj;
                if (typeof round3Data.public_key_package === 'string') {
                    try {
                        publicKeyPackageObj = JSON.parse(round3Data.public_key_package);
                        console.log(`Server: Parsed public_key_package from string`);
                    } catch (parseError) {
                        console.error(`Server: Failed to parse public_key_package:`, parseError);
                        throw new Error(`Invalid public_key_package JSON: ${parseError.message}`);
                    }
                } else {
                    publicKeyPackageObj = round3Data.public_key_package;
                }
                
                console.log(`Server: Debug - publicKeyPackageObj structure:`, {
                    hasPublicKeyPackage: !!publicKeyPackageObj,
                    publicKeyPackageKeys: publicKeyPackageObj ? Object.keys(publicKeyPackageObj) : 'null',
                    publicKeyPackageType: typeof publicKeyPackageObj,
                    publicKeyPackageSample: publicKeyPackageObj ? JSON.stringify(publicKeyPackageObj).substring(0, 200) + '...' : 'null'
                });
                
                pubkeyFingerprint = generatePubkeyFingerprint(publicKeyPackageObj);
                epochCounter = await getNextEpochCounter(db, actualMasterId, curveType);
            }
            
            // エポック情報を検証
            const epochInfo = {
                masterId: actualMasterId,
                curveType,
                epochCounter,
                pubkeyFingerprint
            };
            validateEpochInfo(epochInfo);

            const client = await db.connect();
            
            // シェア情報をデータベースに保存（エポック管理対応）
            const insertQuery = `
                INSERT INTO server_shares (
                    master_id, 
                    curve_type, 
                    party_id, 
                    key_package, 
                    public_key_package, 
                    epoch_counter,
                    pubkey_fingerprint,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `;

            await client.query(insertQuery, [
                actualMasterId,
                curveType,
                this.createFrostId(this.partyId, curveType),
                round3Data.key_package, // オブジェクトとして保存（初期化フローと統一）
                round3Data.public_key_package, // オブジェクトとして保存（初期化フローと統一）
                epochCounter,
                pubkeyFingerprint
            ]);

            client.release();
            console.log(`Server: Share for masterId ${actualMasterId} (${curveType}) saved to database with epoch ${epochCounter} and fingerprint ${pubkeyFingerprint}`);
            
            return {
                success: true,
                epochCounter,
                pubkeyFingerprint,
                epochId: `${actualMasterId}_${curveType}_${epochCounter}_${pubkeyFingerprint}`
            };
        } catch (error) {
            console.error(`Server: Failed to save share for ${curveType}:`, error);
            throw error;
        }
    }

    /**
     * シェアをデータベースから読み込み（最新エポック）
     */
    async loadShareFromDatabase(db, masterId, curveType) {
        try {
            if (!db) {
                throw new Error('Database connection not available');
            }

            const client = await db.connect();
            
            // 最新のエポックのシェアを取得
            const query = `
                SELECT key_package, public_key_package, party_id, epoch_counter, pubkey_fingerprint, created_at
                FROM server_shares 
                WHERE master_id = ? AND curve_type = ?
                ORDER BY epoch_counter DESC
                LIMIT 1
            `;

            const [result] = await client.query(query, [masterId, curveType]);
            const rows = result || [];
            client.release();

            if (rows.length === 0) {
                console.log(`Server: No share found for masterId ${masterId} (${curveType})`);
                return null;
            }

            const shareData = rows[0];
            
            // キーパッケージをオブジェクトとして読み込み
            let keyPackage = shareData.key_package;
            if (typeof keyPackage === 'string') {
                try {
                    keyPackage = JSON.parse(keyPackage);
                } catch (parseError) {
                    console.warn(`Server: Failed to parse keyPackage for ${masterId} (${curveType}):`, parseError.message);
                }
            }

            let publicKeyPackage = shareData.public_key_package;
            if (typeof publicKeyPackage === 'string') {
                try {
                    publicKeyPackage = JSON.parse(publicKeyPackage);
                } catch (parseError) {
                    console.warn(`Server: Failed to parse publicKeyPackage for ${masterId} (${curveType}):`, parseError.message);
                }
            }

            console.log(`Server: Share for masterId ${masterId} (${curveType}) loaded from database (epoch ${shareData.epoch_counter})`);
            
            return {
                masterId: masterId,
                curveType: curveType,
                partyId: shareData.party_id,
                keyPackage: keyPackage,
                publicKeyPackage: publicKeyPackage,
                epochCounter: shareData.epoch_counter,
                pubkeyFingerprint: shareData.pubkey_fingerprint,
                createdAt: shareData.created_at
            };
        } catch (error) {
            console.error(`Server: Failed to load share for ${masterId} (${curveType}):`, error);
            return null;
        }
    }

    // Secp/Ed同時ラウンド1（json_content対応）
    async dkgRound1Batch(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        try {
            // 2024移行: secp256k1のDKGはP2サーバ側で完了するため、BitVoyサーバではスキップ
            console.log(`[MPCServer] dkgRound1Batch - Skipping SECP256k1 Round 1 for session: ${sessionId} (handled by P2 server)`);
            session.secp256k1 = session.secp256k1 || { dkgState: { round1: null, round2: null, round3: null } };
            session.secp256k1.dkgState = session.secp256k1.dkgState || { round1: null, round2: null, round3: null };
            session.secp256k1.dkgState.round1 = null;
            
            console.log('Server: dkgRound1Batch - Starting ED25519 Round 1...');
            console.log('Server: dkgRound1Batch - ED25519 partyId (numeric):', this.partyId);
            // Ed25519 - 数値のpartyIdを直接渡す
            const edResult = JSON.parse(this.frostWasm.ed_dkg_round1(
                this.partyId, this.maxSigners, this.minSigners
            ));
            session.ed25519 = session.ed25519 || { dkgState: { round1: null, round2: null, round3: null } };
            session.ed25519.dkgState = session.ed25519.dkgState || { round1: null, round2: null, round3: null };
            session.ed25519.dkgState.round1 = edResult;
            console.log('Server: dkgRound1Batch - ED25519 Round 1 completed');
            
            console.log('Server: dkgRound1Batch - ED25519 package length:', edResult.package ? edResult.package.length : 'undefined');
            
            // 状態を保存
            await this.saveSessionJson(sessionId, session);
            
            return { secpPackage: null, edPackage: edResult.package };
        } catch (error) {
            console.error('Server: dkgRound1Batch failed:', error);
            throw error;
        }
    }
    // Secp/Ed同時ラウンド2（json_content対応）
    async dkgRound2Batch(sessionId, secpPackages = {}, edPackages = {}) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        try {
            // ラウンド1のsecret_packageを取得
            const edSecret = session?.ed25519?.dkgState?.round1?.secret_package;
            if (!edSecret) {
                throw new Error('ED25519 Round1 secret_package not found in session');
            }
            const secpSecret = session?.secp256k1?.dkgState?.round1?.secret_package;
            // パッケージのキーを64文字の16進数文字列に変換（曲線別）
            const convertedEdPackages = this.convertPackageKeys(edPackages, 'ed25519');
            
            let secpResult = { package: null };
            const hasSecpInput = secpSecret && secpPackages && Object.keys(secpPackages || {}).length > 0;
            if (hasSecpInput) {
                const convertedSecpPackages = this.convertPackageKeys(secpPackages, 'secp256k1');
                console.log(`[MPCServer] dkgRound2Batch - SECP256k1 packages count for session ${sessionId}:`, Object.keys(convertedSecpPackages).length);
                secpResult = JSON.parse(this.frostWasm.secp_dkg_round2(
                    secpSecret, JSON.stringify(convertedSecpPackages)
                ));
                session.secp256k1.dkgState = session.secp256k1.dkgState || {};
                session.secp256k1.dkgState.round2 = secpResult;
            } else {
                console.log(`[MPCServer] dkgRound2Batch - Skipping SECP256k1 processing for session ${sessionId} (handled by P2 server)`);
                if (session.secp256k1?.dkgState) {
                    session.secp256k1.dkgState.round2 = null;
                }
            }
            
            console.log('Server: dkgRound2Batch - ED25519 packages count:', Object.keys(convertedEdPackages).length);
            console.log('Server: dkgRound2Batch - ED25519 packages keys:', Object.keys(convertedEdPackages));
            
            console.log('Server: dkgRound2Batch - Starting ED25519 Round 2...');
            console.log('Server: dkgRound2Batch - ED25519 secret_package length:', edSecret ? edSecret.length : 'undefined');
            console.log('Server: dkgRound2Batch - ED25519 packages JSON length:', JSON.stringify(convertedEdPackages).length);
            
            const edResult = JSON.parse(this.frostWasm.ed_dkg_round2(
                edSecret, JSON.stringify(convertedEdPackages)
            ));
            session.ed25519.dkgState.round2 = edResult;
            
            // 状態を保存
            await this.saveSessionJson(sessionId, session);
            
            return { secpPackage: secpResult?.package || null, edPackage: edResult.package };
        } catch (error) {
            console.error('Server: dkgRound2Batch failed:', error);
            throw error;
        }
    }

    // Secp/Ed同時ラウンド3
    async dkgRound3Batch(sessionId, secpRound1Pkgs = {}, edRound1Pkgs = {}, secpRound2Pkgs = {}, edRound2Pkgs = {}) {
        try {
            // Round 2のsecret_packageが存在することをセッションから確認
            const session = await this.getSession(sessionId);

            if (!session.ed25519?.dkgState?.round2 || !session.ed25519.dkgState.round2.secret_package) {
                throw new Error('ED25519 Round 2 secret_package not found');
            }

            const edSecret = session.ed25519.dkgState.round2.secret_package;
            const secpSecret = session.secp256k1?.dkgState?.round2?.secret_package;

            // パッケージのキーを64文字の16進数文字列に変換（曲線別）
            const convertedEdRound1Pkgs = this.convertPackageKeys(edRound1Pkgs, 'ed25519');
            const convertedEdRound2Pkgs = this.convertPackageKeys(edRound2Pkgs, 'ed25519');
            
            let secpResult = null;
            const hasSecpData = secpSecret && Object.keys(secpRound1Pkgs || {}).length > 0 && Object.keys(secpRound2Pkgs || {}).length > 0;
            if (hasSecpData) {
                const convertedSecpRound1Pkgs = this.convertPackageKeys(secpRound1Pkgs, 'secp256k1');
                const convertedSecpRound2Pkgs = this.convertPackageKeys(secpRound2Pkgs, 'secp256k1');
                secpResult = JSON.parse(this.frostWasm.secp_dkg_round3(
                    secpSecret, JSON.stringify(convertedSecpRound1Pkgs), JSON.stringify(convertedSecpRound2Pkgs)
                ));
                session.secp256k1.dkgState = session.secp256k1.dkgState || {};
                session.secp256k1.dkgState.round3 = secpResult;
            } else {
                console.log(`[MPCServer] dkgRound3Batch - Skipping SECP256k1 processing for session ${sessionId} (handled by P2 server)`);
                if (session.secp256k1?.dkgState) {
                    session.secp256k1.dkgState.round3 = null;
                }
            }

            const edResult = JSON.parse(this.frostWasm.ed_dkg_round3(
                edSecret, JSON.stringify(convertedEdRound1Pkgs), JSON.stringify(convertedEdRound2Pkgs)
            ));
            session.ed25519.dkgState.round3 = edResult;

            await this.saveSessionJson(sessionId, session);
            
            if (secpResult) {
                console.log('Server: dkgRound3Batch - SECP256k1 result keys:', Object.keys(secpResult));
            }
            console.log('Server: dkgRound3Batch - ED25519 result keys:', Object.keys(edResult));
            
            return {
                secpPackage: secpResult ? {
                    key_package: secpResult.key_package,
                    public_key_package: secpResult.public_key_package
                } : null,
                edPackage: {
                    key_package: edResult.key_package,
                    public_key_package: edResult.public_key_package
                }
            };
        } catch (error) {
            console.error('Server: dkgRound3Batch failed:', error);
            throw error;
        }
    }

    /**
     * リシェアセッションを作成
     */
    async createReshareSession(masterId, curveType, maxSigners, minSigners, customSessionId = null) {
        try {
            const sessionId = customSessionId || `reshare_${masterId}_${curveType}_${Date.now()}`;
            
            const query = `
                INSERT INTO reshare_sessions (session_id, master_id, curve_type, max_signers, min_signers, status)
                VALUES (?, ?, ?, ?, ?, 'active')
            `;
            
            await executeQuery(query, [
                sessionId, masterId, curveType, maxSigners, minSigners
            ]);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_sessions WHERE session_id = ?',
                [sessionId]
            );
            
            console.log(`[Server] Reshare session created: ${sessionId}`);
            return result[0] || result;
            
        } catch (error) {
            console.error('[Server] Failed to create reshare session:', error);
            throw error;
        }
    }

    /**
     * リシェアセッションを取得
     */
    async getReshareSession(sessionId) {
        try {
            console.log(`[Server] 🔧 getReshareSession called with: ${sessionId}`);
            const query = `
                SELECT * FROM reshare_sessions 
                WHERE session_id = ? AND status IN ('active', 'round1_completed', 'round2_completed', 'completed')
            `;
            
            const [result] = await executeQuery(query, [sessionId]);
            const rows = result || [];
            console.log(`[Server] 🔧 getReshareSession query result: ${rows.length} rows`);
            if (rows.length > 0) {
                console.log(`[Server] 🔧 Found session: ${rows[0].session_id}, status: ${rows[0].status}`);
            }
            return rows[0] || null;
            
        } catch (error) {
            console.error('[Server] Failed to get reshare session:', error);
            throw error;
        }
    }

    /**
     * リシェアセッションのステータスを更新
     */
    async updateReshareSessionStatus(sessionId, status, additionalData = {}) {
        try {
            let query = `
                UPDATE reshare_sessions 
                SET status = ?, updated_at = NOW()
                ${status === 'completed' ? ', completed_at = NOW()' : ''}
            `;
            
            const params = [status];
            
            // 追加データを動的に追加
            if (additionalData.server_secret_package) {
                query += `, server_secret_package = ?`;
                params.push(additionalData.server_secret_package);
            }
            
            query += ` WHERE session_id = ?`;
            params.push(sessionId);
            
            await executeQuery(query, params);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_sessions WHERE session_id = ?',
                [sessionId]
            );
            console.log(`[Server] Reshare session ${sessionId} status updated to: ${status}`);
            return result[0] || result;
            
        } catch (error) {
            console.error('[Server] Failed to update reshare session status:', error);
            throw error;
        }
    }

    /**
     * リシェアコミットメントを保存
     */
    async saveReshareCommitments(sessionId, partyId, curveType, commitments, nonces) {
        try {
            const query = `
                INSERT INTO reshare_commitments (session_id, party_id, curve_type, commitments, nonces)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    commitments = VALUES(commitments),
                    nonces = VALUES(nonces),
                    created_at = NOW()
            `;
            
            await executeQuery(query, [
                sessionId, partyId, curveType, JSON.stringify(commitments), JSON.stringify(nonces)
            ]);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_commitments WHERE session_id = ? AND party_id = ? AND curve_type = ?',
                [sessionId, partyId, curveType]
            );
            
            console.log(`[Server] Reshare commitments saved for session: ${sessionId}, party: ${partyId}`);
            const rows = result || [];
            return rows[0];
            
        } catch (error) {
            console.error('[Server] Failed to save reshare commitments:', error);
            throw error;
        }
    }

    /**
     * リシェアコミットメントを取得
     */
    async getReshareCommitments(sessionId, curveType) {
        try {
            const query = `
                SELECT party_id, commitments, nonces
                FROM reshare_commitments 
                WHERE session_id = ? AND curve_type = ?
                ORDER BY party_id
            `;
            
            const [result] = await executeQuery(query, [sessionId, curveType]);
            const rows = result || [];
            
            const commitments = {};
            const nonces = {};
            
            rows.forEach(row => {
                commitments[row.party_id] = typeof row.commitments === 'string' ? JSON.parse(row.commitments) : row.commitments;
                nonces[row.party_id] = typeof row.nonces === 'string' ? JSON.parse(row.nonces) : row.nonces;
            });
            
            console.log(`[Server] Retrieved ${rows.length} reshare commitments for session: ${sessionId}`);
            return { commitments, nonces };
            
        } catch (error) {
            console.error('[Server] Failed to get reshare commitments:', error);
            throw error;
        }
    }

    /**
     * 全員分のリシェアコミットメントを保存
     */
    async saveAllReshareCommitments(sessionId, curveType, allCommitments) {
        try {
            const query = `
                INSERT INTO reshare_all_commitments (session_id, curve_type, all_commitments)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    all_commitments = VALUES(all_commitments),
                    created_at = NOW()
            `;
            
            await executeQuery(query, [
                sessionId, curveType, JSON.stringify(allCommitments)
            ]);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_all_commitments WHERE session_id = ? AND curve_type = ?',
                [sessionId, curveType]
            );
            
            console.log(`[Server] All reshare commitments saved for session: ${sessionId}`);
            return result[0] || result;
            
        } catch (error) {
            console.error('[Server] Failed to save all reshare commitments:', error);
            throw error;
        }
    }

    /**
     * 全員分のリシェアコミットメントを取得
     */
    async getAllReshareCommitments(sessionId, curveType) {
        try {
            const query = `
                SELECT all_commitments
                FROM reshare_all_commitments 
                WHERE session_id = ? AND curve_type = ?
            `;
            
            const [result] = await executeQuery(query, [sessionId, curveType]);
            const rows = result || [];
            
            if (rows.length === 0) {
                return null;
            }
            
            const allCommitments = typeof rows[0].all_commitments === 'string' 
                ? JSON.parse(rows[0].all_commitments) 
                : rows[0].all_commitments;
            
            console.log(`[Server] Retrieved all reshare commitments for session: ${sessionId}`);
            return allCommitments;
            
        } catch (error) {
            console.error('[Server] Failed to get all reshare commitments:', error);
            throw error;
        }
    }

    /**
     * リシェアシェアを保存
     */
    async saveReshareShares(sessionId, partyId, curveType, shares) {
        try {
            const query = `
                INSERT INTO reshare_shares (session_id, party_id, curve_type, shares)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    shares = VALUES(shares),
                    created_at = NOW()
            `;
            
            await executeQuery(query, [
                sessionId, partyId, curveType, JSON.stringify(shares)
            ]);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_shares WHERE session_id = ? AND party_id = ? AND curve_type = ?',
                [sessionId, partyId, curveType]
            );
            
            console.log(`[Server] Reshare shares saved for session: ${sessionId}, party: ${partyId}`);
            return result[0] || result;
            
        } catch (error) {
            console.error('[Server] Failed to save reshare shares:', error);
            throw error;
        }
    }

    /**
     * リシェアシェアを取得
     */
    async getReshareShares(sessionId, curveType) {
        try {
            const query = `
                SELECT party_id, shares
                FROM reshare_shares 
                WHERE session_id = ? AND curve_type = ?
                ORDER BY party_id
            `;
            
            const [result] = await executeQuery(query, [sessionId, curveType]);
            const rows = result || [];
            
            const shares = {};
            rows.forEach(row => {
                shares[row.party_id] = typeof row.shares === 'string' ? JSON.parse(row.shares) : row.shares;
            });
            
            console.log(`[Server] Retrieved ${rows.length} reshare shares for session: ${sessionId}`);
            return shares;
            
        } catch (error) {
            console.error('[Server] Failed to get reshare shares:', error);
            throw error;
        }
    }

    /**
     * リシェア結果を保存
     */
    async saveReshareResults(sessionId, curveType, newKeyPackages, newPublicKeyPackage, newEpochCounter, newPubkeyFingerprint) {
        try {
            const query = `
                INSERT INTO reshare_results (session_id, curve_type, new_key_packages, new_public_key_package, new_epoch_counter, new_pubkey_fingerprint)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE 
                    new_key_packages = VALUES(new_key_packages),
                    new_public_key_package = VALUES(new_public_key_package),
                    new_epoch_counter = VALUES(new_epoch_counter),
                    new_pubkey_fingerprint = VALUES(new_pubkey_fingerprint),
                    created_at = NOW()
            `;
            
            await executeQuery(query, [
                sessionId, curveType, JSON.stringify(newKeyPackages), JSON.stringify(newPublicKeyPackage), 
                newEpochCounter, newPubkeyFingerprint
            ]);
            const [result] = await executeQuery(
                'SELECT * FROM reshare_results WHERE session_id = ? AND curve_type = ?',
                [sessionId, curveType]
            );
            
            console.log(`[Server] Reshare results saved for session: ${sessionId}, curve: ${curveType}`);
            return result[0] || result;
            
        } catch (error) {
            console.error('[Server] Failed to save reshare results:', error);
            throw error;
        }
    }

    /**
     * リシェア結果を取得
     */
    async getReshareResults(sessionId, curveType) {
        try {
            const query = `
                SELECT new_key_packages, new_public_key_package, new_epoch_counter, new_pubkey_fingerprint
                FROM reshare_results 
                WHERE session_id = ? AND curve_type = ?
            `;
            
            const [result] = await executeQuery(query, [sessionId, curveType]);
            const rows = result || [];
            
            if (rows.length === 0) {
                return null;
            }
            
            const row = rows[0];
            return {
                newKeyPackages: JSON.parse(row.new_key_packages),
                newPublicKeyPackage: JSON.parse(row.new_public_key_package),
                newEpochCounter: row.new_epoch_counter,
                newPubkeyFingerprint: row.new_pubkey_fingerprint
            };
            
        } catch (error) {
            console.error('[Server] Failed to get reshare results:', error);
            throw error;
        }
    }

    /**
     * 古いリシェアセッションをクリーンアップ
     */
    async cleanupOldReshareSessions(maxAgeHours = 24) {
        try {
            const query = `
                DELETE FROM reshare_sessions 
                WHERE created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)
                AND status IN ('completed', 'failed', 'cancelled')
            `;
            
            const [result] = await executeQuery(query, [maxAgeHours]);
            const rows = result || [];
            const rowCount = rows.length;
            console.log(`[Server] Cleaned up ${rowCount} old reshare sessions`);
            return rowCount;
            
        } catch (error) {
            console.error('[Server] Failed to cleanup old reshare sessions:', error);
            throw error;
        }
    }
}

module.exports = MPCServer; 