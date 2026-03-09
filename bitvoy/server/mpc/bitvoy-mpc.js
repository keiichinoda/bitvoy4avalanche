/**
 * Bitvoy × Guardian分散ノード統合実装
 * 既存MPCコードとGuardian Nodeの完全連携
 */

// 1. 既存bitvoy-mpc.jsの拡張
class BitvoyMPC {
    constructor() {
        this.threshold = 2; // 2-of-3 threshold
        this.totalParties = 3;
        this.dbName = "bitvoy-mpc";
        this.storeName = "shares";
        this.db = null;
        
        // Guardian Node統合
        this.guardianManager = new GuardianManager();
        this.jwtSigner = new BitvoyJWTSigner();
    }

    async init() {
        this.db = await this.openIndexedDB();
        await this.guardianManager.init();
        await this.jwtSigner.init();
    }

    /**
     * 分散鍵生成 - 正しいMPC実装版
     * 各パーティが自身のシェアを生成し、協調して公開鍵を構築
     */
    async generateDistributedKey(masterId, reqId) {
        try {
            console.log(`🔑 Starting distributed key generation for ${masterId} (ラウンド分割方式)`);
            // === Round 1: 各パーティが独立してシェアを生成（Secp/Ed同時） ===
            const secpRound1 = JSON.parse(window.frost_wasm.secp_dkg_round1(2, this.totalParties, this.threshold));
            const edRound1 = JSON.parse(window.frost_wasm.ed_dkg_round1(2, this.totalParties, this.threshold));

            // === Round 1パッケージ同時交換（バッチAPI） ===
            const { secpPackages: otherSecpRound1Packages, edPackages: otherEdRound1Packages } = await this.exchangePackagesWithPeers(masterId, 'batch', 1, {
                secpPackage: secpRound1.package,
                edPackage: edRound1.package
            });

            // === Round 2: コミットメントの交換と検証（Secp/Ed同時） ===
            const secpRound2 = JSON.parse(window.frost_wasm.secp_dkg_round2(secpRound1.secret_package, JSON.stringify(otherSecpRound1Packages)));
            const edRound2 = JSON.parse(window.frost_wasm.ed_dkg_round2(edRound1.secret_package, JSON.stringify(otherEdRound1Packages)));

            // === Round 2パッケージ同時交換（バッチAPI） ===
            const { secpPackages: otherSecpRound2Packages, edPackages: otherEdRound2Packages } = await this.exchangePackagesWithPeers(masterId, 'batch', 2, {
                secpPackage: secpRound2.package,
                edPackage: edRound2.package
            });

            // === Round 3: 公開鍵の協調構築（Secp/Ed同時） ===
            const secpRound3 = JSON.parse(window.frost_wasm.secp_dkg_round3(
                secpRound2.secret_package,
                JSON.stringify(otherSecpRound1Packages),
                JSON.stringify(otherSecpRound2Packages)
            ));
            const edRound3 = JSON.parse(window.frost_wasm.ed_dkg_round3(
                edRound2.secret_package,
                JSON.stringify(otherEdRound1Packages),
                JSON.stringify(otherEdRound2Packages)
            ));

            // 公開鍵パッケージ保存（Secp256k1のみ従来通り）
            await this.storePublicKeyPackage(masterId, secpRound3.public_key_package);

            console.log(`✅ Distributed key generation completed for ${masterId} (ラウンド分割方式)`);
            return {
                success: true,
                secp256k1: {
                    publicKey: secpRound3.public_key_package,
                    localSigningShare: secpRound2.secret_package
                },
                ed25519: {
                    publicKey: edRound3.public_key_package,
                    localSigningShare: edRound2.secret_package
                },
                credentialId: reqId,
                guardianNodes: []
            };
        } catch (error) {
            console.error('💥 Distributed key generation failed:', error);
            throw new Error(`Key generation failed: ${error.message}`);
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
        // バッチAPIでSecp/Ed両方のパッケージを同時交換
        const endpoint = `/mpc/dkg/round${round}-batch`;
        const response = await fetch(this.guardianManager.getGuardianApiUrl() + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(myPackages)
        });
        if (!response.ok) throw new Error(`Batch exchange failed: ${response.status}`);
        const data = await response.json();
        return {
            secpPackages: data.secpPackage ? JSON.parse(data.secpPackage) : {},
            edPackages: data.edPackage ? JSON.parse(data.edPackage) : {}
        };
    }

