const logger = require('../utils/logger');
const FrostClient = require('@toruslabs/tss-frost-client');
const path = require('path');

class MPCService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.frostWasm = null; // frost_wasmインスタンス（後でBitVoy Serverから設定）
        
        // MPC設定
        this.threshold = config.mpc?.threshold || 2;
        this.totalParties = config.mpc?.totalParties || 3;
        this.sessionTimeout = config.mpc?.sessionTimeout || 300000;
        this.maxRetries = config.mpc?.maxRetries || 3;
        this.retryDelay = config.mpc?.retryDelay || 1000;
        
        // FROST用Identifier（64桁16進文字列）変換関数
        this.toFrostIdentifier = function(num) {
            return num.toString(16).padStart(64, '0');
        };
        
        // パッケージのキーを64文字の16進数文字列に変換する関数
        this.convertPackageKeys = function(packages) {
            const converted = {};
            for (const [key, value] of Object.entries(packages)) {
                const frostKey = this.toFrostIdentifier(parseInt(key));
                converted[frostKey] = value;
            }
            return converted;
        };
    }

    /**
     * frost_wasmインスタンスを設定（BitVoy Serverから呼び出される）
     */
    setFrostWasm(frostWasm) {
        this.frostWasm = frostWasm;
        if (frostWasm) {
            this.logger.info('✅ frost_wasm instance set in MPCService');
        } else {
            this.logger.warn('⚠️ frost_wasm instance set to null in MPCService');
        }
    }

    /**
     * ヘルス状態確認
     */
    isHealthy() {
        return this.frostWasm !== null &&
            typeof this.frostWasm.secp_dkg_round1 === 'function' &&
            typeof this.frostWasm.secp_dkg_round2 === 'function' &&
            typeof this.frostWasm.secp_dkg_round3 === 'function' &&
            typeof this.frostWasm.ed_dkg_round1 === 'function' &&
            typeof this.frostWasm.ed_dkg_round2 === 'function' &&
            typeof this.frostWasm.ed_dkg_round3 === 'function';
    }

    async initializeWallet(masterId) {
        try {
            this.logger.info(`🔑 Initializing MPC wallet for ${masterId} (ラウンド分割方式)`);
            if (!this.frostWasm) throw new Error('frost_wasm not initialized');

            // === Round 1 ===
            const round1Result = JSON.parse(this.frostWasm.secp_dkg_round1(this.toFrostIdentifier(2), this.totalParties, this.threshold));
            // Round 1パッケージを他パーティと交換（DB/API経由で保存・取得）
            const otherRound1Packages = await this.exchangePackagesWithPeers(masterId, 1, round1Result.package);

            // === Round 2 ===
            // パッケージのキーを64文字の16進数文字列に変換
            const convertedPackages = this.convertPackageKeys(otherRound1Packages);
            const round2Result = JSON.parse(this.frostWasm.secp_dkg_round2(round1Result.secret_package, JSON.stringify(convertedPackages)));
            const otherRound2Packages = await this.exchangePackagesWithPeers(masterId, 2, round2Result.package);

            // === Round 3 ===
            const round3Result = JSON.parse(this.frostWasm.secp_dkg_round3(
                round2Result.secret_package,
                JSON.stringify(otherRound1Packages),
                JSON.stringify(otherRound2Packages)
            ));

            // 公開鍵パッケージ保存
            await this.storePublicKeyPackage(masterId, round3Result.public_key_package);

            this.logger.info(`✅ MPC wallet initialized for ${masterId} (ラウンド分割方式)`);
            return {
                success: true,
                masterId: masterId,
                publicKeyPackage: round3Result.public_key_package
            };
        } catch (error) {
            this.logger.error(`❌ MPC wallet initialization failed for ${masterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 各ラウンドで自分のpackageを他パーティと交換する（DB/API/メッセージング層で実装）
     * @param {string} masterId
     * @param {number} round 1 or 2
     * @param {string} myPackage
     * @returns {Promise<Object>} FROST識別子をキーにした他パーティのpackageオブジェクト
     */
    async exchangePackagesWithPeers(masterId, round, myPackage) {
        // --- ここはDBやAPI経由で他パーティのpackageを取得する実装に置き換えてください ---
        // 例: await this.db.exchangePackage(masterId, round, myPackage)
        // ここではモックとして空オブジェクトを返す
        return {};
    }

    /**
     * Share A 生成（BitVoy Server側）
     */
    async generateShareA(masterId, publicKey) {
        try {
            // frost_wasmを使用してShare Aを生成
            const shareData = {
                masterId: masterId,
                partyId: 1, // BitVoy Server = Party 1
                publicKey: publicKey,
                threshold: 2,
                totalParties: 3,
                algorithm: 'FROST',
                generatedAt: Date.now()
            };
            
            // 実際のFROST実装では、ここでfrost_wasmを使用してシェアを生成
            // 現在はダミーシェアを生成（本番では適切なFROST実装に置き換え）
            const crypto = require('crypto');
            const shareA = {
                ...shareData,
                share: crypto.randomBytes(32).toString('hex'),
                commitment: crypto.randomBytes(32).toString('hex')
            };
            
            this.logger.info(`✅ Share A generated for ${masterId}`);
            return shareA;
            
        } catch (error) {
            this.logger.error(`❌ Share A generation failed for ${masterId}:`, error);
            throw error;
        }
    }

    /**
     * Share C 生成（Guardian Network用）
     */
    async generateShareC(masterId, publicKey) {
        try {
            // Guardian Network用のShare Cを生成
            const shareData = {
                masterId: masterId,
                partyId: 2, // BitVoy Server = Party 2
                publicKey: publicKey,
                threshold: 2,
                totalParties: 3,
                algorithm: 'FROST',
                generatedAt: Date.now()
            };
            
            // 実際のFROST実装では、ここでfrost_wasmを使用してシェアを生成
            // 現在はダミーシェアを生成（本番では適切なFROST実装に置き換え）
            const crypto = require('crypto');
            const shareC = {
                ...shareData,
                share: crypto.randomBytes(32).toString('hex'),
                commitment: crypto.randomBytes(32).toString('hex')
            };
            
            this.logger.info(`✅ Share C generated for ${masterId}`);
            return shareC;
            
        } catch (error) {
            this.logger.error(`❌ Share C generation failed for ${masterId}:`, error);
            throw error;
        }
    }

    async signWithShareA(masterId, messageHash, context) {
        // frost_wasmを使用した部分署名生成
    }

    async combineSignatures(signatures) {
        // frost_wasmを使用した署名集約
    }

    async init(db) {
        try {
            this.db = db;
            if (!this.isHealthy()) {
                throw new Error('frost_wasm is not initialized or missing required functions');
            }
            this.logger.info('✅ MPC Service initialized with database');
            return true;
        } catch (error) {
            this.logger.error('❌ MPC Service initialization failed:', error);
            throw error;
        }
    }
    
    static async generateDistributedKeys(masterId, email) {
        try {
            logger.info(`Generating MPC keys for masterId: ${masterId}`);
            
            // FROSTクライアント初期化
            const frostClient = new FrostClient();

            // 1. 分散鍵生成（各ノードで秘密分散）
            // ※実際のAPIはご利用のFROSTクライアント仕様に合わせてください
            const keygenResult = await frostClient.keygen({
                sessionId: masterId,
                threshold: 2,
                totalParties: 3,
                // 必要に応じて他のパラメータ
            });

            // 2. 公開鍵・シェア取得
            const publicKey = keygenResult.publicKey;
            const keyShares = keygenResult.shares; // { client: ..., server: ..., guardian: ... }

            // 3. 各種アドレス生成（例: secp256k1公開鍵からBTC/ETHアドレス等を導出）
            // ここは既存のKeyDerivation等のユーティリティを利用
            const walletAddresses = {
                BTC: 'btc_address_from_publicKey', // 実装例
                ETH: 'eth_address_from_publicKey',
                SOL: 'sol_address_from_publicKey',
                TON: 'ton_address_from_publicKey'
            };

            return {
                masterId,
                publicKey,
                keyShares,
                walletAddresses
            };
        } catch (error) {
            logger.error('MPC key generation error:', error);
            throw error;
        }
    }

    static async signTransaction(masterId, transactionData, blockchain) {
        try {
            logger.info(`Signing transaction for ${blockchain} - masterId: ${masterId}`);
            
            // 1. 署名対象メッセージ生成（トランザクションハッシュ等）
            const message = Buffer.isBuffer(transactionData) ? transactionData : Buffer.from(transactionData, 'hex');

            // 2. シェア情報取得（本来はDBやセッション管理から取得）
            // ここではダミー値を使用
            const keyShares = {
                client: 'dummy_private_share',
                publicKey: 'dummy_public_key'
            };

            // 3. FROSTクライアント初期化
            const frostClient = new FrostClient();

            // 4. FROST署名（本番では正しいシェア情報を利用）
            const signature = await frostClient.sign({
                message,
                privateShare: keyShares.client, // ダミー
                publicKey: keyShares.publicKey, // ダミー
                partyId: 1 // 例: クライアント側
                // 必要に応じて他のパラメータ
            });

            // 5. 署名結果を返却
            return {
                signature,
                transactionHash: 'dummy_tx_hash_' + Date.now(), // ダミー値
                blockchain,
                status: 'signed'
            };
            
        } catch (error) {
            logger.error('MPC transaction signing error:', error);
            throw error;
        }
    }

    static async createFROSTPartialSignature(message, share, partyId, context = {}) {
        try {
            // FROSTクライアント初期化
            const frostClient = new FrostClient();

            // 署名用メッセージをバッファ化
            const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message, 'hex');

            // --- 簡化されたFROST実装（本番は専用ライブラリ推奨） ---
            // ランダムスカラーとメッセージハッシュを使ったダミー署名
            const crypto = require('crypto');
            const messageHash = crypto.createHash('sha256').update(messageBuffer).digest('hex');
            const randomScalar = crypto.randomBytes(32).toString('hex');

            const dummySignature = {
                r: randomScalar.substring(0, 64),
                s: messageHash.substring(0, 64),
                partyId: partyId,
                algorithm: 'FROST',
                timestamp: Date.now(),
                context: context,
                dummy: true // ダミーフラグ
            };

            // --- 本番用: FROST部分署名生成 ---
            // share: { privateShare, publicKey, ... } など必要な情報を含む想定
            // const result = await frostClient.sign({
            //     message: messageBuffer,
            //     privateShare: share.privateShare,
            //     publicKey: share.publicKey,
            //     partyId: partyId,
            //     // 必要に応じて他のパラメータも追加
            // });
            // return {
            //     r: result.r,
            //     s: result.s,
            //     partyId: partyId,
            //     algorithm: 'FROST',
            //     timestamp: Date.now(),
            //     context: context
            // };

            // デモ・テスト用はダミー署名を返す
            return dummySignature;
        } catch (error) {
            logger.error('FROST部分署名生成失敗:', error);
            throw error;
        }
    }

    /**
     * ウォレット復旧処理（Reshare対応版）
     */
    async recoverWalletWithReshare(masterId, recoveryCode, curve = 'secp256k1') {
        try {
            this.logger.info(`Recovering wallet with Reshare for masterId: ${masterId}, curve: ${curve}`);

            // 復旧コードの検証
            const isValidCode = await this.validateRecoveryCode(masterId, recoveryCode);
            if (!isValidCode) {
                return { success: false, error: 'Invalid recovery code' };
            }

            // Guardian Networkからシェア復旧
            const guardianShares = await this.recoverGuardianShares(masterId);
            if (!guardianShares.success) {
                return { success: false, error: 'Failed to recover Guardian shares' };
            }

            // frost_wasmを使用した復旧処理（Reshare対応版）
            const recoveryResult = await this.performFrostRecoveryWithReshare(masterId, guardianShares.shares, curve);
            if (!recoveryResult.success) {
                return { success: false, error: 'FROST recovery with Reshare failed' };
            }

            // 復旧後のウォレット情報を返却
            return {
                success: true,
                recoveredWallet: {
                    masterId: masterId,
                    publicKey: recoveryResult.publicKey,
                    publicKeyPackage: recoveryResult.publicKeyPackage,
                    guardianShares: guardianShares.shares,
                    newShares: recoveryResult.newShares,
                    recoveryTimestamp: Date.now(),
                    reshareCompleted: true,
                    secretMaintained: true,
                    curve: curve
                }
            };

        } catch (error) {
            this.logger.error('Wallet recovery with Reshare failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 復旧コードの検証
     */
    async validateRecoveryCode(masterId, recoveryCode) {
        try {
            // データベースから復旧コードを取得・検証
            const [result] = await this.db.query(
                'SELECT * FROM recovery_codes WHERE master_id = ? AND code = ? AND expires_at > NOW() AND used = FALSE',
                [masterId, recoveryCode]
            );
            const rows = Array.isArray(result) ? result : [];

            return rows.length > 0;

        } catch (error) {
            this.logger.error('Recovery code validation failed:', error);
            return false;
        }
    }

    /**
     * Guardian Networkからシェア復旧
     */
    async recoverGuardianShares(masterId) {
        try {
            // Guardian Networkからシェアを取得
            const guardianResponse = await this.guardianService.recoverShares(masterId);
            
            if (!guardianResponse.success) {
                throw new Error('Guardian share recovery failed');
            }

            return {
                success: true,
                shares: guardianResponse.shares,
                guardianNodes: guardianResponse.guardianNodes
            };

        } catch (error) {
            this.logger.error('Guardian share recovery failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * frost_wasmを使用したFROST復旧処理（Reshare対応版）
     */
    async performFrostRecoveryWithReshare(masterId, guardianShares, curve = 'secp256k1') {
        try {
            // frost_wasmの存在確認
            const recoverFunction = curve === 'secp256k1' ? 'secp_recover_secret' : 'ed_recover_secret';
            if (!this.frostWasm || typeof this.frostWasm[recoverFunction] !== 'function') {
                throw new Error(`frost_wasm ${recoverFunction} function is not available`);
            }

            // FROST秘密復元実行
            const recoveryResult = this.frostWasm[recoverFunction](
                JSON.stringify(guardianShares),
                JSON.stringify(this.publicKeyPackage)
            );

            if (!recoveryResult) {
                throw new Error('FROST secret recovery failed');
            }

            // 結果の解析
            let parsedResult;
            if (typeof recoveryResult === 'string') {
                parsedResult = recoveryResult; // 16進数文字列として返される
            } else {
                parsedResult = recoveryResult;
            }

            // 復元された秘密を使用して新しいシェアを生成（Reshare）
            const reshareResult = await this.performReshareWithSecret(parsedResult, curve);
            if (!reshareResult.success) {
                throw new Error('Reshare failed after secret recovery');
            }

            return {
                success: true,
                secret: parsedResult,
                publicKey: reshareResult.newPublicKey,
                publicKeyPackage: reshareResult.newPublicKeyPackage,
                newShares: reshareResult.newShares,
                curve: curve,
                reshareCompleted: true,
                secretMaintained: true
            };

        } catch (error) {
            this.logger.error('FROST recovery with Reshare failed:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * frost_wasmを使用してReshare実行
     */
    async performReshareWithSecret(secret, curve = 'secp256k1') {
        try {
            // frost_wasmの存在確認
            const reshareFunction = curve === 'secp256k1' ? 'secp_reshare' : 'ed_reshare';
            if (!this.frostWasm || typeof this.frostWasm[reshareFunction] !== 'function') {
                throw new Error(`frost_wasm ${reshareFunction} function is not available`);
            }

            // FROST秘密復元実行
            const recoveryResult = this.frostWasm[reshareFunction](
                JSON.stringify(guardianShares),
                JSON.stringify(this.publicKeyPackage)
            );

            if (!recoveryResult) {
                throw new Error('FROST secret recovery failed');
            }

            // 結果の解析
            let parsedResult;
            if (typeof recoveryResult === 'string') {
                parsedResult = recoveryResult; // 16進数文字列として返される
            } else {
                parsedResult = recoveryResult;
            }

            // 復元された秘密を使用して新しいシェアを生成（Reshare）
            const reshareResult = await this.performReshareWithSecret(parsedResult, curve);
            if (!reshareResult.success) {
                throw new Error('Reshare failed after secret recovery');
            }

            return {
                success: true,
                secret: parsedResult,
                publicKey: reshareResult.newPublicKey,
                publicKeyPackage: reshareResult.newPublicKeyPackage,
                newShares: reshareResult.newShares,
                curve: curve,
                reshareCompleted: true,
                secretMaintained: true
            };

        } catch (error) {
            this.logger.error('FROST recovery with Reshare failed:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = MPCService;