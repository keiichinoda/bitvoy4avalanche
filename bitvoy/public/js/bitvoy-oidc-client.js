/**
 * BitVoy OIDC Client - OIDC Authentication Flow Management
 * IndexedDB master_id verification and unregistered user flow support
 */

class BitVoyOIDCClient {
    constructor() {
        this.storage = new BitVoyStorage();
        this.oidcFlagKey = 'bitvoy_oidc_flag';
        
        // Extract OIDC parameters from JWT token and save to session storage
        this.extractOIDCParamsFromJWT();
        
        // Initialize internationalization
        this.initI18n();
    }
    
    /**
     * Initialize internationalization
     */
    initI18n() {
		// Detect language (localStorage/i18next/browser)
		// パスやクエリによる言語判定はi18n-init.jsで行うため、ここではlocalStorageから取得
		const browserLang = navigator.language || (navigator.languages && navigator.languages[0]) || 'en';
		const browserCode = (browserLang || 'en').split('-')[0];
		const storedLang = localStorage.getItem('lang');
		const supported = ['en', 'ja'];
		
		// 優先順位: localStorage > i18next > ブラウザ > デフォルト
		// localStorageを優先することで、ユーザーが設定した言語を保持
		let preferred;
		if (storedLang && supported.indexOf(storedLang) >= 0) {
			// localStorageに保存されている場合は最優先（i18n-init.jsでパスやクエリから設定済み）
			preferred = storedLang;
		} else if (browserCode && supported.indexOf(browserCode) >= 0) {
			// ブラウザの言語設定
			preferred = browserCode;
		} else {
			// デフォルト
			preferred = 'en';
		}
		
		this.currentLang = preferred;
		
		// localStorageに値がない場合、または無効な値の場合のみ更新
		if (!storedLang || supported.indexOf(storedLang) < 0) {
			localStorage.setItem('lang', this.currentLang);
		}

		// Follow i18next language changes if available
		if (typeof i18next !== 'undefined') {
			// If i18next initializes later, update when ready
			if (i18next.on) {
				i18next.on('languageChanged', (lng) => {
					const code = (lng || '').split('-')[0];
					// i18nextの言語変更を反映（パスやクエリの判定はi18n-init.jsで行うため、ここでは反映のみ）
					if (supported.indexOf(code) >= 0) {
						this.setLanguage(code);
					}
				});
			}
		}
		
		// Define translations
        this.translations = {
            en: {
                accountCreationRequired: '🔐 BitVoy Account Creation Required',
                accountCreationMessage: 'To complete authentication, you need to create a BitVoy account first.',
                createAccount: 'Create Account',
                cancel: 'Cancel',
                authError: 'Authentication Error',
                authStartFailed: 'Failed to start OIDC authentication',
                unregisteredUserFlow: 'Unregistered User Flow',
                unregisteredUserFlowError: 'Failed to process unregistered user flow',
                registeredUserFlow: 'Registered User Flow',
                authFlowError: 'Failed to process authentication flow',
                passkeyAuthStart: 'Starting Passkey Authentication',
                passkeyAuthSuccess: 'Passkey Authentication Successful',
                passkeyAuthCanceled: 'Passkey Authentication Canceled',
                passkeyAuthFailed: 'Passkey Authentication Failed',
                oidcFlowResume: 'Resuming OIDC Flow',
                authFailed: 'Authentication Failed',
                getStartedButton: 'Get Started Button',
                redirectToIndex: 'Redirecting to index.html',
                cancelButton: 'Cancel Button',
                clearOidcFlag: 'Clearing OIDC Flag',
                oidcAuthFlowStart: 'Starting OIDC Authentication Flow',
                linkProcessing: 'Processing OIDC Link',
                linkError: 'OIDC Link Error',
                linkChainNotSupported: 'Unsupported chain',
                linkAddressNotFound: 'Wallet address not found',
                linkSignatureFailed: 'Failed to sign message'
            },
            ja: {
                accountCreationRequired: '🔐 BitVoyアカウントの作成が必要です',
                accountCreationMessage: '認証を完了するには、まずBitVoyアカウントを作成する必要があります。',
                createAccount: 'アカウント作成',
                cancel: 'キャンセル',
                authError: '認証エラー',
                authStartFailed: 'OIDC認証の開始に失敗しました',
                unregisteredUserFlow: '未登録ユーザーフロー',
                unregisteredUserFlowError: '未登録ユーザーフローの処理に失敗しました',
                registeredUserFlow: '登録済みユーザーフロー',
                authFlowError: '認証フローの処理に失敗しました',
                passkeyAuthStart: 'パスキー認証を開始',
                passkeyAuthSuccess: 'パスキー認証成功',
                passkeyAuthCanceled: 'パスキー認証がキャンセルされました',
                passkeyAuthFailed: 'パスキー認証に失敗しました',
                oidcFlowResume: 'OIDCフローを再開',
                authFailed: '認証に失敗しました',
                getStartedButton: 'Get Startedボタン',
                redirectToIndex: 'index.htmlにリダイレクト',
                cancelButton: 'Cancelボタン',
                clearOidcFlag: 'OIDCフラグをクリア',
                oidcAuthFlowStart: 'OIDC認証フロー開始',
                linkProcessing: 'OIDC Link処理中',
                linkError: 'OIDC Linkエラー',
                linkChainNotSupported: 'サポートされていないチェーン',
                linkAddressNotFound: 'ウォレットアドレスが見つかりません',
                linkSignatureFailed: '署名に失敗しました'
            },
            zh: {
                accountCreationRequired: '🔐 需要创建BitVoy账户',
                accountCreationMessage: '要完成身份验证，您需要先创建一个BitVoy账户。',
                createAccount: '创建账户',
                cancel: '取消',
                authError: '身份验证错误',
                authStartFailed: 'OIDC身份验证启动失败',
                unregisteredUserFlow: '未注册用户流程',
                unregisteredUserFlowError: '未注册用户流程处理失败',
                registeredUserFlow: '已注册用户流程',
                authFlowError: '身份验证流程处理失败',
                passkeyAuthStart: '开始Passkey身份验证',
                passkeyAuthSuccess: 'Passkey身份验证成功',
                passkeyAuthCanceled: 'Passkey身份验证已取消',
                passkeyAuthFailed: 'Passkey身份验证失败',
                oidcFlowResume: '恢复OIDC流程',
                authFailed: '身份验证失败',
                getStartedButton: '开始按钮',
                redirectToIndex: '重定向到index.html',
                cancelButton: '取消按钮',
                clearOidcFlag: '清除OIDC标志',
                oidcAuthFlowStart: '开始OIDC身份验证流程',
                linkProcessing: '处理OIDC Link',
                linkError: 'OIDC Link错误',
                linkChainNotSupported: '不支持的链',
                linkAddressNotFound: '未找到钱包地址',
                linkSignatureFailed: '签名失败'
            }
        };
    }
    