    /**
     * MPC署名 - FROST Round 1/2統合版
     */
    async signMessage(messageBytes, masterId, signingContext = {}) {
        try {
            console.log(`✍️ MPC signing for ${masterId}`);
            
            // FROST Round 1: Commitment生成
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const round1Result = await this.performFrostRound1(messageBytes, masterId, sessionId, signingContext);
            
            // FROST Round 2: 部分署名生成・集約
            const round2Result = await this.performFrostRound2(messageBytes, masterId, sessionId, round1Result, signingContext);
            
            console.log('✅ FROST signing completed successfully');
            return round2Result;
            
        } catch (error) {
            console.error('💥 FROST signing failed:', error);
            throw new Error(`Signing failed: ${error.message}`);
        }
    }

    /**
     * FROST Round 1: Commitment生成
     */
    async performFrostRound1(messageBytes, masterId, sessionId, context) {
        try {
            const baseUrl = process.env.BITVOY_SERVER_URL;
            const webauthnCredential = await this.getPasskeyCredential(masterId);
            
            // BitVoy Server (Share A) のcommitment生成
            const response = await fetch(`${baseUrl}/mpcapi/mpc/round1-commit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    message: Buffer.from(messageBytes).toString('hex'),
                    sessionId: sessionId,
                    includeGuardian: true,
                    webauthnCredential: webauthnCredential,
                    context: context
                })
            });

            if (!response.ok) {
                throw new Error(`Round 1 commitment failed: ${response.status}`);
            }

            const result = await response.json();
            return {
                sessionId: sessionId,
                bitvoyCommitment: result.bitvoyCommitment,
                guardianCommitment: result.guardianCommitment,
                timestamp: result.timestamp
            };
            
        } catch (error) {
            console.error('💥 FROST Round 1 failed:', error);
            throw error;
        }
    }

    /**
     * FROST Round 2: 部分署名生成・集約
     */
    async performFrostRound2(messageBytes, masterId, sessionId, round1Result, context) {
        try {
            const baseUrl = process.env.BITVOY_SERVER_URL;
            const webauthnCredential = await this.getPasskeyCredential(masterId);
            
            // Share B: ローカルで部分署名生成
            const encryptedShareB = await this.loadEncryptedShare(masterId);
            if (!encryptedShareB) {
                throw new Error('Local share not found');
            }
            
            const cryptoKey = await this.deriveKeyFromCredential(webauthnCredential);
            const shareB = await this.decryptShare(encryptedShareB, cryptoKey);
            const localPartialSignature = await this.performLocalSigning(messageBytes, shareB, context);
            
            // BitVoy Server (Share A) + Guardian (Share C) の部分署名生成
            const response = await fetch(`${baseUrl}/mpcapi/mpc/round2-sign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    sessionId: sessionId,
                    localPartialSignature: localPartialSignature,
                    includeGuardian: true,
                    webauthnCredential: webauthnCredential,
                    context: context
                })
            });

            if (!response.ok) {
                throw new Error(`Round 2 signing failed: ${response.status}`);
            }

            const result = await response.json();
            
            // 部分署名を集約（Share A + Share B + Share C）
            const allPartialSignatures = [
                result.bitvoyPartialSignature,
                localPartialSignature,
                result.guardianPartialSignature
            ];
            
            const finalSignature = await this.aggregateSignatures(allPartialSignatures, context);
            
            return {
                signature: finalSignature,
                sessionId: sessionId,
                algorithm: 'FROST',
                parties: 3,
                timestamp: result.timestamp
            };
            
        } catch (error) {
            console.error('💥 FROST Round 2 failed:', error);
            throw error;
        }
    }

    async signRequest(masterId) {
        // 簡易的な要求署名（本番では適切な認証実装）
        return 'signed_request_' + Date.now();
    }

    /**
     * ローカルシェア生成（ユーザー端末）
     */
    async generateLocalShare() {
        // FROSTシェア生成の実装
        // 実際の実装では適切なFROSTライブラリを使用
        const share = {
            partyId: 2,
            secretShare: crypto.randomBytes(32), // 実際はFROSTシェア
            publicShare: crypto.randomBytes(33), // 実際はFROST公開シェア
            commitment: crypto.randomBytes(32)   // 実際はFROSTコミットメント
        };
        return share;
    }

    /**
     * 公開鍵構築（3パーティ協調）
     */
    async constructPublicKey(partyShares) {
        // FROST公開鍵構築の実装
        // 実際の実装では適切なFROSTライブラリを使用
        const publicKey = {
            algorithm: 'FROST',
            threshold: this.threshold,
            totalParties: this.totalParties,
            publicKey: crypto.randomBytes(33), // 実際はFROST公開鍵
            commitments: partyShares.map(p => p.share.commitment)
        };
        return publicKey;
    }
}

