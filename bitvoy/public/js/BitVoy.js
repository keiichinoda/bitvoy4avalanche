/**
 * BitVoy.js - Main MPC Application Class (JWT認証統合改良版)
 * Guardian Node JWT認証対応・認証責任の明確化
 */

class BitVoy {
    constructor(network = 'mainnet') {
        // ネットワーク設定（セッションストレージから優先取得）
        const savedNetwork = sessionStorage.getItem('mpc.current_network');
        this.network = savedNetwork || network;
        
        // セッションストレージに保存
        sessionStorage.setItem('mpc.current_network', this.network);
        
        // Token contract addresses are now retrieved from coins-libs.js functions:
        // - getPolygonTokenContractAddress(productId) for Polygon tokens
        // - getERC20TokenContractAddress(productId) for Ethereum tokens
        // - contracts object for Solana/TON tokens

        // Initialize core components (依存性注入)
        this.mpc = new BitVoyMPC();
        this.wallet = new BitVoyWallet(this.mpc, this.network);
        this.storage = new BitVoyStorage();
        
        // State variables
        this.masterId = null;
        this.isInitialized = false;
        this.credential = null; // Passkey credential for deviceId generation
        
        // JWT管理
        this.guardianJWT = null;
        this.jwtExpiry = null;
        
        // サーバー設定
        this.config = {
            serverUrl: window.location.origin
        };
    }

    /**
     * BitVoy統合システム初期化
     */
    async init() {
        try {
            if (this.isInitialized) return;

            // 各コンポーネント初期化
            await this.storage.init();
            await this.mpc.init();

            // 緊急復旧フラグを確認
            const isEmergencyRecovered = sessionStorage.getItem('mpc.emergency_recovered') === 'true';
            const isRecovered = sessionStorage.getItem('mpc.recovered') === 'true';
            const isRecoveryMode = isEmergencyRecovered || isRecovered;
            
            // 緊急復旧時の処理と通常の処理を分ける
            if (isRecoveryMode) {
                // ========== 緊急復旧時の処理 ==========
                await this.handleRecoveryModeInitialization();
            } else {
                // ========== 通常の処理 ==========
                await this.handleNormalInitialization();
            }

            this.isInitialized = true;
            console.log("BitVoy integrated system initialized successfully");

        } catch (error) {
            console.error("BitVoy system initialization failed:", error);
            throw error;
        }
    }

    /**
     * 緊急復旧時の初期化処理
     */
    async handleRecoveryModeInitialization() {
        try {
            console.log("🔄 Emergency recovery mode: Initializing...");
            
            // セッションストレージからmasterIdを取得（緊急復旧時は必須）
            const sessionMasterId = sessionStorage.getItem('mpc.masterid');
            if (!sessionMasterId) {
                throw new Error('Master ID not found in session storage during emergency recovery');
            }
            
            this.masterId = sessionMasterId;
            console.log("✅ Master ID loaded from session storage (recovery mode):", this.masterId);
            
            // IndexedDBに同期（緊急復旧状態を永続化）
            if (this.storage) {
                console.log("🔄 Syncing emergency recovery state to IndexedDB...");
                await this.storage.updateMasterId(this.masterId);
                console.log("✅ IndexedDB synced with emergency recovery state");
            }
        } catch (error) {
            console.error("Failed to initialize in recovery mode:", error);
            throw error;
        }
    }

    /**
     * 通常時の初期化処理
     */
    async handleNormalInitialization() {
        try {
            console.log("🔄 Normal mode: Initializing...");
            
            this.masterId = await this.storage.getMasterId();
            if (this.masterId) {
                console.log("✅ Master ID loaded from IndexedDB:", this.masterId);
            }
        } catch (error) {
            console.error("Failed to initialize in normal mode:", error);
            throw error;
        }
    }

    /**
     * ネットワークごとのウォレットセットアップ
     */
    async setupNetworkWallets(networkType, {
        secp256k1PubKey,
        ed25519MasterSeed,
        ecdsaTssPubKey,
        sharedJWT = null,
        registerOnServer = false
    } = {}) {
        if (!secp256k1PubKey || !ed25519MasterSeed || !ecdsaTssPubKey) {
            throw new Error('Wallet key material is required to setup wallets');
        }

        console.log(`🔧 Setting up wallets for network: ${networkType}`);

        // アドレス生成（SAアドレス含む）
        console.log(`[${networkType}] 🔄 Generating addresses via MPCAddressGenerator`);
        const allAddresses = await this.wallet.addressGenerator.generateAllAddresses(
            networkType,
            secp256k1PubKey,
            ed25519MasterSeed,
            ecdsaTssPubKey,
            { includeSA: true } // SAアドレスを含める
        );
        console.log(`[${networkType}] ✅ Addresses generated`, {
            bitcoin: allAddresses.bitcoin,
            ethereum: allAddresses.ethereum,
            polygon: allAddresses.polygon,
            avalanche: allAddresses.avalanche,
            solana: allAddresses.solana,
            ton: allAddresses.ton,
            ethereumSA: allAddresses.ethereumSA,
            polygonSA_USDC: allAddresses.polygonSA_USDC,
            polygonSA_JPYC: allAddresses.polygonSA_JPYC,
            avalancheSA_USDC: allAddresses.avalancheSA_USDC,
            avalancheSA_JPYC: allAddresses.avalancheSA_JPYC,
            ownerEOA: allAddresses.ownerEOA
        });

        // SAアドレス保存処理
        if (allAddresses.ownerEOA) {
            try {
                await this.saveSmartAccountAddresses(
                    networkType,
                    allAddresses.ownerEOA,
                    allAddresses.ethereumSA,
                    null, // polygonSAは不要（polygonSA_USDCとpolygonSA_JPYCを使用）
                    sharedJWT,
                    allAddresses.polygonSA_USDC,
                    allAddresses.polygonSA_JPYC,
                    allAddresses.avalancheSA_USDC,
                    allAddresses.avalancheSA_JPYC
                );
            } catch (error) {
                console.error(`[${networkType}] ❌ Failed to save SA addresses:`, error);
                // SAアドレス保存失敗は警告のみ（既存フローは継続）
            }
        }

        // P2WPKHではTaproot情報は不要（コメントアウト）
        // if (allAddresses.bitcoinTaprootInfo) {
        //     try {
        //         await this.mpc.storeTaprootTweakInfo(
        //             this.masterId,
        //             allAddresses.bitcoinTaprootInfo.taproot_internal_key,
        //             allAddresses.bitcoinTaprootInfo.taproot_tweak,
        //             allAddresses.bitcoinTaprootInfo.taproot_merkle_root
        //         );
        //         console.log(`[${networkType}] ✅ Taproot tweak info stored to metadata`);
        //     } catch (error) {
        //         console.error(`[${networkType}] ❌ Failed to store Taproot tweak info:`, error);
        //         throw error;
        //     }
        // }

        const supportedCoins = this.getSupportedCoinsForNetwork(networkType);
        const walletCreationPromises = supportedCoins.map(async (coin) => {
            try {
                const addresses = this.wallet.getAddressForCoinType(allAddresses, coin.coinType, coin.productId);
                if (!addresses || !addresses.primary) {
                    throw new Error(`Address generation failed for ${coin.productId}`);
                }

                let publicKey;
                if (coin.curve === 'secp256k1') {
                    publicKey = secp256k1PubKey;
                } else if (coin.curve === 'ecdsa_tss') {
                    publicKey = ecdsaTssPubKey;
                } else {
                    publicKey = ed25519MasterSeed;
                }

                const wallet = {
                    address: addresses.primary,
                    publicKey,
                    // derivepath: HDWallet廃止により削除
                    addressindex: "0",
                    productid: coin.productId,
                    cointype: coin.coinType,
                    mpcEnabled: true,
                    guardianAuthMethod: 'JWT',
                    alternatives: addresses.alternatives,
                    curve: coin.curve,
                    createdAt: Date.now(),
                    network: networkType
                };

                console.log(`[${networkType}] ✅ ${coin.name} wallet created:`, wallet.address);

                // ネットワーク別キーで保存（wallet.0.<network>.<productId>.address）
                this.saveWalletToSession(`wallet.0.${networkType}.${coin.productId}`, wallet);
                await this.storage.storeWalletInfo(this.masterId, coin.productId, wallet);

                if (registerOnServer) {
                    if (!sharedJWT) {
                        throw new Error('Server JWT is required to register wallet on server');
                    }
                    try {
                        await this.registerWalletWithServer(coin.productId, wallet, sharedJWT);
                        console.log(`[${networkType}] ✅ ${coin.name} wallet registered with server`);
                    } catch (error) {
                        console.error(`[${networkType}] ❌ Failed to register ${coin.name} wallet with server:`, error);
                        console.warn(`[${networkType}] ⚠️ ${coin.name} wallet saved locally but server registration failed`);
                    }
                }

                return { productId: coin.productId, success: true };
            } catch (error) {
                console.error(`[${networkType}] ❌ Failed to create ${coin.productId} wallet:`, error);
                return { productId: coin.productId, success: false, error: error.message };
            }
        });

        const results = await Promise.allSettled(walletCreationPromises);
        const successful = results.filter(result => result.status === 'fulfilled' && result.value.success);
        const failed = results.filter(result => result.status === 'fulfilled' && !result.value.success);

        console.log(`[${networkType}] 📊 Wallet creation results: ${successful.length}/${supportedCoins.length} successful`);
        if (failed.length > 0) {
            console.warn(`[${networkType}] ⚠️ Some wallets failed to create:`, failed.map(f => f.value));
        }

        await this.createTokenWalletsForNetwork(networkType, allAddresses);
    }

    // ==========================================
    // 高レベルユーザー操作
    // ==========================================