    /**
     * Get translated text
     */
    t(key) {
        return this.translations[this.currentLang]?.[key] || this.translations.en[key] || key;
    }
    
    /**
     * Set language
     */
    setLanguage(lang) {
		if (this.translations[lang]) {
			this.currentLang = lang;
			// Store unified key for consistency
			// パスやクエリによる言語判定はi18n-init.jsで行うため、ここではlocalStorageに保存のみ
			localStorage.setItem('lang', lang);
		}
    }
    
    /**
     * Extract OIDC parameters from JWT token and save to session storage
     */
    extractOIDCParamsFromJWT() {
        try {
            const sessionTokenElement = document.getElementById('oidc-session-data');
            if (sessionTokenElement) {
                const sessionToken = sessionTokenElement.getAttribute('data-session-token');
                console.log('🔍 Session Token:', sessionToken);
                
                if (sessionToken) {
                    // 原本のJWTも保持（完全JWT化用）
                    sessionStorage.setItem('bitvoy_oidc_session_token', sessionToken);
                    console.log('✅ Stored OIDC session JWT to sessionStorage');
                    // Decode JWT token (simple implementation)
                    const parts = sessionToken.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        console.log('🔍 JWT Payload:', payload);
                        
                        if (payload.oidcParams) {
                            sessionStorage.setItem('bitvoy_oidc_params', JSON.stringify(payload.oidcParams));
                            // 支払い関連フラグと値を個別にも保持
                            if (payload.oidcParams.payment !== undefined) sessionStorage.setItem('bitvoy_payment_flag', String(payload.oidcParams.payment));
                            if (payload.oidcParams.currency !== undefined) sessionStorage.setItem('bitvoy_payment_currency', String(payload.oidcParams.currency));
                            if (payload.oidcParams.amount !== undefined) sessionStorage.setItem('bitvoy_payment_amount', String(payload.oidcParams.amount));
                            if (payload.oidcParams.to !== undefined) sessionStorage.setItem('bitvoy_payment_to', String(payload.oidcParams.to));
                            // OIDC Link関連フラグと値を個別にも保持
                            if (payload.oidcParams.link !== undefined) sessionStorage.setItem('bitvoy_link_flag', String(payload.oidcParams.link));
                            if (payload.oidcParams.chain !== undefined) sessionStorage.setItem('bitvoy_link_chain', String(payload.oidcParams.chain));
                            if (payload.oidcParams.network !== undefined) sessionStorage.setItem('bitvoy_link_network', String(payload.oidcParams.network));
                            console.log('✅ Extracted OIDC parameters from JWT and saved to session storage:', payload.oidcParams);
                        } else {
                            console.log('❌ oidcParams not found in JWT payload');
                        }
                    } else {
                        console.log('❌ Invalid JWT token format');
                    }
                } else {
                    console.log('❌ Session token not found');
                }
            } else {
                console.log('❌ oidc-session-data element not found');
            }
        } catch (error) {
            console.error('❌ OIDC parameter extraction error:', error);
        }
    }

    /**
     * Start OIDC authentication
     * Check if master_id exists in IndexedDB
     */
    async startOIDCAuth() {
        try {
            console.log('🔐 ' + this.t('oidcAuthFlowStart'));
            
            // Check master_id from IndexedDB
            const hasMasterId = await this.storage.hasMasterId();
            
            if (!hasMasterId) {
                console.log('❌ master_id not found - proceeding to unregistered or payment-cancel flow');
                const isPayment = (sessionStorage.getItem('bitvoy_payment_flag') || '').toString().toLowerCase();
                if (isPayment === '1' || isPayment === 'true') {
                    // 支払い要求だが未登録 → 直ちにRPへキャンセル返却
                    const params = JSON.parse(sessionStorage.getItem('bitvoy_oidc_params') || '{}');
                    const form = document.createElement('form');
                    form.method = 'POST';
                    form.action = '/wallet/payment-cancel';
                    const entries = {
                        redirect_uri: params.redirect_uri || '',
                        state: params.state || '',
                        error: 'registration_required'
                    };
                    for (const k in entries) { const i = document.createElement('input'); i.type='hidden'; i.name=k; i.value=entries[k]; form.appendChild(i); }
                    document.body.appendChild(form); form.submit();
                    return;
                }
                await this.handleUnregisteredUser();
                return;
            }
            
            console.log('✅ master_id exists - proceeding to normal authentication flow');
            await this.handleRegisteredUser();
            
        } catch (error) {
            console.error('❌ OIDC authentication start error:', error);
            this.showError(this.t('authError'), this.t('authStartFailed'));
        }
    }

    /**
     * Unregistered user flow
     */
    async handleUnregisteredUser() {
        try {
            console.log('🔄 ' + this.t('unregisteredUserFlow'));
            
            // Save OIDC flag to session storage
            sessionStorage.setItem(this.oidcFlagKey, 'true');
            console.log('✅ OIDC flag saved to session storage');
            
            // Show "BitVoy Account Creation Required" dialog
            this.showUnregisteredUserDialog();
            
        } catch (error) {
            console.error('❌ Unregistered user flow error:', error);
            this.showError('Error', this.t('unregisteredUserFlowError'));
        }
    }

    /**
     * Show unregistered user dialog
     */
    showUnregisteredUserDialog() {
        // Remove existing dialog if any
        const existingDialog = document.getElementById('oidc-unregistered-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialog = document.createElement('div');
        dialog.id = 'oidc-unregistered-dialog';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    padding: 30px;
                    border-radius: 10px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    max-width: 500px;
                    text-align: center;
                ">
                    <h2 style="color: #333; margin-bottom: 20px;">${this.t('accountCreationRequired')}</h2>
                    <p style="color: #666; margin-bottom: 30px; line-height: 1.6;">
                        ${this.t('accountCreationMessage')}
                    </p>
                    <div style="margin-bottom: 20px;">
                        <button id="oidc-get-started-btn" style="
                            background-color: #007bff;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 16px;
                            margin-right: 10px;
                        ">${this.t('createAccount')}</button>
                        <button id="oidc-cancel-btn" style="
                            background-color: #6c757d;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 16px;
                        ">${this.t('cancel')}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        // Set up event listeners
        document.getElementById('oidc-get-started-btn').addEventListener('click', () => {
            dialog.remove();
            // Redirect to index.html
            window.location.href = '/index.html';
        });

        document.getElementById('oidc-cancel-btn').addEventListener('click', () => {
            dialog.remove();
            // Clear OIDC flag
            sessionStorage.removeItem(this.oidcFlagKey);
        });
    }

    /**
     * Registered user flow
     */
    async handleRegisteredUser() {
        try {
            console.log('✅ ' + this.t('registeredUserFlow'));
            
            // Continue with normal OIDC authentication flow
            // Continue OIDC authentication processing here
            console.log('🔄 Continuing normal OIDC authentication flow');
            
        } catch (error) {
            console.error('❌ Registered user flow error:', error);
            this.showError(this.t('authError'), this.t('authFlowError'));
        }
    }


    /**
     * Show error
     */
    showError(title, message) {
        console.error(`❌ ${title}: ${message}`);
        
        // Simple error display with i18next support
        if (typeof i18next !== 'undefined' && i18next.isInitialized) {
            const translatedTitle = i18next.t(title);
            const translatedMessage = i18next.t(message);
            alert(`${translatedTitle}: ${translatedMessage}`);
        } else {
            alert(`${title}: ${message}`);
        }
    }

    /**
     * ローカルのIndexedDBからmaster_idを取得
     */
    async getMasterIdFromStorage() {
        try {
            // BitVoyStorageを使用してmaster_idを取得
            const storage = new BitVoyStorage();
            await storage.init();
            const masterId = await storage.getMasterId();
            console.log('🔍 Retrieved master_id from BitVoyStorage:', masterId);
            return masterId;
        } catch (error) {
            console.error('Error getting master_id from storage:', error);
            return null;
        }
    }

    /**
     * BitVoyクラスが利用可能になるまで待機
     */
    async waitForBitVoyClass(maxWaitTime = 10000) {
        const startTime = Date.now();
        
        // 既に利用可能な場合は即座に返す
        if (typeof BitVoy !== 'undefined') {
            console.log('✅ BitVoyクラスは既に利用可能です');
            return;
        }
        
        console.log('⏳ BitVoyクラスの読み込みを待機中...');
        
        // 方法1: bitvoy_libraries_readyイベントを待つ
        const eventPromise = new Promise((resolve) => {
            let timeout = null;
            let resolved = false;
            
            const checkLibraries = () => {
                if (resolved) return;
                if (typeof BitVoy !== 'undefined') {
                    resolved = true;
                    if (timeout) clearTimeout(timeout);
                    window.removeEventListener('bitvoy_libraries_ready', checkLibraries);
                    console.log('✅ bitvoy_libraries_readyイベントを受信、BitVoyクラスが利用可能になりました');
                    resolve(true);
                }
            };
            
            window.addEventListener('bitvoy_libraries_ready', checkLibraries);
            
            timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    window.removeEventListener('bitvoy_libraries_ready', checkLibraries);
                    resolve(false);
                }
            }, maxWaitTime);
            
            // 既にイベントが発火済みの場合に備えて即座にチェック
            if (typeof BitVoy !== 'undefined') {
                resolved = true;
                if (timeout) clearTimeout(timeout);
                window.removeEventListener('bitvoy_libraries_ready', checkLibraries);
                resolve(true);
            }
        });
        
        // 方法2: ポーリングでチェック（フォールバック）
        const pollPromise = new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (typeof BitVoy !== 'undefined') {
                    clearInterval(checkInterval);
                    console.log('✅ ポーリングでBitVoyクラスを検出');
                    resolve(true);
                } else if (Date.now() - startTime > maxWaitTime) {
                    clearInterval(checkInterval);
                    console.warn('⚠️ BitVoyクラスの読み込み待機がタイムアウトしました');
                    resolve(false);
                }
            }, 100); // 100msごとにチェック
        });
        
        // どちらかが成功するまで待機（Promise.raceを使用）
        await Promise.race([eventPromise, pollPromise]);
        
        // 最終確認
        if (typeof BitVoy === 'undefined') {
            console.warn('⚠️ BitVoyクラスが読み込まれていません。ウォレット情報の自動展開をスキップします。');
        }
    }

    /**
     * OIDC認証完了後にウォレット情報を自動展開
     * @param {PublicKeyCredential} credential - WebAuthn認証で得られたクレデンシャル
     * @param {string} masterId - マスターID（IndexedDBから取得済み）
     */
    async loadWalletInformationAfterAuth(credential, masterId) {
        try {
            console.log('🔄 OIDC認証完了後のウォレット情報自動展開を開始');
            
            // masterIdの取得を試行（userHandleから取得を優先）
            let resolvedMasterId = masterId;
            
            // userHandleからmasterIdを取得を試行
            if (credential && credential.response && credential.response.userHandle) {
                try {
                    const userHandleBytes = credential.response.userHandle;
                    const decodedMasterId = new TextDecoder().decode(userHandleBytes);
                    if (decodedMasterId && decodedMasterId.length > 0) {
                        resolvedMasterId = decodedMasterId;
                        console.log('✅ masterIdをuserHandleから取得:', resolvedMasterId);
                    }
                } catch (error) {
                    console.warn('⚠️ userHandleからのmasterId取得に失敗、IndexedDBの値を使用:', error);
                }
            }
            
            // masterIdが取得できていない場合はIndexedDBから再取得
            if (!resolvedMasterId) {
                resolvedMasterId = await this.getMasterIdFromStorage();
                if (!resolvedMasterId) {
                    console.warn('⚠️ masterIdが取得できませんでした。ウォレット情報の自動展開をスキップします。');
                    return;
                }
            }
            
            console.log('✅ masterIdを取得:', resolvedMasterId);
            
            // BitVoyクラスが利用可能になるまで待機
            await this.waitForBitVoyClass();
            
            // BitVoyクラスが利用可能か確認
            if (typeof BitVoy === 'undefined') {
                console.warn('⚠️ BitVoyクラスが利用できません。ウォレット情報の自動展開をスキップします。');
                return;
            }
            
            // IndexedDBからnetworkを読み込んでsessionStorageに設定（BitVoyインスタンス作成前に実行）
            console.log('🔄 IndexedDBからnetwork設定を読み込み中...');
            try {
                // BitVoyStorageを初期化
                if (!this.storage || !this.storage.isInitialized) {
                    await this.storage.init();
                }
                
                if (this.storage && this.storage.isInitialized) {
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
                        console.log('📝 No network setting found in IndexedDB, setting default to mainnet');
                        const defaultNetworkData = {
                            key: 'mpc.current_network',
                            value: DEFAULT_NETWORK,
                            updatedAt: new Date().toISOString()
                        };
                        await store.put(defaultNetworkData);
                        networkData = { value: DEFAULT_NETWORK };
                    }
                    
                    // SessionStorageに設定
                    const network = networkData.value;
                    sessionStorage.setItem('mpc.current_network', network);
                    console.log('✅ Network setting loaded from IndexedDB to SessionStorage:', network);
                } else {
                    console.warn('⚠️ BitVoyStorage not available, using default network (mainnet)');
                    sessionStorage.setItem('mpc.current_network', 'mainnet');
                }
            } catch (error) {
                console.error('❌ Error loading network from IndexedDB:', error);
                // エラー時はデフォルト値を使用
                sessionStorage.setItem('mpc.current_network', 'mainnet');
            }
            
            // BitVoyインスタンスを作成または取得
            let bitvoyInstance = null;
            
            // 既存のグローバルインスタンスを確認
            if (window.bitvoyMPC && window.bitvoyMPC instanceof BitVoy) {
                bitvoyInstance = window.bitvoyMPC;
                console.log('✅ 既存のBitVoyインスタンスを使用');
            } else {
                // 新しいインスタンスを作成（sessionStorageからnetworkを読み込む）
                try {
                    bitvoyInstance = new BitVoy();
                    await bitvoyInstance.init();
                    console.log('✅ 新しいBitVoyインスタンスを作成');
                } catch (error) {
                    console.error('❌ BitVoyインスタンスの作成に失敗:', error);
                    return;
                }
            }
            
            // masterIdを設定
            if (bitvoyInstance) {
                bitvoyInstance.masterId = resolvedMasterId;
                
                // セッションストレージにも保存
                sessionStorage.setItem('mpc.masterid', resolvedMasterId);
                
                console.log('✅ masterIdをBitVoyインスタンスに設定:', resolvedMasterId);
                
                // IndexedDBからnetworkを読み込んでBitVoyインスタンスのnetworkも更新
                try {
                    await bitvoyInstance.loadNetworkFromIndexedDB();
                    console.log('✅ Network設定をBitVoyインスタンスに反映:', bitvoyInstance.network);
                } catch (error) {
                    console.warn('⚠️ Network設定の読み込みに失敗（処理は続行）:', error);
                }
                
                // ウォレット情報を読み込み
                try {
                    await bitvoyInstance.loadWalletInformation();
                    console.log('✅ ウォレット情報の読み込みが完了しました');
                    
                    // セッション状態を更新
                    bitvoyInstance.updateSessionState(true);
                    console.log('✅ セッション状態を更新しました');
                } catch (error) {
                    console.error('❌ ウォレット情報の読み込みに失敗:', error);
                    // エラーが発生してもリダイレクトは続行
                }
            }
            
        } catch (error) {
            console.error('❌ ウォレット情報自動展開処理でエラーが発生:', error);
            // エラーが発生してもリダイレクトは続行（OIDCフローを優先）
        }
    }


    /**
     * Handle OIDC Link flow
     * Get wallet address and signature for the specified chain/network
     */
    async handleOIDCLink(masterId, redirectUrl, providedCredential = null) {
        try {
            console.log('🔗 OIDC Link処理を開始');
            if (providedCredential) {
                console.log('🔐 既に取得済みのPasskey credentialを再利用します');
            }
            
            // OIDC Linkパラメータを取得
            const chain = sessionStorage.getItem('bitvoy_link_chain') || '';
            const network = sessionStorage.getItem('bitvoy_link_network') || 'mainnet';
            const params = JSON.parse(sessionStorage.getItem('bitvoy_oidc_params') || '{}');
            const nonce = params.nonce || '';
            
            if (!chain) {
                const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'invalid_request', 'chain parameter is required for OIDC Link');
                if (errorUrl) {
                    window.location.href = errorUrl;
                } else {
                    throw new Error('chain parameter is required for OIDC Link');
                }
                return;
            }
            
            console.log('🔗 OIDC Linkパラメータ:', { chain, network, nonce });
            
            // BitVoyクラスが利用可能になるまで待機
            await this.waitForBitVoyClass();
            
            if (typeof BitVoy === 'undefined') {
                const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'wallet_not_connected', 'BitVoy wallet is not available');
                if (errorUrl) {
                    window.location.href = errorUrl;
                } else {
                    throw new Error('BitVoy class is not available');
                }
                return;
            }
            
            // BitVoyインスタンスを取得または作成
            let bitvoyInstance = null;
            if (window.bitvoyMPC && window.bitvoyMPC instanceof BitVoy) {
                bitvoyInstance = window.bitvoyMPC;
            } else {
                bitvoyInstance = new BitVoy(network);
                await bitvoyInstance.init();
                bitvoyInstance.masterId = masterId;
                sessionStorage.setItem('mpc.masterid', masterId);
            }
            
            // ウォレット情報が読み込まれていない場合は読み込む
            if (!sessionStorage.getItem(`wallet.0.${network}.${this.getProductIdFromChain(chain)}.address`)) {
                await bitvoyInstance.loadWalletInformation();
            }
            
            // チェーン名からproductIdを取得
            const productId = this.getProductIdFromChain(chain);
            if (!productId) {
                const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'chain_not_supported', `Unsupported chain: ${chain}`);
                if (errorUrl) {
                    window.location.href = errorUrl;
                } else {
                    throw new Error(`Unsupported chain: ${chain}`);
                }
                return;
            }
            
            // ウォレットアドレスを取得
            const walletAddress = this.getWalletAddress(productId, network);
            if (!walletAddress) {
                const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'address_fetch_failed', `Wallet address not found for chain: ${chain}, network: ${network}`);
                if (errorUrl) {
                    window.location.href = errorUrl;
                } else {
                    throw new Error(`Wallet address not found for chain: ${chain}, network: ${network}`);
                }
                return;
            }
            
            console.log('✅ ウォレットアドレスを取得:', walletAddress);
            
            // 署名メッセージを生成
            const domain = this.extractDomainFromRedirectUri(params.redirect_uri || '');
            const message = this.generateLinkMessage(domain, chain, network, nonce);
            console.log('📝 署名メッセージ:', message);
            
            // メッセージを署名（既に取得済みのcredentialを再利用）
            let signature;
            try {
                // startPasskeyAuth()で取得したcredentialを再利用
                signature = await this.signMessage(bitvoyInstance, productId, message, chain, providedCredential);
                if (!signature) {
                    throw new Error('Failed to sign message');
                }
            } catch (signError) {
                console.error('❌ 署名エラー:', signError);
                const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'signature_failed', 'Failed to sign message');
                if (errorUrl) {
                    window.location.href = errorUrl;
                } else {
                    throw signError;
                }
                return;
            }
            
            console.log('✅ 署名を生成:', signature);
            
            // サーバーにOIDC Link情報を送信
            const linkResponse = await fetch('/wallet/oidc-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    master_id: masterId,
                    wallet_address: walletAddress,
                    wallet_signature: signature,
                    wallet_message: message,
                    chain: chain,
                    network: network,
                    session_token: sessionStorage.getItem('bitvoy_oidc_session_token')
                })
            });
            
            const linkResult = await linkResponse.json();
            
            if (linkResult.success && linkResult.redirect_url) {
                console.log('✅ OIDC Link処理完了、リダイレクト:', linkResult.redirect_url);
                window.location.href = linkResult.redirect_url;
            } else {
                throw new Error(linkResult.error || 'OIDC Link処理に失敗しました');
            }
            
        } catch (error) {
            console.error('❌ OIDC Link処理エラー:', error);
            // エラーをRPに返す
            const params = JSON.parse(sessionStorage.getItem('bitvoy_oidc_params') || '{}');
            const errorUrl = this.buildErrorRedirectUrl(params.redirect_uri, 'wallet_not_connected', error.message);
            if (errorUrl) {
                window.location.href = errorUrl;
            } else {
                alert(`OIDC Link Error: ${error.message}`);
            }
        }
    }
    
    /**
     * Extract domain from redirect_uri
     */
    extractDomainFromRedirectUri(redirectUri) {
        try {
            const url = new URL(redirectUri);
            return url.hostname;
        } catch (error) {
            console.warn('Failed to extract domain from redirect_uri:', redirectUri);
            return 'unknown';
        }
    }
    
    /**
     * Generate OIDC Link message
     */
    generateLinkMessage(domain, chain, network, nonce) {
        const timestamp = new Date().toISOString();
        const lines = [
            'BitVoy OIDC Link',
            `Domain: ${domain}`,
            `Chain: ${chain}`,
            `Network: ${network}`
        ];
        
        if (nonce) {
            lines.push(`Nonce: ${nonce}`);
        }
        
        lines.push(`Timestamp: ${timestamp}`);
        
        return lines.join('\n');
    }
    
    /**
     * Get productId from chain name
     */
    getProductIdFromChain(chain) {
        const chainLower = chain.toLowerCase();
        const chainMap = {
            'polygon': 'POL',
            'ethereum': 'ETH',
            'bitcoin': 'BTC',
            'solana': 'SOL',
            'ton': 'TON',
            'arbitrum': 'ARB',
            'base': 'BASE',
            'optimism': 'OPT',
            'avalanche': 'AVAX',
            'bsc': 'BNB'
        };
        return chainMap[chainLower] || null;
    }
    
    /**
     * Get wallet address for productId and network
     */
    getWalletAddress(productId, network) {
        const networkKey = network === 'testnet' ? 'testnet' : 'mainnet';
        return sessionStorage.getItem(`wallet.0.${networkKey}.${productId}.address`);
    }
    
    /**
     * Sign message using BitVoy wallet
     */
    async signMessage(bitvoyInstance, productId, message, chain, providedCredential = null) {
        try {
            // EIP-191署名（Ethereum系チェーン）
            const chainLower = chain.toLowerCase();
            if (['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'avalanche', 'bsc'].includes(chainLower)) {
                // EIP-191署名を実行
                if (window.ethers && window.ethers.utils) {
                    const messageHash = window.ethers.utils.hashMessage(message);
                    console.log('📝 EIP-191メッセージハッシュ:', messageHash);
                    
                    // MPC署名を実行（既に取得済みのcredentialを再利用）
                    const context = {
                            blockchain: chainLower,
                            productId: productId,
                            reason: 'OIDC Link'
                    };
                    if (providedCredential) {
                        // PublicKeyCredentialオブジェクトをauthenticateWithPasskey()が返す形式に変換
                        // deriveEncryptionKey()とgetClientKeyPackage()が期待する形式
                        const credentialId = providedCredential.id; // base64urlエンコードされた文字列
                        context.providedCredential = {
                            credentialId: credentialId,
                            assertion: providedCredential,
                            credential: providedCredential,
                            rawId: providedCredential.rawId // ArrayBuffer
                        };
                        console.log('🔐 既に取得済みのPasskey credentialを署名処理で再利用します');
                    }
                    
                    const signature = await bitvoyInstance.signWithMPC(
                        bitvoyInstance.masterId,
                        messageHash,
                        context
                    );
                    
                    return signature;
                } else {
                    throw new Error('ethers.js is not available');
                }
            } else {
                // その他のチェーン（Bitcoin, Solana, TON等）は別の署名方式が必要
                throw new Error(`Signing for chain ${chain} is not yet implemented`);
            }
        } catch (error) {
            console.error('❌ 署名エラー:', error);
            throw error;
        }
    }
    
    /**
     * Build error redirect URL
     */
    buildErrorRedirectUrl(redirectUri, errorCode, errorDescription) {
        if (!redirectUri) return null;
        
        try {
            const url = new URL(redirectUri);
            url.searchParams.set('error', errorCode);
            url.searchParams.set('error_description', encodeURIComponent(errorDescription));
            return url.toString();
        } catch (error) {
            console.error('Failed to build error redirect URL:', error);
            return null;
        }
    }

    /**
     * Start passkey authentication
     */
    async startPasskeyAuth() {
        const button = document.getElementById('webauthnButton');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        
        if (button) {
            button.disabled = true;
        }
        if (loading) {
            loading.style.display = 'block';
        }
        if (error) {
            error.style.display = 'none';
        }
        
        try {
            console.log('🔐 ' + this.t('passkeyAuthStart'));
            
            // Start passkey authentication
            const credential = await navigator.credentials.get({
                publicKey: {
                    challenge: new Uint8Array(32),
                    rpId: window.location.hostname,
                    userVerification: 'required'
                }
            });
            
            if (credential) {
                console.log('✅ ' + this.t('passkeyAuthSuccess'));
                
                // Get session token from data attribute
                const sessionDataElement = document.getElementById('oidc-session-data');
                const sessionToken = sessionDataElement ? sessionDataElement.getAttribute('data-session-token') || '' : '';
                
                // Send passkey authentication success to server
                // langをURLクエリで常に付与
                const lang = this.currentLang || 'en';
                const masterId = await this.getMasterIdFromStorage(); // ローカルのIndexedDBからmaster_idを取得
                console.log('🔍 Retrieved master_id from storage:', masterId);
                
                // 公開鍵はサーバー側でcredential_idから取得するため、クライアント側では送信しない
                const response = await fetch('/wallet/authenticate?lang=' + encodeURIComponent(lang), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        webauthn_credential: {
                            id: credential.id,
                            type: credential.type,
                            response: {
                                authenticatorData: Array.from(new Uint8Array(credential.response.authenticatorData)),
                                clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
                                signature: Array.from(new Uint8Array(credential.response.signature)),
                                userHandle: credential.response.userHandle 
                                    ? Array.from(new Uint8Array(credential.response.userHandle))
                                    : null
                            }
                        },
                        master_id: masterId, // ローカルのIndexedDBから取得したmaster_id
                        session_token: sessionToken // Send JWT token
                    })
                });
                
                const result = await response.json();
                
                if (result.success && result.redirect_url) {
                    console.log('🔄 ' + this.t('oidcFlowResume') + ':', result.redirect_url);
                    
                    // OIDC認証完了時にウォレット情報を自動展開
                    await this.loadWalletInformationAfterAuth(credential, masterId);
                    
                    // OIDC Link処理を実行
                    const isLink = (sessionStorage.getItem('bitvoy_link_flag') || '').toString().toLowerCase();
                    if (isLink === '1' || isLink === 'true') {
                        console.log('🔗 OIDC Linkモードを検出、ウォレットアドレスと署名を取得します');
                        // 既に取得したcredentialを渡して、署名時に再利用する
                        await this.handleOIDCLink(masterId, result.redirect_url, credential);
                        return;
                    }
                    
                    // Resume OIDC flow
                    window.location.href = result.redirect_url;
                } else {
                    throw new Error(result.error || this.t('authFailed'));
                }
            } else {
                throw new Error(this.t('passkeyAuthCanceled'));
            }
            
        } catch (error) {
            console.error('❌ Passkey authentication error:', error);
            if (document.getElementById('error')) {
                let errorMessage = error.message || this.t('passkeyAuthFailed');
                // i18nextが利用可能な場合は翻訳を適用
                if (typeof i18next !== 'undefined' && i18next.isInitialized) {
                    errorMessage = i18next.t('wallet.authFailed');
                }
                document.getElementById('error').textContent = errorMessage;
                document.getElementById('error').style.display = 'block';
            }
            if (button) {
                button.disabled = false;
            }
            if (loading) {
                loading.style.display = 'none';
            }
        }
    }
}