/**
 * Guardian Manager - Guardian Nodeとの通信管理
 */
class GuardianManager {
    constructor() {
        // Guardian Node エンドポイント設定
        this.guardianEndpoints = [
            'http://localhost:5101',
            'http://localhost:5102',
            // 'http://localhost:5002'
        ];
        this.replicationFactor = 10; // 開発時は10ノード
        this.jwtSigner = null;
    }

    async init() {
        this.jwtSigner = new BitvoyJWTSigner();
        await this.discoverNodes();
    }

    /**
     * Share C を Guardian ノードに分散配布
     */
    async distributeShareC(masterId, shareC, metadata) {
        try {
            console.log(`📡 Distributing Share C to ${this.replicationFactor} nodes`);
            
            const distributionPromises = [];
            const targetNodes = this.selectOptimalNodes(this.replicationFactor);
            
            for (const nodeUrl of targetNodes) {
                distributionPromises.push(
                    this.sendShareToNode(nodeUrl, masterId, shareC, metadata)
                );
            }
            
            const results = await Promise.allSettled(distributionPromises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            if (successful < this.replicationFactor * 0.8) {
                throw new Error(`Distribution failed: only ${successful}/${this.replicationFactor} succeeded`);
            }
            
            console.log(`✅ Share C distributed to ${successful} nodes`);
            return { distributedNodes: successful, totalNodes: this.replicationFactor };
            
        } catch (error) {
            console.error('💥 Share C distribution failed:', error);
            throw error;
        }
    }

    /**
     * Guardian ノードから署名要求
     */
    async requestSignature(masterId, messageBytes, context) {
        try {
            // JWT署名許可トークン生成
            const jwtToken = await this.jwtSigner.createSigningJWT(masterId, context);
            
            const signingPromises = [];
            const activeNodes = this.selectOptimalNodes(Math.min(10, this.guardianNodes.length));
            
            for (const nodeUrl of activeNodes) {
                signingPromises.push(
                    this.requestSignatureFromNode(nodeUrl, masterId, messageBytes, jwtToken, context)
                );
            }
            
            // 最初に応答したノードの署名を採用（Quickest-of-N）
            const signature = await Promise.any(signingPromises);
            
            console.log(`🛡️ Guardian signature obtained from: ${signature.nodeId}`);
            return signature;
            
        } catch (error) {
            console.error('💥 Guardian signature request failed:', error);
            throw new Error(`No Guardian nodes responded: ${error.message}`);
        }
    }

    /**
     * 個別ノードへShare送信
     */
    async sendShareToNode(nodeUrl, masterId, shareC, metadata) {
        try {
            const response = await fetch(`${nodeUrl}/share/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    shareData: shareC,
                    metadata: metadata,
                    ttl: metadata.ttl
                }),
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`Node ${nodeUrl} registration failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`📤 Share sent to ${nodeUrl}: ${result.nodeId}`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to send share to ${nodeUrl}:`, error);
            throw error;
        }
    }

    /**
     * 個別ノードから署名要求
     */
    async requestSignatureFromNode(nodeUrl, masterId, messageBytes, jwtToken, context) {
        try {
            const response = await fetch(`${nodeUrl}/mpc/sign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    message: Buffer.from(messageBytes).toString('hex'),
                    jwtToken: jwtToken,
                    signingContext: context
                }),
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`Signing failed: ${response.status}`);
            }