    /**
     * BitVoy MPC ウォレット登録 (高レベル統合処理)
     * 新フロー: /auth/init/start → /auth/init/finish を使用
     */
    async registerBitVoyMPC() {
        try {
            console.log("🚀 Starting BitVoy MPC wallet registration (new flow)...");

            // iOS Safariでは、ユーザー操作から外れたと判定されないよう、
            // navigator.credentials.create()を最初に実行する必要がある
            // そのため、init()とfetch()を先に実行してから、navigator.credentials.create()を呼ぶ

            // 1. 初期化フロー開始: /auth/init/start
            // （init()は後回しにして、まずサーバーからchallengeを取得）
            console.log("Step 1: Requesting init registration options from server...");
            const initStartResponse = await fetch(`${this.config.serverUrl}/auth/init/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    displayName: 'BitVoy User'
                })
            });

            if (!initStartResponse.ok) {
                const errorData = await initStartResponse.json().catch(() => ({}));
                throw new Error(`Init registration start failed: ${initStartResponse.status} - ${errorData.error || 'Unknown error'}`);
            }

            const initOptions = await initStartResponse.json();
            if (!initOptions.challengeKey) {
                throw new Error('Invalid init registration options response');
            }

            console.log("✅ Init registration options received");

            // 2. クライアント側でPasskey登録実行
            // （ユーザー操作の直後に実行することで、iOS SafariのNotAllowedErrorを回避）
            console.log("Step 2: Creating Passkey credential...");
            
            // challengeをUint8Arrayに変換
            const challengeBuffer = typeof initOptions.challenge === 'string' 
                ? this.mpc.base64urlToBuffer(initOptions.challenge)
                : new Uint8Array(initOptions.challenge);
            
            // user.idをUint8Arrayに変換
            const userIdBuffer = typeof initOptions.user.id === 'string'
                ? this.mpc.base64urlToBuffer(initOptions.user.id)
                : new Uint8Array(initOptions.user.id);
            
            // excludeCredentialsを変換
            const excludeCredentials = initOptions.excludeCredentials?.map(cred => ({
                id: typeof cred.id === 'string' 
                    ? this.mpc.base64urlToBuffer(cred.id)
                    : new Uint8Array(cred.id),
                type: cred.type,
                transports: cred.transports
            }));
            
            // pubKeyCredParamsを確認し、ES256（-7）が含まれていない場合は追加
            let pubKeyCredParams = initOptions.pubKeyCredParams || [];
            const hasES256 = pubKeyCredParams.some(param => param.alg === -7);
            const hasRS256 = pubKeyCredParams.some(param => param.alg === -257);
            
            if (!hasES256) {
                console.log("⚠️ ES256 (-7) not found in pubKeyCredParams, adding it");
                pubKeyCredParams = [
                    { type: "public-key", alg: -7 }, // ES256
                    ...pubKeyCredParams
                ];
            }
            if (!hasRS256) {
                console.log("⚠️ RS256 (-257) not found in pubKeyCredParams, adding it");
                pubKeyCredParams.push({ type: "public-key", alg: -257 }); // RS256
            }
            
            // サーバーから返されたRP IDを使用（または現在のドメイン）
            const rpId = initOptions.rpId || initOptions.rp.id || window.location.hostname;
            console.log("Using RP ID:", rpId, "from server options or hostname:", window.location.hostname);
            
            let credential;
            try {
                credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: challengeBuffer,
                        rp: {
                            name: initOptions.rp.name,
                            id: rpId // サーバーから返されたRP IDを使用
                        },
                        user: {
                            id: userIdBuffer,
                            name: initOptions.user.name,
                            displayName: initOptions.user.displayName
                        },
                        pubKeyCredParams: pubKeyCredParams,
                        authenticatorSelection: initOptions.authenticatorSelection,
                        timeout: initOptions.timeout || 60000,
                        attestation: initOptions.attestation || 'none',
                        excludeCredentials: excludeCredentials
                    }
                });
            } catch (passkeyError) {
                // パスキー処理のエラー（Operation failed、NotAllowedError等）
                console.error("❌ Passkey credential creation error:", passkeyError);
                
                // Operation failedやNotAllowedErrorの場合、アプリ内ブラウザの可能性が高い
                const errorName = passkeyError.name || '';
                const errorMessage = passkeyError.message || '';
                const errorString = String(passkeyError);
                
                // エラーメッセージのチェックを強化（大文字小文字を区別しない）
                const isOperationFailed = errorMessage.toLowerCase().includes('operation failed') || 
                                         errorString.toLowerCase().includes('operation failed') ||
                                         errorName === 'NotAllowedError' ||
                                         errorName === 'NotSupportedError' ||
                                         errorName === 'SecurityError' ||
                                         errorName === 'UnknownError';
                
                if (isOperationFailed) {
                    // アプリ内ブラウザ検出バナーを表示（少し遅延させてDOMが準備されるのを待つ）
                    setTimeout(() => {
                        if (typeof window.BitVoyEnv !== 'undefined' && typeof window.BitVoyEnv.showInAppBrowserBanner === 'function') {
                            window.BitVoyEnv.showInAppBrowserBanner();
                        }
                    }, 100);
                }
                
                // エラーを再スロー
                throw new Error(`Passkey credential creation failed: ${errorName} - ${errorMessage}`);
            }

            if (!credential) {
                throw new Error('Passkey credential creation failed');
            }

            console.log("✅ Passkey credential created");

            // 2.5. BitVoy初期化（Passkey作成後に実行）
            // （IndexedDB読み込みなどは、navigator.credentials.create()の後に移動）
            if (!this.isInitialized) {
                console.log("Initializing BitVoy after Passkey creation...");
                await this.init();
            }

            // 3. 初期化フロー完了: /auth/init/finish
            console.log("Step 3: Sending credential to server for verification...");
            
            // @simplewebauthn/serverはidとrawIdが同じBase64url文字列であることを期待
            const credentialIdBase64url = this.mpc.bufferToBase64url(new Uint8Array(credential.rawId));
            
            // @simplewebauthn/serverはclientDataJSONとattestationObjectをBase64url文字列として期待
            const clientDataJSONBase64url = this.mpc.bufferToBase64url(new Uint8Array(credential.response.clientDataJSON));
            const attestationObjectBase64url = this.mpc.bufferToBase64url(new Uint8Array(credential.response.attestationObject));
            
            const credentialData = {
                id: credentialIdBase64url,
                rawId: credentialIdBase64url, // idと同じBase64url文字列
                type: credential.type,
                response: {
                    clientDataJSON: clientDataJSONBase64url, // Base64url文字列
                    attestationObject: attestationObjectBase64url // Base64url文字列
                }
            };

            const initFinishResponse = await fetch(`${this.config.serverUrl}/auth/init/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential: credentialData,
                    challengeKey: initOptions.challengeKey
                })
            });

            if (!initFinishResponse.ok) {
                const errorData = await initFinishResponse.json().catch(() => ({}));
                throw new Error(`Init registration finish failed: ${initFinishResponse.status} - ${errorData.error || 'Unknown error'}`);
            }

            const initResult = await initFinishResponse.json();
            if (!initResult.masterId || !initResult.credentialId) {
                throw new Error('Invalid init registration result');
            }
            if (!initResult.walletRegisterJWT) {
                throw new Error('Wallet registration JWT not provided by server');
            }

            // サーバーから返されたmasterIdを使用
            this.masterId = initResult.masterId;
            console.log("✅ Master ID received from server:", this.masterId);

            const walletRegistrationJWT = initResult.walletRegisterJWT;
            if (initResult.walletRegisterJWTExpiresAt) {
                console.log("🕒 Wallet registration JWT expires at:", new Date(initResult.walletRegisterJWTExpiresAt).toISOString());
            }

            const credentialDataForEncryption = {
                rawId: credential.rawId,
                credentialId: initResult.credentialId
            };

            // 4. MPC処理に委譲（分散キー生成 + シェア配布）
            // 注意: Guardian NodeはJWT認証のみで、Passkey不要
            // 新フローでは既にPasskey登録が完了しているため、スキップ
            console.log("Step 4: Starting MPC wallet initialization...");
            const mpcResult = await this.mpc.initializeWalletBatchMode(this.masterId, true, credentialDataForEncryption); // skipPasskeyRegistration = true, reuse credential
            
            if (!mpcResult.success) {
                console.error("❌ MPC initialization failed:", mpcResult.error);
                throw new Error('MPC wallet initialization failed: ' + mpcResult.error+ ' Please open in Chrome or Safari.');
            }
            console.log("✅ MPC wallet initialization completed");

            // 5. マスターID保存
            console.log("Step 5: Saving master ID to storage...");
            await this.storage.storeMasterId(this.masterId);
            // sessionStorageにも保存（SAアドレス計算時に使用）
            sessionStorage.setItem('masterId', this.masterId);
            sessionStorage.setItem('mpc.masterid', this.masterId);
            console.log("✅ Master ID saved to IndexedDB and sessionStorage");

            // 6. クレデンシャルを保持（deviceId生成用）
            this.credential = credential;

            // 7. デフォルトウォレット作成
            console.log("Step 6: Creating default wallets for Mainnet & Testnet...");
            await this.createDefaultWallets(walletRegistrationJWT, ['mainnet', 'testnet']);
            console.log("✅ Default wallets created");

            // 8. UI状態更新
            console.log("Step 7: Updating session state...");
            this.updateSessionState(true);
            console.log("✅ Session state updated");

            console.log("🎉 BitVoy MPC wallet registration completed successfully (new flow)");
            
            // 9. Push通知購読登録（非同期、エラーは無視）
            this.subscribeToPushNotifications().catch(error => {
                console.warn("⚠️ Push notification subscription failed (non-blocking):", error);
            });
            
            return { success: true, masterId: this.masterId };

        } catch (error) {
            console.error("❌ BitVoy MPC wallet registration failed:", error);
            console.error("Error details:", {
                message: error.message,
                stack: error.stack,
                masterId: this.masterId
            });
            
            // ユーザーフレンドリーなエラーメッセージ
            let userMessage = error.message;
            if (error.message.includes('frost_wasm')) {
                userMessage = 'MPCライブラリの初期化に失敗しました。ページを再読み込みしてください。';
            } else if (error.message.includes('Storage')) {
                userMessage = 'ストレージの初期化に失敗しました。ブラウザの設定を確認してください。';
            } else if (error.message.includes('Passkey')) {
                userMessage = 'パスキー認証に失敗しました。ブラウザの設定を確認してください。';
            } else if (error.message.includes('Network')) {
                userMessage = 'ネットワーク接続に問題があります。インターネット接続を確認してください。';
            }
            
            this.showDialog('Registration Failed', userMessage);
            return { success: false, error: error.message };
        }
    }

    /**
     * リカバリーフロー: masterId不明状態から復元
     * リカバリーフロー: /mpcapi/auth/recovery/start → /mpcapi/auth/recovery/finish を使用
     * @param {Object} options - オプション
     * @param {PublicKeyCredential} options.existingAssertion - 既に取得した認証結果（省略時は新規に認証を実行）
     * @param {string} options.challengeKey - 既に取得したchallengeKey（existingAssertion使用時は必須）
     */
    async recoverMasterId(options = {}) {
        try {
            if (!this.isInitialized) {
                console.log("Initializing BitVoy before recovery...");
                await this.init();
            }

            console.log("🔄 Starting masterId recovery (new flow)...");

            let assertion;
            let recoveryOptions;
            let challengeKey;

            // 既に取得した認証結果がある場合はそれを使用
            if (options.existingAssertion && options.challengeKey) {
                console.log("✅ Using existing Passkey authentication result");
                assertion = options.existingAssertion;
                challengeKey = options.challengeKey;
                // challengeKeyからrecoveryOptionsを再構築する必要はないが、後続処理のために空オブジェクトを設定
                recoveryOptions = { challengeKey: challengeKey };
            } else {
                // 1. リカバリーフロー開始: /mpcapi/auth/recovery/start
                console.log("Step 1: Requesting recovery authentication options from server...");
                const recoveryStartResponse = await fetch(`${this.config.serverUrl}/mpcapi/auth/recovery/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!recoveryStartResponse.ok) {
                    const errorData = await recoveryStartResponse.json().catch(() => ({}));
                    throw new Error(`Recovery start failed: ${recoveryStartResponse.status} - ${errorData.error || 'Unknown error'}`);
                }

                recoveryOptions = await recoveryStartResponse.json();
                if (!recoveryOptions.success || !recoveryOptions.challengeKey) {
                    throw new Error('Invalid recovery options response');
                }

                challengeKey = recoveryOptions.challengeKey;
                console.log("✅ Recovery authentication options received");

                // 2. クライアント側でPasskey認証実行（discoverable credential使用）
                console.log("Step 2: Requesting Passkey authentication (discoverable credential)...");
                
                // challengeをUint8Arrayに変換
                const challengeBuffer = typeof recoveryOptions.challenge === 'string'
                    ? this.mpc.base64urlToBuffer(recoveryOptions.challenge)
                    : new Uint8Array(recoveryOptions.challenge);
                
                // サーバーから返されたRP IDを使用（または現在のドメイン）
                const rpId = recoveryOptions.rpId || window.location.hostname;
                console.log("Using RP ID:", rpId, "from server options or hostname:", window.location.hostname);
                
                assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: challengeBuffer,
                        rpId: rpId, // サーバーから返されたRP IDを使用
                        userVerification: recoveryOptions.userVerification || 'required',
                        timeout: recoveryOptions.timeout || 60000,
                        allowCredentials: recoveryOptions.allowCredentials || [] // 空でdiscoverable credential使用
                    }
                });

                if (!assertion) {
                    throw new Error('Passkey authentication failed');
                }

                console.log("✅ Passkey authentication successful");
            }

            // 3. リカバリーフロー完了: /mpcapi/auth/recovery/finishエンドポイントを使用
            // このエンドポイントはJWTも発行するため、リカバリー後のウォレット登録に使用可能
            const recoveryFinishEndpoint = `${this.config.serverUrl}/mpcapi/auth/recovery/finish`;
            
            console.log("Step 3: Sending assertion to server for verification...", { 
                endpoint: recoveryFinishEndpoint, 
                challengeKey: challengeKey?.substring(0, 30) + '...' 
            });
            const assertionData = {
                id: assertion.id,
                rawId: this.mpc.bufferToBase64url(new Uint8Array(assertion.rawId)),
                type: assertion.type,
                response: {
                    authenticatorData: this.mpc.bufferToBase64url(new Uint8Array(assertion.response.authenticatorData)),
                    clientDataJSON: this.mpc.bufferToBase64url(new Uint8Array(assertion.response.clientDataJSON)),
                    signature: this.mpc.bufferToBase64url(new Uint8Array(assertion.response.signature)),
                    userHandle: assertion.response.userHandle 
                        ? this.mpc.bufferToBase64url(new Uint8Array(assertion.response.userHandle))
                        : null
                }
            };

            const recoveryFinishResponse = await fetch(recoveryFinishEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential: assertionData,
                    challengeKey: challengeKey
                })
            });

            if (!recoveryFinishResponse.ok) {
                const errorData = await recoveryFinishResponse.json().catch(() => ({}));
                throw new Error(`Recovery finish failed: ${recoveryFinishResponse.status} - ${errorData.error || 'Unknown error'}`);
            }

            const recoveryResult = await recoveryFinishResponse.json();
            // /mpcapi/auth/recovery/finishはsuccessフィールドを含む
            if (!recoveryResult.success || !recoveryResult.masterId) {
                throw new Error('Invalid recovery result');
            }

            // サーバーから返されたmasterIdを使用
            const recoveredMasterId = recoveryResult.masterId;
            console.log("✅ Master ID recovered from server:", recoveredMasterId);

            // 4. マスターID保存
            console.log("Step 4: Saving recovered master ID to storage...");
            await this.storage.storeMasterId(recoveredMasterId);
            this.masterId = recoveredMasterId;
            console.log("✅ Master ID saved to IndexedDB");

            // 5. クレデンシャルを保持（deviceId生成用）
            this.credential = assertion;

            // 6. セッション状態更新
            sessionStorage.setItem('mpc.masterid', recoveredMasterId);
            sessionStorage.setItem('mpc.recovered', 'true');

            // 7. JWTを取得（ウォレット登録用）
            const walletRegisterJWT = recoveryResult.walletRegisterJWT;
            if (!walletRegisterJWT) {
                console.warn("⚠️ Wallet registration JWT not provided in recovery response");
            } else {
                console.log("✅ Wallet registration JWT received from recovery flow");
            }

            console.log("🎉 Master ID recovery completed successfully (new flow)");
            return { 
                success: true, 
                masterId: recoveredMasterId,
                credentialId: recoveryResult.credentialId,
                walletRegisterJWT: walletRegisterJWT
            };

        } catch (error) {
            console.error("❌ Master ID recovery failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * BitVoy MPC ウォレットログイン (高レベル統合処理)
     */
    async signinBitVoyMPC() {
        try {
            if (!this.masterId) {
                throw new Error('No wallet found. Please register first.');
            }

            console.log("Starting BitVoy MPC wallet signin...");

            // iOS Safariでは、ユーザー操作から外れたと判定されないよう、
            // navigator.credentials.get()を最初に実行する必要がある
            // そのため、IndexedDB読み込みは認証後に移動

            // 1. MPC認証処理に委譲（パスキー認証 - ローカル用のみ）
            // ユーザー操作の直後に実行することで、iOS SafariのNotAllowedErrorを回避
            const credential = await this.mpc.authenticateWithPasskey(this.masterId);
            if (!credential) {
                throw new Error('Local authentication failed');
            }
            
            // credentialを保持（deviceId生成用）
            this.credential = credential;

            // 2. ウォレット情報読み込み（ローカル）
            await this.loadWalletInformation();

            // 3. IndexedDBからネットワーク設定を読み込んでSessionStorageに保存
            // （認証後に移動することで、iOS SafariのNotAllowedErrorを回避）
            await this.loadNetworkFromIndexedDB();

            // 4. UI状態更新
            this.updateSessionState(true);

            console.log("BitVoy MPC wallet signin completed successfully");
            return { success: true };

        } catch (error) {
            console.error("BitVoy MPC wallet signin failed:", error);
            this.showDialog('Signin Failed', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * BitVoy MPC ウォレット復元 (高レベル統合処理)
     */
    async restoreBitVoyMPC(email, verificationCode) {
        try {
            console.log("Starting BitVoy MPC wallet restoration...");

            // 1. メール認証
            const emailVerificationData = await this.verifyEmailForRestore(email, verificationCode);
            if (!emailVerificationData.success) {
                throw new Error('Email verification failed');
            }

            this.masterId = emailVerificationData.masterId;

            // 2. MPC復元処理に委譲
            const mpcResult = await this.mpc.restoreWallet(this.masterId, emailVerificationData);
            if (!mpcResult.success) {
                throw new Error('MPC wallet restoration failed: ' + mpcResult.error);
            }

            // 3. マスターID保存
            await this.storage.storeMasterId(this.masterId);

            // 4. ウォレット情報再構築
            await this.loadWalletInformation();

            // 5. UI状態更新
            this.updateSessionState(true);

            console.log("BitVoy MPC wallet restoration completed successfully");
            return { success: true };

        } catch (error) {
            console.error("BitVoy MPC wallet restoration failed:", error);
            this.showDialog('Restoration Failed', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get Started - 登録またはサインイン判定
     */
    async getStarted() {
        try {
            if (!this.masterId) {
                return await this.registerBitVoyMPC();
            } else {
                return await this.signinBitVoyMPC();
            }
        } catch (error) {
            console.error("Error during getStarted:", error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // JWT認証管理 (Guardian Node用)
    // ==========================================

    /**
     * Guardian Node用JWT取得・管理
     */
    async ensureGuardianJWT(action = 'mpc_sign', context = {}) {
        try {
            // 既存JWTの有効性確認
            if (this.isGuardianJWTValid()) {
                return this.guardianJWT;
            }

            console.log("Obtaining new Guardian JWT...");
            
            // deviceIdがcontextに含まれていない場合、生成する
            if (!context.deviceId && this.credential) {
                try {
                    const credentialId = await this.mpc.extractCredentialIdForGuardian(this.credential);
                    context.deviceId = await this.mpc.generateDeviceIdFromCredentialId(credentialId);
                    console.log("✅ DeviceId generated for Guardian JWT:", context.deviceId);
                } catch (error) {
                    console.warn("⚠️ Failed to generate deviceId, continuing without it:", error);
                }
            }
            
            // MPCコンポーネントからJWT取得
            this.guardianJWT = await this.mpc.obtainGuardianJWT(this.masterId, action, context);
            
            // JWT有効期限計算（5分後）
            this.jwtExpiry = Date.now() + 5 * 60 * 1000;
            
            console.log("Guardian JWT obtained and cached");
            return this.guardianJWT;

        } catch (error) {
            console.error("Guardian JWT acquisition failed:", error);
            throw new Error(`Failed to obtain Guardian JWT: ${error.message}`);
        }
    }

    /**
     * 現在のGuardian JWTトークンを取得
     */
    async getGuardianJWT(action = 'blockchain_access', context = {}) {
        try {
            // 既存JWTの有効性確認
            if (this.isGuardianJWTValid()) {
                return this.guardianJWT;
            }

            // 新しいJWTを取得
            return await this.ensureGuardianJWT(action, context);
        } catch (error) {
            console.error("Failed to get Guardian JWT:", error);
            return null;
        }
    }

    /**
     * Guardian JWT有効性確認
     */
    isGuardianJWTValid() {
        return this.guardianJWT && 
               this.jwtExpiry && 
               Date.now() < this.jwtExpiry - 30000; // 30秒のマージン
    }

    /**
     * Guardian JWT無効化
     */
    invalidateGuardianJWT() {
        this.guardianJWT = null;
        this.jwtExpiry = null;
    }

    // ==========================================
    // ウォレット統合処理（既存を維持）
    // ==========================================

    /**
     * デフォルトウォレット作成 (統合処理・改良版・secp256k1とEd25519両対応)
     */
    /**
     * MPCメタデータからウォレット生成に必要な鍵素材を取得
     */
    async getWalletKeyMaterial() {
        console.log("🔍 Checking MPC metadata for both curves...");
        const mpcMetadata = await this.storage.getAllCurveMetadata(this.masterId);
        console.log("📋 MPC metadata result:", mpcMetadata);
        
        if (!mpcMetadata || (!mpcMetadata.secp256k1 && !mpcMetadata.ed25519 && !mpcMetadata.ecdsa_tss)) {
            console.error("❌ MPC metadata not found for masterId:", this.masterId);
            console.log("📋 Available metadata keys:", await this.storage.getAllMetadataKeys());
            
            console.log("🔍 Storage debug info:");
            console.log("  - Storage initialized:", this.storage?.isInitialized);
            console.log("  - Database object:", this.storage?.db ? "exists" : "null");
            console.log("  - Master ID in storage:", await this.storage.getMasterId());
            
            throw new Error(`MPC metadata not found for masterId: ${this.masterId}. Please ensure MPC wallet is properly initialized.`);
        }
        
        console.log("✅ MPC metadata found, extracting key material");
        console.log("🔍 Metadata details:", {
            hasSecp256k1: !!mpcMetadata.secp256k1,
            hasEd25519: !!mpcMetadata.ed25519,
            hasEcdsaTss: !!mpcMetadata.ecdsa_tss,
            secp256k1PublicKeyLength: mpcMetadata.secp256k1?.publicKey?.length,
            ed25519PublicKeyLength: mpcMetadata.ed25519?.publicKey?.length,
            ecdsaTssPublicKeyLength: mpcMetadata.ecdsa_tss?.publicKey?.length
        });
        
        let secp256k1PubKey = mpcMetadata.secp256k1?.publicKey;
        let ed25519MasterSeed = mpcMetadata.ed25519?.publicKeyPackage?.verifying_key || mpcMetadata.ed25519?.publicKey;
        let ecdsaTssPubKey = mpcMetadata.ecdsa_tss?.publicKey;
        
        const convertToHex = (key) => {
            if (!key) return null;
            
            if (typeof key === 'string' && key.startsWith('0x') && /^[0-9a-fA-F]+$/.test(key.slice(2))) {
                return key.slice(2);
            }
            
            if (typeof key === 'string' && /^[0-9a-fA-F]+$/.test(key)) {
                return key;
            }
            
            if (typeof key === 'string' && key.includes('=')) {
                try {
                    const buffer = Buffer.from(key, 'base64');
                    return buffer.toString('hex');
                } catch (error) {
                    console.warn("Failed to convert Base64 to hex:", error);
                }
            }
            
            if (typeof key === 'object') {
                try {
                    const jsonStr = JSON.stringify(key);
                    const buffer = Buffer.from(jsonStr, 'utf8');
                    return buffer.toString('hex');
                } catch (error) {
                    console.warn("Failed to convert object to hex:", error);
                }
            }
            
            try {
                const buffer = Buffer.from(String(key), 'utf8');
                return buffer.toString('hex');
            } catch (error) {
                console.warn("Failed to convert to hex:", error);
                return null;
            }
        };
        
        if (mpcMetadata.ed25519?.publicKeyPackage) {
            try {
                const publicKeyPackage = typeof mpcMetadata.ed25519.publicKeyPackage === 'string' 
                    ? JSON.parse(mpcMetadata.ed25519.publicKeyPackage)
                    : mpcMetadata.ed25519.publicKeyPackage;
                
                if (publicKeyPackage.verifying_key) {
                    ed25519MasterSeed = publicKeyPackage.verifying_key;
                    console.log("✅ ED25519 public key extracted from publicKeyPackage (initialization)");
                }
            } catch (error) {
                console.warn("⚠️ Failed to parse ED25519 publicKeyPackage:", error);
            }
        }
        
        secp256k1PubKey = convertToHex(secp256k1PubKey);
        ed25519MasterSeed = convertToHex(ed25519MasterSeed);
        ecdsaTssPubKey = convertToHex(ecdsaTssPubKey);
        
        if (secp256k1PubKey && secp256k1PubKey.length === 128) {
            secp256k1PubKey = '04' + secp256k1PubKey;
            console.log("🔧 Normalized SECP256k1 public key to uncompressed format (added 0x04 prefix)");
        }
        
        if (ecdsaTssPubKey && ecdsaTssPubKey.length === 128) {
            ecdsaTssPubKey = '04' + ecdsaTssPubKey;
            console.log("🔧 Normalized ECDSA-TSS public key to uncompressed format (added 0x04 prefix)");
        }
        
        if (!secp256k1PubKey) {
            console.error("❌ secp256k1 public key not found in metadata");
            console.log("🔍 secp256k1 metadata structure:", mpcMetadata.secp256k1);
            throw new Error('secp256k1 public key not provided');
        }
        
        if (!ed25519MasterSeed) {
            console.error("❌ ed25519 public key not found in metadata");
            console.log("🔍 ed25519 metadata structure:", mpcMetadata.ed25519);
            throw new Error('ed25519 master seed not provided');
        }
        
        if (!ecdsaTssPubKey) {
            console.error("❌ ecdsa_tss public key not found in metadata");
            console.log("🔍 ecdsa_tss metadata structure:", mpcMetadata.ecdsa_tss);
            throw new Error('ecdsa_tss public key not provided');
        }
        
        console.log("✅ Public keys extracted and converted successfully:", {
            secp256k1PubKeyLength: secp256k1PubKey.length,
            ed25519MasterSeedLength: ed25519MasterSeed.length,
            ecdsaTssPubKeyLength: ecdsaTssPubKey.length,
            secp256k1PubKeyPrefix: secp256k1PubKey.substring(0, 10) + "...",
            ed25519MasterSeedPrefix: ed25519MasterSeed.substring(0, 10) + "...",
            ecdsaTssPubKeyPrefix: ecdsaTssPubKey.substring(0, 10) + "..."
        });
        
        return {
            secp256k1PubKey,
            ed25519MasterSeed,
            ecdsaTssPubKey
        };
    }
    
    /**
     * デフォルトウォレット作成
     * @param {string|null} preAcquiredJWT - 事前に取得したJWT（省略可能）。提供された場合、JWT取得をスキップする
     * @param {string[]} networks - ウォレット生成・登録対象のネットワーク一覧
     */
    async createDefaultWallets(preAcquiredJWT = null, networks = ['mainnet', 'testnet']) {
        try {
            console.log("🔄 Starting default wallet creation for masterId:", this.masterId);
            console.log("🔍 Debug info:", {
                masterId: this.masterId,
                storageInitialized: this.storage?.isInitialized,
                mpcInitialized: this.mpc?.isInitialized,
                walletInitialized: this.wallet ? true : false
            });
            
            const { secp256k1PubKey, ed25519MasterSeed, ecdsaTssPubKey } = await this.getWalletKeyMaterial();
            
            if (!preAcquiredJWT) {
                throw new Error('Wallet registration JWT is required before creating default wallets');
            }
            
            const sharedJWT = preAcquiredJWT;
            console.log("♻️ Using pre-acquired JWT for wallet registration (shared for all coins)");
            
            const networksToInitialize = Array.isArray(networks) && networks.length > 0
                ? Array.from(new Set(networks))
                : ['mainnet', 'testnet'];
            console.log("🌐 Networks scheduled for wallet creation:", networksToInitialize);
            for (const networkType of networksToInitialize) {
                await this.setupNetworkWallets(networkType, {
                    secp256k1PubKey,
                    ed25519MasterSeed,
                    ecdsaTssPubKey,
                    sharedJWT,
                    registerOnServer: true
                });
            }
            
            console.log("✅ Default wallet creation completed successfully for all networks");

        } catch (error) {
            console.error("❌ Default wallet creation failed:", error);
            console.error("Error details:", {
                message: error.message,
                stack: error.stack,
                masterId: this.masterId
            });
            throw error;
        }
    }

    /**
     * ネットワーク別のトークンウォレット作成
     */
    async createTokenWalletsForNetwork(networkType, allAddresses = {}) {
        // 現在のネットワークを一時的に設定（coins-libs.jsの関数が使用するため）
        const originalNetwork = sessionStorage.getItem('mpc.current_network');
        
        try {
            sessionStorage.setItem('mpc.current_network', networkType);

            // productsオブジェクトからトークンを動的に取得
            // tokentypeが空文字列でない（トークン）ものを全て処理
            const products = window.CoinsLibs?.products || window.products || {};
            const chainToAddressProp = window.CoinsLibs?.chainToAddressProp || {};
            const tokenRules = [];
            
            // coins-libs.jsの関数を取得
            const getContractAddress = window.CoinsLibs?.getContractAddress;
            const getERC20TokenContractAddress = window.CoinsLibs?.getERC20TokenContractAddress;
            const getPolygonTokenContractAddress = window.CoinsLibs?.getPolygonTokenContractAddress;
            
            // productsからトークンを抽出
            for (const [productId, product] of Object.entries(products)) {
                // tokentypeが空文字列でない場合はトークン
                if (product.tokentype && product.tokentype !== '') {
                    const chain = product.chain?.toLowerCase();
                    const addressProp = chainToAddressProp[chain];
                    
                    if (!addressProp) {
                        console.warn(`[${networkType}] ⚠️ Unknown chain for ${productId}: ${chain}, skipping`);
                        continue;
                    }
                    
                    // コントラクトアドレス取得関数を生成
                    const getContract = () => {
                        // まず getContractAddress を試す
                        if (getContractAddress) {
                            const contract = getContractAddress(productId, networkType);
                            if (contract) return contract;
                        }
                        
                        // フォールバック: チェーンごとの関数を使用
                        if (chain === 'polygon' && getPolygonTokenContractAddress) {
                            return getPolygonTokenContractAddress(productId);
                        } else if ((chain === 'ethereum' || chain === 'arbitrum' || chain === 'base' || chain === 'optimism' || chain === 'bsc' || chain === 'avalanche') && getERC20TokenContractAddress) {
                            return getERC20TokenContractAddress(productId);
                        }
                        
                        return null;
                    };
                    
                    tokenRules.push({
                        productId: productId,
                        addressProp: addressProp,
                        coinType: product.cointype || '60',
                        chain: chain,
                        getContract: getContract
                    });
                }
            }
            
            console.log(`[${networkType}] Found ${tokenRules.length} tokens to process`);

            for (const rule of tokenRules) {
                // チェーンに応じたベースアドレスを取得
                const baseAddress = allAddresses[rule.addressProp];

                if (!baseAddress) {
                    console.warn(`[${networkType}] ⚠️ Base address for ${rule.productId} not available, skipping token wallet creation`);
                    continue;
                }

                // coins-libs.jsの関数を使用してコントラクトアドレスを取得
                const tokenContract = rule.getContract();

                const tokenWallet = {
                    address: baseAddress,
                    productid: rule.productId,
                    cointype: rule.coinType,
                    tokenContract,
                    network: networkType,
                    createdAt: Date.now()
                };

                // ネットワーク別キーで保存（wallet.0.<network>.<productId>.address）
                this.saveWalletToSession(`wallet.0.${networkType}.${rule.productId}`, tokenWallet);
                await this.storage.storeWalletInfo(this.masterId, rule.productId, tokenWallet);
            }

            // 元のネットワーク設定を復元
            if (originalNetwork) {
                sessionStorage.setItem('mpc.current_network', originalNetwork);
            } else {
                sessionStorage.removeItem('mpc.current_network');
            }

            console.log(`[${networkType}] Token wallets created successfully`);
        } catch (error) {
            console.error(`[${networkType}] Token wallet creation failed:`, error);
            // エラー時も元のネットワーク設定を復元
            const originalNetwork = sessionStorage.getItem('mpc.current_network');
            if (originalNetwork && originalNetwork !== networkType) {
                sessionStorage.setItem('mpc.current_network', originalNetwork);
            }
        }
    }

    /**
     * ウォレット情報読み込み（曲線分離対応）
     */
    async loadWalletInformation() {
        try {
            console.log("🔄 Loading wallet information for masterId:", this.masterId);
            console.log("🔍 Debug info:", {
                masterId: this.masterId,
                storageInitialized: this.storage?.isInitialized,
                mpcInitialized: this.mpc?.isInitialized,
                walletInitialized: this.wallet ? true : false
            });
            
            // MPCメタデータの存在確認（曲線別）
            console.log("🔍 Checking MPC metadata for both curves...");
            const mpcMetadata = await this.storage.getAllCurveMetadata(this.masterId);
            console.log("📋 MPC metadata result:", mpcMetadata);
            
            if (!mpcMetadata || (!mpcMetadata.secp256k1 && !mpcMetadata.ed25519 && !mpcMetadata.ecdsa_tss)) {
                console.error("❌ MPC metadata not found for masterId:", this.masterId);
                console.log("📋 Available metadata keys:", await this.storage.getAllMetadataKeys());
                
                // ストレージの状態を詳細に確認
                console.log("🔍 Storage debug info:");
                console.log("  - Storage initialized:", this.storage?.isInitialized);
                console.log("  - Database object:", this.storage?.db ? "exists" : "null");
                console.log("  - Master ID in storage:", await this.storage.getMasterId());
                
                throw new Error(`MPC metadata not found for masterId: ${this.masterId}. Please ensure MPC wallet is properly initialized.`);
            }
            
            console.log("✅ MPC metadata found, proceeding with wallet loading");
            console.log("🔍 Metadata details:", {
                hasSecp256k1: !!mpcMetadata.secp256k1,
                hasEd25519: !!mpcMetadata.ed25519,
                hasEcdsaTss: !!mpcMetadata.ecdsa_tss,
                secp256k1PublicKeyLength: mpcMetadata.secp256k1?.publicKey?.length,
                ed25519PublicKeyLength: mpcMetadata.ed25519?.publicKey?.length,
                ecdsaTssPublicKeyLength: mpcMetadata.ecdsa_tss?.publicKey?.length
            });

            // 適切な公開鍵を準備 - 初期化フローと同じ方法
            let secp256k1PubKey = mpcMetadata.secp256k1?.publicKeyPackage?.verifying_key;
            let ed25519MasterSeed = mpcMetadata.ed25519?.publicKeyPackage?.verifying_key;
            let ecdsaTssPubKey = mpcMetadata.ecdsa_tss?.publicKey;

            // 公開鍵をhex文字列形式に変換
            const convertToHex = (key) => {
                if (!key) return null;
                
                // 既にhex文字列の場合
                if (typeof key === 'string' && /^[0-9a-fA-F]+$/.test(key)) {
                    return key;
                }
                
                // Base64形式の場合
                if (typeof key === 'string' && key.includes('=')) {
                    try {
                        const buffer = Buffer.from(key, 'base64');
                        return buffer.toString('hex');
                    } catch (error) {
                        console.warn("Failed to convert Base64 to hex:", error);
                    }
                }
                
                // オブジェクトの場合（JSON文字列に変換してから処理）
                if (typeof key === 'object') {
                    try {
                        const jsonStr = JSON.stringify(key);
                        const buffer = Buffer.from(jsonStr, 'utf8');
                        return buffer.toString('hex');
                    } catch (error) {
                        console.warn("Failed to convert object to hex:", error);
                    }
                }
                
                // その他の場合は文字列として扱う
                try {
                    const buffer = Buffer.from(String(key), 'utf8');
                    return buffer.toString('hex');
                } catch (error) {
                    console.warn("Failed to convert to hex:", error);
                    return null;
                }
            };

            // SECP256k1公開鍵の取得（JSON文字列対応）
            if (mpcMetadata.secp256k1?.publicKeyPackage) {
                try {
                    // publicKeyPackageがJSON文字列の場合はパース
                    const publicKeyPackage = typeof mpcMetadata.secp256k1.publicKeyPackage === 'string' 
                        ? JSON.parse(mpcMetadata.secp256k1.publicKeyPackage)
                        : mpcMetadata.secp256k1.publicKeyPackage;
                    
                    if (publicKeyPackage.verifying_key) {
                        secp256k1PubKey = publicKeyPackage.verifying_key;
                        console.log("✅ SECP256k1 public key extracted from publicKeyPackage (signin)");
                    }
                } catch (error) {
                    console.warn("⚠️ Failed to parse SECP256k1 publicKeyPackage:", error);
                }
            }

            // ED25519公開鍵の取得（JSON文字列対応）
            if (mpcMetadata.ed25519?.publicKeyPackage) {
                try {
                    // publicKeyPackageがJSON文字列の場合はパース
                    const publicKeyPackage = typeof mpcMetadata.ed25519.publicKeyPackage === 'string' 
                        ? JSON.parse(mpcMetadata.ed25519.publicKeyPackage)
                        : mpcMetadata.ed25519.publicKeyPackage;
                    
                    if (publicKeyPackage.verifying_key) {
                        ed25519MasterSeed = publicKeyPackage.verifying_key;
                        console.log("✅ ED25519 public key extracted from publicKeyPackage (signin)");
                    }
                } catch (error) {
                    console.warn("⚠️ Failed to parse ED25519 publicKeyPackage:", error);
                }
            }

            // ECDSA-TSS公開鍵の取得
            if (ecdsaTssPubKey) {
                console.log("✅ ECDSA-TSS public key loaded from metadata.publicKey");
            } else {
                console.warn("⚠️ ECDSA-TSS publicKey missing in metadata");
            }

            secp256k1PubKey = convertToHex(secp256k1PubKey);
            ed25519MasterSeed = convertToHex(ed25519MasterSeed);
            ecdsaTssPubKey = convertToHex(ecdsaTssPubKey);

            // ECDSA-TSS公開鍵をアンコンプレスト形式(65 bytes)に正規化（必要に応じて）
            if (ecdsaTssPubKey && ecdsaTssPubKey.length === 128) {
                ecdsaTssPubKey = '04' + ecdsaTssPubKey;
                console.log("🔧 Normalized ECDSA-TSS public key to uncompressed format (added 0x04 prefix)");
            }

            // 公開鍵の存在確認
            if (!secp256k1PubKey) {
                console.error("❌ secp256k1 public key not found in metadata");
                console.log("🔍 secp256k1 metadata structure:", mpcMetadata.secp256k1);
                throw new Error('secp256k1 public key not provided');
            }

            if (!ed25519MasterSeed) {
                console.error("❌ ed25519 public key not found in metadata");
                console.log("🔍 ed25519 metadata structure:", mpcMetadata.ed25519);
                throw new Error('ed25519 master seed not provided');
            }

            if (!ecdsaTssPubKey) {
                console.error("❌ ecdsa_tss public key not found in metadata");
                console.log("🔍 ecdsa_tss metadata structure:", mpcMetadata.ecdsa_tss);
                throw new Error('ecdsa_tss public key not provided');
            }

            console.log("✅ Public keys extracted and converted successfully:", {
                secp256k1PubKeyLength: secp256k1PubKey.length,
                ed25519MasterSeedLength: ed25519MasterSeed.length,
                ecdsaTssPubKeyLength: ecdsaTssPubKey.length,
                secp256k1PubKeyPrefix: secp256k1PubKey.substring(0, 10) + "...",
                ed25519MasterSeedPrefix: ed25519MasterSeed.substring(0, 10) + "..."
            });

            // 現在のネットワークを取得
            const currentNetwork = this.network || sessionStorage.getItem('mpc.current_network') || 'mainnet';
            console.log("🔧 Loading wallet information for network:", currentNetwork);
            
            // 新しいアドレス生成器を使用して全アドレスを一度に生成（ネットワーク指定）
            console.log("🔄 Generating all addresses using MPCAddressGenerator for network:", currentNetwork);
            const allAddresses = await this.wallet.addressGenerator.generateAllAddresses(currentNetwork, secp256k1PubKey, ed25519MasterSeed, ecdsaTssPubKey);
            console.log("✅ All addresses generated successfully for network:", currentNetwork);
            
            // P2WPKHではTaproot情報は不要（コメントアウト）
            // Taproot tweak情報をメタデータに保存
            // if (allAddresses.bitcoinTaprootInfo) {
            //     try {
            //         await this.mpc.storeTaprootTweakInfo(
            //             this.masterId,
            //             allAddresses.bitcoinTaprootInfo.taproot_internal_key,
            //             allAddresses.bitcoinTaprootInfo.taproot_tweak,
            //             allAddresses.bitcoinTaprootInfo.taproot_merkle_root
            //         );
            //         console.log("✅ Taproot tweak info stored to metadata");
            //     } catch (error) {
            //         console.error("❌ Failed to store Taproot tweak info:", error);
            //         throw error; // フォールバックなし
            //     }
            // }

            const supportedCoins = [
                // { productId: 'BTC', coinType: '0', name: 'Bitcoin', curve: 'secp256k1' }, for Taproot
                { productId: 'BTC',  coinType: '0',     name: 'Bitcoin',   curve: 'ecdsa_tss' },
                { productId: 'ETH',  coinType: '60',    name: 'Ethereum',  curve: 'ecdsa_tss' },
                { productId: 'POL',  coinType: '137',   name: 'Polygon',   curve: 'ecdsa_tss' },
                { productId: 'AVAX', coinType: '43114', name: 'Avalanche', curve: 'ecdsa_tss' },
                { productId: 'SOL',  coinType: '501',   name: 'Solana',    curve: 'ed25519'   },
                { productId: 'TON',  coinType: '607',   name: 'TON',       curve: 'ed25519'   }
            ];

            const walletLoadingPromises = supportedCoins.map(async (coin) => {
                try {
                    console.log(`🔄 Loading ${coin.name} wallet (${coin.curve})...`);
                    
                    // アドレス生成器から該当するアドレスを取得
                    const addresses = this.wallet.getAddressForCoinType(allAddresses, coin.coinType, coin.productId);
                    
                    // 適切な公開鍵を選択
                    let publicKey;
                    if (coin.curve === 'secp256k1') {
                        publicKey = secp256k1PubKey;
                    } else if (coin.curve === 'ecdsa_tss') {
                        publicKey = ecdsaTssPubKey;
                    } else {
                        publicKey = ed25519MasterSeed;
                    }
                    
                    const wallet = {
                        address: addresses.primary,
                        publicKey: publicKey,
                        // derivepath: HDWallet廃止により削除
                        addressindex: "0",
                        productid: coin.productId,
                        cointype: coin.coinType,
                        mpcEnabled: true,
                        guardianAuthMethod: 'JWT',
                        allAddresses: allAddresses, // 全アドレス情報を保存
                        alternatives: addresses.alternatives, // 代替アドレスも保存
                        curve: coin.curve,
                        createdAt: Date.now()
                    };

                    console.log(`✅ ${coin.name} wallet loaded:`, wallet.address);
                    console.log(`🔍 ${coin.name} alternative addresses:`, addresses.alternatives);
                    
                    // セッションストレージに保存（ネットワーク別キー）
                    this.saveWalletToSession(`wallet.0.${currentNetwork}.${coin.productId}`, wallet);
                    
                    console.log(`✅ ${coin.name} MPC wallet loaded and saved:`, wallet.address);
                    return { productId: coin.productId, success: true, wallet: wallet };

            } catch (error) {
                    console.error(`❌ Failed to load ${coin.name} wallet:`, error);
                    console.error(`🔍 Error details for ${coin.name}:`, {
                        message: error.message,
                        stack: error.stack,
                        coinType: coin.coinType,
                        productId: coin.productId,
                        curve: coin.curve
                    });
                    return { productId: coin.productId, success: false, error: error.message };
            }
            });

            const results = await Promise.allSettled(walletLoadingPromises);
            const successful = results.filter(result => result.status === 'fulfilled' && result.value.success);
            const failed = results.filter(result => result.status === 'fulfilled' && !result.value.success);
            
            console.log(`📊 Wallet loading results: ${successful.length}/${supportedCoins.length} successful`);
            
            if (failed.length > 0) {
                console.warn("⚠️ Some wallets failed to load:", failed.map(f => f.value));
            }

            // 成功したウォレットの詳細をログ出力
            successful.forEach(result => {
                const wallet = result.value.wallet;
                console.log(`📋 ${wallet.productid} wallet details:`, {
                    address: wallet.address,
                    curve: wallet.curve,
                    alternatives: wallet.alternatives,
                    hasAllAddresses: !!wallet.allAddresses
                });
            });

            console.log("✅ Wallet information loading completed successfully");
            
            // トークンウォレットも作成（allAddressesが利用可能なため）
            try {
                console.log("🔄 Creating token wallets for network:", currentNetwork);
                await this.createTokenWalletsForNetwork(currentNetwork, allAddresses);
                console.log("✅ Token wallets created successfully");
            } catch (tokenError) {
                console.warn("⚠️ Token wallet creation failed (non-critical):", tokenError);
                // トークンウォレットの作成失敗は非致命的なので、処理を続行
            }

        } catch (error) {
            console.error("❌ Wallet information loading failed:", error);
            console.error("Error details:", {
                message: error.message,
                stack: error.stack,
                masterId: this.masterId
            });
            throw error;
        }
    }

    // ==========================================
    // アプリケーション状態管理（既存を維持）
    // ==========================================

    /**
     * ログイン状態確認
     */
    isSignin() {
        try {
            // 緊急復旧済みの場合は特別処理
            const isEmergencyRecovered = sessionStorage.getItem('mpc.emergency_recovered') === 'true';
            const isRecovered = sessionStorage.getItem('mpc.recovered') === 'true';
            
            if (isEmergencyRecovered || isRecovered) {
                const masterId = this.getMasterId();
                const isInitialized = sessionStorage.getItem('mpc.initialized') === 'true';
                const isSignedIn = sessionStorage.getItem('mpc.signedin') === 'true';
                
                return masterId && isInitialized && isSignedIn;
            }
            
            // 通常のログイン状態確認
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
     * ログアウト（セッション情報のみクリア、永続データは保持）
     */
    signout() {
        try {
            console.log("🔄 Starting logout process (preserving persistent data)...");
            
            // セッション関連の情報のみをクリア（永続データは保持）
            const keysToRemove = [
                'mpc.signedin',
                'mpc.initialized',
                'mpc.masterid',
                'mpc.emergency_recovered',
                'mpc.recovered',
                'mpc.current_network',
                'guardian.jwt',
                'guardian.jwt.expiry'
            ];
            
            // ウォレット関連のセッション情報をクリア
            const walletKeys = Object.keys(sessionStorage).filter(key => 
                key.startsWith('wallet.') && 
                !key.includes('share') && 
                !key.includes('credential')
            );
            
            // 削除対象のキーを特定
            const allKeysToRemove = [...keysToRemove, ...walletKeys];
            
            // セッション情報のみを削除
            allKeysToRemove.forEach(key => {
                if (sessionStorage.hasOwnProperty(key)) {
                    sessionStorage.removeItem(key);
                    console.log(`🗑️ Removed session key: ${key}`);
                }
            });
            
            // 内部状態リセット（masterIdは保持）
            this.invalidateGuardianJWT(); // JWT無効化のみ
            
            console.log("✅ Logout completed - persistent data preserved");
            console.log("📊 Preserved data includes:");
            console.log("   - Encrypted shares");
            console.log("   - Passkey credentials");
            console.log("   - Wallet configurations");
            console.log("   - Master ID (for re-authentication)");
            
        } catch (error) {
            console.error("❌ Error during logout:", error);
        }
    }

    /**
     * 完全ログアウト（すべてのデータを削除）
     * ⚠️ 注意: この操作は元に戻せません
     */
    async completeSignout() {
        try {
            console.log("🚨 Starting complete logout (ALL DATA WILL BE DELETED)...");
            
            // 確認ダイアログ
            const confirmed = confirm(
                "⚠️ 完全ログアウト\n\n" +
                "この操作により、以下のすべてのデータが削除されます：\n" +
                "• ウォレット情報\n" +
                "• 暗号化シェア\n" +
                "• Passkeyクレデンシャル\n" +
                "• すべての設定\n\n" +
                "この操作は元に戻せません。\n\n" +
                "本当に続行しますか？"
            );
            
            if (!confirmed) {
                console.log("❌ Complete logout cancelled by user");
                return false;
            }
            
            // セッションストレージ完全クリア
            sessionStorage.clear();
            console.log("🗑️ Session storage cleared");
            
            // IndexedDBからmasterId削除
            if (this.storage && this.storage.isInitialized) {
                await this.storage.deleteMasterId();
                console.log("🗑️ Master ID deleted from IndexedDB");
            }
            
            // 内部状態完全リセット
            this.masterId = null;
            this.invalidateGuardianJWT();
            
            console.log("✅ Complete logout finished - ALL DATA DELETED");
            return true;
            
        } catch (error) {
            console.error("❌ Error during complete logout:", error);
            return false;
        }
    }

    /**
     * マスターID取得
     */
    getMasterId() {
        // インスタンス変数から取得
        if (this.masterId) {
            return this.masterId;
        }
        
        // 緊急復旧フラグを確認
        const isEmergencyRecovered = sessionStorage.getItem('mpc.emergency_recovered') === 'true';
        const isRecovered = sessionStorage.getItem('mpc.recovered') === 'true';
        
        // セッションストレージから取得（緊急復旧済みの場合は優先）
        try {
            const sessionMasterId = sessionStorage.getItem('mpc.masterid');
            if (sessionMasterId) {
                this.masterId = sessionMasterId; // インスタンス変数にも設定
                console.log("✅ Master ID retrieved from session storage:", this.masterId.substring(0, 8) + "...");
                return sessionMasterId;
            }
        } catch (error) {
            console.error("Failed to get masterId from session storage:", error);
        }
        
        // sessionStorageにも値がない場合は null を返す
        // 注意: IndexedDBからの取得は init() で既に実行されているため、ここでは行わない
        // init() が呼ばれていない場合、this.storage も初期化されていないため、
        // IndexedDBから取得しようとしても失敗する
        return null;
    }

    /**
     * マスターID設定
     */
    setMasterId(newMasterId) {
        this.masterId = newMasterId;
    }

    /**
     * ウォレットインスタンス取得
     */
    getWallet() {
        return this.wallet;
    }

    /**
     * セッション状態更新
     */
    updateSessionState(isSignedIn) {
        try {
            sessionStorage.setItem('mpc.initialized', 'true');
            sessionStorage.setItem('mpc.masterid', this.masterId || '');
            
            if (isSignedIn) {
                sessionStorage.setItem('mpc.signedin', 'true');
            } else {
                sessionStorage.removeItem('mpc.signedin');
            }
        } catch (error) {
            console.error("Failed to update session state:", error);
        }
    }

    // ==========================================
    // メール関連処理（既存を維持）
    // ==========================================

    /**
     * メール認証確認
     */
    async isEmailSetup() {
        try {
            const url = this.masterId ? 
                `/mpcapi/email/setup/check?masterId=${encodeURIComponent(this.masterId)}` : 
                '/mpcapi/email/setup/check';
                
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const data = await response.json();
            return data.status === 'OK' && data.isSetup === true;

        } catch (error) {
            console.warn("Failed to check email setup:", error);
            return false;
        }
    }

    /**
     * メール設定
     */
    async setEmail(masterId, email, authcode) {
        try {
            const response = await fetch('/mpcapi/email/setup', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    masterId: masterId,
                    email: email,
                    authcode: authcode,
                    timestamp: Date.now()
                })
            });

            const data = await response.json();
            return data.status === 'OK' ? 'OK' : data.message;

        } catch (error) {
            console.error("Email setting failed:", error);
            throw error;
        }
    }

    /**
     * 復元用メール認証
     */
    async verifyEmailForRestore(email, verificationCode) {
        try {
            const response = await fetch('/mpcapi/email/verify-restore', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify({
                    email: email,
                    verificationCode: verificationCode,
                    timestamp: Date.now()
                })
            });

            const data = await response.json();
            
            if (data.status === 'OK') {
                return {
                    success: true,
                    masterId: data.masterId,
                    restoreToken: data.restoreToken
                };
            } else {
                return {
                    success: false,
                    error: data.message || 'Email verification failed'
                };
            }

        } catch (error) {
            console.error("Email verification for restore failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================
    // ユーティリティ関数（既存を維持）
    // ==========================================

    /**
     * ウォレット情報をセッションに保存
     */
    saveWalletToSession(prefix, walletData) {
        try {
            if (walletData.address) sessionStorage.setItem(`${prefix}.address`, walletData.address);
            if (walletData.publicKey) sessionStorage.setItem(`${prefix}.publicKey`, walletData.publicKey);
            // if (walletData.derivepath) sessionStorage.setItem(`${prefix}.derivepath`, walletData.derivepath); // HDWallet廃止により削除
            if (walletData.addressindex) sessionStorage.setItem(`${prefix}.addressindex`, walletData.addressindex);
        } catch (error) {
            console.error("Failed to save wallet to session:", error);
        }
    }

    /**
     * サーバーにウォレット登録
     * @param {string} productId - コインのproductId
     * @param {object} walletData - ウォレットデータ
     * @param {string} [jwtToken] - オプション: 既存のJWTトークン（提供されない場合は新規取得）
     */
    async registerWalletWithServer(productId, walletData, jwtToken = null) {
        try {
            // 既にローカルストレージにウォレット情報がある場合は、サーバーにも登録済みの可能性が高い
            // ただし、緊急復旧時などはサーバー側の登録が失われている可能性があるため、常に登録を試みる
            // サーバー側で ON CONFLICT により既存レコードは更新される（エラーにはならない）
            
            if (!jwtToken) {
                throw new Error('Server JWT is required to register wallet on server');
            }
            console.log(`♻️ Using provided JWT for ${productId} wallet registration`);

            // ネットワーク情報を取得（walletDataから、または現在のネットワーク設定から）
            const network = walletData.network || this.network || sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            const response = await fetch('/walletapi/wallet/register', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Authorization': `Bearer ${jwtToken}`
                },
                body: JSON.stringify({
                    masterId: this.masterId,
                    productId: productId,
                    address: walletData.address,
                    publicKey: walletData.publicKey,
                    publicKeyLength: walletData.publicKey ? walletData.publicKey.length : undefined,
                    network: network, // ネットワーク情報を追加
                    // derivePath: HDWallet廃止により削除
                    addressindex: walletData.addressindex || "0",
                    cointype: walletData.cointype,
                    curve: walletData.curve,
                    mpcEnabled: walletData.mpcEnabled !== undefined ? walletData.mpcEnabled : true,
                    guardianAuthMethod: walletData.guardianAuthMethod || 'JWT',
                    timestamp: Date.now()
                })
            });

            const result = await response.json();
            if (result.status !== 'OK') {
                console.error(`❌ Failed to register ${productId} wallet with server:`, result.message);
                throw new Error(`Wallet registration failed for ${productId}: ${result.message}`);
            } else {
                console.log(`✅ ${productId} wallet registered with server successfully (or updated if already exists)`);
            }

        } catch (error) {
            console.error(`❌ Failed to register ${productId} wallet with server:`, error);
            // エラーを再スローして、呼び出し元で処理できるようにする
            throw error;
        }
    }

    /**
     * マスターID生成
     */
    async generateMasterId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const combined = `${timestamp}-${random}`;
        
        // ハッシュ化
        const encoder = new TextEncoder();
        const data = encoder.encode(combined);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return 'btv_' + hashHex.substring(0, 16);
    }

    /**
     * サーバーJWT取得（チャレンジ-レスポンス方式）
     * @param {string} masterId - マスターID
     * @param {string} action - アクション（例: 'wallet_register'）
     * @param {object} context - 追加コンテキスト情報
     * @returns {Promise<string|null>} JWTトークン（失敗時はnull）
     */
    async obtainServerJWT(masterId, action = 'wallet_register', context = {}) {
        try {
            console.log(`🔐 Obtaining Server JWT for action: ${action}...`);
            
            // Step 1: チャレンジ取得
            const beginResponse = await fetch('/mpcapi/auth/server-jwt/begin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    action: action
                })
            });

            if (!beginResponse.ok) {
                const errorData = await beginResponse.json().catch(() => ({}));
                throw new Error(`Challenge request failed: ${beginResponse.status} - ${errorData.error || 'Unknown error'}`);
            }

            const beginData = await beginResponse.json();
            if (!beginData.success || !beginData.options) {
                throw new Error('Invalid challenge response');
            }

            const { options, sessionKey } = beginData;

            // Step 2: クライアント側でパスキー認証実行（サーバーのチャレンジを使用）
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: this.mpc.base64urlToBuffer(options.challenge),
                    rpId: options.rpId,
                    allowCredentials: options.allowCredentials?.map(cred => ({
                        id: this.mpc.base64urlToBuffer(cred.id),
                        type: cred.type,
                        transports: cred.transports
                    })),
                    userVerification: options.userVerification || 'required',
                    timeout: options.timeout || 60000
                }
            });

            if (!assertion) {
                throw new Error('Passkey authentication failed');
            }

            // Step 3: 認証結果を送信してJWT取得
            const credential = {
                id: this.mpc.bufferToBase64url(new Uint8Array(assertion.rawId)),
                rawId: Array.from(new Uint8Array(assertion.rawId)),
                type: assertion.type,
                response: {
                    clientDataJSON: Array.from(new Uint8Array(assertion.response.clientDataJSON)),
                    authenticatorData: Array.from(new Uint8Array(assertion.response.authenticatorData)),
                    signature: Array.from(new Uint8Array(assertion.response.signature)),
                    userHandle: assertion.response.userHandle ? Array.from(new Uint8Array(assertion.response.userHandle)) : null
                }
            };

            const completeResponse = await fetch('/mpcapi/auth/server-jwt/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterId: masterId,
                    sessionKey: sessionKey,
                    credential: credential,
                    challengeKey: options.challengeKey,
                    emailVerified: true,
                    context: {
                        ...context,
                        masterId: masterId
                    }
                })
            });

            if (completeResponse.ok) {
                const jwtData = await completeResponse.json();
                const jwt = jwtData.jwt;
                if (jwt) {
                    console.log(`✅ Server JWT obtained for action: ${action}`);
                    return jwt;
                }
            } else {
                const errorData = await completeResponse.json().catch(() => ({}));
                throw new Error(errorData.error || 'JWT issuance failed');
            }
        } catch (error) {
            console.error(`❌ Failed to obtain Server JWT for action ${action}:`, error);
            return null;
        }
    }

    /**
     * サーバーにユーザー情報を登録（チャレンジ-レスポンス方式でパスキー登録）
     * 注意: webauthnCredentialは送信しない（セキュリティ上の理由）
     * パスキー登録はチャレンジ-レスポンス方式で行い、サーバー側で検証して公開鍵のみを保存
     */
    async registerUserWithServer(masterId, credential = null) {
        try {
            const serverUrl = this.config.serverUrl || 'http://localhost:3000';
            
            // Step 1: ユーザーアカウント作成（masterIdのみ）
            const userResponse = await fetch(`${serverUrl}/mpcapi/user/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    masterId: masterId
                })
            });

            if (!userResponse.ok) {
                throw new Error(`User registration failed: ${userResponse.status} ${userResponse.statusText}`);
            }

            const userResult = await userResponse.json();
            if (!userResult.success) {
                throw new Error(`User registration failed: ${userResult.error}`);
            }

            console.log("✅ User account created on server");

            // Step 2: パスキー登録（チャレンジ-レスポンス方式）
            // credentialが提供されている場合のみパスキー登録を実行
            if (credential) {
                try {
                    console.log("🔐 Registering passkey with server (challenge-response)...");
                    
                    // Step 2-1: チャレンジ取得
                    const beginResponse = await fetch(`${serverUrl}/mpcapi/auth/webauthn/register/begin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            masterId: masterId,
                            userDisplayName: `BitVoy User (${masterId.substring(0, 8)}...)`
                        })
                    });

                    if (!beginResponse.ok) {
                        const errorData = await beginResponse.json().catch(() => ({}));
                        throw new Error(`Passkey registration challenge failed: ${beginResponse.status} - ${errorData.error || 'Unknown error'}`);
                    }

                    const beginData = await beginResponse.json();
                    if (!beginData.success || !beginData.options) {
                        throw new Error('Invalid passkey registration challenge response');
                    }

                    const { options, expires } = beginData;

                    // Step 2-2: クライアント側でパスキー登録実行（サーバーのチャレンジを使用）
                    // 注意: 既に作成されたcredentialを使用するのではなく、サーバーのチャレンジで新しい登録を行う
                    // ただし、既にcredentialが存在する場合は、それを再利用するか、新しい登録を行うか選択する必要がある
                    // ここでは、既存のcredentialを使用せず、サーバーのチャレンジで新しい登録を行う
                    const registrationCredential = await navigator.credentials.create({
                        publicKey: {
                            challenge: this.mpc.base64urlToBuffer(options.challenge),
                            rp: {
                                name: options.rp.name,
                                id: options.rp.id
                            },
                            user: {
                                id: this.mpc.base64urlToBuffer(options.user.id),
                                name: options.user.name,
                                displayName: options.user.displayName
                            },
                            pubKeyCredParams: options.pubKeyCredParams,
                            authenticatorSelection: options.authenticatorSelection,
                            timeout: options.timeout || 60000,
                            attestation: options.attestation || 'direct',
                            excludeCredentials: options.excludeCredentials?.map(cred => ({
                                id: this.mpc.base64urlToBuffer(cred.id),
                                type: cred.type,
                                transports: cred.transports
                            }))
                        }
                    });

                    if (!registrationCredential) {
                        throw new Error('Passkey registration failed');
                    }

                    // Step 2-3: 登録結果を送信してサーバー側で検証
                    // 注意: credentialは認証用のみ（webauthnCredential全体は送信しない）
                    const registrationCredentialData = {
                        id: this.mpc.bufferToBase64url(new Uint8Array(registrationCredential.rawId)),
                        rawId: Array.from(new Uint8Array(registrationCredential.rawId)),
                        type: registrationCredential.type,
                        response: {
                            clientDataJSON: Array.from(new Uint8Array(registrationCredential.response.clientDataJSON)),
                            attestationObject: Array.from(new Uint8Array(registrationCredential.response.attestationObject))
                        }
                    };

                    const completeResponse = await fetch(`${serverUrl}/mpcapi/auth/webauthn/register/complete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            masterId: masterId,
                            credential: registrationCredentialData,
                            challengeKey: options.challengeKey
                        })
                    });

                    if (!completeResponse.ok) {
                        const errorData = await completeResponse.json().catch(() => ({}));
                        throw new Error(`Passkey registration verification failed: ${completeResponse.status} - ${errorData.error || 'Unknown error'}`);
                    }

                    const completeData = await completeResponse.json();
                    if (!completeData.success) {
                        throw new Error(`Passkey registration verification failed: ${completeData.error || 'Unknown error'}`);
                    }

                    console.log("✅ Passkey registered with server (public key only stored)");
                } catch (passkeyError) {
                    console.warn("⚠️ Passkey registration with server failed:", passkeyError);
                    // パスキー登録失敗は致命的ではないので、警告のみ
                    console.warn("⚠️ Continuing without passkey registration on server...");
                }
            } else {
                console.log("ℹ️ No credential provided, skipping passkey registration on server");
            }

            console.log("✅ User registered with server successfully");
            return userResult;

        } catch (error) {
            console.error("❌ Failed to register user with server:", error);
            // サーバー登録失敗は致命的ではないので、エラーを投げない
            console.warn("⚠️ Continuing without server registration...");
        }
    }

    /**
     * ダイアログ表示
     */
    showDialog(title, message) {
        const dialog = document.querySelector('#bitvoy-dialog');
        if (dialog && typeof dialog.showModal === "function") {
            // i18nextが利用可能な場合は翻訳を適用
            const translatedTitle = (window.i18next && window.i18next.t) ? window.i18next.t(title) : title;
            const translatedMessage = (window.i18next && window.i18next.t) ? window.i18next.t(message) : message;
            
            document.querySelector('#bitvoy-dialog h2').textContent = translatedTitle;
            document.querySelector('#bitvoy-dialog p').textContent = translatedMessage;
            dialog.showModal();
        } else {
            alert(`${title}: ${message}`);
        }
    }

    /**
     * オブジェクトをURLエンコード文字列に変換
     */
    serialize(obj) {
        const str = [];
        for (let p in obj) {
            if (obj.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        }
        return str.join("&");
    }

    async emergencyRecovery(email, code, action = 'emergency_restore') {
        try {
            // リカバリーフロー開始: /mpcapi/auth/recovery/start でチャレンジを取得（JWT取得用）
            console.log("🔄 Starting recovery flow for JWT acquisition...");
            const recoveryStartResponse = await fetch(`${this.config.serverUrl}/mpcapi/auth/recovery/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!recoveryStartResponse.ok) {
                const errorData = await recoveryStartResponse.json().catch(() => ({}));
                throw new Error(`Recovery start failed: ${recoveryStartResponse.status} - ${errorData.error || 'Unknown error'}`);
            }

            const recoveryOptions = await recoveryStartResponse.json();
            if (!recoveryOptions.success || !recoveryOptions.challengeKey || !recoveryOptions.challenge) {
                throw new Error('Invalid recovery options response');
            }

            const recoveryChallengeKey = recoveryOptions.challengeKey;
            const recoveryChallenge = recoveryOptions.challenge;
            const recoveryRpId = recoveryOptions.rpId || window.location.hostname;
            console.log("✅ Recovery challenge obtained for JWT acquisition");

            // チャレンジをUint8Arrayに変換
            const challengeBuffer = typeof recoveryChallenge === 'string'
                ? this.mpc.base64urlToBuffer(recoveryChallenge)
                : new Uint8Array(recoveryChallenge);

            // Passkey認証を実行（リカバリーフローのチャレンジを使用）
            console.log("🔐 Executing Passkey authentication with recovery challenge...");
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: challengeBuffer,
                    rpId: recoveryRpId,
                    userVerification: recoveryOptions.userVerification || 'required',
                    timeout: recoveryOptions.timeout || 60000,
                    allowCredentials: recoveryOptions.allowCredentials || [] // 空でdiscoverable credential使用
                }
            });

            if (!assertion) {
                throw new Error('Passkey authentication failed');
            }

            console.log("✅ Passkey authentication successful with recovery challenge");

            // masterIdを取得（既に取得した認証結果とchallengeKeyを使用）
            // recoverMasterId関数を使用することで、/mpcapi/auth/recovery/finishの重複呼び出しを防ぐ
            const recoveryResult = await this.recoverMasterId({
                existingAssertion: assertion,
                challengeKey: recoveryChallengeKey
            });

            if (!recoveryResult.success || !recoveryResult.masterId) {
                throw new Error('Failed to recover masterId: ' + (recoveryResult.error || 'Unknown error'));
            }

            const masterId = recoveryResult.masterId;
            const walletRegisterJWT = recoveryResult.walletRegisterJWT; // 既に取得したJWTを保存
            console.log("✅ Master ID recovered:", masterId);
            if (walletRegisterJWT) {
                console.log("✅ Wallet registration JWT obtained from recovery flow");
            } else {
                console.warn("⚠️ Wallet registration JWT not provided in recovery response");
            }

            // masterIdを保存
            await this.storage.storeMasterId(masterId);
            this.masterId = masterId;
            sessionStorage.setItem('mpc.masterid', masterId);
            sessionStorage.setItem('mpc.recovered', 'true');

            // クレデンシャルを保持（deviceId生成用）
            this.credential = assertion;

            // MPCコンポーネントに緊急復旧を委譲（masterIdと認証結果を渡す）
            // recoverFromCredentialは既に取得した認証結果を使用するため、/mpcapi/auth/recovery/finishは呼ばれない
            let mpcRecoveryResult;
            // メール機能をコメントアウト: emailとcodeが提供されている場合は、email認証を実行してからrecoverFromCredentialを呼び出す
            // そうでない場合は、recoverFromCredentialを直接呼び出す
            /*
            if (email && code) {
                // email認証を実行（masterIdは既に取得済みだが、email認証が必要な場合に備えて）
                const emailAuthResult = await this.mpc.authenticateWithEmail(email, code);
                if (!emailAuthResult.success) {
                    throw new Error('Email authentication failed: ' + emailAuthResult.error);
                }
                console.log('✅ Email authentication successful');
            }
            */

            // recoverFromCredentialを直接呼び出す（既に取得した認証結果を使用）
            // これにより、/mpcapi/auth/recovery/finishの重複呼び出しを防ぐ
            mpcRecoveryResult = await this.mpc.recoverFromCredential(masterId, null, assertion);

            const result = {
                success: true,
                masterId: masterId,
                emergencyRecovered: true,
                recoveryResult: mpcRecoveryResult,
                timestamp: Date.now()
            };
            
            if (result.success && result.masterId) {
                // 緊急復旧成功時、masterIdの一貫性を確認
                console.log("🔄 Checking masterId consistency after emergency recovery...");
                
                // 既存のmasterIdを取得
                const existingMasterId = await this.storage.getMasterId();
                const sessionMasterId = sessionStorage.getItem('mpc.masterid');
                
                console.log("MasterId comparison:", {
                    existing: existingMasterId,
                    session: sessionMasterId,
                    recovered: result.masterId
                });
                
                // 既存のmasterIdと復旧されたmasterIdが一致することを確認
                if (existingMasterId && existingMasterId !== result.masterId) {
                    console.warn("⚠️ MasterId mismatch detected during emergency recovery!");
                    console.warn("Existing masterId:", existingMasterId);
                    console.warn("Recovered masterId:", result.masterId);
                    
                    // 既存のmasterIdを優先（ウォレット資産の継続性を保つため）
                    console.log("🔄 Using existing masterId to preserve wallet assets...");
                    result.masterId = existingMasterId;
                }
                
                // IndexedDBを更新（一貫性確認後）
                console.log("🔄 Updating IndexedDB after emergency recovery...");
                await this.storage.updateMasterId(result.masterId);
                
                // インスタンス変数も更新
                this.masterId = result.masterId;
                
                // クレデンシャルを保持（deviceId生成に必要）
                // authenticateWithPasskey は assertion を返すので、それを credential として保存
                if (result.recoveryResult && result.recoveryResult.authResult) {
                    if (result.recoveryResult.authResult.assertion) {
                        this.credential = result.recoveryResult.authResult.assertion;
                        console.log("✅ Credential (assertion) saved for deviceId generation");
                    } else if (result.recoveryResult.authResult.credential) {
                        this.credential = result.recoveryResult.authResult.credential;
                        console.log("✅ Credential saved for deviceId generation");
                    } else {
                        console.warn("⚠️ Credential (assertion) not found in recovery result, deviceId generation may fail");
                    }
                } else {
                    console.warn("⚠️ Recovery result or authResult not found, deviceId generation may fail");
                }
                
                // sessionStorageにmasterIdを設定（BitVoyWalletが使用するため）
                sessionStorage.setItem('mpc.masterid', result.masterId);
                console.log("✅ SessionStorage updated with masterId:", result.masterId);
                
                // 緊急復旧時に既存のウォレット関連のセッションストレージをクリア
                console.log("🧹 Clearing existing wallet session storage for emergency recovery...");
                const keysToClear = Object.keys(sessionStorage).filter(key => 
                    key.startsWith('wallet.') || 
                    key.startsWith('mpc.addresses_') ||
                    key.startsWith('mpc.reshare_')
                );
                
                keysToClear.forEach(key => {
                    console.log(`🗑️ Clearing session storage key: ${key}`);
                    sessionStorage.removeItem(key);
                });
                
                console.log(`✅ Cleared ${keysToClear.length} wallet-related session storage keys`);
                
                console.log("✅ IndexedDB updated after emergency recovery with consistent masterId");
                
                // sessionStorageにmasterIdを設定（BitVoyWalletが使用するため）
                // BitVoyMPC.emergencyRecoveryでも設定されるが、ここで確実に更新する
                sessionStorage.setItem('mpc.masterid', result.masterId);
                console.log("✅ SessionStorage updated with masterId:", result.masterId);
                
                // 緊急復旧後にウォレットをサーバーに登録（JWT取得が必要）
                console.log("🔄 Registering wallets with server after emergency recovery...");
                try {
                    // 既に取得したwalletRegisterJWTを使用（重複呼び出しを防ぐ）
                    if (!walletRegisterJWT) {
                        console.warn("⚠️ Wallet registration JWT not provided in recovery result, skipping wallet registration");
                        console.log("ℹ️ Wallets can be registered later using the registration flow");
                    } else {
                        console.log("✅ Using wallet registration JWT from recovery flow (no duplicate API call)");
                        
                        // JWTを使用してウォレットを登録
                        await this.createDefaultWallets(walletRegisterJWT, ['mainnet', 'testnet']);
                        console.log("✅ Wallets registered with server after emergency recovery");
                    }
                } catch (error) {
                    console.error("❌ Failed to register wallets with server after emergency recovery:", error);
                    // ウォレット登録が失敗した場合は警告のみ（緊急復旧は成功）
                    console.warn("⚠️ Emergency recovery succeeded but wallet registration failed. Wallets can be registered later.");
                }
                
                // UI状態更新（通常の初期化フローと同様）
                console.log("🔄 Updating session state after emergency recovery...");
                this.updateSessionState(true);
                console.log("✅ Session state updated");
            }
            
            return result;
        } catch (error) {
            console.error("Emergency recovery failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 緊急復旧後のアドレス再生成（Reshare対応版）
     */
    async regenerateAddressesAfterEmergencyRecovery() {
        try {
            console.log("🔄 Regenerating addresses after emergency recovery with Reshare...");
            
            // MPCメタデータの存在確認（曲線別）- 初期化フローと同じ方法
            console.log("🔍 Checking MPC metadata for both curves...");
            const mpcMetadata = await this.storage.getAllCurveMetadata(this.masterId);
            console.log("📋 MPC metadata result:", mpcMetadata);
            
            if (!mpcMetadata || (!mpcMetadata.secp256k1 && !mpcMetadata.ed25519 && !mpcMetadata.ecdsa_tss)) {
                console.error("❌ MPC metadata not found for masterId:", this.masterId);
                console.log("📋 Available metadata keys:", await this.storage.getAllMetadataKeys());
                
                // ストレージの状態を詳細に確認
                console.log("🔍 Storage debug info:");
                console.log("  - Storage initialized:", this.storage?.isInitialized);
                console.log("  - Database object:", this.storage?.db ? "exists" : "null");
                console.log("  - Master ID in storage:", await this.storage.getMasterId());
                
                throw new Error(`MPC metadata not found for masterId: ${this.masterId}. Please ensure MPC wallet is properly initialized.`);
            }
            
            console.log("✅ MPC metadata found, proceeding with address regeneration");
            console.log("🔍 Metadata details:", {
                hasSecp256k1: !!mpcMetadata.secp256k1,
                hasEd25519: !!mpcMetadata.ed25519,
                hasEcdsaTss: !!mpcMetadata.ecdsa_tss,
                secp256k1PublicKeyLength: mpcMetadata.secp256k1?.publicKey?.length,
                ed25519PublicKeyLength: mpcMetadata.ed25519?.publicKey?.length,
                ecdsaTssPublicKeyLength: mpcMetadata.ecdsa_tss?.publicKey?.length,
                reshareCompleted: mpcMetadata.reshareCompleted,
                curve: mpcMetadata.curve
            });

            // 適切な公開鍵を準備 - 緊急復旧後の処理専用
            let secp256k1PubKey = null;
            let ed25519MasterSeed = null;
            let ecdsaTssPubKey = mpcMetadata.ecdsa_tss?.publicKey;

            // SECP256k1公開鍵の取得（緊急復旧後のJSON文字列対応）
            if (mpcMetadata.secp256k1?.publicKeyPackage) {
                try {
                    // publicKeyPackageがJSON文字列の場合はパース
                    const publicKeyPackage = typeof mpcMetadata.secp256k1.publicKeyPackage === 'string' 
                        ? JSON.parse(mpcMetadata.secp256k1.publicKeyPackage)
                        : mpcMetadata.secp256k1.publicKeyPackage;
                    
                    if (publicKeyPackage.verifying_key) {
                        secp256k1PubKey = publicKeyPackage.verifying_key;
                        console.log("✅ SECP256k1 public key extracted from publicKeyPackage (emergency recovery)");
                    }
                } catch (error) {
                    console.warn("⚠️ Failed to parse SECP256k1 publicKeyPackage:", error);
                }
            }

            // ED25519公開鍵の取得（緊急復旧後のJSON文字列対応）
            if (mpcMetadata.ed25519?.publicKeyPackage) {
                try {
                    // publicKeyPackageがJSON文字列の場合はパース
                    const publicKeyPackage = typeof mpcMetadata.ed25519.publicKeyPackage === 'string' 
                        ? JSON.parse(mpcMetadata.ed25519.publicKeyPackage)
                        : mpcMetadata.ed25519.publicKeyPackage;
                    
                    if (publicKeyPackage.verifying_key) {
                        ed25519MasterSeed = publicKeyPackage.verifying_key;
                        console.log("✅ ED25519 public key extracted from publicKeyPackage (emergency recovery)");
                    }
                } catch (error) {
                    console.warn("⚠️ Failed to parse ED25519 publicKeyPackage:", error);
                }
            }

            // 公開鍵をhex文字列形式に変換
            const convertToHex = (key) => {
                if (!key) return null;
                
                // 既にhex文字列の場合
                if (typeof key === 'string' && /^[0-9a-fA-F]+$/.test(key)) {
                    return key;
                }
                
                // Base64形式の場合
                if (typeof key === 'string' && key.includes('=')) {
                    try {
                        const buffer = Buffer.from(key, 'base64');
                        return buffer.toString('hex');
                    } catch (error) {
                        console.warn("Failed to convert Base64 to hex:", error);
                    }
                }
                
                // オブジェクトの場合（JSON文字列に変換してから処理）
                if (typeof key === 'object') {
                    try {
                        const jsonStr = JSON.stringify(key);
                        const buffer = Buffer.from(jsonStr, 'utf8');
                        return buffer.toString('hex');
                    } catch (error) {
                        console.warn("Failed to convert object to hex:", error);
                    }
                }
                
                // その他の場合は文字列として扱う
                try {
                    const buffer = Buffer.from(String(key), 'utf8');
                    return buffer.toString('hex');
                } catch (error) {
                    console.warn("Failed to convert to hex:", error);
                    return null;
                }
            };

            secp256k1PubKey = convertToHex(secp256k1PubKey);
            ed25519MasterSeed = convertToHex(ed25519MasterSeed);

            // 公開鍵の存在確認
            if (!secp256k1PubKey) {
                console.error("❌ secp256k1 public key not found in metadata");
                console.log("🔍 secp256k1 metadata structure:", mpcMetadata.secp256k1);
                throw new Error('secp256k1 public key not provided');
            }

            if (!ed25519MasterSeed) {
                console.error("❌ ed25519 public key not found in metadata");
                console.log("🔍 ed25519 metadata structure:", mpcMetadata.ed25519);
                throw new Error('ed25519 master seed not provided');
            }

            // ECDSA-TSS公開鍵の取得
            if (ecdsaTssPubKey) {
                console.log("✅ ECDSA-TSS public key loaded from metadata.publicKey");
            } else {
                console.warn("⚠️ ECDSA-TSS publicKey missing in metadata");
            }

            ecdsaTssPubKey = convertToHex(ecdsaTssPubKey);

            // ECDSA-TSS公開鍵をアンコンプレスト形式(65 bytes)に正規化（必要に応じて）
            if (ecdsaTssPubKey && ecdsaTssPubKey.length === 128) {
                ecdsaTssPubKey = '04' + ecdsaTssPubKey;
                console.log("🔧 Normalized ECDSA-TSS public key to uncompressed format (added 0x04 prefix)");
            }

            // 公開鍵の存在確認
            if (!ecdsaTssPubKey) {
                console.error("❌ ecdsa_tss public key not found in metadata");
                console.log("🔍 ecdsa_tss metadata structure:", mpcMetadata.ecdsa_tss);
                throw new Error('ecdsa_tss public key not provided');
            }

            console.log("✅ Public keys extracted and converted successfully:", {
                secp256k1PubKeyLength: secp256k1PubKey.length,
                ed25519MasterSeedLength: ed25519MasterSeed.length,
                ecdsaTssPubKeyLength: ecdsaTssPubKey.length,
                secp256k1PubKeyPrefix: secp256k1PubKey.substring(0, 10) + "...",
                ed25519MasterSeedPrefix: ed25519MasterSeed.substring(0, 10) + "...",
                ecdsaTssPubKeyPrefix: ecdsaTssPubKey.substring(0, 10) + "..."
            });

            // 現在のネットワークを取得
            const currentNetwork = this.network || sessionStorage.getItem('mpc.current_network') || 'mainnet';
            console.log("🔧 Regenerating addresses for network:", currentNetwork);
            
            // 新しいアドレス生成器を使用して全アドレスを一度に生成 - 初期化フローと同じ方法（ネットワーク指定）
            console.log("🔄 Generating all addresses using MPCAddressGenerator for network:", currentNetwork);
            const allAddresses = await this.wallet.addressGenerator.generateAllAddresses(currentNetwork, secp256k1PubKey, ed25519MasterSeed, ecdsaTssPubKey);
            console.log("✅ All addresses generated successfully for network:", currentNetwork);

            // アドレス生成結果の詳細ログ
            console.log("📊 Address generation results:", {
                allAddresses: allAddresses,
                keys: Object.keys(allAddresses),
                errors: allAddresses.errors || []
            });
            
            // 各ブロックチェーンのウォレットを再作成 - 初期化フローと同じ方法
            const supportedCoins = this.getSupportedCoinsForNetwork(currentNetwork);

            const regeneratedWallets = {};
            for (const coin of supportedCoins) {
                try {
                    console.log(`🔄 Regenerating ${coin.name} wallet (${coin.curve})...`);
                    
                    // アドレス生成器から該当するアドレスを取得 - 初期化フローと同じ方法
                    const addresses = this.wallet.getAddressForCoinType(allAddresses, coin.coinType, coin.productId);
                    
                    // 適切な公開鍵を選択
                    let publicKey;
                    if (coin.curve === 'secp256k1') {
                        publicKey = secp256k1PubKey;
                    } else if (coin.curve === 'ecdsa_tss') {
                        publicKey = ecdsaTssPubKey;
                    } else {
                        publicKey = ed25519MasterSeed;
                    }
                    
                    const wallet = {
                        address: addresses.primary,
                        publicKey: publicKey,
                        // derivepath: HDWallet廃止により削除
                        addressindex: "0",
                        productid: coin.productId,
                        cointype: coin.coinType,
                        mpcEnabled: true,
                        guardianAuthMethod: 'JWT',
                        allAddresses: allAddresses, // 全アドレス情報を保存
                        alternatives: addresses.alternatives, // 代替アドレスも保存
                        curve: coin.curve,
                        createdAt: Date.now()
                    };

                    console.log(`✅ ${coin.name} wallet regenerated:`, wallet.address);
                    console.log(`🔍 ${coin.name} alternative addresses:`, addresses.alternatives);
                    
                    // セッションストレージに保存（ネットワーク別キー）
                    this.saveWalletToSession(`wallet.0.${currentNetwork}.${coin.productId}`, wallet);
                    
                    regeneratedWallets[coin.productId] = {
                        address: wallet.address,
                        coinType: coin.coinType,
                        name: coin.name,
                        curve: coin.curve
                    };
                        
                    console.log(`✅ ${coin.name} MPC wallet regenerated and saved:`, wallet.address);
                } catch (error) {
                    console.error(`❌ Failed to regenerate ${coin.name} wallet:`, error);
                    console.error(`🔍 Error details for ${coin.name}:`, {
                        message: error.message,
                        stack: error.stack,
                        coinType: coin.coinType,
                        productId: coin.productId,
                        curve: coin.curve
                    });
                }
            }

            // エラーがある場合はログ出力
            if (allAddresses.errors && allAddresses.errors.length > 0) {
                console.warn("⚠️ Address generation errors:", allAddresses.errors);
            }

            // 復旧完了フラグを設定（初期化フローと統一）
            sessionStorage.setItem('mpc.addresses_regenerated', 'true');

            // 生成されたウォレットの詳細ログ
            console.log("📊 Regenerated wallets summary:", {
                totalWallets: Object.keys(regeneratedWallets).length,
                wallets: regeneratedWallets,
                sessionStorageKeys: Object.keys(sessionStorage).filter(key => key.startsWith('wallet.'))
            });

            console.log("✅ All addresses regenerated after emergency recovery with Reshare");
            return {
                success: true,
                wallets: regeneratedWallets,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error("❌ Address regeneration after emergency recovery failed:", error);
            throw error;
        }
    }

    /**
     * Reshare機能を使用したウォレット復旧
     */
    async recoverWalletWithReshare(email, code, curve = 'secp256k1') {
        try {
            console.log(`🔄 Starting wallet recovery with Reshare for curve: ${curve}`);
            
            // MPCコンポーネントに緊急復旧を委譲（Reshare対応版）
            const result = await this.mpc.emergencyRecovery(email, code, 'emergency_restore');
            
            if (result.success && result.masterId) {
                // 緊急復旧成功時、masterIdの一貫性を確認
                console.log("🔄 Checking masterId consistency after emergency recovery with Reshare...");
                
                // 既存のmasterIdを取得
                const existingMasterId = await this.storage.getMasterId();
                const sessionMasterId = sessionStorage.getItem('mpc.masterid');
                
                console.log("MasterId comparison:", {
                    existing: existingMasterId,
                    session: sessionMasterId,
                    recovered: result.masterId
                });
                
                // 既存のmasterIdと復旧されたmasterIdが一致することを確認
                if (existingMasterId && existingMasterId !== result.masterId) {
                    console.warn("⚠️ MasterId mismatch detected during emergency recovery with Reshare!");
                    console.warn("Existing masterId:", existingMasterId);
                    console.warn("Recovered masterId:", result.masterId);
                    
                    // 既存のmasterIdを優先（ウォレット資産の継続性を保つため）
                    console.log("🔄 Using existing masterId to preserve wallet assets...");
                    result.masterId = existingMasterId;
                }
                
                // IndexedDBを更新（一貫性確認後）
                console.log("🔄 Updating IndexedDB after emergency recovery with Reshare...");
                await this.storage.updateMasterId(result.masterId);
                
                // インスタンス変数も更新
                this.masterId = result.masterId;
                
                // アドレス再生成（Reshare対応版）
                const addressResult = await this.regenerateAddressesAfterEmergencyRecovery();
                
                console.log("✅ Wallet recovery with Reshare completed successfully");
                return {
                    success: true,
                    masterId: result.masterId,
                    recoveryResult: result.recoveryResult,
                    addressResult: addressResult,
                    reshareCompleted: result.recoveryResult?.reshareCompleted || false,
                    curve: curve,
                    timestamp: Date.now()
                };
            } else {
                throw new Error(result.error || 'Emergency recovery with Reshare failed');
            }
            
        } catch (error) {
            console.error("❌ Wallet recovery with Reshare failed:", error);
            throw error;
        }
    }

    /**
     * 特定のブロックチェーンアドレスを再生成
     */
    async regenerateAddressesForBlockchain(blockchain) {
        try {
            console.log(`🔄 Regenerating ${blockchain} addresses...`);
            
            // MPCメタデータを取得
            const mpcMetadata = await this.storage.getMetadata(this.masterId);
            if (!mpcMetadata || !mpcMetadata.publicKey) {
                throw new Error('MPC metadata not found');
            }

            // 指定されたブロックチェーンのアドレスを再生成
            const addresses = await this.wallet.regenerateAddressesForBlockchain(mpcMetadata.publicKey, blockchain);
            
            console.log(`✅ ${blockchain} addresses regenerated successfully`);
            return {
                success: true,
                blockchain: blockchain,
                addresses: addresses
            };

        } catch (error) {
            console.error(`❌ ${blockchain} address regeneration failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 元のMPC公開鍵を復元
     */
    async restoreMPCPublicKeyFromAddresses(addresses) {
        try {
            console.log("🔄 Restoring MPC public key from addresses...");
            
            const restoredPublicKey = await this.wallet.restoreMPCPublicKeyFromAddresses(addresses);
            
            console.log("✅ MPC public key restored successfully");
            return {
                success: true,
                publicKey: restoredPublicKey
            };

        } catch (error) {
            console.error("❌ MPC public key restoration failed:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 全アドレス情報を取得
     */
    async getAllAddresses() {
        try {
            console.log("🔄 Getting all addresses...");
            
            // MPCメタデータを取得
            const mpcMetadata = await this.storage.getMetadata(this.masterId);
            if (!mpcMetadata || !mpcMetadata.publicKey) {
                throw new Error('MPC metadata not found');
            }

            // 現在のネットワークを取得
            const currentNetwork = this.network || sessionStorage.getItem('mpc.current_network') || 'mainnet';
            console.log("🔧 Getting all addresses for network:", currentNetwork);
            
            // 全アドレスを生成（ネットワーク指定）
            const allAddresses = await this.wallet.addressGenerator.generateAllAddresses(currentNetwork, mpcMetadata.publicKey, null);
            
            console.log("✅ All addresses retrieved successfully");
            return {
                success: true,
                addresses: allAddresses,
                metadata: {
                    masterId: this.masterId,
                    network: this.network,
                    generatedAt: Date.now()
                }
            };

        } catch (error) {
            console.error("❌ Failed to get all addresses:", error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 動的walletid生成関数
     */
    generateWalletId(address, productId) {
        if (productId === 'USDT_ERC20') {
            return `${address}_${productId}`;
        }
        return address; // 通常はアドレスと同じ
    }

    /**
     * IndexedDBからネットワーク設定を読み込んでSessionStorageに保存
     */
    async loadNetworkFromIndexedDB() {
        try {
            if (!this.storage || !this.storage.isInitialized) {
                console.warn('⚠️ BitVoyStorage not available, skipping network load');
                return;
            }

            if (!this.masterId) {
                console.warn('⚠️ Master ID not found, skipping network load');
                return;
            }

            // IndexedDBから読み込み
            const db = this.storage.db;
            const transaction = db.transaction([this.storage.stores.mypage], 'readwrite');
            const store = transaction.objectStore(this.storage.stores.mypage);

            const networkRequest = store.get('mpc.current_network');
            let networkData = await new Promise((resolve, reject) => {
                networkRequest.onsuccess = () => resolve(networkRequest.result);
                networkRequest.onerror = () => reject(networkRequest.error);
            });

            // デフォルト値: mainnet
            const DEFAULT_NETWORK = 'mainnet';

            // 設定が存在しない場合
            if (!networkData || !networkData.value) {
                // IndexedDBに値がない場合のみ、デフォルト値を設定
                console.log('📝 No network setting found in IndexedDB, setting default to mainnet');
                const defaultNetworkData = {
                    key: 'mpc.current_network',
                    masterId: this.masterId,
                    value: DEFAULT_NETWORK,
                    updatedAt: new Date().toISOString()
                };
                await store.put(defaultNetworkData);
                networkData = { value: DEFAULT_NETWORK };
            }

            // SessionStorageとBitVoyインスタンスのnetworkを更新
            const network = networkData.value;
            sessionStorage.setItem('mpc.current_network', network);
            this.network = network;
            
            // BitVoyWalletのnetworkも更新
            if (this.wallet) {
                this.wallet.network = network;
                this.wallet.isTestnet = network === 'testnet';
            }

            console.log('✅ Network setting loaded from IndexedDB to SessionStorage and BitVoy instance:', network);
        } catch (error) {
            console.error('❌ Error loading network setting from IndexedDB:', error);
            // エラー時はデフォルト値を使用
            const defaultNetwork = 'mainnet';
            sessionStorage.setItem('mpc.current_network', defaultNetwork);
            this.network = defaultNetwork;
        }
    }

    /**
     * ネットワーク切り替え
     * IndexedDBに保存してから、その値を元にSessionStorageとアドレス等を展開
     */
    async switchNetwork(networkType) {
        try {
            console.log(`🔄 Switching network from ${this.network} to ${networkType}`);
            
            // IndexedDBに保存（既に保存されている場合もあるが、確実に保存する）
            if (this.storage && this.storage.isInitialized && this.masterId) {
                try {
                    const db = this.storage.db;
                    const transaction = db.transaction([this.storage.stores.mypage], 'readwrite');
                    const store = transaction.objectStore(this.storage.stores.mypage);
                    
                    await store.put({
                        key: 'mpc.current_network',
                        masterId: this.masterId,
                        value: networkType,
                        updatedAt: new Date().toISOString()
                    });
                    console.log('✅ Network setting saved to IndexedDB:', networkType);
                } catch (error) {
                    console.warn('⚠️ Failed to save network to IndexedDB:', error);
                }
            }
            
            // IndexedDBから読み込んで確認（保存した値を確実に使用するため）
            await this.loadNetworkFromIndexedDB();
            
            // 読み込んだnetwork設定を使用（IndexedDBの値が優先）
            const actualNetwork = this.network || networkType;
            console.log(`🔍 Debug: Using network from IndexedDB:`, actualNetwork);
            console.log(`🔍 Debug: Session storage after load:`, sessionStorage.getItem('mpc.current_network'));
            
            // 既存のウォレット情報をクリア
            this.clearSessionWallets();
            
            // 新しいネットワーク用のウォレットを作成（サーバー登録なし）
            // これにより、アドレス等が新しいnetwork設定で展開される
            const result = await this.switchDefaultWallets(actualNetwork);
            if (!result.success) {
                throw new Error(result.error || 'Failed to rebuild wallets for target network');
            }
            
            console.log(`✅ Network switched to ${actualNetwork} successfully`);
            return { success: true, network: actualNetwork };
            
        } catch (error) {
            console.error(`❌ Network switch failed:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * ネットワーク切替時のウォレット再構築（サーバー登録なし）
     */
    async switchDefaultWallets(networkType) {
        try {
            const { secp256k1PubKey, ed25519MasterSeed, ecdsaTssPubKey } = await this.getWalletKeyMaterial();
            await this.setupNetworkWallets(networkType, {
                secp256k1PubKey,
                ed25519MasterSeed,
                ecdsaTssPubKey,
                registerOnServer: false
            });
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to rebuild wallets for ${networkType}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * セッションストレージのウォレット情報をクリア
     */
    clearSessionWallets() {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('wallet.0.')) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
        });
        
        console.log(`🗑️ Cleared ${keysToRemove.length} wallet entries from session storage`);
    }

    /**
     * 現在のネットワークを取得
     */
    getCurrentNetwork() {
        return this.network;
    }

    /**
     * セッションストレージのウォレット情報を確認
     */
    debugSessionWallets() {
        console.log("🔍 Debug: Current network:", this.network);
        console.log("🔍 Debug: Session storage network:", sessionStorage.getItem('mpc.current_network'));
        console.log("🔍 Debug: Session storage wallet entries:");
        
        const walletEntries = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('wallet.0.')) {
                walletEntries[key] = sessionStorage.getItem(key);
            }
        }
        
        console.log("📋 Wallet entries in session storage:", walletEntries);
        
        // Bitcoinアドレスの詳細確認（新形式: wallet.0.<network>.BTC.address）
        const mainnetBtcAddress  = sessionStorage.getItem('wallet.0.mainnet.BTC.address');
        const testnetBtcAddress  = sessionStorage.getItem('wallet.0.testnet.BTC.address');
        console.log("🔍 Debug: Bitcoin addresses:", {
            mainnet: mainnetBtcAddress,
            testnet: testnetBtcAddress,
            mainnetPrefix: mainnetBtcAddress ? mainnetBtcAddress.substring(0, 3) : 'N/A',
            testnetPrefix: testnetBtcAddress ? testnetBtcAddress.substring(0, 3) : 'N/A'
        });
        
        return walletEntries;
    }

    /**
     * ネットワーク別のサポートされるコインを取得
     */
    getSupportedCoinsForNetwork(networkType) {
        const coinConfigs = {
            mainnet: [
                // BitcoinはP2WPKH(ECDSA)用に ecdsa_tss を使用
                { productId: 'BTC',  coinType: '0',     name: 'Bitcoin',         curve: 'ecdsa_tss' },
                { productId: 'ETH',  coinType: '60',    name: 'Ethereum',        curve: 'ecdsa_tss' },
                { productId: 'POL',  coinType: '137',   name: 'Polygon',         curve: 'ecdsa_tss' },
                { productId: 'AVAX', coinType: '43114', name: 'Avalanche',       curve: 'ecdsa_tss' },
                { productId: 'SOL',  coinType: '501',   name: 'Solana',          curve: 'ed25519'   },
                { productId: 'TON',  coinType: '607',   name: 'TON',             curve: 'ed25519'   }
            ],
            testnet: [
                // testnet でも productId は mainnet と共通
                { productId: 'BTC',  coinType: '0',     name: 'Bitcoin Testnet', curve: 'ecdsa_tss' },
                { productId: 'ETH',  coinType: '60',    name: 'Ethereum Sepolia',curve: 'ecdsa_tss' },
                { productId: 'POL',  coinType: '137',   name: 'Polygon Amoy',    curve: 'ecdsa_tss' },
                { productId: 'AVAX', coinType: '43114', name: 'Avalanche Fuji',  curve: 'ecdsa_tss' },
                { productId: 'SOL',  coinType: '501',   name: 'Solana Devnet',   curve: 'ed25519'   },
                { productId: 'TON',  coinType: '607',   name: 'TON Testnet',     curve: 'ed25519'   }
            ]
        };

        return coinConfigs[networkType] || coinConfigs.mainnet;
    }

    /**
     * MPC署名実行（BitVoyMPCへの委譲）
     */
    async signWithMPC(masterId, messageHash, context = {}) {
        try {
            console.log("BitVoy: Delegating MPC signing to BitVoyMPC");
            
            if (!this.mpc) {
                throw new Error('BitVoyMPC instance not initialized');
            }
            
            if (!this.mpc.signWithMPC) {
                throw new Error('signWithMPC method not available in BitVoyMPC');
            }
            
            // BitVoyMPCのsignWithMPCメソッドを呼び出し
            const signature = await this.mpc.signWithMPC(masterId, messageHash, context);
            
            console.log("BitVoy: MPC signing completed successfully");
            return signature;
            
        } catch (error) {
            console.error("BitVoy: MPC signing failed:", error);
            throw error;
        }
    }

    /**
     * Push通知購読登録
     * Service WorkerからPush Subscriptionを取得してサーバーに送信
     */
    async subscribeToPushNotifications() {
        try {
            // Service WorkerとPush APIのサポート確認
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.log('📱 Push notifications not supported in this browser');
                return;
            }

            // Service Workerの登録を取得
            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                console.log('📱 Service Worker not ready');
                return;
            }

            // 既存のPush Subscriptionを確認
            let subscription = await registration.pushManager.getSubscription();
            
            // 既存のSubscriptionがない場合は新規作成
            if (!subscription) {
                // VAPID公開鍵をサーバーから取得
                let applicationServerKey = null;
                try {
                    const vapidKeyResponse = await fetch(`${this.config.serverUrl}/pushapi/push/vapid-key`);
                    if (vapidKeyResponse.ok) {
                        const vapidKeyData = await vapidKeyResponse.json();
                        if (vapidKeyData.publicKey) {
                            // VAPID公開鍵をUint8Arrayに変換
                            applicationServerKey = this.urlBase64ToUint8Array(vapidKeyData.publicKey);
                        }
                    } else {
                        console.warn('📱 Failed to fetch VAPID public key:', vapidKeyResponse.status);
                    }
                } catch (error) {
                    console.warn('📱 Error fetching VAPID public key:', error);
                }
                
                if (!applicationServerKey) {
                    console.log('📱 Push subscription requires VAPID public key (not configured)');
                    return;
                }
                
                try {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: applicationServerKey
                    });
                } catch (error) {
                    console.error('📱 Failed to subscribe to push notifications:', error);
                    throw error;
                }
            }

            // Subscriptionオブジェクトから必要な情報を取得
            const subscriptionData = {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: this.arrayBufferToBase64URL(subscription.getKey('p256dh')),
                    auth: this.arrayBufferToBase64URL(subscription.getKey('auth'))
                }
            };

            // masterIdが取得できない場合はスキップ
            if (!this.masterId) {
                console.log('📱 MasterId not available, skipping push subscription');
                return;
            }

            // /pushapi/push/subscribeにPOSTリクエストを送信
            const subscribeUrl = `${this.config.serverUrl}/pushapi/push/subscribe`;
            console.log('[BitVoy] Sending push subscription request to:', subscribeUrl);
            console.log('[BitVoy] Request payload:', {
                masterId: this.masterId,
                subscription: {
                    endpoint: subscriptionData.endpoint,
                    keys: {
                        p256dh: subscriptionData.keys.p256dh ? '***' : null,
                        auth: subscriptionData.keys.auth ? '***' : null
                    }
                }
            });
            
            const response = await fetch(subscribeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    masterId: this.masterId,
                    subscription: subscriptionData
                })
            });

            console.log('[BitVoy] Push subscription response status:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Push notification subscription successful:', result);
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn('⚠️ Push notification subscription failed:', response.status, errorData);
            }
        } catch (error) {
            // エラーはログに出力するのみ（処理に影響しない）
            console.warn('⚠️ Push notification subscription error (non-blocking):', error);
        }
    }

    /**
     * Push通知の購読を解除
     */
    async unsubscribeToPushNotifications() {
        try {
            // Service WorkerとPush APIのサポート確認
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                console.log('📱 Push notifications not supported in this browser');
                return;
            }

            // Service Workerの登録を取得
            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                console.log('📱 Service Worker not ready');
                return;
            }

            // 既存のPush Subscriptionを取得
            const subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                console.log('📱 No active push subscription to unsubscribe');
                return;
            }

            // masterIdが取得できない場合はスキップ
            if (!this.masterId) {
                console.log('📱 MasterId not available, skipping push unsubscription');
                return;
            }

            // /pushapi/push/unsubscribeにPOSTリクエストを送信
            const unsubscribeUrl = `${this.config.serverUrl}/pushapi/push/unsubscribe`;
            console.log('[BitVoy] Sending push unsubscription request to:', unsubscribeUrl);
            
            const response = await fetch(unsubscribeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    masterId: this.masterId,
                    subscription: {
                        endpoint: subscription.endpoint
                    }
                })
            });

            console.log('[BitVoy] Push unsubscription response status:', response.status);
            
            if (response.ok) {
                // サーバー側で無効化されたら、クライアント側でも購読を解除
                await subscription.unsubscribe();
                const result = await response.json();
                console.log('✅ Push notification unsubscription successful:', result);
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.warn('⚠️ Push notification unsubscription failed:', response.status, errorData);
            }
        } catch (error) {
            // エラーはログに出力するのみ（処理に影響しない）
            console.warn('⚠️ Push notification unsubscription error (non-blocking):', error);
        }
    }

    /**
     * Push通知の購読状態を取得
     */
    async getPushSubscriptionStatus() {
        try {
            // Service WorkerとPush APIのサポート確認
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                return { subscribed: false, supported: false };
            }

            // Service Workerの登録を取得
            const registration = await navigator.serviceWorker.ready;
            if (!registration) {
                return { subscribed: false, supported: true };
            }

            // 既存のPush Subscriptionを取得
            const subscription = await registration.pushManager.getSubscription();
            return {
                subscribed: !!subscription,
                supported: true,
                endpoint: subscription?.endpoint || null
            };
        } catch (error) {
            console.warn('⚠️ Error checking push subscription status:', error);
            return { subscribed: false, supported: false };
        }
    }

    async getPushSubscriptionStatus() {
        const serviceWorkerSupported = 'serviceWorker' in navigator;
        const pushSupported         = 'PushManager'   in window;
        const notificationSupported = 'Notification'  in window;
      
        const supported = serviceWorkerSupported && pushSupported && notificationSupported;
        const permission = notificationSupported ? Notification.permission : null;
      
        if (!supported) {
          return {
            supported: false,
            subscribed: false,
            permission,
            endpoint: null,
          };
        }
      
        try {
          const registration = await navigator.serviceWorker.ready;
          if (!registration) {
            // SW はサポートされてるが、まだ登録されてない or ready で取れなかった
            return {
              supported: true,
              subscribed: false,
              permission,
              endpoint: null,
            };
          }
      
          const subscription = await registration.pushManager.getSubscription();
      
          return {
            supported: true,
            subscribed: !!subscription,
            permission,
            endpoint: subscription?.endpoint ?? null,
          };
        } catch (error) {
          console.warn('⚠️ Error checking push subscription status:', error);
          return {
            supported,
            subscribed: false,
            permission,
            endpoint: null,
          };
        }
    }  

    /**
     * Base64URL文字列をUint8Arrayに変換（VAPID公開鍵用）
     */
    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    /**
     * Smart Accountアドレス保存
     * @param {string} networkType - ネットワークタイプ（'mainnet', 'testnet'）
     * @param {string} ownerEOA - OWNER_EOAアドレス
     * @param {string} ethereumSA - Ethereum SAアドレス（オプション）
     * @param {string} polygonSA - Polygon SAアドレス（オプション、未使用）
     * @param {string} sharedJWT - サーバー登録用JWT（オプション）
     * @param {string} polygonSA_USDC - Polygon SAアドレス（USDC用、オプション）
     * @param {string} polygonSA_JPYC - Polygon SAアドレス（JPYC用、オプション）
     * @param {string} avalancheSA_USDC - Avalanche SAアドレス（USDC用、オプション）
     * @param {string} avalancheSA_JPYC - Avalanche SAアドレス（JPYC用、オプション）
     */
    async saveSmartAccountAddresses(
        networkType,
        ownerEOA,
        ethereumSA,
        polygonSA,
        sharedJWT = null,
        polygonSA_USDC = null,
        polygonSA_JPYC = null,
        avalancheSA_USDC = null,
        avalancheSA_JPYC = null
    ) {
        try {
            // 1. ローカルストレージに保存
            const saData = {
                ownerEOA,
                ethereum: ethereumSA ? {
                    [networkType]: ethereumSA
                } : null,
                polygon_USDC: polygonSA_USDC ? {
                    [networkType]: polygonSA_USDC
                } : null,
                polygon_JPYC: polygonSA_JPYC ? {
                    [networkType]: polygonSA_JPYC
                } : null,
                avalanche_USDC: avalancheSA_USDC ? {
                    [networkType]: avalancheSA_USDC
                } : null,
                avalanche_JPYC: avalancheSA_JPYC ? {
                    [networkType]: avalancheSA_JPYC
                } : null,
                updatedAt: Date.now()
            };

            // 既存のSAデータを取得
            const existingSAData = await this.storage.getSmartAccountAddresses(this.masterId);
            if (existingSAData) {
                // 既存データとマージ
                if (ethereumSA) {
                    existingSAData.ethereum = existingSAData.ethereum || {};
                    existingSAData.ethereum[networkType] = ethereumSA;
                }
                if (polygonSA_USDC) {
                    existingSAData.polygon_USDC = existingSAData.polygon_USDC || {};
                    existingSAData.polygon_USDC[networkType] = polygonSA_USDC;
                }
                if (polygonSA_JPYC) {
                    existingSAData.polygon_JPYC = existingSAData.polygon_JPYC || {};
                    existingSAData.polygon_JPYC[networkType] = polygonSA_JPYC;
                }
                if (avalancheSA_USDC) {
                    existingSAData.avalanche_USDC = existingSAData.avalanche_USDC || {};
                    existingSAData.avalanche_USDC[networkType] = avalancheSA_USDC;
                }
                if (avalancheSA_JPYC) {
                    existingSAData.avalanche_JPYC = existingSAData.avalanche_JPYC || {};
                    existingSAData.avalanche_JPYC[networkType] = avalancheSA_JPYC;
                }
                saData.ethereum = existingSAData.ethereum;
                saData.polygon_USDC = existingSAData.polygon_USDC;
                saData.polygon_JPYC = existingSAData.polygon_JPYC;
                saData.avalanche_USDC = existingSAData.avalanche_USDC;
                saData.avalanche_JPYC = existingSAData.avalanche_JPYC;
            }

            // IndexedDBに保存
            await this.storage.storeSmartAccountAddresses(this.masterId, saData);
            console.log(`[SA] Smart Account addresses saved locally:`, saData);

            // 2. サーバーに登録（JWTがある場合）
            if (sharedJWT && (ethereumSA || polygonSA_USDC || polygonSA_JPYC || avalancheSA_USDC || avalancheSA_JPYC)) {
                try {
                    await this.registerSmartAccountAddressesOnServer(
                        networkType,
                        ownerEOA,
                        ethereumSA,
                        polygonSA_USDC,
                        polygonSA_JPYC,
                        sharedJWT,
                        avalancheSA_USDC,
                        avalancheSA_JPYC
                    );
                    console.log(`[SA] Smart Account addresses registered on server`);
                } catch (error) {
                    console.error(`[SA] Failed to register SA addresses on server:`, error);
                    // サーバー登録失敗は警告のみ
                }
            }
            
        } catch (error) {
            console.error(`[SA] Failed to save Smart Account addresses:`, error);
            throw error;
        }
    }

    /**
     * サーバーにSAアドレスを登録
     * @param {string} networkType - ネットワークタイプ
     * @param {string} ownerEOA - OWNER_EOA
     * @param {string} ethereumSA - Ethereum SAアドレス
     * @param {string} polygonSA_USDC - Polygon SAアドレス（USDC用）
     * @param {string} polygonSA_JPYC - Polygon SAアドレス（JPYC用）
     * @param {string} jwt - JWT
     * @param {string} avalancheSA_USDC - Avalanche SAアドレス（USDC用）
     * @param {string} avalancheSA_JPYC - Avalanche SAアドレス（JPYC用）
     */
    async registerSmartAccountAddressesOnServer(
        networkType,
        ownerEOA,
        ethereumSA,
        polygonSA_USDC,
        polygonSA_JPYC,
        jwt,
        avalancheSA_USDC = null,
        avalancheSA_JPYC = null
    ) {
        const apiBaseUrl = this.config.serverUrl;
        
        // Ethereum SA登録
        // 注意: Ethereumの場合は通貨が未定義の可能性があるため、デフォルトで'ETH'を使用
        if (ethereumSA) {
            const response = await fetch(`${apiBaseUrl}/walletapi/aa/smart-account/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    chain: 'ethereum',
                    network: networkType,
                    currency: 'ETH', // Ethereumの場合はETHをデフォルトとして使用
                    owner_eoa: ownerEOA,
                    smart_account_address: ethereumSA
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Ethereum SA registration failed: ${response.status} ${errorData.message || ''}`);
            }
        }
        
        // Polygon SA登録（USDC）
        if (polygonSA_USDC) {
            const response = await fetch(`${apiBaseUrl}/walletapi/aa/smart-account/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    chain: 'polygon',
                    network: networkType,
                    currency: 'USDC',
                    owner_eoa: ownerEOA,
                    smart_account_address: polygonSA_USDC
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Polygon SA (USDC) registration failed: ${response.status} ${errorData.message || ''}`);
            }
        }
        
        // Polygon SA登録（JPYC）
        if (polygonSA_JPYC) {
            const response = await fetch(`${apiBaseUrl}/walletapi/aa/smart-account/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    chain: 'polygon',
                    network: networkType,
                    currency: 'JPYC',
                    owner_eoa: ownerEOA,
                    smart_account_address: polygonSA_JPYC
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Polygon SA (JPYC) registration failed: ${response.status} ${errorData.message || ''}`);
            }
        }

        // Avalanche SA登録（USDC）
        if (avalancheSA_USDC) {
            const response = await fetch(`${apiBaseUrl}/walletapi/aa/smart-account/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    chain: 'avalanche',
                    network: networkType,
                    currency: 'USDC',
                    owner_eoa: ownerEOA,
                    smart_account_address: avalancheSA_USDC
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Avalanche SA (USDC) registration failed: ${response.status} ${errorData.message || ''}`);
            }
        }

        // Avalanche SA登録（JPYC）
        if (avalancheSA_JPYC) {
            const response = await fetch(`${apiBaseUrl}/walletapi/aa/smart-account/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    chain: 'avalanche',
                    network: networkType,
                    currency: 'JPYC',
                    owner_eoa: ownerEOA,
                    smart_account_address: avalancheSA_JPYC
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Avalanche SA (JPYC) registration failed: ${response.status} ${errorData.message || ''}`);
            }
        }
    }

    /**
     * ArrayBufferをBase64URL文字列に変換
     */
    arrayBufferToBase64URL(buffer) {
        if (!buffer) return null;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BitVoy;
} else if (typeof window !== 'undefined') {
    window.BitVoy = BitVoy;
}