// Global instance
window.bitvoyOIDCClient = new BitVoyOIDCClient();

// Auto-execute on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set up passkey authentication button event listener
    const webauthnButton = document.getElementById('webauthnButton');
    if (webauthnButton) {
        console.log('🔐 Passkey authentication button detected - setting up event listener');
        webauthnButton.addEventListener('click', () => {
            window.bitvoyOIDCClient.startPasskeyAuth();
        });
    }
    
    // Set up unregistered user page button event listeners
    const getStartedBtn = document.getElementById('get-started-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    
    if (getStartedBtn) {
        console.log('🔐 Unregistered user page detected - setting up Get Started button');
        // Save OIDC flag to session storage
        sessionStorage.setItem('bitvoy_oidc_flag', 'true');
        
        getStartedBtn.addEventListener('click', function() {
            console.log('🔄 ' + window.bitvoyOIDCClient.t('getStartedButton') + ' clicked - ' + window.bitvoyOIDCClient.t('redirectToIndex'));
            // Redirect to index.html after 2 seconds
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        });
    }
    
    if (cancelBtn) {
        console.log('🔐 Unregistered user page detected - setting up Cancel button');
        cancelBtn.addEventListener('click', function() {
            console.log('❌ ' + window.bitvoyOIDCClient.t('cancelButton') + ' clicked - ' + window.bitvoyOIDCClient.t('clearOidcFlag'));
            // Clear OIDC flag
            sessionStorage.removeItem('bitvoy_oidc_flag');
            window.close();
        });
    }
    
    console.log('🔐 ' + window.bitvoyOIDCClient.t('oidcAuthFlowStart'));
    window.bitvoyOIDCClient.startOIDCAuth();
});