            const result = await response.json();
            return {
                ...result.signature,
                nodeId: result.nodeId,
                nodeUrl: nodeUrl
            };

        } catch (error) {
            console.error(`❌ Signature request failed for ${nodeUrl}:`, error);
            throw error;
        }
    }

    /**
     * ノード発見・ヘルスチェック
     */
    async discoverNodes() {
        const healthyNodes = [];
        
        for (const nodeUrl of this.guardianEndpoints) {
            try {
                const response = await fetch(`${nodeUrl}/health`, { timeout: 3000 });
                if (response.ok) {
                    const health = await response.json();
                    healthyNodes.push({
                        url: nodeUrl,
                        nodeId: health.nodeId,
                        uptime: health.uptime,
                        shares: health.shares
                    });
                }
            } catch (error) {
                console.warn(`⚠️ Node ${nodeUrl} unreachable`);
            }
        }
        
        this.activeNodes = healthyNodes;
        console.log(`🔍 Discovered ${healthyNodes.length} healthy Guardian nodes`);
        return healthyNodes;
    }

    selectOptimalNodes(count) {
        // 簡易版: ランダム選択（本番では信頼スコア + レスポンス速度で選択）
        const shuffled = [...this.guardianEndpoints].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    /**
     * Guardian認証確認
     */
    async verifyGuardianAccess(masterId, context) {
        try {
            const jwtToken = await this.jwtSigner.createSigningJWT(masterId, context);
            const signingPromises = [];
            const activeNodes = this.selectOptimalNodes(Math.min(10, this.guardianNodes.length));

            for (const nodeUrl of activeNodes) {
                signingPromises.push(
                    this.requestSignatureFromNode(nodeUrl, masterId, new TextEncoder().encode('guardian_access_test'), jwtToken, context)
                );
            }

            const signature = await Promise.any(signingPromises);
            return { verified: true, nodeId: signature.nodeId };
        } catch (error) {
            console.error('💥 Guardian access verification failed:', error);
            return { verified: false, error: error.message };
        }
    }

    /**
     * Guardian ノードからシェア生成要求 + 分散配布
     */
    async generateGuardianShare(masterId, metadata) {
        try {
            console.log(`🔑 Requesting Guardian share generation for ${masterId}`);
            
            const jwtToken = await this.jwtSigner.createSigningJWT(masterId, metadata);
            
            // 1. プライマリノードでシェア生成
            const primaryNode = this.selectOptimalNodes(1)[0];
            const shareGenerationResult = await this.generateShareOnNode(primaryNode, masterId, jwtToken, metadata);
            
            // 2. 生成されたシェアを複数ノードに分散配布
            const distributionResult = await this.distributeGuardianShare(
                masterId, 
                shareGenerationResult.share, 
                shareGenerationResult.shareId,
                metadata
            );
            
            console.log(`✅ Guardian share generated and distributed to ${distributionResult.distributedNodes} nodes`);
            
            return {
                shareId: shareGenerationResult.shareId,
                share: shareGenerationResult.share,
                primaryNodeId: shareGenerationResult.nodeId,
                primaryNodeUrl: primaryNode,
                distributedNodes: distributionResult.distributedNodes,
                totalNodes: distributionResult.totalNodes
            };
        } catch (error) {
            console.error(`❌ Guardian share generation failed:`, error);
            throw error;
        }
    }

    /**
     * 指定ノードでシェア生成
     */
    async generateShareOnNode(nodeUrl, masterId, jwtToken, metadata) {
        try {
            const response = await fetch(`${nodeUrl}/mpc/generate-share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    partyId: 3, // Guardian Node
                    jwtToken: jwtToken,
                    signingContext: metadata
                }),
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`Guardian share generation failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`✅ Share generated on node: ${result.nodeId}`);
            
            return {
                shareId: result.shareId,
                share: result.share,
                nodeId: result.nodeId,
                nodeUrl: nodeUrl
            };
        } catch (error) {
            console.error(`❌ Share generation failed on ${nodeUrl}:`, error);
            throw error;
        }
    }

    /**
     * Guardianシェアを複数ノードに分散配布
     */
    async distributeGuardianShare(masterId, share, shareId, metadata) {
        try {
            console.log(`📡 Distributing Guardian share to ${this.replicationFactor} nodes`);
            
            const distributionPromises = [];
            const targetNodes = this.selectOptimalNodes(this.replicationFactor);
            
            for (const nodeUrl of targetNodes) {
                distributionPromises.push(
                    this.sendGuardianShareToNode(nodeUrl, masterId, share, shareId, metadata)
                );
            }
            
            const results = await Promise.allSettled(distributionPromises);
            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            if (successful < this.replicationFactor * 0.8) {
                throw new Error(`Distribution failed: only ${successful}/${this.replicationFactor} succeeded`);
            }
            
            console.log(`✅ Guardian share distributed to ${successful} nodes`);
            return { 
                distributedNodes: successful, 
                totalNodes: this.replicationFactor,
                shareId: shareId
            };
            
        } catch (error) {
            console.error('💥 Guardian share distribution failed:', error);
            throw error;
        }
    }

    /**
     * 個別ノードへGuardianシェア送信
     */
    async sendGuardianShareToNode(nodeUrl, masterId, share, shareId, metadata) {
        try {
            const response = await fetch(`${nodeUrl}/guardian/share/store`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    shareId: shareId,
                    shareData: share,
                    metadata: {
                        ...metadata,
                        ttl: 30 * 24 * 60 * 60 * 1000, // 30日
                        algorithm: 'FROST',
                        threshold: 2
                    }
                }),
                timeout: 5000
            });

            if (!response.ok) {
                throw new Error(`Node ${nodeUrl} share storage failed: ${response.status}`);
            }

            const result = await response.json();
            console.log(`📤 Guardian share stored on ${nodeUrl}: ${result.nodeId}`);
            return result;

        } catch (error) {
            console.error(`❌ Failed to store share on ${nodeUrl}:`, error);
            throw error;
        }
    }
}

/**
 * JWT署名管理 - Guardian認証用
 */
class BitvoyJWTSigner {
    constructor() {
        this.algorithm = 'ES256'; // ECDSA P-256
        this.privateKey = null;
        this.publicKey = null;
    }

    async init() {
        // 開発用の鍵ペア生成（本番では固定鍵使用）
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'ECDSA',
                namedCurve: 'P-256'
            },
            true,
            ['sign', 'verify']
        );
        
        this.privateKey = keyPair.privateKey;
        this.publicKey = keyPair.publicKey;
        
        console.log('🔐 JWT signing keys initialized');
    }

    /**
     * Guardian署名許可JWT生成
     */
    async createSigningJWT(masterId, context) {
        const header = {
            typ: 'JWT',
            alg: this.algorithm
        };

        const payload = {
            sub: masterId,
            iss: 'bitvoy-mpc',
            aud: 'guardian-nodes',
            exp: Math.floor(Date.now() / 1000) + 300, // 5分有効
            iat: Math.floor(Date.now() / 1000),
            action: 'mpc-sign',
            mpc_id: masterId,
            context: context
        };

        const headerB64 = this.base64URLEncode(JSON.stringify(header));
        const payloadB64 = this.base64URLEncode(JSON.stringify(payload));
        const signingInput = `${headerB64}.${payloadB64}`;

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            this.privateKey,
            new TextEncoder().encode(signingInput)
        );

        const signatureB64 = this.base64URLEncode(signature);
        return `${signingInput}.${signatureB64}`;
    }

    /**
     * JWT検証（Guardian Node用）
     */
    async verifyJWT(token) {
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        
        const signature = this.base64URLDecode(signatureB64);
        const signingInput = `${headerB64}.${payloadB64}`;
        
        const isValid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            this.publicKey,
            signature,
            new TextEncoder().encode(signingInput)
        );

        if (!isValid) {
            throw new Error('Invalid JWT signature');
        }

        const payload = JSON.parse(
            new TextDecoder().decode(this.base64URLDecode(payloadB64))
        );

        if (payload.exp < Date.now() / 1000) {
            throw new Error('JWT expired');
        }

        return payload;
    }

    base64URLEncode(data) {
        if (typeof data === 'string') {
            data = new TextEncoder().encode(data);
        } else if (data instanceof ArrayBuffer) {
            data = new Uint8Array(data);
        }
        
        return btoa(String.fromCharCode(...data))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    base64URLDecode(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        const binary = atob(str);
        return new Uint8Array([...binary].map(char => char.charCodeAt(0)));
    }
}

/**
 * 既存BitVoyクラスの更新 - Guardian統合
 */
class BitVoyServer {
    constructor() {
        // 既存コード...
        this.mpc = new BitvoyMPC(); // 新しいGuardian統合版
    }

    /**
     * MPC Wallet登録 - Guardian統合版
     */
    async registerBitVoyMPC() {
        try {
            if (!isInitialized) {
                await this.init();
            }

            console.log("🚀 Starting MPC wallet registration with Guardian...");

            // Master ID生成
            masterId = await this.generateMasterId();
            
            // MPC wallet作成（Guardian自動配布含む）
            const walletResult = await this.mpc.generateDistributedKey(masterId, Date.now().toString());
            
            if (!walletResult.success) {
                throw new Error('Failed to create MPC wallet system');
            }

            console.log(`✅ Wallet created with ${walletResult.guardianNodes} Guardian nodes`);

            // 既存の保存処理...
            await Promise.all([
                putIntoIndexedDB(db, storeName, 'bitvoy.masterid', masterId),
                putIntoIndexedDB(db, storeName, 'bitvoy.credentialid', walletResult.credentialId),
                putIntoIndexedDB(db, storeName, 'bitvoy.publickey', walletResult.publicKey)
            ]);

            await this.createDefaultMPCWallets(masterId);
            sessionStorage.setItem('mpc.initialized', 'true');
            sessionStorage.setItem('mpc.masterid', masterId);

            console.log("🎉 MPC wallet registration with Guardian completed successfully");
            return { success: true, masterId: masterId, guardianNodes: walletResult.guardianNodes };

        } catch (error) {
            console.error("💥 MPC wallet registration failed:", error);
            this.showDialog('Registration Failed', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Guardian復元機能 - 修正版
     * シェア取得ではなく、新規鍵生成による復旧
     */
    async restoreFromGuardian(masterId, recoveryContext = {}) {
        try {
            console.log("🛡️ Starting Guardian-based restoration...");
            
            // 1. Guardian認証確認（シェア取得ではなく認証のみ）
            const guardianAuth = await this.mpc.guardianManager.verifyGuardianAccess(
                masterId, 
                recoveryContext
            );

            if (!guardianAuth.verified) {
                throw new Error("Guardian authentication failed");
            }

            // 2. 新規MPC鍵生成（既存シェアは破棄）
            console.log("🔄 Generating new MPC keys for recovery...");
            const newWalletResult = await this.mpc.generateDistributedKey(masterId, `recovery_${Date.now()}`);
            
            if (!newWalletResult.success) {
                throw new Error("Failed to generate new MPC keys");
            }

            console.log("✅ Guardian-based recovery completed with new keys");
            return { 
                success: true, 
                newPublicKey: newWalletResult.publicKey,
                guardianNodes: newWalletResult.guardianNodes,
                recoveryType: 'guardian_new_keys'
            };

        } catch (error) {
            console.error("💥 Guardian restoration failed:", error);
            throw error;
        }
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BitvoyMPC, GuardianManager, BitvoyJWTSigner, BitVoyServer };
} else if (typeof window !== 'undefined') {
    window.BitvoyMPC = BitvoyMPC;
    window.GuardianManager = GuardianManager;
    window.BitvoyJWTSigner = BitvoyJWTSigner;
}

console.log("🔗 Bitvoy × Guardian integration loaded");
