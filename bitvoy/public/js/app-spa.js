/**
 * app-mpc.js - BitVoy MPC Application Entry Point (JWT対応緊急機能改良版)
 * Guardian Node JWT認証対応・リカバリー機能統合
 */

// 初期化フラグ
let appInitialized = false;

console.log('🔧 app-mpc.js loaded, setting up event listeners...');
console.log('🔧 app-mpc.js script execution started at:', new Date().toISOString());

// スクリプト読み込み完了時の即座チェック
console.log('🔧 Checking if bitvoy_libraries_ready event was already fired...');
console.log('🔧 Current document readyState:', document.readyState);
console.log('🔧 BitVoy libraries status:', {
    BitVoyConfig: typeof window.BitVoyConfig,
    BitVoyStorage: typeof window.BitVoyStorage,
    BitVoyMPC: typeof window.BitVoyMPC,
    BitVoyWallet: typeof window.BitVoyWallet,
    BitVoy: typeof window.BitVoy,
    MPCAddressGenerator: typeof window.MPCAddressGenerator
});

// 即座にイベントリスナーを登録
document.addEventListener("bitvoy_libraries_ready", async function() {
    console.log('🎯 bitvoy_libraries_ready event received in app-mpc.js');
    console.log('🎯 Event timestamp:', new Date().toISOString());
    console.log('🎯 appInitialized flag:', appInitialized);
    
    if (appInitialized) {
        console.log('⚠️ app-mpc.js already initialized, skipping...');
        return;
    }
    console.log('🚀 Starting app-mpc.js initialization...');
    appInitialized = true;
    await initializeApp();
});

// frost-wasm-init.jsの読み込み完了イベントも監視
document.addEventListener("frost_wasm_libraries_complete", async function(event) {
    console.log('🎯 frost_wasm_libraries_complete event received in app-mpc.js');
    console.log('🎯 Event detail:', event.detail);
    
    if (appInitialized) {
        console.log('⚠️ app-mpc.js already initialized, skipping...');
        return;
    }
    console.log('🚀 Starting app-mpc.js initialization from frost_wasm_libraries_complete...');
    appInitialized = true;
    await initializeApp();
});

// フォールバック: DOMContentLoadedでも初期化を試行
document.addEventListener("DOMContentLoaded", async function() {
    console.log('🎯 DOMContentLoaded event received in app-mpc.js');
    if (appInitialized) {
        console.log('⚠️ app-mpc.js already initialized, skipping...');
        return;
    }
    
    // BitVoyライブラリが既に読み込まれている場合は初期化
    if (typeof BitVoyConfig !== 'undefined' && typeof BitVoyMPC !== 'undefined') {
        console.log('🚀 Starting app-mpc.js initialization (DOMContentLoaded fallback)...');
        appInitialized = true;
        await initializeApp();
    } else {
        console.log('⏳ BitVoy libraries not ready yet, waiting for bitvoy_libraries_ready event...');
    }

    bindLanguageSelector();
});

function bindLanguageSelector() {
  const el = document.querySelector('#menu-language-selector');
  if (!el) return false;

  // 初期値を設定（localStorageから）
  const storedLang = localStorage.getItem('lang');
  const supported = ['en', 'ja'];
  if (storedLang && supported.indexOf(storedLang) >= 0) {
    el.value = storedLang;
    console.log('[Menu] Language selector bound with initial value:', storedLang);
  }

  el.addEventListener('change', async (e) => {
    const selectedLang = e.target.value;
    localStorage.setItem('lang', selectedLang);

    if (window.i18next?.changeLanguage) {
      await i18next.changeLanguage(selectedLang);
      window.applyI18n?.();
    }
  });

  return true;
}

// 即座にチェック: 既にイベントが発火している場合
if (document.readyState === 'loading') {
    console.log('⏳ Document still loading, waiting for events...');
} else {
    console.log('📄 Document already loaded, checking if libraries are ready...');
    // DOMContentLoadedが既に発火している場合の処理
    if (typeof BitVoyConfig !== 'undefined' && typeof BitVoyMPC !== 'undefined' && !appInitialized) {
        console.log('🚀 Libraries already available, starting initialization immediately...');
        appInitialized = true;
        initializeApp();
    }
}

// 即座に初期化を試行（フォールバック）
setTimeout(async () => {
    if (!appInitialized && typeof BitVoyConfig !== 'undefined' && typeof BitVoyMPC !== 'undefined') {
        console.log('🚀 Delayed initialization attempt...');
        appInitialized = true;
        await initializeApp();
    }
}, 1000);

// 追加: ライブラリが利用可能になった場合の即座チェック
setTimeout(async () => {
    console.log('🔍 Checking if all required libraries are now available...');
    const allLibrariesAvailable = typeof window.BitVoyConfig !== 'undefined' && 
                                 typeof window.BitVoyStorage !== 'undefined' && 
                                 typeof window.BitVoyMPC !== 'undefined' && 
                                 typeof window.BitVoyWallet !== 'undefined' && 
                                 typeof window.BitVoy !== 'undefined' && 
                                 typeof window.MPCAddressGenerator !== 'undefined';
    
    console.log('🔍 All libraries available:', allLibrariesAvailable);
    
    if (allLibrariesAvailable && !appInitialized) {
        console.log('🚀 All libraries are available, starting initialization...');
        appInitialized = true;
        await initializeApp();
    }
}, 2000);

// 追加: より長い間隔での最終チェック
setTimeout(async () => {
    if (!appInitialized) {
        console.log('🔍 Final check for library availability...');
        const allLibrariesAvailable = typeof window.BitVoyConfig !== 'undefined' && 
                                     typeof window.BitVoyStorage !== 'undefined' && 
                                     typeof window.BitVoyMPC !== 'undefined' && 
                                     typeof window.BitVoyWallet !== 'undefined' && 
                                     typeof window.BitVoy !== 'undefined' && 
                                     typeof window.MPCAddressGenerator !== 'undefined';
        
        if (allLibrariesAvailable) {
            console.log('🚀 Final check: All libraries are available, starting initialization...');
            appInitialized = true;
            await initializeApp();
        } else {
            console.log('⏳ Final check: Some libraries are still missing, waiting for frost-wasm-init.js to complete...');
            // エラーではなく、待機メッセージに変更
        }
    }
}, 5000);

// 追加: frost-wasm-init.jsの読み込み完了を待つ最終チェック
setTimeout(async () => {
    if (!appInitialized) {
        console.log('🔍 Extended check: Waiting for frost-wasm-init.js to complete...');
        
        // frost-wasm-init.jsの読み込み完了を待つ
        let waitCount = 0;
        const maxWait = 100; // 最大10秒
        
        while (!appInitialized && waitCount < maxWait) {
            const allLibrariesAvailable = typeof window.BitVoyConfig !== 'undefined' && 
                                         typeof window.BitVoyStorage !== 'undefined' && 
                                         typeof window.BitVoyMPC !== 'undefined' && 
                                         typeof window.BitVoyWallet !== 'undefined' && 
                                         typeof window.BitVoy !== 'undefined' && 
                                         typeof window.MPCAddressGenerator !== 'undefined';
            
            if (allLibrariesAvailable) {
                console.log('🚀 Extended check: All libraries are now available, starting initialization...');
                appInitialized = true;
                await initializeApp();
                break;
            }
            
            console.log(`⏳ Extended check: Waiting for libraries... (${waitCount + 1}/${maxWait})`);
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        
        if (!appInitialized) {
            console.error('❌ Extended check: Timeout waiting for libraries to become available');
        }
    }
}, 8000);

async function initializeApp() {
    console.log('🔧 initializeApp() called - starting BitVoy MPC application initialization...');
    
    // ローディング表示を確実に開始
    const loadingElement = document.querySelector('#loading');
    if (loadingElement) {
        loadingElement.classList.remove('hide');
        const loadingContent = loadingElement.querySelector('.loading-content');
        if (loadingContent) {
            loadingContent.innerHTML = `
                <div style="margin-bottom: 10px;">⏳ Initializing BitVoy Wallet...</div>
                <div style="font-size: 0.8em; opacity: 0.7;">Loading libraries and preparing secure environment</div>
            `;
        }
    }
    
    // Check Passkey support
    if (!window.PublicKeyCredential) {
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
        alert("Error: this browser does not support Passkey, which is required for MPC wallets");
        return;
    }

    // Check required libraries (統一されたクラス名で確認)
    console.log('=== Library Availability Check ===');
    console.log('window.BitVoyMPC:', typeof window.BitVoyMPC);
    console.log('window.BitVoyWallet:', typeof window.BitVoyWallet);
    console.log('window.BitVoy:', typeof window.BitVoy);
    console.log('window.BitVoyStorage:', typeof window.BitVoyStorage);
    console.log('window.MPCAddressGenerator:', typeof window.MPCAddressGenerator);
    console.log('==================================');
    
    // より詳細なライブラリチェック
    const requiredLibraries = [
        { name: 'BitVoyMPC', global: window.BitVoyMPC },
        { name: 'BitVoyWallet', global: window.BitVoyWallet },
        { name: 'BitVoy', global: window.BitVoy },
        { name: 'BitVoyStorage', global: window.BitVoyStorage },
        { name: 'MPCAddressGenerator', global: window.MPCAddressGenerator }
    ];
    
    const missingLibraries = [];
    const availableLibraries = [];
    
    for (const lib of requiredLibraries) {
        if (!lib.global) {
            missingLibraries.push(lib.name);
            console.error(`❌ ${lib.name} is missing`);
        } else {
            availableLibraries.push(lib.name);
            console.log(`✅ ${lib.name} is available`);
        }
    }
    
    // 不足しているライブラリがある場合は、リトライ
    if (missingLibraries.length > 0) {
        console.log(`⏳ Some libraries are missing: ${missingLibraries.join(', ')}. Attempting retry...`);
        
        let retryCount = 0;
        const maxRetries = 30; // 最大30回リトライ（6秒）
        const retryInterval = 200; // 200ms間隔
        
        while (missingLibraries.length > 0 && retryCount < maxRetries) {
            console.log(`⏳ Retry ${retryCount + 1}/${maxRetries}: Waiting for missing libraries...`);
            await new Promise(resolve => setTimeout(resolve, retryInterval));
            
            // 再チェック
            const stillMissing = [];
            const nowAvailable = [];
            
            for (const libName of missingLibraries) {
                if (typeof window[libName] !== 'undefined') {
                    nowAvailable.push(libName);
                    console.log(`✅ ${libName} is now available after retry`);
                } else {
                    stillMissing.push(libName);
                }
            }
            
            // リストを更新
            missingLibraries.length = 0;
            missingLibraries.push(...stillMissing);
            availableLibraries.push(...nowAvailable);
            
            retryCount++;
        }
        
        if (missingLibraries.length > 0) {
            console.error('❌ Some libraries are still missing after all retries:', missingLibraries);
        } else {
            console.log('✅ All libraries are now available after retry');
        }
    }
    
    if (missingLibraries.length > 0) {
        console.error('Missing libraries:', missingLibraries);
        console.error('Available libraries:', availableLibraries);
        
        // より詳細なエラーメッセージ
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
        const errorMessage = `Required MPC libraries not loaded: ${missingLibraries.join(', ')}\n\nAvailable: ${availableLibraries.join(', ')}\n\nPlease refresh the page and try again.`;
        alert(errorMessage);
        return;
    }
    
    console.log('✅ All required libraries are available');

    // BITVOY_LOADINGフラグがfalseになるまで待機
    console.log('⏳ Waiting for BitVoy system initialization...');
    await waitForBitVoyInitialization();

    // Initialize MPC BitVoy wallet (単一インスタンス)
    let bitvoyMPC = null;
    let masterId = null;
    let initializationStatus = { success: false, error: null };

    try {
        console.log("Creating BitVoy unified instance...");
        bitvoyMPC = new BitVoy(); // 統一されたクラスを使用
        
        console.log("Initializing BitVoy integrated system...");
        await bitvoyMPC.init();
        
        masterId = bitvoyMPC.getMasterId();
        initializationStatus.success = true;
        console.log("BitVoy MPC initialized successfully");
    } catch (error) {
        console.error("BitVoy MPC initialization failed:", error);
        initializationStatus.error = error.message;
    }

    // UI elements
    const restoreElement = document.getElementById("restoreaccount");
    const signoutElement = document.querySelector(".signout");
    const getStartedElements = Array.from(document.querySelectorAll('.getstarted'));
    const emailAlertElement = document.getElementById('setemailalert');

    // デバッグ: UI要素の確認
    console.log('=== UI Elements Debug Info ===');
    console.log('restoreElement:', restoreElement);
    console.log('signoutElement:', signoutElement);
    console.log('getStartedElements count:', getStartedElements.length);
    console.log('getStartedElements:', getStartedElements);
    console.log('emailAlertElement:', emailAlertElement);
    console.log('================================');

    // Hide logout initially
    if (signoutElement) {
        signoutElement.parentElement.style.display = 'none';
    }

    // Hide complete logout initially
    const completeSignoutElement = document.querySelector('.complete-signout');
    if (completeSignoutElement) {
        completeSignoutElement.parentElement.style.display = 'none';
    }

    // Hide My Setup menu initially
    const mysetupMenu = document.getElementById('mysetup-menu');
    if (mysetupMenu) {
        mysetupMenu.parentElement.style.display = 'none';
    }

    // Handle initialization failure
    if (!initializationStatus.success) {
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
        showError("Initialization Failed", initializationStatus.error);
        return;
    }

    // Configure UI based on wallet state
    if (masterId) {
        console.log("Existing wallet found:", masterId);
        
        if (restoreElement) {
            restoreElement.style.display = 'none';
        }

        if (bitvoyMPC.isSignin()) {
            // User is signed in
            setupSignedInUI();
        } else {
            // User needs to sign in
            setupSignInUI();
        }
    } else {
        // No wallet exists, user needs to register
        console.log("No existing wallet found, setting up registration UI...");
        setupRegistrationUI();
    }

    /**
     * Setup UI for signed-in user
     */
    function setupSignedInUI() {
        console.log("Setting up signed-in UI");
        
        // Show logout button
        if (signoutElement) {
            signoutElement.parentElement.style.display = 'block';
        }

        // Show complete logout button
        const completeSignoutElement = document.querySelector('.complete-signout');
        if (completeSignoutElement) {
            completeSignoutElement.parentElement.style.display = 'block';
        }

        // Show My Setup menu
        const mysetupMenu = document.getElementById('mysetup-menu');
        if (mysetupMenu) {
            mysetupMenu.parentElement.style.display = 'block';
        }

        // Hide get started buttons and their parent elements
        getStartedElements.forEach(element => {
            element.style.display = 'none';
            // 親要素（<li>）も非表示にする
            if (element.parentElement) {
                element.parentElement.style.display = 'none';
            }
        });

        // Hide Easy Recovery button when signed in
        const emergencyRecoveryBtn = document.getElementById('emergency-recovery-btn-menu');
        if (emergencyRecoveryBtn) {
            emergencyRecoveryBtn.parentElement.style.display = 'none';
            console.log("Easy Recovery button hidden (user is signed in)");
        }

        // Check email setup
        checkEmailSetup();
        
        // Setup easy recovery button
        setupEmergencyRecoveryUI();
        
        // Setup My Setup menu
        setupMySetupMenu();
        
        // メニューの言語セレクターを初期化
        initMenuLanguageSelector();
        
        // Sign In完了時にIndexedDBからネットワーク設定を取得してSessionStorageに保存
        loadNetworkSetting().then(network => {
          if (network) {
            sessionStorage.setItem('mpc.current_network', network);
            console.log('✅ Network setting loaded from IndexedDB to SessionStorage:', network);
          }
        });
        
        // BitVoyStorageのグローバルインスタンスを初期化
        if (typeof window.BitVoyStorage !== 'undefined' && !window.bitvoyStorageInstance) {
            window.bitvoyStorageInstance = new window.BitVoyStorage();
            window.bitvoyStorageInstance.init().catch(error => {
                console.error('Failed to initialize BitVoyStorage:', error);
            });
        }
        
        // localStorageからIndexedDBへの移行処理（初回のみ）
        migrateSettingsToIndexedDB();
        
        // ページフォーカス時にIndexedDBから設定を再読み込み（タブ間の同期）
        setupIndexedDBSync();
        
        // 初期化完了：ローディングを非表示
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
    }

    /**
     * Setup easy recovery UI
     */
    function setupEmergencyRecoveryUI() {
        // Easy Recoveryボタンの動的生成を無効化
        // メニュー内のEasy Recoveryボタンを使用
        console.log("Easy Recovery UI setup completed (using menu button)");
    }

    /**
     * Setup UI for sign-in
     */
    function setupSignInUI() {
        console.log("Setting up sign-in UI");
        
        getStartedElements.forEach(element => {
            const signInText = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t)
                ? i18next.t('actions.signIn', { ns: 'common' })
                : 'Log In';
            element.innerHTML = signInText;
            element.onclick = async function(event) {
                event.preventDefault();
                await handleSignIn();
            };
        });

        // Show mainwallet div for sign in
        const mainwalletElement = document.querySelector('.mainwallet');
        if (mainwalletElement) {
            mainwalletElement.style.display = 'block';
            console.log("✅ mainwallet element displayed for sign in");
        }

        // Hide My Setup menu when not signed in
        const mysetupMenu = document.getElementById('mysetup-menu');
        if (mysetupMenu) {
            mysetupMenu.parentElement.style.display = 'none';
        }

        // Hide Easy Recovery button when user needs to sign in
        const emergencyRecoveryBtn = document.getElementById('emergency-recovery-btn-menu');
        if (emergencyRecoveryBtn) {
            emergencyRecoveryBtn.parentElement.style.display = 'none';
            console.log("Easy Recovery button hidden (user needs to sign in)");
        }
        
        // 初期化完了：ローディングを非表示
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
    }

    /**
     * Setup UI for registration
     */
    function setupRegistrationUI() {
        console.log("🔧 Setting up registration UI...");
        
        // Show mainwallet div for registration
        const mainwalletElement = document.querySelector('.mainwallet');
        if (mainwalletElement) {
            mainwalletElement.style.display = 'block';
            console.log("✅ mainwallet element displayed for registration");
        }
        
        // Hide My Setup menu when not signed in
        const mysetupMenu = document.getElementById('mysetup-menu');
        if (mysetupMenu) {
            mysetupMenu.parentElement.style.display = 'none';
        }
        
        // 既にウォレットが存在する場合は警告を表示
        if (masterId) {
            console.log("⚠️ Wallet already exists, showing warning instead of registration UI");
            getStartedElements.forEach((element, index) => {
                console.log(`🔧 Setting up Get Started button ${index + 1} (wallet exists):`, element);
                element.innerHTML = 'Wallet Already Exists';
                element.style.opacity = '0.6';
                element.style.cursor = 'not-allowed';
                
                // 既存のイベントリスナーを削除
                element.onclick = null;
                element.removeEventListener('click', element._registrationHandler);
                
                // 警告メッセージを表示するイベントリスナーを設定
                const handler = async function(event) {
                    console.log('🎯 Get Started button clicked (wallet exists)!');
                    event.preventDefault();
                    event.stopPropagation();
                    const errorTitle = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t)
                        ? i18next.t('errors.walletAlreadyExists.title', { ns: 'common' })
                        : 'Wallet Already Exists';
                    const errorMessage = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t)
                        ? i18next.t('errors.walletAlreadyExists.message', { ns: 'common' })
                        : 'A wallet has already been created for this device.<br><br>If you need to access your existing wallet, please use the "Log In" option instead.<br><br>If you want to perform easy recovery, please use the "Easy Recovery" option.';
                    showError(errorTitle, errorMessage);
                };
                
                element.onclick = handler;
                element._registrationHandler = handler;
                
                console.log(`✅ Get Started button ${index + 1} configured (wallet exists warning)`);
            });
        } else {
            // iOS判定を行う
            const ua = navigator.userAgent || navigator.vendor || window.opera || '';
            const uaLower = ua.toLowerCase();
            const isIOS = /iphone|ipad|ipod/.test(uaLower);
            
            // 通常の登録UI設定
            getStartedElements.forEach((element, index) => {
                console.log(`🔧 Setting up Get Started button ${index + 1}:`, element);
                element.textContent = i18next.t('actions.getStarted');
                element.style.opacity = '1';
                element.style.cursor = 'pointer';
                
                // 既存のイベントリスナーを削除
                element.onclick = null;
                element.removeEventListener('click', element._registrationHandler);
                
                // 新しいイベントリスナーを設定
                const handler = async function(event) {
                    console.log('🎯 Get Started button clicked!');
                    event.preventDefault();
                    event.stopPropagation();
                    
                    // iOSの場合、ダイアログを表示
                    if (isIOS) {
                        await showIOSInitializationDialog();
                    } else {
                        // 非iOS共通：通常の初期化処理へ
                        await handleRegistration();
                    }
                };
                
                element.onclick = handler;
                element._registrationHandler = handler; // 後で削除するために保存
                
                console.log(`✅ Get Started button ${index + 1} configured`);
            });
        }
        
        // Show Easy Recovery button when user needs to register
        const emergencyRecoveryBtn = document.getElementById('emergency-recovery-btn-menu');
        if (emergencyRecoveryBtn) {
            emergencyRecoveryBtn.parentElement.style.display = 'block';
            console.log("Easy Recovery button shown (user needs to register)");
        }
        
        console.log(`✅ Registration UI setup completed for ${getStartedElements.length} buttons`);
        
        // 初期化完了：ローディングを非表示
        if (loadingElement) {
            loadingElement.classList.add('hide');
        }
    }

    /**
     * SPA Routing Handler
     */
    function setupSPARouting() {
        console.log('🔧 Setting up SPA routing...');
        
        // 初期ルート処理
        function handleRoute() {
            const hash = window.location.hash || '#home';
            console.log('📍 Current route:', hash);
            
            // is-transitioningクラスを削除（前回の遷移が残っている場合があるため）
            const wrapper = document.getElementById('wrapper');
            if (wrapper) {
                wrapper.classList.remove('is-transitioning');
            }
            document.querySelectorAll('.is-transitioning').forEach(el => {
                el.classList.remove('is-transitioning');
            });
            
            // すべてのページを非表示
            const mainPage = document.getElementById('main');
            const coinsPage = document.getElementById('coins-page');
            const nftsPage = document.getElementById('nfts-page');
            const swapPage = document.getElementById('swap-page');
            const crossPage = document.getElementById('cross-page');
            const mysetupPage = document.getElementById('mysetup-page');
            const scantopayPage = document.getElementById('scantopay-page');
            const receivepayPage = document.getElementById('receivepay-page');
            const walletconnectPage = document.getElementById('walletconnect-page');
            const banner = document.getElementById('banner');
            
            if (mainPage) mainPage.style.display = 'none';
            if (coinsPage) coinsPage.style.display = 'none';
            if (nftsPage) nftsPage.style.display = 'none';
            if (swapPage) swapPage.style.display = 'none';
            if (crossPage) crossPage.style.display = 'none';
            if (mysetupPage) mysetupPage.style.display = 'none';
            if (scantopayPage) scantopayPage.style.display = 'none';
            if (receivepayPage) receivepayPage.style.display = 'none';
            if (walletconnectPage) walletconnectPage.style.display = 'none';
            if (banner) banner.style.display = 'none';
            
            // ルートに応じてページを表示
            if (hash === '#mysetup') {
                console.log('📄 Showing mysetup page');
                if (mysetupPage) {
                    mysetupPage.style.display = 'block';
                    // 翻訳を再適用
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #mysetup-page');
                        window.applyI18n();
                    }
                    // Push通知の購読状態を確認してトグルを更新
                    if (typeof updatePushNotificationToggle === 'function') {
                        updatePushNotificationToggle();
                    }
                    // Developerトグルの状態を復元
                    const developerToggle = document.getElementById('developer-toggle');
                    if (developerToggle) {
                        loadDeveloperMode().then(isDeveloperMode => {
                            developerToggle.checked = isDeveloperMode;
                            handleDeveloperToggle(isDeveloperMode);
                        }).catch(error => {
                            console.error('❌ Error loading developer mode:', error);
                            developerToggle.checked = false;
                            handleDeveloperToggle(false);
                        });
                    }
                    // 支払い設定を読み込み
                    if (typeof loadPaymentSettings === 'function') {
                        loadPaymentSettings();
                    }
                }
            } else if (hash === '#coins') {
                console.log('📄 Showing coins page');
                if (coinsPage) {
                    coinsPage.style.display = 'block';
                    // 翻訳を再適用（#coins-pageが非表示だったため、翻訳が適用されていない可能性がある）
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #coins-page');
                        window.applyI18n();
                    }
                    // coins.jsの初期化をトリガー
                    if (typeof window.checkCoinsPageInitialization === 'function') {
                        window.checkCoinsPageInitialization();
                    }
                    
                    // 送金情報が既に設定されている場合（Scan to Payからの遷移など）は、#viewCoinを表示せずに送金確認画面を表示
                    // ただし、送金確認画面が表示されている場合（送信途中でHOMEに戻った場合）はリセットして一覧を表示
                    const viewSendConfirm = document.getElementById('viewSendConfirm');
                    const isSendConfirmVisible = viewSendConfirm && !viewSendConfirm.hidden;
                    
                    if (isSendConfirmVisible) {
                        // 送信途中でHOMEに戻った場合、状態をリセットして一覧を表示
                        console.log('🔄 Send confirm view is visible, resetting state and showing coin list');
                        // coinsViewCoin()が呼ばれると自動的にリセットされる
                        // 少し待ってからcoinsViewCoin()を呼び出す（coins.jsの初期化を待つ）
                        setTimeout(() => {
                            if (typeof coinsViewCoin === 'function') {
                                coinsViewCoin();
                            }
                        }, 100);
                    } else if (window.selectedCoinForSend && document.getElementById('send-address')?.value && document.getElementById('send-amount')?.value) {
                        console.log('📄 Send info already set, showing send confirm view directly');
                        // 少し待ってから送金確認画面を表示（coins.jsの初期化を待つ）
                        setTimeout(() => {
                            if (typeof coinsViewSendConfirm === 'function') {
                                coinsViewSendConfirm(true);
                            }
                        }, 100);
                    } else {
                        // #viewCoinを初期表示する
                        const viewCoin = document.querySelector('#viewCoin');
                        const viewIcon = document.querySelector('#viewIcon');
                        if (viewCoin) {
                            // 他のビューを非表示にする
                            const otherViews = ['#viewHistory', '#viewCoinSelect', '#viewSend', '#viewReader', 
                                               '#viewSendConfirm', '#viewReceive', '#viewAddToken'];
                            otherViews.forEach(selector => {
                                const el = document.querySelector(selector);
                                if (el) el.hidden = true;
                            });
                            // #viewCoinと#viewIconを表示
                            viewCoin.hidden = false;
                            if (viewIcon) viewIcon.hidden = false;
                            console.log('📄 #viewCoin displayed as initial view');
                        }
                    }
                    
                    // 既に初期化済みの場合でもcoinsViewCoin()を呼び出す
                    // 初期化が完了するまで待つ（最大10秒）
                    let retryCount = 0;
                    const maxRetries = 100; // 10秒
                    const checkAndShowCoins = () => {
                        retryCount++;
                        // coins.jsが利用可能で、初期化が完了していることを確認
                        if (typeof coinsViewCoin === 'function' && window.coinsPageInitialized === true) {
                            // coinsMasterIdが設定されているか確認（リロード時に対応）
                            if (window.coinsMasterId) {
                                console.log('📄 Calling coinsViewCoin() for #coins page');
                                coinsViewCoin();
                                // coinsViewCoin()実行後にも翻訳を再適用（動的に生成される要素に対応）
                                setTimeout(() => {
                                    if (typeof window.applyI18n === 'function') {
                                        console.log('🌐 Re-applying translations after coinsViewCoin()');
                                        window.applyI18n();
                                    }
                                }, 100);
                            } else {
                                // coinsMasterIdがまだ設定されていない場合、少し待って再試行
                                if (retryCount < maxRetries) {
                                setTimeout(checkAndShowCoins, 100);
                                } else {
                                    console.warn('⚠️ coinsMasterId not available after timeout, but #viewCoin is already displayed');
                                }
                            }
                        } else {
                            // coinsViewCoinがまだ利用できない、または初期化が完了していない場合、再試行
                            if (retryCount < maxRetries) {
                            setTimeout(checkAndShowCoins, 100);
                            } else {
                                console.warn('⚠️ coins.js initialization not completed after timeout, but #viewCoin is already displayed');
                            }
                        }
                    };
                    checkAndShowCoins();
                }
            } else if (hash === '#nfts') {
                console.log('📄 Showing nfts page');
                if (nftsPage) {
                    nftsPage.style.display = 'block';
                    // 翻訳を再適用（#nfts-pageが非表示だったため、翻訳が適用されていない可能性がある）
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #nfts-page');
                        window.applyI18n();
                    }
                    // nfts.jsの初期化をトリガー
                    if (typeof window.checkNFTsPageInitialization === 'function') {
                        window.checkNFTsPageInitialization();
                    }
                    
                    // #nfts-viewNFTを初期表示する
                    const viewNFT = document.querySelector('#nfts-viewNFT');
                    const viewIcon = document.querySelector('#nfts-viewIcon');
                    if (viewNFT) {
                        // 他のビューを非表示にする
                        const otherViews = ['#nfts-viewDetail', '#nfts-viewSend', '#nfts-viewReader', 
                                           '#nfts-viewSendConfirm', '#nfts-viewReceive', '#nfts-viewImport'];
                        otherViews.forEach(selector => {
                            const el = document.querySelector(selector);
                            if (el) el.hidden = true;
                        });
                        // #nfts-viewNFTと#nfts-viewIconを表示
                        viewNFT.hidden = false;
                        if (viewIcon) viewIcon.hidden = false;
                        console.log('📄 #nfts-viewNFT displayed as initial view');
                    }
                    
                    // 既に初期化済みの場合でもnftsViewNFT()を呼び出す
                    // 初期化が完了するまで待つ（最大10秒）
                    let retryCount = 0;
                    const maxRetries = 100; // 10秒
                    const checkAndShowNFTs = () => {
                        retryCount++;
                        // nfts.jsが利用可能で、初期化が完了していることを確認
                        if (typeof nftsViewNFT === 'function' && window.nftsPageInitialized === true) {
                            // nftsMasterIdが設定されているか確認（リロード時に対応）
                            if (window.nftsMasterId) {
                                console.log('📄 Calling nftsViewNFT() for #nfts page');
                                nftsViewNFT();
                                // nftsViewNFT()実行後にも翻訳を再適用（動的に生成される要素に対応）
                                setTimeout(() => {
                                    if (typeof window.applyI18n === 'function') {
                                        console.log('🌐 Re-applying translations after nftsViewNFT()');
                                        window.applyI18n();
                                    }
                                }, 100);
                            } else {
                                // nftsMasterIdがまだ設定されていない場合、少し待って再試行
                                if (retryCount < maxRetries) {
                                setTimeout(checkAndShowNFTs, 100);
                                } else {
                                    console.warn('⚠️ nftsMasterId not available after timeout, but #nfts-viewNFT is already displayed');
                                }
                            }
                        } else {
                            // nftsViewNFTがまだ利用できない、または初期化が完了していない場合、再試行
                            if (retryCount < maxRetries) {
                            setTimeout(checkAndShowNFTs, 100);
                            } else {
                                console.warn('⚠️ nfts.js initialization not completed after timeout, but #nfts-viewNFT is already displayed');
                            }
                        }
                    };
                    checkAndShowNFTs();
                }
            } else if (hash === '#swap') {
                console.log('📄 Showing swap page');
                if (swapPage) {
                    swapPage.style.display = 'block';
                    // swap名前空間が読み込まれているか確認し、読み込まれていない場合は動的に読み込む
                    const ensureSwapNamespace = () => {
                        if (typeof i18next !== 'undefined' && i18next.isInitialized) {
                            const loadedNS = i18next.options.ns || [];
                            if (loadedNS.indexOf('swap') < 0) {
                                console.log('📦 Loading swap namespace dynamically');
                                i18next.loadNamespaces('swap').then(() => {
                                    console.log('✅ swap namespace loaded');
                                    if (typeof window.applyI18n === 'function') {
                                        window.applyI18n();
                                    }
                                }).catch((err) => {
                                    console.error('❌ Failed to load swap namespace:', err);
                                });
                            } else {
                                // 既に読み込まれている場合は翻訳を再適用
                                if (typeof window.applyI18n === 'function') {
                                    window.applyI18n();
                                }
                            }
                        } else {
                            // i18nextが初期化されていない場合は少し待って再試行
                            setTimeout(ensureSwapNamespace, 100);
                        }
                    };
                    ensureSwapNamespace();
                    // 翻訳を再適用（#swap-pageが非表示だったため、翻訳が適用されていない可能性がある）
                    // 少し遅延を入れて確実に翻訳を適用
                    setTimeout(() => {
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #swap-page');
                        window.applyI18n();
                    }
                    }, 50);
                    // swap.jsの初期化をトリガー
                    if (typeof swapInit === 'function') {
                        console.log('🔄 Initializing swap page');
                        swapInit();
                        // swapInit()の後にも翻訳を再適用（動的に追加される要素がある可能性があるため）
                        setTimeout(() => {
                            if (typeof window.applyI18n === 'function') {
                                window.applyI18n();
                            }
                        }, 100);
                    } else {
                        // swap.jsがまだ読み込まれていない場合、少し待って再試行
                        let retryCount = 0;
                        const maxRetries = 50; // 5秒
                        const checkAndInitSwap = () => {
                            retryCount++;
                            if (typeof swapInit === 'function') {
                                console.log('🔄 Initializing swap page (retry)');
                                swapInit();
                                // swapInit()の後にも翻訳を再適用
                                setTimeout(() => {
                                    if (typeof window.applyI18n === 'function') {
                                        window.applyI18n();
                                    }
                                }, 100);
                            } else if (retryCount < maxRetries) {
                                setTimeout(checkAndInitSwap, 100);
                            } else {
                                console.warn('⚠️ swap.js initialization function not available after timeout');
                            }
                        };
                        setTimeout(checkAndInitSwap, 100);
                    }
                }
            } else if (hash === '#cross') {
                console.log('📄 Showing cross-chain swap page');
                if (crossPage) {
                    crossPage.style.display = 'block';
                    // 翻訳を再適用（#cross-pageが非表示だったため、翻訳が適用されていない可能性がある）
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #cross-page');
                        window.applyI18n();
                    }
                    // crosschain.jsの初期化をトリガー
                    if (typeof crossInit === 'function') {
                        console.log('🔄 Initializing cross-chain swap page');
                        crossInit();
                    } else {
                        // crosschain.jsがまだ読み込まれていない場合、少し待って再試行
                        let retryCount = 0;
                        const maxRetries = 50; // 5秒
                        const checkAndInitCross = () => {
                            retryCount++;
                            if (typeof crossInit === 'function') {
                                console.log('🔄 Initializing cross-chain swap page (retry)');
                                crossInit();
                            } else if (retryCount < maxRetries) {
                                setTimeout(checkAndInitCross, 100);
                            } else {
                                console.warn('⚠️ crosschain.js initialization function not available after timeout');
                            }
                        };
                        setTimeout(checkAndInitCross, 100);
                    }
                }
            } else if (hash === '#scantopay') {
                console.log('📄 Showing scantopay page');
                if (scantopayPage) {
                    scantopayPage.style.display = 'block';
                    // 翻訳を再適用
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #scantopay-page');
                        window.applyI18n();
                    }
                    // QRスキャンを開始
                    if (typeof window.initScanToPay === 'function') {
                        window.initScanToPay();
                    }
                }
            } else if (hash === '#receivepay') {
                console.log('📄 Showing receivepay page');
                if (receivepayPage) {
                    receivepayPage.style.display = 'block';
                    // 翻訳を再適用
                    if (typeof window.applyI18n === 'function') {
                        console.log('🌐 Re-applying translations for #receivepay-page');
                        window.applyI18n();
                    }
                    // QR生成をリセット
                    if (typeof window.initReceivePay === 'function') {
                        window.initReceivePay();
                    }
                }
            } else if (hash.startsWith('#walletconnect')) {
                console.log('📄 Showing walletconnect signing page');
                if (walletconnectPage) {
                    walletconnectPage.style.display = 'block';
                    // URLパラメータからrequestIdを取得
                    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
                    const requestId = urlParams.get('requestId');
                    
                    if (requestId) {
                        // sessionStorageからリクエスト情報を取得
                        const requestDataStr = sessionStorage.getItem(`walletconnect.pendingRequest.${requestId}`);
                        if (requestDataStr) {
                            const requestData = JSON.parse(requestDataStr);
                            handleWalletConnectSigning(requestData);
                        } else {
                            console.error('[WalletConnect] Request data not found for requestId:', requestId);
                            alert('Request data not found. Please try again.');
                            window.location.hash = '#home';
                        }
                    } else {
                        console.error('[WalletConnect] No requestId in URL');
                        alert('Invalid request. Please try again.');
                        window.location.hash = '#home';
                    }
                }
            } else {
                // デフォルト: ホームページ
                console.log('📄 Showing home page');
                if (mainPage) mainPage.style.display = 'block';
                if (banner) banner.style.display = 'block';
            }
        }
        
        // ハッシュ変更イベントをリッスン
        window.addEventListener('hashchange', handleRoute);
        
        // 初期ルート処理
        handleRoute();
        
        // ナビゲーションリンクのクリックイベントを処理
        // WalletConnectを新規タブで開くハンドラー
        document.querySelectorAll('[data-action="openWalletConnect"]').forEach(el => {
            el.addEventListener('click', async function(e) {
                e.preventDefault();
                try {
                    // MasterIdを取得
                    const masterId = sessionStorage.getItem('mpc.masterid');
                    if (!masterId) {
                        alert('Please log in first');
                        return;
                    }
                    
                    // 現在のネットワークを取得
                    const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
                    
                    // Polygonのwallet_addressを取得
                    const walletAddress = sessionStorage.getItem(`wallet.0.${currentNetwork}.POL.address`);
                    if (!walletAddress) {
                        alert('Polygon wallet address not found. Please create a wallet first.');
                        return;
                    }
                    
                    // セッション作成APIを呼び出す
                    const response = await fetch('/walletapi/walletconnect/create-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            masterId: masterId,
                            wallet_address: walletAddress
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.success && data.sessionId) {
                        // 現在の言語を取得（i18nextまたはlocalStorageから）
                        const currentLang = (typeof i18next !== 'undefined' && i18next.language) 
                            ? i18next.language 
                            : (localStorage.getItem('lang') || 'en');
                        // 同じタブでWalletConnectを開く（言語パスを含める）
                        const walletConnectUrl = `https://${getWalletConnectHost()}/${currentLang}/walletconnect.html?sessionId=${encodeURIComponent(data.sessionId)}`;
                        window.location.href = walletConnectUrl;
                    } else {
                        throw new Error(data.message || 'Failed to create session');
                    }
                } catch (error) {
                    console.error('Error opening WalletConnect:', error);
                    alert('Failed to open WalletConnect: ' + error.message);
                }
            });
        });
        
        // member.bitvoy.netへのリンクに言語パラメータを追加
        document.querySelectorAll('a[href*="member.bitvoy.net"]').forEach(link => {
            // target="_blank"を削除して、同じタブで開くようにする
            link.removeAttribute('target');
            link.removeAttribute('rel');
            
            link.addEventListener('click', async function(e) {
                const href = this.getAttribute('href');
                if (href && href.includes('member.bitvoy.net')) {
                    // 既に言語パラメータがある場合はスキップ
                    if (href.includes('?lang=') || href.includes('&lang=')) {
                        return;
                    }
                    
                    e.preventDefault();
                    
                    // 現在の言語を取得
                    const currentLang = await getCurrentLanguage();
                    
                    // 言語コードのマッピング（member.bitvoy.net用）
                    let langParam = currentLang;
                    if (currentLang === 'en') {
                        langParam = 'en-us';
                    }
                    
                    // 言語パラメータを追加
                    const separator = href.includes('?') ? '&' : '?';
                    const newUrl = `${href}${separator}lang=${langParam}`;
                    
                    // 同じタブで開く
                    window.location.href = newUrl;
                }
            });
        });
        
        document.addEventListener('click', function(event) {
            const link = event.target.closest('a[href^="#"]');
            if (link && link.getAttribute('href') !== '#menu') {
                const href = link.getAttribute('href');
                if (href === '#coins' || href === '#nfts' || href === '#swap' || href === '#cross' || href === '#home' || href === '#mysetup' || href === '#scantopay' || href === '#receivepay') {
                    event.preventDefault();
                    window.location.hash = href;
                }
            }
        });
        
        console.log('✅ SPA routing setup completed');
    }
    
    // ルーティングを設定
    setupSPARouting();

    // 支払い（SOL）処理エントリ
    (function setupPaymentIfRequested() {
        try {
            const params = new URLSearchParams(location.search);
            const pay = (params.get('pay') || '').toLowerCase();
            if (pay !== '1' && pay !== 'true') return;

            const currency = (params.get('currency') || '').toUpperCase();
            const amountStr = params.get('amount') || '';
            let to = params.get('to') || '';
            const chain = params.get('chain') || '';
            const network = params.get('network') || '';
            // アドレスをチェックサム形式に変換（ethers.jsが必要）
            // まず小文字に正規化してからチェックサム形式に変換
            if (to && window.ethers && window.ethers.utils) {
                try {
                    // アドレスが0xで始まる場合、小文字に正規化してからgetAddress()を呼ぶ
                    if (to.startsWith('0x') || to.startsWith('0X')) {
                        to = to.toLowerCase();
                    }
                    to = window.ethers.utils.getAddress(to);
                } catch (e) {
                    console.warn('Failed to convert address to checksum format:', e);
                    // エラーが発生した場合は元のアドレスを使用（後でエラーになる可能性がある）
                }
            }
            const sessionToken = params.get('session_token') || '';
            const response_type = params.get('response_type') || 'code';
            const client_id = params.get('client_id') || '';
            const redirect_uri = params.get('redirect_uri') || '';
            const scope = params.get('scope') || '';
            const state = params.get('state') || '';
            const nonce = params.get('nonce') || '';
            const code_challenge = params.get('code_challenge') || '';
            const code_challenge_method = params.get('code_challenge_method') || '';

            // Payment Completed結果ダイアログを表示する共通関数
            function showPaymentResultDialog(result, redirectUrl) {
                const t = (k) => (window.i18next && window.i18next.t) ? window.i18next.t(k) : k;
                const titleText = t('pay.completed');
                const confirmText = t('actions.confirm');
                const resultDlg = document.createElement('dialog');
                resultDlg.style.cssText = 'background:#1c1d26;color:#fff;border:1px solid #4a4b5a;border-radius:8px;padding:20px;max-width:520px;width:90%';
                resultDlg.innerHTML = `
                    <h3 style="margin-top:0;">${titleText}</h3>
                    <div style="margin:12px 0;">
                        <div>Amount: <strong>${result.amount} ${result.currency}</strong></div>
                        <div>TxID: <span style="word-break:break-all;">${result.txid}</span></div>
                    </div>
                    <div style="text-align:right;margin-top:18px;">
                        <button id="payment-result-confirm" class="button primary">${confirmText}</button>
                    </div>
                `;
                document.body.appendChild(resultDlg);
                // Payment Completedダイアログ表示時のみ、#mainの上端を画面上端に合わせる
                try {
                    const mainEl = document.getElementById('main');
                    if (mainEl && mainEl.scrollIntoView) {
                        mainEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                    } else {
                        window.scrollTo(0, 0);
                    }
                } catch (_) {}
                resultDlg.showModal();
                const confirmBtn = resultDlg.querySelector('#payment-result-confirm');
                if (confirmBtn) {
                    confirmBtn.addEventListener('click', function() {
                        resultDlg.close();
                        window.location.href = redirectUrl || '/index.html';
                    });
                }
            }

            // 確認済みでない場合（直接pay=1でアクセスされた場合）は確認ダイアログを表示
            const dlg = document.getElementById('bitvoy-dialog');
            if (dlg) {
                const t = (k) => (window.i18next && window.i18next.t) ? window.i18next.t(k, { ns: 'payment-consent' }) : k;
                const labelCurrency = t('pay.currency') || 'Currency';
                const labelAmount = t('pay.amount') || 'Amount';
                const labelTo = t('pay.to') || 'To';
                const titleConfirm = t('pay.confirm') || 'Confirm Payment';
                const textSign = t('pay.sign') || 'Sign';
                const textCancel = t('pay.cancel') || 'Cancel';

                dlg.querySelector('h2').textContent = titleConfirm;
                let displayTo = to || '';
                try {
                    if (displayTo.length > 16) {
                        displayTo = displayTo.substring(0, 8) + '...' + displayTo.substring(displayTo.length - 8);
                    }
                } catch (_) {}
                
                // currencyとchainから表示名を生成
                let displayCurrency = currency;
                if (currency && chain) {
                    // productsオブジェクトを取得
                    const products = window.CoinsLibs?.products || window.products || {};
                    
                    // currencyとchainからproductIdを生成
                    const chainLower = chain.toLowerCase();
                    const tokenUpper = currency.toUpperCase();
                    
                    // チェーン名のマッピング
                    const chainMap = {
                        'polygon': 'POL',
                        'ethereum': 'ETH',
                        'arbitrum': 'ARB',
                        'base': 'BASE',
                        'optimism': 'OPT',
                        'avalanche': 'AVAX',
                        'bsc': 'BNB'
                    };
                    
                    // トークンとチェーンの組み合わせからproductIdを生成
                    if (chainMap[chainLower]) {
                        const chainKey = chainMap[chainLower];
                        const candidateProductId = `${tokenUpper}_${chainKey}`;
                        
                        // productsに存在するか確認
                        if (products[candidateProductId]) {
                            // getDisplayName関数を使用して表示名を取得
                            const getDisplayName = window.CoinsLibs?.getDisplayName;
                            if (getDisplayName && typeof getDisplayName === 'function') {
                                displayCurrency = getDisplayName(candidateProductId);
                            } else {
                                // getDisplayNameが利用できない場合、シンボルとチェーン名から生成
                                const product = products[candidateProductId];
                                if (product && product.symbol) {
                                    const chainDisplayNames = {
                                        'polygon': 'Polygon',
                                        'ethereum': 'Ethereum',
                                        'arbitrum': 'Arbitrum',
                                        'base': 'Base',
                                        'optimism': 'Optimism',
                                        'avalanche': 'Avalanche',
                                        'bsc': 'BNB Chain'
                                    };
                                    const chainDisplayName = chainDisplayNames[chainLower] || chain;
                                    displayCurrency = `${product.symbol} (${chainDisplayName})`;
                                }
                            }
                        } else {
                            // シンボルとチェーンで検索
                            const matchingProductId = Object.keys(products).find(pid => {
                                const product = products[pid];
                                return product && 
                                       product.symbol && 
                                       product.symbol.toUpperCase() === tokenUpper &&
                                       product.chain && 
                                       product.chain.toLowerCase() === chainLower;
                            });
                            
                            if (matchingProductId) {
                                const getDisplayName = window.CoinsLibs?.getDisplayName;
                                if (getDisplayName && typeof getDisplayName === 'function') {
                                    displayCurrency = getDisplayName(matchingProductId);
                                } else {
                                    const product = products[matchingProductId];
                                    if (product && product.symbol) {
                                        const chainDisplayNames = {
                                            'polygon': 'Polygon',
                                            'ethereum': 'Ethereum',
                                            'arbitrum': 'Arbitrum',
                                            'base': 'Base',
                                            'optimism': 'Optimism',
                                            'avalanche': 'Avalanche',
                                            'bsc': 'BNB Chain'
                                        };
                                        const chainDisplayName = chainDisplayNames[chainLower] || chain;
                                        displayCurrency = `${product.symbol} (${chainDisplayName})`;
                                    }
                                }
                            }
                        }
                    } else {
                        // ネイティブコインの場合（ETH, POLなど）
                        if (tokenUpper === chainMap[chainLower] || (chainLower === 'ethereum' && tokenUpper === 'ETH') || (chainLower === 'polygon' && tokenUpper === 'POL')) {
                            const getDisplayName = window.CoinsLibs?.getDisplayName;
                            if (getDisplayName && typeof getDisplayName === 'function') {
                                const nativeProductId = tokenUpper;
                                displayCurrency = getDisplayName(nativeProductId);
                            }
                        }
                    }
                }
                
                dlg.querySelector('p').innerHTML = `${labelCurrency}: ${displayCurrency}<br>${labelAmount}: ${amountStr}<br>${labelTo}: ${displayTo}`;
                const closeBtn = document.getElementById('dialog-close-btn');
                // 署名ボタンを動的に追加
                const signBtn = document.createElement('button');
                signBtn.textContent = textSign;
                signBtn.id = 'pay-sign-btn';
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = textCancel;
                cancelBtn.id = 'pay-cancel-btn';
                cancelBtn.style.marginLeft = '50px';
                dlg.appendChild(signBtn);
                dlg.appendChild(cancelBtn);
                dlg.showModal();
                // 支払い確認ダイアログ表示時のみ、#mainの上端を画面上端に合わせる
                try {
                    const mainEl = document.getElementById('main');
                    if (mainEl && mainEl.scrollIntoView) {
                        mainEl.scrollIntoView({ behavior: 'auto', block: 'start' });
                    } else {
                        window.scrollTo(0, 0);
                    }
                } catch (_) {}

                cancelBtn.onclick = async () => {
                    // キャンセルはOPへ返却（fetch APIを使用してCSP準拠）
                    try {
                        const params = new URLSearchParams();
                        params.append('redirect_uri', redirect_uri);
                        params.append('state', state);
                        params.append('error', 'access_denied');
                        
                        const response = await fetch(window.location.origin + '/wallet/payment-cancel', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: params.toString()
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            if (result.success && result.redirect_url) {
                                window.location.href = result.redirect_url;
                            } else {
                                throw new Error('Invalid response from payment-cancel');
                            }
                        } else {
                            throw new Error(`Payment cancel failed: ${response.status}`);
                        }
                    } catch (e) {
                        console.error('Payment cancel failed:', e);
                        showError('Cancel Failed', e.message || String(e));
                    }
                };

                signBtn.onclick = async () => {
                    // エラーハンドリングで使用する変数をスコープの外で定義
                    let tokenChain = null;
                    let tokenSymbol = null;
                    let tokenNetwork = null;
                    
                    try {
                        // ローディング表示
                        signBtn.disabled = true;
                        signBtn.textContent = 'Signing...';
                        
                        // 1. 必要な情報を取得
                        const masterId = sessionStorage.getItem('mpc.masterid');
                        if (!masterId) {
                            throw new Error('Not signed in. Please log in first.');
                        }
                        
                        // 2. 現在のNetwork設定を取得（最初に取得して、以降の処理で使用）
                        const getCurrentNetwork = window.CoinsLibs?.getCurrentNetwork || function() {
                            return sessionStorage.getItem('mpc.current_network') || 'mainnet';
                        };
                        const currentNetwork = getCurrentNetwork();
                        tokenNetwork = currentNetwork; // tokenNetworkを設定
                        const isTestnet = currentNetwork === 'testnet';
                        
                        // 3. Payment Settingsからトークンを取得
                        // mainnet/testnetで同じproductIdを使用するため、変換処理は不要
                        const preferredToken = await getUserPreferredToken();
                        
                        // 4. トークンの決定と検証
                        // currencyとchainからproductIdを生成（Intent情報の場合）
                        let productId = currency;
                        if (currency && chain) {
                            // productsオブジェクトを取得
                            const products = window.CoinsLibs?.products || window.products || {};
                            
                            // currencyとchainからproductIdを生成
                            // chain名を正規化（Polygon -> polygon）
                            const chainLower = chain.toLowerCase();
                            const tokenUpper = currency.toUpperCase();
                            
                            // チェーン名のマッピング
                            const chainMap = {
                                'polygon': 'POL',
                                'ethereum': 'ETH',
                                'arbitrum': 'ARB',
                                'base': 'BASE',
                                'optimism': 'OPT',
                                'avalanche': 'AVAX',
                                'bsc': 'BNB'
                            };
                            
                            // トークンとチェーンの組み合わせからproductIdを生成
                            // 例: JPYC + Polygon -> JPYC_POL
                            if (chainMap[chainLower]) {
                                const chainKey = chainMap[chainLower];
                                const candidateProductId = `${tokenUpper}_${chainKey}`;
                                
                                // productsに存在するか確認
                                if (products[candidateProductId]) {
                                    productId = candidateProductId;
                                    console.log('💳 Generated productId from currency and chain:', { currency, chain, productId });
                                } else {
                                    // シンボルとチェーンで検索
                                    const matchingProductId = Object.keys(products).find(pid => {
                                        const product = products[pid];
                                        return product && 
                                               product.symbol && 
                                               product.symbol.toUpperCase() === tokenUpper &&
                                               product.chain && 
                                               product.chain.toLowerCase() === chainLower;
                                    });
                                    
                                    if (matchingProductId) {
                                        productId = matchingProductId;
                                        console.log('💳 Found productId by symbol and chain:', { currency, chain, productId });
                                    } else {
                                        console.warn('⚠️ Could not generate productId from currency and chain, using currency as productId:', { currency, chain });
                                    }
                                }
                            } else {
                                console.warn('⚠️ Unsupported chain for productId generation:', chain);
                            }
                        }
                        
                        if (!productId || productId === '') {
                            // currencyが指定されていない場合、Payment Settingsのトークンを使用
                            if (!preferredToken) {
                                throw new Error('No payment token configured. Please configure Payment Settings in My Setup.');
                            }
                            productId = preferredToken;
                            console.log('💳 Using Payment Settings token:', productId);
                        } else {
                            // currencyが指定されている場合、Payment Settingsと比較
                            if (preferredToken && preferredToken !== productId) {
                                // 警告を表示
                                const products = window.CoinsLibs?.products || window.products || {};
                                const preferredProduct = products[preferredToken] || {};
                                const currencyProduct = products[productId] || {};
                                console.warn(`⚠️ Token mismatch: OIDC Payment specified ${currencyProduct.symbol || productId}, but Payment Settings is configured for ${preferredProduct.symbol || preferredToken}. Using OIDC Payment token.`);
                                
                                // ユーザーに確認を求める
                                const t = (k) => (window.i18next && window.i18next.t) ? window.i18next.t(k, { ns: 'index' }) : k;
                                const confirmMessage = `Payment Settings is configured for ${preferredProduct.symbol || preferredToken}, but this payment requests ${currencyProduct.symbol || productId}. Continue with ${currencyProduct.symbol || productId}?`;
                                if (!confirm(confirmMessage)) {
                                    throw new Error('Payment cancelled by user');
                                }
                            }
                            console.log('💳 Using OIDC Payment specified token:', productId);
                        }
                        
                        console.log('💳 Starting payment transaction with productId:', productId);
                        
                        // 6. products定義からトークン情報を取得
                        const products = window.CoinsLibs?.products || window.products || {};
                        const product = products[productId];
                        if (!product) {
                            throw new Error(`Product ${productId} not found. Please ensure coins-libs.js is loaded.`);
                        }
                        
                        tokenSymbol = product.symbol;
                        tokenChain = product.chain;
                        const decimals = product.decimal || 18;
                        
                        // 7. コントラクトアドレスを取得
                        let contractAddress = null;
                        if (product.tokentype === 'ERC20') {
                            if (tokenChain === 'polygon') {
                                const getPolygonTokenContractAddress = window.CoinsLibs?.getPolygonTokenContractAddress;
                                if (getPolygonTokenContractAddress) {
                                    contractAddress = getPolygonTokenContractAddress(productId);
                                }
                            } else if (tokenChain === 'ethereum' || tokenChain === 'avalanche') {
                                const getERC20TokenContractAddress = window.CoinsLibs?.getERC20TokenContractAddress;
                                if (getERC20TokenContractAddress) {
                                    contractAddress = getERC20TokenContractAddress(productId);
                                }
                            }
                        }

                        if (!contractAddress && product.tokentype === 'ERC20') {
                            throw new Error(`${productId} contract address not found. Please ensure coins-libs.js is loaded.`);
                        }
                        
                        console.log('💳 Token info:', { productId, tokenSymbol, tokenChain, contractAddress, decimals });
                        
                        // 7. Intent情報を取得してexecution_modeを確認（AAモード判定）
                        let executionMode = 'STANDARD'; // デフォルトはSTANDARD
                        let intentData = null;
                        const intentId = params.get('intent_id');
                        if (intentId) {
                            try {
                                const clientId = params.get('client_id') || '';
                                const intentResponse = await fetch(`${window.location.origin}/oidc-payment/intents/${intentId}?client_id=${clientId}`);
                                if (intentResponse.ok) {
                                    intentData = await intentResponse.json();
                                    executionMode = intentData.execution_mode || 'STANDARD';
                                    console.log(`💳 Intent execution_mode: ${executionMode}`);
                                    console.log(`💳 Intent data:`, intentData);
                                } else {
                                    const errorStatus = intentResponse.status;
                                    const errorText = await intentResponse.text().catch(() => '');
                                    console.error(`❌ Failed to fetch intent data (status: ${errorStatus}):`, errorText);
                                    console.warn('⚠️ Failed to fetch intent data, assuming STANDARD mode');
                                }
                            } catch (error) {
                                console.error('❌ Error fetching intent data:', error);
                                console.warn('⚠️ Error fetching intent data, assuming STANDARD mode');
                            }
                        }
                        
                        // 8. 送信元アドレスを取得（AAモードの場合はSmart Accountアドレス、STANDARDモードの場合は通常アカウント）
                        let fromAddress = null;
                        let addressProductId = productId;
                        
                        if (executionMode === 'AA') {
                            // AAモード: Smart Accountアドレスを取得
                            console.log('💳 AA mode: Getting Smart Account address...');
                            
                            try {
                                // まずStorageから取得を試行
                                const storage = new BitVoyStorage();
                                await storage.init();
                                const saAddresses = await storage.getSmartAccountAddresses(masterId);
                                
                                if (saAddresses) {
                                    const networkKey = currentNetwork; // 'mainnet' or 'testnet'
                                    const chainKey = tokenChain.toLowerCase(); // 'polygon' or 'ethereum'
                                    const currencyKey = tokenSymbol.toUpperCase(); // 'USDC' or 'JPYC'
                                    
                                    // Smart Accountアドレスのキー構造: polygon_USDC[network] または polygon_JPYC[network]
                                    const saKey = `${chainKey}_${currencyKey}`;
                                    if (saAddresses[saKey] && saAddresses[saKey][networkKey]) {
                                        fromAddress = saAddresses[saKey][networkKey];
                                        console.log(`💳 Smart Account address from storage: ${fromAddress} (${saKey}/${networkKey})`);
                                    }
                                }
                                
                                // Storageから取得できない場合は計算
                                if (!fromAddress) {
                                    console.log('💳 Smart Account address not in storage, computing...');
                                    
                                    // chainKey, networkKey, currencyKeyを定義
                                    const networkKey = currentNetwork; // 'mainnet' or 'testnet'
                                    const chainKey = tokenChain.toLowerCase(); // 'polygon' or 'ethereum'
                                    const currencyKey = tokenSymbol.toUpperCase(); // 'USDC' or 'JPYC'
                                    
                                    // OWNER_EOAを取得
                                    const getWalletAddress = window.CoinsLibs?.getWalletAddress;
                                    if (!getWalletAddress) {
                                        throw new Error('getWalletAddress function not found. Please ensure coins-libs.js is loaded.');
                                    }
                                    
                                    const getNativeCoinForToken = window.CoinsLibs?.getNativeCoinForToken;
                                    if (!getNativeCoinForToken) {
                                        throw new Error('getNativeCoinForToken function not found. Please ensure coins-libs.js is loaded.');
                                    }
                                    
                                    const nativeCoinId = getNativeCoinForToken(productId) || productId;
                                    const ownerEOA = getWalletAddress(nativeCoinId);
                                    
                                    if (!ownerEOA) {
                                        throw new Error(`OWNER_EOA not found for ${nativeCoinId}`);
                                    }
                                    
                                    // BitVoyConfigからAA設定を取得
                                    const config = window.BitVoyConfig || {};
                                    const saConfig = config.sa?.[chainKey]?.[networkKey];
                                    if (!saConfig || !saConfig.allowedTokens || !saConfig.allowedTokens[currencyKey]) {
                                        throw new Error(`AA configuration not found for ${chainKey}/${networkKey}/${currencyKey}`);
                                    }
                                    
                                    const tokenConfig = saConfig.allowedTokens[currencyKey];
                                    const factoryAddress = tokenConfig.factoryAddress;
                                    const entryPointAddress = saConfig.entryPointAddress;
                                    const opSignerAddress = saConfig.opSignerAddress;
                                    const allowedTokenAddress = tokenConfig.tokenAddress;
                                    
                                    if (!factoryAddress || !entryPointAddress || !opSignerAddress || !allowedTokenAddress) {
                                        throw new Error(`AA configuration incomplete for ${chainKey}/${networkKey}/${currencyKey}`);
                                    }
                                    
                                    // MPCAddressGeneratorを使用してSmart Accountアドレスを計算
                                    const addressGenerator = new MPCAddressGenerator();
                                    fromAddress = await addressGenerator.computeSmartAccountAddress(
                                        ownerEOA,
                                        chainKey,
                                        networkKey,
                                        factoryAddress,
                                        entryPointAddress,
                                        opSignerAddress,
                                        allowedTokenAddress
                                    );
                                    
                                    console.log(`💳 Smart Account address computed: ${fromAddress}`);
                                }
                                
                                if (!fromAddress) {
                                    throw new Error('Failed to get Smart Account address for AA mode');
                                }
                                
                                addressProductId = `SA_${productId}`;
                            } catch (error) {
                                console.error(`❌ Failed to get Smart Account address:`, error);
                                throw new Error(`Smart Account address retrieval failed: ${error.message}`);
                            }
                        } else {
                            // STANDARDモード: 通常アカウントアドレスを取得
                            const getWalletAddress = window.CoinsLibs?.getWalletAddress;
                            if (!getWalletAddress) {
                                throw new Error('getWalletAddress function not found. Please ensure coins-libs.js is loaded.');
                            }
                            
                            const getNativeCoinForToken = window.CoinsLibs?.getNativeCoinForToken;
                            if (!getNativeCoinForToken) {
                                throw new Error('getNativeCoinForToken function not found. Please ensure coins-libs.js is loaded.');
                            }
                            
                            // nativeCoinIdを最初に取得（重複取得を避ける）
                            const nativeCoinId = getNativeCoinForToken(productId) || productId;
                            console.log(`💳 Token ${productId}: nativeCoinId = ${nativeCoinId}`);
                            
                            // アドレスを取得（productIdから試行、なければnativeCoinIdから）
                            fromAddress = getWalletAddress(productId);
                            console.log(`💳 getWalletAddress('${productId}') =`, fromAddress);
                            
                            // トークンの場合、ネイティブチェーンのアドレスをフォールバックとして使用
                            if (!fromAddress && nativeCoinId !== productId) {
                                console.log(`💳 Trying to get address for nativeCoinId: ${nativeCoinId}`);
                                fromAddress = getWalletAddress(nativeCoinId);
                                console.log(`💳 getWalletAddress('${nativeCoinId}') =`, fromAddress);
                                if (fromAddress) {
                                    addressProductId = nativeCoinId;
                                    console.log(`💳 Token ${productId}: Using ${nativeCoinId} address as fallback:`, fromAddress);
                                } else {
                                    console.error(`❌ Failed to get address for nativeCoinId: ${nativeCoinId}`);
                                    // sessionStorageの内容を確認
                                    const expectedKey = `wallet.0.${currentNetwork}.${nativeCoinId}.address`;
                                    console.error(`❌ Expected sessionStorage key: ${expectedKey}`);
                                    console.error(`❌ SessionStorage value:`, sessionStorage.getItem(expectedKey));
                                    // 利用可能なキーを確認
                                    const availableKeys = Object.keys(sessionStorage).filter(key => key.includes('wallet.0') && key.includes(nativeCoinId));
                                    console.error(`❌ Available sessionStorage keys for ${nativeCoinId}:`, availableKeys);
                                }
                            }
                            
                            if (!fromAddress) {
                                throw new Error(`Wallet address not found for ${productId}. Tried: ${productId} and ${nativeCoinId !== productId ? nativeCoinId : 'N/A'}`);
                            }
                        }
                        
                        console.log(`💳 Using wallet address for ${addressProductId}:`, fromAddress);
                        
                        // HDWallet廃止により、derivepathの取得は不要
                        
                        // アドレスをチェックサム形式に変換（ethers.jsが必要）
                        if (window.ethers && window.ethers.utils) {
                            try {
                                if (fromAddress && (fromAddress.startsWith('0x') || fromAddress.startsWith('0X'))) {
                                    fromAddress = fromAddress.toLowerCase();
                                    fromAddress = window.ethers.utils.getAddress(fromAddress);
                                }
                                if (to && (to.startsWith('0x') || to.startsWith('0X'))) {
                                    to = to.toLowerCase();
                                    to = window.ethers.utils.getAddress(to);
                                }
                            } catch (e) {
                                console.warn('Failed to convert address to checksum format:', e);
                            }
                        }
                        
                        // 9. トークン残高を確認（ERC20トークンの場合）
                        // AAモードの場合はSmart Accountアドレス、STANDARDモードの場合は通常アカウントアドレスで確認
                        if (product.tokentype === 'ERC20' && contractAddress) {
                            try {
                                // fromAddressが正しく設定されているか確認
                                if (!fromAddress) {
                                    throw new Error(`fromAddress is not set. executionMode: ${executionMode}`);
                                }
                                
                                console.log(`💳 Checking ${tokenSymbol} balance for ${executionMode} mode:`);
                                console.log(`💳 fromAddress: ${fromAddress}`);
                                console.log(`💳 contractAddress: ${contractAddress}`);
                                console.log(`💳 chain: ${tokenChain}, network: ${currentNetwork}`);
                                
                                const getERC20Balance = window.CoinsLibs?.getERC20Balance;
                                if (getERC20Balance) {
                                    const tokenBalance = await getERC20Balance(fromAddress, contractAddress, tokenChain, decimals);
                                    console.log(`💳 ${tokenSymbol} balance (${executionMode} mode, address: ${fromAddress}):`, tokenBalance);
                                    
                                    // 送金額と残高を比較
                                    const amountNum = parseFloat(amountStr);
                                    if (tokenBalance < amountNum) {
                                        const modeInfo = executionMode === 'AA' ? 'Smart Account' : 'EOA';
                                        throw new Error(`Insufficient ${tokenSymbol} balance in ${modeInfo} (${fromAddress}): ${tokenBalance} < ${amountNum}`);
                                    }
                                    console.log(`✅ ${tokenSymbol} balance check passed (${executionMode} mode): ${tokenBalance} >= ${amountNum}`);
                                } else {
                                    throw new Error('getERC20Balance function not found');
                                }
                            } catch (e) {
                                console.error(`❌ Failed to check ${tokenSymbol} balance (${executionMode} mode):`, e);
                                throw e; // 残高不足の場合はエラーを投げる
                            }
                        }
                        
                        // 10. ネイティブコイン残高を確認（ガス代が必要）
                        // AAモードの場合はPaymasterがスポンサーするため、ガス代チェックは不要
                        if (executionMode !== 'AA') {
                            try {
                            if (tokenChain === 'polygon') {
                                const getPOLBalance = window.CoinsLibs?.getPOLBalance;
                                if (getPOLBalance) {
                                    const polBalance = await getPOLBalance(fromAddress);
                                    console.log('💳 POL balance for gas:', polBalance);
                                    if (polBalance === 0 || polBalance < 0.001) {
                                        const errorMsg = polBalance === 0 
                                            ? 'Insufficient POL balance for gas fee. Please add POL (Polygon native token) to your wallet to pay for transaction fees.'
                                            : 'Low POL balance. Transaction may fail due to insufficient gas. Please ensure you have enough POL (Polygon native token) to pay for transaction fees.';
                                        throw new Error(errorMsg);
                                    }
                                }
                            } else if (tokenChain === 'ethereum') {
                                const getETHBalance = window.CoinsLibs?.getETHBalance;
                                if (getETHBalance) {
                                    const ethBalance = await getETHBalance(fromAddress);
                                    console.log('💳 ETH balance for gas:', ethBalance);
                                    if (ethBalance === 0 || ethBalance < 0.0001) {
                                        const errorMsg = ethBalance === 0 
                                            ? 'Insufficient ETH balance for gas fee. Please add ETH (Ethereum native token) to your wallet to pay for transaction fees.'
                                            : 'Low ETH balance. Transaction may fail due to insufficient gas. Please ensure you have enough ETH (Ethereum native token) to pay for transaction fees.';
                                        throw new Error(errorMsg);
                                    }
                                }
                            }
                            } catch (e) {
                                // 残高不足の場合はエラーを投げる
                                if (e.message && (e.message.includes('Insufficient') || e.message.includes('Low'))) {
                                    throw e;
                                }
                                console.warn('⚠️ Failed to check native coin balance:', e);
                            }
                        } else {
                            console.log('💳 AA mode: Skipping gas balance check (Paymaster sponsored)');
                        }
                        
                        console.log('💳 Payment details:', {
                            productId,
                            fromAddress,
                            toAddress: to,
                            amount: amountStr,
                            contractAddress,
                            decimals,
                            redirect_uri
                        });
                        
                        // idempotencyKeyを生成（OIDC Paymentのstateパラメータを使用、なければタイムスタンプベース）
                        const requestId = state || null;
                        const idempotencyKey = requestId 
                            ? `oidc-payment-${requestId}-${Date.now()}`
                            : `oidc-payment-${Date.now()}-${Math.random().toString(36).substring(7)}`;
                        console.log(`🔑 Generated idempotencyKey for OIDC Payment: ${idempotencyKey}`);
                        
                        let txid = '';
                        
                        // 10. AAモードの場合はAA専用フローに分岐
                        if (executionMode === 'AA') {
                            console.log('💳 AA mode: Starting AA payment flow...');
                            
                            // AA専用のIntent承認とUserOperation送信
                            if (typeof window.approveIntentWithAA === 'function' || typeof approveIntentWithAA === 'function') {
                                try {
                                    // approveIntentWithAAはwindow.approveIntentWithAAまたはグローバルスコープから取得
                                    const approveAA = window.approveIntentWithAA || approveIntentWithAA;
                                    
                                    // masterIdを取得（既にsignBtn.onclickハンドラー内で取得済み）
                                    // masterIdは行1400で取得されているが、スコープを確認
                                    const aaMasterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
                                    if (!aaMasterId) {
                                        throw new Error('Master ID not found. Please log in first.');
                                    }
                                    
                                    // Passkey承認はapproveIntentWithAA内で実行される（credentialはnullでOK）
                                    const passkeyCredential = null;
                                    
                                    const aaResult = await approveAA(intentId, aaMasterId, passkeyCredential);
                                    console.log('✅ AA payment completed:', aaResult);
                                    
                                    // AAモードの場合はtxidではなく、aa_user_op_hashを取得
                                    txid = aaResult.aa_user_op_hash || aaResult.userOpHash || '';
                                    
                                    // 成功時のリダイレクト処理 — STANDARDモードと同様に /wallet/payment-complete を呼んで
                                    // 本物のOIDC認可コードを取得してからRPにリダイレクトする。
                                    // code=success のリテラル文字列はOIDC tokenエンドポイントで拒否されるため使用不可。
                                    if (redirect_uri) {
                                        const formParams = new URLSearchParams();
                                        formParams.append('session_token', sessionToken);
                                        formParams.append('currency', currency);
                                        formParams.append('amount', amountStr);
                                        formParams.append('to', to);
                                        formParams.append('response_type', response_type);
                                        formParams.append('client_id', client_id);
                                        formParams.append('redirect_uri', redirect_uri);
                                        formParams.append('scope', scope);
                                        formParams.append('state', state || '');
                                        formParams.append('nonce', nonce);
                                        formParams.append('code_challenge', code_challenge);
                                        formParams.append('code_challenge_method', code_challenge_method);
                                        if (txid) formParams.append('txid', txid);           // aa_user_op_hash
                                        if (intentId) formParams.append('intent_id', intentId);
                                        formParams.append('chain', tokenChain || '');

                                        const completionResponse = await fetch(window.location.origin + '/wallet/payment-complete', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                            body: formParams.toString()
                                        });

                                        const completionResult = await completionResponse.json();

                                        if (!completionResponse.ok) {
                                            if (completionResult.redirect_url) {
                                                window.location.href = completionResult.redirect_url;
                                                return;
                                            }
                                            throw new Error(completionResult.error || completionResult.message || 'Payment completion failed');
                                        }

                                        // STANDARDモードと同様に confirmations待機 → 確認ダイアログを表示
                                        if (completionResult.success) {
                                            if (intentId && client_id) {
                                                try {
                                                    await waitForConfirmations(intentId, client_id);
                                                } catch (confirmError) {
                                                    console.error('❌ AA Confirmations待機エラー:', confirmError);
                                                    // その他のエラーは続行（バックグラウンドジョブで処理）
                                                }
                                            }
                                            dlg.close();
                                            showPaymentResultDialog(completionResult, completionResult.redirect_url);
                                        } else if (completionResult.redirect_url) {
                                            window.location.href = completionResult.redirect_url;
                                        } else {
                                            window.location.href = redirect_uri;
                                        }
                                    } else {
                                        // redirect_uriがない場合は成功メッセージを表示
                                        alert('✅ Payment completed successfully!');
                                        window.location.hash = '#home';
                                    }

                                    return; // AAモードの処理完了
                                } catch (error) {
                                    console.error('❌ AA payment failed:', error);
                                    throw error; // エラーを再スローしてSTANDARDモードのエラーハンドリングに任せる
                                }
                            } else {
                                throw new Error('approveIntentWithAA function not found. Please ensure oidc-payment-aa.js is loaded.');
                            }
                        }
                        
                        // 11. STANDARDモード: トークンタイプに応じてトランザクションを構築
                        if (product.tokentype === 'ERC20') {
                            if (tokenChain === 'polygon') {
                                // Polygon ERC20トークン送金
                                const transactionData = await bitvoyMPC.wallet.buildPolygonERC20Transaction(
                                    fromAddress,
                                    to,
                                    contractAddress,
                                    amountStr,
                                    decimals,
                                    'medium', // feeLevel
                                    productId, // productIdを渡してネットワーク判定を確実に
                                    idempotencyKey
                                );
                                
                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'polygon',
                                        transactionType: 'token_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        contractAddress: contractAddress,
                                        tokenSymbol: tokenSymbol,
                                        redirect_uri: redirect_uri,
                                        // path: HDWallet廃止により削除
                                    }
                                );
                                
                                const signedTransaction = await bitvoyMPC.wallet.buildSignedPolygonTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress  // expectedFromAddressとして渡す
                                );
                                
                                txid = await bitvoyMPC.wallet.broadcastPolygonTransaction(signedTransaction, idempotencyKey);
                            } else if (tokenChain === 'ethereum') {
                                // Ethereum ERC20トークン送金
                                const transactionData = await bitvoyMPC.wallet.buildEthereumERC20Transaction(
                                    fromAddress,
                                    to,
                                    contractAddress,
                                    amountStr,
                                    decimals,
                                    'medium', // feeLevel
                                    productId, // productIdを渡してネットワーク判定を確実に
                                    idempotencyKey
                                );
                                
                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'ethereum',
                                        transactionType: 'token_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        contractAddress: contractAddress,
                                        tokenSymbol: tokenSymbol,
                                        redirect_uri: redirect_uri,
                                        // path: HDWallet廃止により削除
                                    }
                                );
                                
                                const signedTransaction = await bitvoyMPC.wallet.buildSignedEthereumTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress  // expectedFromAddressとして渡す
                                );
                                
                                txid = await bitvoyMPC.wallet.broadcastEthereumTransaction(signedTransaction, idempotencyKey);
                            } else if (tokenChain === 'avalanche') {
                                // Avalanche ERC20トークン送金
                                const transactionData = await bitvoyMPC.wallet.buildAvalancheERC20Transaction(
                                    fromAddress,
                                    to,
                                    contractAddress,
                                    amountStr,
                                    decimals,
                                    'medium',
                                    productId,
                                    idempotencyKey
                                );

                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'avalanche',
                                        transactionType: 'token_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        contractAddress: contractAddress,
                                        tokenSymbol: tokenSymbol,
                                        redirect_uri: redirect_uri,
                                    }
                                );

                                const signedTransaction = await bitvoyMPC.wallet.buildSignedAvalancheTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress
                                );

                                txid = await bitvoyMPC.wallet.broadcastAvalancheTransaction(signedTransaction, idempotencyKey);
                            } else {
                                throw new Error(`Unsupported chain for ERC20 token: ${tokenChain}`);
                            }
                        } else if (!product.tokentype || product.tokentype === '') {
                            // ネイティブコイン送金
                            if (tokenChain === 'polygon') {
                                const transactionData = await bitvoyMPC.wallet.buildPolygonTransaction(
                                    fromAddress,
                                    to,
                                    amountStr,
                                    'medium',
                                    nativeCoinId, // mainnet/testnetで同じproductIdを使用
                                    idempotencyKey
                                );
                                
                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'polygon',
                                        transactionType: 'native_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        redirect_uri: redirect_uri,
                                        // path: HDWallet廃止により削除
                                    }
                                );
                                
                                const signedTransaction = await bitvoyMPC.wallet.buildSignedPolygonTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress  // expectedFromAddressとして渡す
                                );
                                
                                txid = await bitvoyMPC.wallet.broadcastPolygonTransaction(signedTransaction, idempotencyKey);
                            } else if (tokenChain === 'ethereum') {
                                const transactionData = await bitvoyMPC.wallet.buildEthereumTransaction(
                                    fromAddress,
                                    to,
                                    amountStr,
                                    'medium',
                                    nativeCoinId, // mainnet/testnetで同じproductIdを使用
                                    idempotencyKey
                                );
                                
                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'ethereum',
                                        transactionType: 'native_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        redirect_uri: redirect_uri,
                                        // path: HDWallet廃止により削除
                                    }
                                );
                                
                                const signedTransaction = await bitvoyMPC.wallet.buildSignedEthereumTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress  // expectedFromAddressとして渡す
                                );
                                
                                txid = await bitvoyMPC.wallet.broadcastEthereumTransaction(signedTransaction, idempotencyKey);
                            } else if (tokenChain === 'avalanche') {
                                // Avalanche ネイティブ送金（AVAX）
                                const transactionData = await bitvoyMPC.wallet.buildAvalancheTransaction(
                                    fromAddress,
                                    to,
                                    amountStr,
                                    'medium',
                                    nativeCoinId,
                                    idempotencyKey
                                );

                                const signature = await bitvoyMPC.signWithMPC(
                                    masterId,
                                    transactionData.messageHash,
                                    {
                                        blockchain: 'avalanche',
                                        transactionType: 'native_transfer',
                                        amount: amountStr,
                                        gasPrice: transactionData.gasPrice,
                                        gasLimit: transactionData.gasLimit,
                                        redirect_uri: redirect_uri,
                                    }
                                );

                                const signedTransaction = await bitvoyMPC.wallet.buildSignedAvalancheTransaction(
                                    transactionData.unsignedTx,
                                    signature,
                                    fromAddress
                                );

                                txid = await bitvoyMPC.wallet.broadcastAvalancheTransaction(signedTransaction, idempotencyKey);
                            } else {
                                throw new Error(`Unsupported chain for native coin: ${tokenChain}`);
                            }
                        } else {
                            throw new Error(`Unsupported token type: ${product.tokentype}`);
                        }
                        
                        console.log(`✅ ${productId} payment transaction completed:`, txid);

                        // 結果をOPへ返却（fetch APIを使用してCSP準拠）
                        // URLSearchParamsを使用してapplication/x-www-form-urlencoded形式で送信
                        const formParams = new URLSearchParams();
                        formParams.append('session_token', sessionToken);
                        formParams.append('currency', currency);
                        formParams.append('amount', amountStr);
                        formParams.append('to', to);
                        formParams.append('response_type', response_type);
                        formParams.append('client_id', client_id);
                        formParams.append('redirect_uri', redirect_uri);
                        formParams.append('scope', scope);
                        formParams.append('state', state);
                        formParams.append('nonce', nonce);
                        formParams.append('code_challenge', code_challenge);
                        formParams.append('code_challenge_method', code_challenge_method);
                        formParams.append('txid', txid);
                        
                        // intent_idを追加（OIDC Payment Intentの場合）
                        // intentIdは既に行1537で宣言されているため、再宣言しない
                        if (intentId) {
                            formParams.append('intent_id', intentId);
                            formParams.append('chain', tokenChain || '');
                            formParams.append('network', tokenNetwork || '');
                        }
                        
                        const response = await fetch(window.location.origin + '/wallet/payment-complete', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: formParams.toString()
                        });
                        
                        // レスポンスを確認
                        const result = await response.json();
                        
                        if (!response.ok) {
                            // エラー時でもredirect_urlが返されている場合は使用
                            if (result.redirect_url) {
                                console.warn('⚠️ Payment completion returned error but redirect_url is available:', result.error);
                                dlg.close();
                                showPaymentResultDialog({
                                    ...result,
                                    txid: txid || 'N/A',
                                    currency: currency || 'N/A',
                                    amount: amountStr || '0'
                                }, result.redirect_url);
                                return;
                            }
                            throw new Error(result.error || result.message || 'Payment completion failed');
                        }
                        
                        if (result.success) {
                            // intent_idがある場合はconfirmations待機処理を実行
                            // intentIdは既に行1537で宣言されているため、再宣言しない
                            if (intentId && client_id) {
                                try {
                                    // confirmations待機処理
                                    await waitForConfirmations(intentId, client_id);
                                } catch (confirmError) {
                                    console.error('❌ Confirmations待機エラー:', confirmError);
                                    // tx_hash_not_setエラーの場合は、ユーザーに明確なエラーメッセージを表示し、RPにエラーを返す
                                    if (confirmError.message && confirmError.message.includes('トランザクション送信に失敗')) {
                                        showError('支払いエラー', confirmError.message);
                                        // RPにエラー情報を返す（redirect_urlが存在する場合）
                                        if (result.redirect_url) {
                                            dlg.close();
                                            // エラーパラメータを付けてRPにリダイレクト
                                            const errorUrl = new URL(result.redirect_url);
                                            errorUrl.searchParams.set('error', 'payment_failed');
                                            errorUrl.searchParams.set('error_description', 'トランザクション送信に失敗しました');
                                            if (state) {
                                                errorUrl.searchParams.set('state', state);
                                            }
                                            showPaymentResultDialog({
                                                success: false,
                                                error: 'payment_failed',
                                                message: confirmError.message,
                                                redirect_url: errorUrl.toString()
                                            }, errorUrl.toString());
                                        }
                                        return; // エラー処理完了
                                    }
                                    // その他のエラーは処理を続行（バックグラウンドジョブで処理される可能性がある）
                                }
                            }

                            // ダイアログ（確認）を表示し、ユーザ操作でOIDCへ戻す
                            dlg.close();
                            showPaymentResultDialog(result, result.redirect_url);
                        } else {
                            // success: falseでもredirect_urlが返されている場合は使用
                            if (result.redirect_url) {
                                console.warn('⚠️ Payment completion returned success: false but redirect_url is available:', result.error);
                                dlg.close();
                                showPaymentResultDialog({
                                    ...result,
                                    txid: txid || 'N/A',
                                    currency: currency || 'N/A',
                                    amount: amountStr || '0'
                                }, result.redirect_url);
                                return;
                            }
                            throw new Error(result.error || result.message || 'Payment completion failed');
                        }
                    } catch (e) {
                        console.error('💥 Payment transaction failed:', e);
                        
                        // エラーメッセージを抽出（サーバーからのエラーメッセージを含む）
                        let errorMessage = e.message || String(e);
                        
                        // エラーオブジェクトから詳細なメッセージを抽出
                        if (e.error) {
                            // エラーオブジェクトにerrorプロパティがある場合
                            if (typeof e.error === 'string') {
                                errorMessage = e.error;
                            } else if (e.error.message) {
                                errorMessage = e.error.message;
                            } else if (e.error.error) {
                                errorMessage = e.error.error;
                            }
                        }
                        
                        // レスポンスからエラーメッセージを抽出
                        if (e.responseData) {
                            try {
                                const errorData = typeof e.responseData === 'string' ? JSON.parse(e.responseData) : e.responseData;
                                if (errorData.error) {
                                    errorMessage = errorData.error;
                                } else if (errorData.message) {
                                    errorMessage = errorData.message;
                                }
                            } catch (parseError) {
                                // JSONパースに失敗した場合は無視
                            }
                        } else if (e.response) {
                            try {
                                const errorData = typeof e.response === 'string' ? JSON.parse(e.response) : e.response;
                                if (errorData.error) {
                                    errorMessage = errorData.error;
                                } else if (errorData.message) {
                                    errorMessage = errorData.message;
                                }
                            } catch (parseError) {
                                // JSONパースに失敗した場合は無視
                            }
                        }
                        
                        // エラーメッセージに「insufficient funds」などの重要な情報が含まれているか確認
                        if (errorMessage.includes('insufficient funds') || 
                            errorMessage.includes('balance') || 
                            errorMessage.includes('overshot')) {
                            // サーバーからの詳細なエラーメッセージを使用
                            console.log('📋 Server error message:', errorMessage);
                            
                            // insufficient fundsエラーの場合、より分かりやすいメッセージに変換（翻訳は後で行う）
                            if (errorMessage.includes('insufficient funds')) {
                                const nativeToken = tokenChain === 'polygon' ? 'POL' : (tokenChain === 'ethereum' ? 'ETH' : 'native token');
                                errorMessage = `Insufficient ${nativeToken} balance for gas fee. Please add ${nativeToken} to your wallet to pay for transaction fees.`;
                            }
                        }
                        
                        // Payment Failedの場合、署名ボタンとキャンセルボタンを非表示にし、確認ボタンを表示
                        if (signBtn) {
                            signBtn.style.display = 'none';
                        }
                        if (cancelBtn) {
                            cancelBtn.style.display = 'none';
                        }
                        
                        // 確認ボタンを作成
                        const confirmBtn = document.createElement('button');
                        confirmBtn.textContent = t('pay.confirm') || 'Confirm';
                        confirmBtn.id = 'pay-confirm-btn';
                        confirmBtn.className = 'button primary';
                        dlg.appendChild(confirmBtn);
                        
                        // ダイアログのメッセージを更新
                        dlg.querySelector('h2').textContent = t('pay.failed') || 'Payment Failed';
                        
                        // displayCurrencyが未定義の場合は再計算（エラーが早期に発生した場合）
                        let errorDisplayCurrency = displayCurrency || currency;
                        if (!displayCurrency && currency && chain) {
                            // productsオブジェクトを取得
                            const products = window.CoinsLibs?.products || window.products || {};
                            
                            // currencyとchainからproductIdを生成
                            const chainLower = chain.toLowerCase();
                            const tokenUpper = currency.toUpperCase();
                            
                            // チェーン名のマッピング
                            const chainMap = {
                                'polygon': 'POL',
                                'ethereum': 'ETH',
                                'arbitrum': 'ARB',
                                'base': 'BASE',
                                'optimism': 'OPT',
                                'avalanche': 'AVAX',
                                'bsc': 'BNB'
                            };
                            
                            // トークンとチェーンの組み合わせからproductIdを生成
                            if (chainMap[chainLower]) {
                                const chainKey = chainMap[chainLower];
                                const candidateProductId = `${tokenUpper}_${chainKey}`;
                                
                                // productsに存在するか確認
                                if (products[candidateProductId]) {
                                    // getDisplayName関数を使用して表示名を取得
                                    const getDisplayName = window.CoinsLibs?.getDisplayName;
                                    if (getDisplayName && typeof getDisplayName === 'function') {
                                        errorDisplayCurrency = getDisplayName(candidateProductId);
                                    } else {
                                        // getDisplayNameが利用できない場合、シンボルとチェーン名から生成
                                        const product = products[candidateProductId];
                                        if (product && product.symbol) {
                                            const chainDisplayNames = {
                                                'polygon': 'Polygon',
                                                'ethereum': 'Ethereum',
                                                'arbitrum': 'Arbitrum',
                                                'base': 'Base',
                                                'optimism': 'Optimism',
                                                'avalanche': 'Avalanche',
                                                'bsc': 'BNB Chain'
                                            };
                                            const chainDisplayName = chainDisplayNames[chainLower] || chain;
                                            errorDisplayCurrency = `${product.symbol} (${chainDisplayName})`;
                                        }
                                    }
                                }
                            }
                        }
                        
                        // エラーメッセージを翻訳
                        let translatedErrorMessage = errorMessage;
                        
                        // "Insufficient {symbol} balance: {balance} < {required}" パターンを検出
                        const insufficientBalanceMatch = errorMessage.match(/Insufficient\s+(\w+)\s+balance:\s+([\d.]+)\s+<\s+([\d.]+)/i);
                        if (insufficientBalanceMatch) {
                            const symbol = insufficientBalanceMatch[1];
                            const balance = insufficientBalanceMatch[2];
                            const required = insufficientBalanceMatch[3];
                            // i18nextのt関数に名前空間とパラメータを渡す（payment-consent → common の順でフォールバック）
                            if (window.i18next && window.i18next.t) {
                                let translated = window.i18next.t('pay.insufficientBalance', { 
                                    ns: 'payment-consent',
                                    symbol: symbol, 
                                    balance: balance, 
                                    required: required 
                                });
                                // 翻訳キーが解決されていない場合（キー自体が返された場合）はcommon名前空間を試す
                                if (translated === 'pay.insufficientBalance') {
                                    translated = window.i18next.t('pay.insufficientBalance', { 
                                        ns: 'common',
                                        symbol: symbol, 
                                        balance: balance, 
                                        required: required 
                                    });
                                }
                                // それでも解決されない場合はフォールバックを使用
                                if (translated && translated !== 'pay.insufficientBalance') {
                                    translatedErrorMessage = translated;
                                } else {
                                    // フォールバック: 言語に応じたメッセージ
                                    const currentLang = (window.i18next && window.i18next.language) || 'en';
                                    if (currentLang === 'ja') {
                                        translatedErrorMessage = `${symbol}の残高が不足しています: ${balance} < ${required}`;
                                    } else {
                                        translatedErrorMessage = `Insufficient ${symbol} balance: ${balance} < ${required}`;
                                    }
                                }
                            } else {
                                // フォールバック
                                translatedErrorMessage = `${symbol}の残高が不足しています: ${balance} < ${required}`;
                            }
                        } else {
                            // "Insufficient {token} balance for gas fee" パターンを検出
                            const insufficientGasMatch = errorMessage.match(/Insufficient\s+(\w+)\s+balance\s+for\s+gas\s+fee/i);
                            if (insufficientGasMatch) {
                                const token = insufficientGasMatch[1];
                                if (window.i18next && window.i18next.t) {
                                    let translated = window.i18next.t('pay.insufficientGas', { 
                                        ns: 'payment-consent',
                                        token: token 
                                    });
                                    // 翻訳キーが解決されていない場合（キー自体が返された場合）はcommon名前空間を試す
                                    if (translated === 'pay.insufficientGas') {
                                        translated = window.i18next.t('pay.insufficientGas', { 
                                            ns: 'common',
                                            token: token 
                                        });
                                    }
                                    // それでも解決されない場合はフォールバックを使用
                                    if (translated && translated !== 'pay.insufficientGas') {
                                        translatedErrorMessage = translated;
                                    } else {
                                        // フォールバック: 言語に応じたメッセージ
                                        const currentLang = (window.i18next && window.i18next.language) || 'en';
                                        if (currentLang === 'ja') {
                                            translatedErrorMessage = `ガス代用の${token}残高が不足しています。取引手数料を支払うために、ウォレットに${token}を追加してください。`;
                                        } else {
                                            translatedErrorMessage = `Insufficient ${token} balance for gas fee. Please add ${token} to your wallet to pay for transaction fees.`;
                                        }
                                    }
                                } else {
                                    // フォールバック
                                    translatedErrorMessage = `ガス代用の${token}残高が不足しています。取引手数料を支払うために、ウォレットに${token}を追加してください。`;
                                }
                            } else {
                                // "Low {token} balance" パターンを検出
                                const lowGasMatch = errorMessage.match(/Low\s+(\w+)\s+balance/i);
                                if (lowGasMatch) {
                                    const token = lowGasMatch[1];
                                    if (window.i18next && window.i18next.t) {
                                        let translated = window.i18next.t('pay.lowGas', { 
                                            ns: 'payment-consent',
                                            token: token 
                                        });
                                        // 翻訳キーが解決されていない場合（キー自体が返された場合）はcommon名前空間を試す
                                        if (translated === 'pay.lowGas') {
                                            translated = window.i18next.t('pay.lowGas', { 
                                                ns: 'common',
                                                token: token 
                                            });
                                        }
                                        // それでも解決されない場合はフォールバックを使用
                                        if (translated && translated !== 'pay.lowGas') {
                                            translatedErrorMessage = translated;
                                        } else {
                                            // フォールバック: 言語に応じたメッセージ
                                            const currentLang = (window.i18next && window.i18next.language) || 'en';
                                            if (currentLang === 'ja') {
                                                translatedErrorMessage = `${token}残高が少ないです。ガス代不足により取引が失敗する可能性があります。取引手数料を支払うために、十分な${token}があることを確認してください。`;
                                            } else {
                                                translatedErrorMessage = `Low ${token} balance. Transaction may fail due to insufficient gas. Please ensure you have enough ${token} to pay for transaction fees.`;
                                            }
                                        }
                                    } else {
                                        // フォールバック
                                        translatedErrorMessage = `${token}残高が少ないです。ガス代不足により取引が失敗する可能性があります。取引手数料を支払うために、十分な${token}があることを確認してください。`;
                                    }
                                }
                            }
                        }
                        
                        const errorLabel = t('pay.error') || 'Error';
                        dlg.querySelector('p').innerHTML = `${labelCurrency}: ${errorDisplayCurrency}<br>${labelAmount}: ${amountStr}<br>${labelTo}: ${displayTo}<br><br><strong style="color: #ff6b6b;">${errorLabel}: ${translatedErrorMessage}</strong>`;
                        
                        // 確認ボタンのクリックイベント（キャンセルボタンと同様の処理）
                        confirmBtn.onclick = async () => {
                            // エラー終了はOPへ返却（fetch APIを使用してCSP準拠）
                            try {
                                const params = new URLSearchParams();
                                params.append('redirect_uri', redirect_uri);
                                params.append('state', state);
                                params.append('error', 'payment_failed');
                                params.append('error_description', errorMessage);
                                
                                const response = await fetch(window.location.origin + '/wallet/payment-cancel', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/x-www-form-urlencoded',
                                    },
                                    body: params.toString()
                                });
                                
                                if (response.ok) {
                                    const result = await response.json();
                                    if (result.success && result.redirect_url) {
                                        window.location.href = result.redirect_url;
                                    } else {
                                        throw new Error('Invalid response from payment-cancel');
                                    }
                                } else {
                                    throw new Error(`Payment error redirect failed: ${response.status}`);
                                }
                            } catch (e) {
                                console.error('Payment error redirect failed:', e);
                                showError('Redirect Failed', e.message || String(e));
                                // CSPエラーなどの場合、ダイアログを閉じてエラーを表示
                                dlg.close();
                            }
                        };
                    }
                };

                if (closeBtn) closeBtn.style.display = 'none';
            }
        } catch (e) {
            console.warn('Payment init error:', e);
        }
    })();

    /**
     * Handle wallet registration (統一処理)
     */
    /**
     * iOS用の初期化ダイアログを表示
     */
    async function showIOSInitializationDialog() {
        // URLクエリパラメータを確認
        const urlParams = new URLSearchParams(window.location.search);
        const startParam = urlParams.get('start');
        
        // startパラメータがある場合、ダイアログを表示せずに直接処理を実行
        if (startParam) {
            if (startParam === 'getstarted') {
                console.log('🔧 start=getstarted detected, executing handleRegistration...');
                await handleRegistration();
                return;
            } else if (startParam === 'login') {
                console.log('🔧 start=login detected, executing executeEmergencyRecoveryWithPasskeyOnly...');
                if (typeof window.executeEmergencyRecoveryWithPasskeyOnly === 'function') {
                    await window.executeEmergencyRecoveryWithPasskeyOnly();
                } else {
                    console.error('executeEmergencyRecoveryWithPasskeyOnly function not found');
                    showError('Recovery Failed', 'Recovery function not available');
                }
                return;
            }
        }
        
        return new Promise((resolve) => {
            // ダイアログ要素を取得または作成
            let dialog = document.getElementById('ios-init-dialog');
            if (!dialog) {
                dialog = document.createElement('dialog');
                dialog.id = 'ios-init-dialog';
                dialog.style.cssText = `
                    background: #1c1d26;
                    color: #ffffff;
                    border: 1px solid #4a4b5a;
                    border-radius: 8px;
                    padding: 0;
                    max-width: 500px;
                    width: 90%;
                `;
                document.body.appendChild(dialog);
            }
            
            // i18nextが利用可能な場合は翻訳を取得
            const t = (key, ns = 'index') => {
                if (window.i18next && window.i18next.t) {
                    return window.i18next.t(key, { ns: ns }) || key;
                }
                return key;
            };
            const dialogTitle = t('dialogs.iosInit.title') || 'Get Started';
            const firstTimeText = t('dialogs.iosInit.firstTimeUse') || 'First time use';
            const subsequentText = t('dialogs.iosInit.subsequentUse') || 'Subsequent use';
            const cancelText = t('dialogs.generic.close') || 'Cancel';
            
            dialog.innerHTML = `
                <header class="major" style="background: #1c1d26; padding: 20px; margin: 0; width: 100%;">
                    <h3 style="color: #ffffff; margin: 0; text-align: center;">${dialogTitle}</h3>
                </header>
                <div style="padding: 20px; background: #1c1d26;">
                    <div style="margin-bottom: 15px;">
                        <button id="ios-first-time-use-btn" class="button primary" style="width: 100%; margin-bottom: 10px;">
                            ${firstTimeText}
                        </button>
                    </div>
                    <div style="margin-bottom: 15px;">
                        <button id="ios-subsequent-use-btn" class="button primary" style="width: 100%; margin-bottom: 10px;">
                            ${subsequentText}
                        </button>
                    </div>
                    <button id="ios-init-dialog-close-btn" class="button secondary" style="width: 100%;">
                        ${cancelText}
                    </button>
                </div>
            `;
            
            // イベントリスナーを設定
            const firstTimeBtn = dialog.querySelector('#ios-first-time-use-btn');
            const subsequentBtn = dialog.querySelector('#ios-subsequent-use-btn');
            const closeBtn = dialog.querySelector('#ios-init-dialog-close-btn');
            
            // 既存のイベントリスナーを削除
            const removeListeners = () => {
                if (firstTimeBtn) {
                    firstTimeBtn.replaceWith(firstTimeBtn.cloneNode(true));
                }
                if (subsequentBtn) {
                    subsequentBtn.replaceWith(subsequentBtn.cloneNode(true));
                }
                if (closeBtn) {
                    closeBtn.replaceWith(closeBtn.cloneNode(true));
                }
            };
            
            // First time use ボタン
            const firstTimeHandler = async (e) => {
                e.preventDefault();
                dialog.close();
                removeListeners();
                // 通常の初期化処理へ
                await handleRegistration();
                resolve();
            };
            
            // Subsequent use ボタン
            const subsequentHandler = async (e) => {
                e.preventDefault();
                dialog.close();
                removeListeners();
                // リカバリー処理へ
                if (typeof window.executeEmergencyRecoveryWithPasskeyOnly === 'function') {
                    await window.executeEmergencyRecoveryWithPasskeyOnly();
                } else {
                    console.error('executeEmergencyRecoveryWithPasskeyOnly function not found');
                    showError('Recovery Failed', 'Recovery function not available');
                }
                resolve();
            };
            
            // 閉じるボタン
            const closeHandler = (e) => {
                e.preventDefault();
                dialog.close();
                removeListeners();
                resolve();
            };
            
            // 新しい要素を取得してイベントリスナーを設定
            const newFirstTimeBtn = dialog.querySelector('#ios-first-time-use-btn');
            const newSubsequentBtn = dialog.querySelector('#ios-subsequent-use-btn');
            const newCloseBtn = dialog.querySelector('#ios-init-dialog-close-btn');
            
            if (newFirstTimeBtn) {
                newFirstTimeBtn.addEventListener('click', firstTimeHandler);
            }
            if (newSubsequentBtn) {
                newSubsequentBtn.addEventListener('click', subsequentHandler);
            }
            if (newCloseBtn) {
                newCloseBtn.addEventListener('click', closeHandler);
            }
            
            // ダイアログを表示
            dialog.showModal();
        });
    }

    async function handleRegistration() {
        // Get Startedボタンの元のテキストを保存
        const getStartedButtons = Array.from(document.querySelectorAll('.getstarted'));
        const originalTexts = getStartedButtons.map(btn => btn.textContent);
        
        // ボタンの状態を復元する関数
        const restoreButtons = () => {
            getStartedButtons.forEach((btn, index) => {
                btn.textContent = originalTexts[index] || i18next.t('actions.getStarted');
                btn.disabled = false;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
            });
        };
        
        try {
            // 既にウォレットが存在するかチェック
            if (masterId) {
                const errorTitle = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t)
                    ? i18next.t('errors.walletAlreadyExists.title', { ns: 'common' })
                    : 'Wallet Already Exists';
                const errorMessage = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t)
                    ? i18next.t('errors.walletAlreadyExists.message', { ns: 'common' })
                    : 'A wallet has already been created for this device.<br><br>If you need to access your existing wallet, please use the "Log In" option instead.<br><br>If you want to perform easy recovery, please use the "Easy Recovery" option.';
                showError(errorTitle, errorMessage);
                return;
            }

            // ボタンのテキストを「Processing..」に変更
            const processingText = i18next.t('actions.processing');
            getStartedButtons.forEach(btn => {
                btn.textContent = processingText;
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.6';
            });

            showLoading(true);
            // iOS Safariでは、ユーザー操作から外れたと判定されないよう、
            // navigator.credentials.create()を最初に実行する必要がある
            // そのため、showMessageInDialog()は後回しにする

            if (restoreElement) {
                restoreElement.style.display = 'none';
            }

            console.log("Starting wallet registration...");
            
            // 統一されたgetStartedメソッドを使用（重複回避）
            // navigator.credentials.create()を先に実行するため、ここで呼び出す
            const result = await bitvoyMPC.getStarted();
            
            // 登録が開始されたら、ダイアログを表示（非同期処理の後）
            await showMessageInDialog('dialogs.registration.title', 'dialogs.registration.creating', 2);

            if (result.success) {
                console.log("Registration successful");
                
                // OIDCフラグの確認
                const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
                
                if (oidcFlag === 'true') {
                    // OIDC経由の場合はダイアログを表示せずに直接OIDCフローに戻る
                    console.log("🔄 OIDC経由の登録完了 - ダイアログをスキップしてOIDCフローに戻る");
                await handleRegistrationComplete();
                } else {
                    // 通常の場合は成功ダイアログを表示
                    console.log("ℹ️ 通常の登録完了 - 成功ダイアログを表示");
                    showSuccessDialog('dialogs.registration.successTitle', 'dialogs.registration.successMessage');
                    // 通常の登録完了フラグを設定（ダイアログを閉じた際にリロードするため）
                    window.registrationCompleted = true;
                }
            } else {
                throw new Error(result.error || 'Registration failed');
            }

        } catch (error) {
            console.error("Registration failed:", error);
            showError('Registration Failed', error.message);
        } finally {
            showLoading(false);
            // ボタンのテキストを元に戻す
            restoreButtons();
        }
    }

    /**
     * Handle wallet sign-in (統一処理)
     */
    async function handleSignIn() {
        try {
            showLoading(true);
            
            if (restoreElement) {
                restoreElement.style.display = 'none';
            }

            console.log("Starting wallet log-in...");
            const result = await bitvoyMPC.signinBitVoyMPC();

            if (result.success) {
                console.log("Log-in successful");
                showSuccessDialog('dialogs.signin.title', 'dialogs.signin.message');
                setTimeout(() => location.reload(), 1000);
            } else {
                throw new Error(result.error || 'Log-in failed');
            }

        } catch (error) {
            console.error("Log-in failed:", error);
            showError('Log-in Failed', error.message);
        } finally {
            showLoading(false);
        }
    }

    /**
     * Handle wallet restoration (統一処理)
     */
    async function handleRestore() {
        try {
            console.log("Starting wallet restoration...");
            
            // Hide other elements
            if (restoreElement) restoreElement.style.display = 'none';
            getStartedElements.forEach(el => {
                el.style.display = 'none';
                // 親要素（<li>）も非表示にする
                if (el.parentElement) {
                    el.parentElement.style.display = 'none';
                }
            });
            
            // Show email verification UI
            document.querySelector('#setemailsection1').style.display = 'block';
            document.querySelector('.mainwallet').style.display = 'none';
            document.querySelector('#main').style.display = 'none';
            document.querySelector('#footer').style.display = 'none';

        } catch (error) {
            console.error("Restore setup failed:", error);
            showError('Restore Failed', error.message);
        }
    }

    /**
     * Show easy recovery options
     */
    window.showEmergencyRecovery = function() {
        const emergencyDialog = document.createElement('dialog');
        emergencyDialog.id = 'emergency-recovery-dialog';
        emergencyDialog.style.cssText = `
            background: #1c1d26;
            color: #ffffff;
            border: 1px solid #4a4b5a;
            border-radius: 8px;
            padding: 0;
            max-width: 500px;
            width: 90%;
        `;
        // i18nextが利用可能な場合は翻訳を取得
        const t = (key) => (window.i18next && window.i18next.t) ? window.i18next.t(key) : key;
        const dialogTitle = t('dialogs.emergencyRecovery.dialogTitle') || 'Easy Recovery';
        const startRecoveryText = t('dialogs.emergencyRecovery.startRecovery') || 'Start Recovery';
        const cancelText = t('dialogs.generic.close') || 'Cancel';
        
        emergencyDialog.innerHTML = `
            <header class="major" style="background: #1c1d26; padding: 20px; margin: 0; width: 100%;">
                <h3 style="color: #ffffff; margin: 0; text-align: center;">${dialogTitle}</h3>
            </header>
            <div style="padding: 20px; background: #1c1d26;">
                <div style="margin-bottom: 15px;">
                    <button id="start-emergency-recovery-passkey-only-btn" class="button primary" style="width: 100%;">
                        🔐 ${startRecoveryText}
                    </button>
                </div>
                <button id="close-emergency-recovery-dialog-btn">
                    ${cancelText}
                </button>
            </div>
        `;
        
        document.body.appendChild(emergencyDialog);
        
        // イベントリスナーを設定
        const passkeyOnlyBtn = emergencyDialog.querySelector('#start-emergency-recovery-passkey-only-btn');
        const closeBtn = emergencyDialog.querySelector('#close-emergency-recovery-dialog-btn');
        
        if (passkeyOnlyBtn) {
            passkeyOnlyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                emergencyDialog.close();
                window.executeEmergencyRecoveryWithPasskeyOnly();
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                emergencyDialog.close();
            });
        }
        
        emergencyDialog.showModal();
    };


    /**
     * Execute easy recovery with Passkey only (no email)
     */
    window.executeEmergencyRecoveryWithPasskeyOnly = async function() {
        try {
            showLoading(true);
            
            console.log("🔄 Starting easy recovery with Passkey only...");
            
            // BitVoyインスタンスを取得
            if (!window.bitvoyMPC) {
                throw new Error('BitVoy instance not found. Please refresh the page.');
            }
            
            // メール認証なしでリカバリを実行
            const result = await window.bitvoyMPC.emergencyRecovery(null, null, 'emergency_restore');
            
            if (result.success) {
                // リカバリ成功フラグを設定
                window.emergencyRecoveryCompleted = true;
                
                // OIDCフラグの確認
                const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
                
                if (oidcFlag === 'true') {
                    // OIDC経由の場合はダイアログを表示せずに直接OIDC認証フローに戻る
                    console.log("🔄 OIDC経由のリカバリー完了 - ダイアログをスキップしてOIDC認証フローに戻る");
                    await handleRecoveryComplete();
                } else {
                    // 通常の場合は成功ダイアログを表示
                    console.log("ℹ️ 通常のリカバリー完了 - 成功ダイアログを表示");
                    showSuccessDialog('dialogs.emergencyRecovery.title', 
                        `${window.i18next?.t('dialogs.emergencyRecovery.message') || 'Wallet recovered successfully with Reshare!'}`);
                    
                    // アドレス再生成を実行（リカバリは既に完了しているため、アドレス再生成のみ）
                    try {
                        const addressResult = await window.bitvoyMPC.regenerateAddressesAfterEmergencyRecovery();
                        if (addressResult.success) {
                            console.log("✅ Address regeneration completed after Reshare recovery");
                            console.log("📊 Generated wallets:", addressResult.wallets);
                        }
                    } catch (addressError) {
                        console.warn("⚠️ Address regeneration failed after recovery:", addressError);
                        // アドレス再生成の失敗は致命的ではない
                    }
                }
            } else {
                throw new Error(result.error || 'Easy recovery failed');
            }
        } catch (error) {
            console.error("Easy recovery failed:", error);
            showError('Recovery Failed', error.message);
        } finally {
            showLoading(false);
        }
    };


    /**
     * Check and handle email setup
     */
    async function checkEmailSetup() {
        try {
            // メール設定警告の表示を無効化
            // const isEmailSetup = await bitvoyMPC.isEmailSetup();
            // if (!isEmailSetup && emailAlertElement) {
            //     emailAlertElement.style.display = 'block';
            //     
            //     // Add Guardian Node notice to email alert
            //     const guardianNotice = document.createElement('div');
            //     const securityTitle = (window.i18next && window.i18next.t) ? window.i18next.t('dialogs.emailSecurity.title') : '🛡️ Enhanced Security for Easy Recovery';
            //     const securityDescription = (window.i18next && window.i18next.t) ? window.i18next.t('dialogs.emailSecurity.description') : 'Email verification enables secure easy recovery with dual authentication: Email + Passkey biometric/security key verification.';
            //     
            //     guardianNotice.innerHTML = `
            //         <div style="background: rgba(76, 175, 80, 0.1); border: 1px solid #4CAF50; border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 0.9em;">
            //             <h5 style="color: #4CAF50; margin: 0 0 5px 0;">${securityTitle}</h5>
            //             <p style="margin: 0;">${securityDescription}</p>
            //         </div>
            //     `;
            //     emailAlertElement.appendChild(guardianNotice);
            // }
            
            // エレメントを非表示に保つ
            if (emailAlertElement) {
                emailAlertElement.style.display = 'none';
            }
        } catch (error) {
            console.warn("Failed to check email setup:", error);
        }
    }


    /**
     * UI utility functions
     */
    function showLoading(show) {
        const loadingElement = document.querySelector('#loading');
        if (loadingElement) {
            if (show) {
                loadingElement.classList.remove('hide');
                // Update loading message for JWT operations
                const loadingContent = loadingElement.querySelector('.loading-content');
                if (loadingContent) {
                    loadingContent.innerHTML = `
                        <div style="margin-bottom: 10px;">🔐 Processing MPC Operation...</div>
                        <div style="font-size: 0.8em; opacity: 0.7;">Coordinating with JWT-authenticated parties</div>
                    `;
                }
            } else {
                loadingElement.classList.add('hide');
            }
        }
    }

    function showError(title, message) {
        console.error(`${title}: ${message}`);
        showDialog(title, message);
    }

    function showSuccessDialog(title, message) {
        showDialog(title, message);
    }

    function showDialog(title, message) {
        const dialog = document.querySelector('#bitvoy-dialog');
        if (dialog && typeof dialog.showModal === "function") {
            // i18nextが利用可能な場合は翻訳を適用
            const translatedTitle = (window.i18next && window.i18next.t) ? window.i18next.t(title) : title;
            const translatedMessage = (window.i18next && window.i18next.t) ? window.i18next.t(message) : message;
            
            document.querySelector('#bitvoy-dialog h2').textContent = translatedTitle;
            document.querySelector('#bitvoy-dialog p').innerHTML = translatedMessage;
            dialog.showModal();
        } else {
            alert(`${title}: ${message}`);
        }
    }

    async function showMessageInDialog(headerText, messageText, durationInSeconds) {
        const dialog = document.getElementById('auto-dialog');
        if (!dialog) return;

        const header = dialog.querySelector('h2');
        const paragraph = dialog.querySelector('p');

        // i18nextが利用可能な場合は翻訳を適用
        const translatedHeader = (window.i18next && window.i18next.t) ? window.i18next.t(headerText) : headerText;
        const translatedMessage = (window.i18next && window.i18next.t) ? window.i18next.t(messageText) : messageText;

        if (header) header.textContent = translatedHeader;
        if (paragraph) paragraph.textContent = translatedMessage;

        dialog.showModal();
        await new Promise(resolve => setTimeout(resolve, durationInSeconds * 1000));
        dialog.close();
    }

    // Email verification functions (統一処理対応)
    window.needVerification = function() {
        document.querySelector('#setemailsection1').style.display = 'block';
        document.querySelector('.mainwallet').style.display = 'none';
        document.querySelector('#main').style.display = 'none';
        document.querySelector('#footer').style.display = 'none';
    };

    // Make bitvoyMPC globally available (単一インスタンス)
    window.bitvoyMPC = bitvoyMPC;

    // Hide email sections initially
    const emailSection1 = document.getElementById('setemailsection1');
    const emailSection2 = document.getElementById('setemailsection2');
    if (emailSection1) emailSection1.style.display = 'none';
    if (emailSection2) emailSection2.style.display = 'none';

    console.log("MPC application with JWT authentication initialized successfully");
    
    // preloadクラスを削除してbannerを表示
    document.body.classList.remove('is-preload');
    console.log("✅ Removed is-preload class - banner should now be visible");
    
    // UI設定完了の確認
    console.log("=== Final UI Setup Verification ===");
    const finalGetStartedElements = Array.from(document.querySelectorAll('.getstarted'));
    console.log("Final getStartedElements count:", finalGetStartedElements.length);
    finalGetStartedElements.forEach((element, index) => {
        console.log(`Get Started button ${index + 1}:`, {
            element: element,
            innerHTML: element.innerHTML,
            onclick: typeof element.onclick,
            display: element.style.display,
            visible: element.offsetParent !== null
        });
    });
    
    // ページ全体の表示状態を確認
    console.log("Page visibility check:", {
        bodyDisplay: document.body.style.display,
        bodyVisibility: document.body.style.visibility,
        bodyOpacity: document.body.style.opacity,
        hasPreloadClass: document.body.classList.contains('is-preload')
    });
    
    console.log("=== End UI Setup Verification ===");
    
    // 初期化完了イベントを発火
    window.dispatchEvent(new CustomEvent('bitvoy_app_ready', {
        detail: {
            timestamp: Date.now(),
            mpcInitialized: true,
            jwtAuthenticationEnabled: true
        }
    }));

    /**
     * Start emergency signing process
     */
    window.startEmergencySigning = async function() {
        try {
            // Close the main dialog
            document.querySelector('#emergency-recovery-dialog').close();
            
            // Show transaction input dialog
            const signingDialog = document.createElement('dialog');
            signingDialog.id = 'emergency-signing-dialog';
            signingDialog.style.cssText = `
                background: #1c1d26;
                color: #ffffff;
                border: 1px solid #4a4b5a;
                border-radius: 8px;
                padding: 0;
                max-width: 500px;
                width: 90%;
            `;
            signingDialog.innerHTML = `
                <header class="major" style="background: #2a2b36; padding: 20px; margin: 0; border-bottom: 1px solid #4a4b5a;">
                    <h3 style="color: #ffffff; margin: 0;">✍️ Emergency Transaction Signing</h3>
                </header>
                <div style="padding: 20px; background: #1c1d26;">
                    <p style="color: #ffffff;">Enter transaction details for emergency signing:</p>
                    <input type="text" id="emergency-transaction-hash" placeholder="Transaction hash or message" style="width: 100%; margin-bottom: 15px; padding: 8px; border: 1px solid #4a4b5a; border-radius: 4px; background: #2a2b36; color: #ffffff;">
                    <div style="display: flex; gap: 10px;">
                        <button id="execute-emergency-signing-btn" class="button primary">
                            Sign Transaction
                        </button>
                        <button id="cancel-emergency-signing-dialog-btn">
                            Cancel
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(signingDialog);
            signingDialog.showModal();

            // イベントリスナー追加
            const executeBtn = signingDialog.querySelector('#execute-emergency-signing-btn');
            if (executeBtn) {
                executeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    window.executeEmergencySigning();
                });
            }
            const cancelBtn = signingDialog.querySelector('#cancel-emergency-signing-dialog-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    signingDialog.close();
                });
            }
        } catch (error) {
            console.error("Failed to start emergency signing:", error);
            showError('Emergency Signing Failed', error.message);
        }
    };

    /**
     * Execute emergency signing with Reshare
     */
    window.executeEmergencySigning = async function() {
        try {
            const transactionHash = document.querySelector('#emergency-transaction-hash').value.trim();
            if (!transactionHash) {
                showError('Invalid Transaction', 'Please enter a transaction hash or message.');
                return;
            }

            showLoading(true);
            
            // Close signing dialog
            document.querySelector('#emergency-signing-dialog').close();
            
            // Execute emergency signing flow with Reshare
            const result = await bitvoyMPC.emergencyRecovery('', '', 'emergency_sign');
            
            if (result.success) {
                showSuccessDialog('dialogs.emergencySigning.title', 
                    `${window.i18next?.t('dialogs.emergencySigning.message') || 'Transaction signed successfully with Reshare!'}<br><br>
                    <strong>${window.i18next?.t('dialogs.emergencySigning.details') || 'Signing Details:'}</strong><br>
                    • ${window.i18next?.t('dialogs.emergencySigning.signature') || 'Signature:'} ${result.recoveryResult.signature.substring(0, 32)}...<br>
                    • Signing Method: ${result.recoveryResult.signingMethod || 'emergency_guardian_reshare'}<br>
                    • Curve: ${result.recoveryResult.curve || 'secp256k1'}<br>
                    • Session ID: ${result.recoveryResult.sessionId || 'N/A'}<br><br>
                    Transaction signed using enhanced frost-core 2.1.0 Reshare functionality.`);
            } else {
                throw new Error(result.error || 'Emergency signing with Reshare failed');
            }
            
        } catch (error) {
            console.error("Emergency signing with Reshare execution failed:", error);
            showError('Signing Failed', `Emergency signing with Reshare failed: ${error.message}`);
        } finally {
            showLoading(false);
        }
    };

    /**
     * BITVOY_LOADINGフラグがfalseになるまで待機
     */
    async function waitForBitVoyInitialization(maxWaitTime = 60000) {
        const startTime = Date.now();
        
        while (window.BITVOY_LOADING === true) {
            if (Date.now() - startTime > maxWaitTime) {
                console.warn('⚠️ BitVoy initialization timeout, proceeding anyway...');
                break;
            }
            
            console.log('⏳ Still waiting for BitVoy initialization...', {
                BITVOY_LOADING: window.BITVOY_LOADING,
                frostWasmReady: window.BitVoyInitializationState?.frostWasmReady,
                systemReady: window.BitVoyInitializationState?.systemReady
            });
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('✅ BitVoy initialization wait completed');
    }

    // Restore Walletボタンで緊急リカバリーUIを開く
    window.restoreWallet = window.showEmergencyRecovery;

    // Easy Recoveryボタン（メニュー）
    const emergencyRecoveryBtnMenu = document.getElementById('emergency-recovery-btn-menu');
    if (emergencyRecoveryBtnMenu) {
        emergencyRecoveryBtnMenu.addEventListener('click', function(e) {
            e.preventDefault();
            window.showEmergencyRecovery();
        });
    }
    
    // Easy Recoveryボタン（ヘッダー）
    const emergencyBtnHeader = document.getElementById('emergency-recovery-btn-header');
    if (emergencyBtnHeader) {
        emergencyBtnHeader.addEventListener('click', function(e) {
            e.preventDefault();
            window.showEmergencyRecovery();
        });
    }

    // Dialogボタンのイベントリスナー設定
    setupDialogEventListeners();
    
    // 最終確認：初期化が完了したらローディングを確実に非表示
    if (loadingElement) {
        loadingElement.classList.add('hide');
    }
    
    console.log('✅ BitVoy MPC application initialization completed');
    
    // OIDC経由でアクセスされた場合、「Get Started」ボタンを自動クリック
    // ただし、「Sign In」ボタンの場合は発火させない
    const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
    if (oidcFlag === 'true') {
        console.log('🔐 OIDC経由でアクセス検出 - Get Startedボタンの自動クリックをチェック');
        
        // グローバルフラグで重複実行を防止
        if (window._bitvoyAutoClickInProgress) {
            console.log('⚠️ 既に自動クリック処理が実行中です。スキップします。');
            return;
        }
        window._bitvoyAutoClickInProgress = true;
        
        // 初期化完了後、UIが完全にレンダリングされるまで少し待つ
        setTimeout(() => {
            const tryAutoClick = () => {
                // OIDCフラグがまだ存在するか確認
                const currentOidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
                if (currentOidcFlag !== 'true') {
                    console.log('🔐 OIDCフラグがクリアされました。自動クリック処理を中止します。');
                    window._bitvoyAutoClickInProgress = false;
                    return;
                }
                
                // 「Get Started」ボタンを探す（「Sign In」ではない）
                const getStartedButtons = Array.from(document.querySelectorAll('.getstarted'));
                
                for (const button of getStartedButtons) {
                    // ボタンが表示されているかチェック
                    const isVisible = button.offsetParent !== null && 
                                    button.style.display !== 'none';
                    
                    // ボタンのテキストが「Sign In」でないことを確認
                    const buttonText = button.textContent?.trim() || button.innerHTML?.trim() || '';
                    const isSignInButton = buttonText.toLowerCase().includes('log in');
                    
                    // イベントリスナーが設定されているかチェック
                    const hasEventListener = button.onclick !== null || 
                                          button._registrationHandler !== undefined;
                    
                    console.log('🔍 ボタンチェック:', {
                        text: buttonText,
                        isSignIn: isSignInButton,
                        isVisible: isVisible,
                        hasEventListener: hasEventListener
                    });
                    
                    // 「Get Started」ボタンで、かつ表示され、かつイベントリスナーが設定されている場合のみ自動クリック
                    if (!isSignInButton && isVisible && hasEventListener) {
                        console.log('✅ Get Startedボタンを自動クリックします:', button);
                        window._bitvoyAutoClickInProgress = false;
                        
                        // クリックイベントを発火
                        try {
                            button.click();
                            console.log('✅ ボタンの自動クリックが成功しました');
                            return; // 成功したので終了
                        } catch (error) {
                            console.error('❌ ボタンの自動クリックでエラー:', error);
                            window._bitvoyAutoClickInProgress = false;
                        }
                        // 最初の有効なボタンだけをクリックして終了
                        break;
                    }
                }
                
                console.log('⚠️ クリック可能なGet Startedボタンが見つかりませんでした');
                window._bitvoyAutoClickInProgress = false;
            };
            
            // requestAnimationFrameを使ってDOMレンダリング完了を待ってから実行
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    tryAutoClick();
                });
            });
        }, 300); // UIのレンダリング完了を待つ
    }
}

/**
 * Dialogボタンのイベントリスナーを設定
 */
function setupDialogEventListeners() {
    // ダイアログの閉じるボタン
    const dialogCloseBtn = document.getElementById('dialog-close-btn');
    if (dialogCloseBtn) {
        dialogCloseBtn.addEventListener('click', function() {
            const dialog = document.querySelector('#bitvoy-dialog');
            if (dialog) {
                dialog.close();
                
                // リカバリー完了後にリロード（OIDC経由でない場合のみ）
                if (window.emergencyRecoveryCompleted) {
                    // OIDCフラグがある場合はリロードしない（handleRecoveryCompleteでリダイレクトされる）
                    const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
                    if (oidcFlag !== 'true') {
                        console.log("🔄 Reloading page after easy recovery completion...");
                        setTimeout(() => {
                            location.reload();
                        }, 500); // ダイアログが閉じるのを待ってからリロード
                    } else {
                        console.log("ℹ️ OIDCフラグが存在するため、リロードをスキップします");
                    }
                }
                
                // 通常の登録完了後にリロード（OIDC経由でない場合のみ）
                if (window.registrationCompleted) {
                    console.log("🔄 Reloading page after registration completion...");
                    window.registrationCompleted = false; // フラグをクリア
                    setTimeout(() => {
                        location.reload();
                    }, 500); // ダイアログが閉じるのを待ってからリロード
                }
            }
        });
    }

    // 復旧ダイアログの続行ボタン
    const restoreButton = document.getElementById('restore-button');
    if (restoreButton) {
        restoreButton.addEventListener('click', function() {
            if (typeof startRestoreStep2 === 'function') {
                startRestoreStep2();
            } else {
                console.error('startRestoreStep2 function not found');
            }
        });
    }
}

/**
 * 復旧ステップ2を実行
 */
async function startRestoreStep2() {
    try {
        if (typeof bitvoyMPC !== 'undefined' && bitvoyMPC.restoreBitVoyStep2) {
            await bitvoyMPC.restoreBitVoyStep2();
        } else if (typeof window.bitvoyMPC !== 'undefined' && window.bitvoyMPC.restoreBitVoyStep2) {
            await window.bitvoyMPC.restoreBitVoyStep2();
        } else {
            console.error('bitvoyMPC.restoreBitVoyStep2 not available');
            alert('Restore functionality not available');
        }
    } catch (error) {
        console.error('Restore step 2 failed:', error);
        alert('Restore failed: ' + error.message);
    }
}

/**
 * 登録完了後のOIDCフロー復帰処理
 * app-mpc.jsの524行目で呼び出される
 */
async function handleRegistrationComplete() {
    try {
        console.log('🔄 登録完了後のOIDCフロー復帰処理');
        
        // OIDCフラグがセッションストレージにあるかチェック
        const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
        
        if (oidcFlag === 'true') {
            console.log('✅ OIDCフラグが存在 - OIDC認証フローに戻る');
            
            // フラグをクリア
            sessionStorage.removeItem('bitvoy_oidc_flag');
            
            // OIDC認証フローに戻る
            await returnToOIDCFlow();
            
        } else {
            console.log('ℹ️ OIDCフラグなし - 通常の登録完了処理');
        }
        
    } catch (error) {
        console.error('❌ 登録完了後処理エラー:', error);
    }
}

/**
 * OIDC認証フローに戻る
 */
async function returnToOIDCFlow() {
    try {
        console.log('🔄 OIDC認証フローに戻る');
        
        // セッションストレージからOIDCパラメータを取得
        const storedOIDCParams = sessionStorage.getItem('bitvoy_oidc_params');
        
        if (!storedOIDCParams) {
            console.log('❌ セッションストレージにOIDCパラメータが存在しません');
            showError('認証エラー', 'OIDC認証パラメータが見つかりません');
            return;
        }
        
        const oidcParams = JSON.parse(storedOIDCParams);
        console.log('✅ セッションストレージからOIDCパラメータを取得:', oidcParams);

        // 現在の言語を取得
        const currentLang = await getCurrentLanguage();
        console.log('🌐 現在の言語:', currentLang);
        
        // サーバー統合エンドポイントを呼び出して、追加のパスキー無しで/oidc/authorizeへ進める
        try {
            const oidcSessionToken = sessionStorage.getItem('bitvoy_oidc_session_token');
            const response = await fetch('/wallet/complete-registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    master_id: masterId,
                    oidc_session_token: oidcSessionToken
                })
            });
            const data = await response.json();
            if (response.ok && data && data.success && data.redirect_url) {
                console.log('✅ 統合フロー成功。リダイレクト:', data.redirect_url);
                window.location.href = data.redirect_url;
                return;
            } else {
                console.warn('⚠️ 統合フロー失敗。フォールバックで従来のリダイレクトを実行します。', data?.error);
            }
        } catch (e) {
            console.warn('⚠️ 統合フロー呼び出しエラー。フォールバックを使用します。', e);
        }

        // フォールバック: 直接OIDC URLに遷移
        const oidcUrl = buildOIDCUrl(oidcParams, currentLang);
        if (oidcUrl) {
            console.log('🔄 (fallback) OIDC認証URLにリダイレクト:', oidcUrl);
            window.location.href = oidcUrl;
        } else {
            console.log('❌ OIDCパラメータが不完全');
            showError('認証エラー', 'OIDC認証パラメータが不完全です');
        }
        
    } catch (error) {
        console.error('❌ OIDCフロー復帰エラー:', error);
    }
}

/**
 * リカバリー完了後のOIDC認証フロー復帰処理
 */
async function handleRecoveryComplete() {
    try {
        console.log('🔄 リカバリー完了後のOIDC認証フロー復帰処理');
        
        // masterIdを取得（bitvoyMPCインスタンスまたはセッションストレージから）
        let masterId = null;
        if (window.bitvoyMPC) {
            masterId = window.bitvoyMPC.getMasterId();
        }
        if (!masterId) {
            masterId = sessionStorage.getItem('mpc.masterid');
        }
        
        if (!masterId) {
            throw new Error('masterIdが見つかりません。リカバリーが正しく完了していない可能性があります。');
        }
        
        console.log('✅ masterId取得:', masterId.substring(0, 8) + '...');
        
        // OIDCフラグがセッションストレージにあるかチェック
        const oidcFlag = sessionStorage.getItem('bitvoy_oidc_flag');
        
        if (oidcFlag === 'true') {
            console.log('✅ OIDCフラグが存在 - OIDC認証フローに戻る');
            
            // フラグをクリア
            sessionStorage.removeItem('bitvoy_oidc_flag');
            
            // パスキー認証を実行
            try {
                console.log('🔐 パスキー認証を実行中...');
                // authenticateWithPasskeyはBitVoyMPCクラスのメソッドなので、mpcプロパティ経由で呼び出す
                const authResult = await window.bitvoyMPC.mpc.authenticateWithPasskey(masterId);
                
                if (!authResult || !authResult.assertion) {
                    throw new Error('パスキー認証に失敗しました');
                }
                
                console.log('✅ パスキー認証成功');
                
                // パスキー認証結果をWebAuthn形式に変換
                // authResult.assertionはPublicKeyCredentialオブジェクト
                const assertion = authResult.assertion;
                const webauthnCredential = {
                    id: authResult.credentialId,
                    type: assertion.type || 'public-key',
                    response: {
                        authenticatorData: Array.from(new Uint8Array(assertion.response.authenticatorData)),
                        clientDataJSON: Array.from(new Uint8Array(assertion.response.clientDataJSON)),
                        signature: Array.from(new Uint8Array(assertion.response.signature)),
                        userHandle: assertion.response.userHandle 
                            ? Array.from(new Uint8Array(assertion.response.userHandle))
                            : null
                    }
                };
                
                // OIDCセッショントークンを取得
                const oidcSessionToken = sessionStorage.getItem('bitvoy_oidc_session_token');
                
                if (!oidcSessionToken) {
                    throw new Error('OIDCセッショントークンが見つかりません');
                }
                
                // `/wallet/authenticate`エンドポイントを呼び出し
                const response = await fetch('/wallet/authenticate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        webauthn_credential: webauthnCredential,
                        master_id: masterId,
                        session_token: oidcSessionToken
                    })
                });
                
                const data = await response.json();
                
                if (response.ok && data && data.success && data.redirect_url) {
                    console.log('✅ OIDC認証フロー成功。リダイレクト:', data.redirect_url);
                    window.location.href = data.redirect_url;
                    return;
                } else {
                    throw new Error(data?.error || 'OIDC認証フローに失敗しました');
                }
                
            } catch (authError) {
                console.error('❌ パスキー認証エラー:', authError);
                showError('認証エラー', authError.message || 'パスキー認証に失敗しました');
            }
            
        } else {
            console.log('ℹ️ OIDCフラグなし - 通常のリカバリー完了処理');
        }
        
    } catch (error) {
        console.error('❌ リカバリー完了後処理エラー:', error);
        showError('エラー', error.message || 'リカバリー完了後の処理に失敗しました');
    }
}

/**
 * 支払い完了後のconfirmations待機処理
 */
async function waitForConfirmations(intentId, clientId) {
    const maxAttempts = 60; // 5分（5秒間隔）
    let attempts = 0;
    let receiptObtained = false;
    
    const pollConfirmations = async () => {
        try {
            const response = await fetch(
                `${window.location.origin}/oidc-payment/intents/${intentId}/confirmations?client_id=${clientId}`
            );
            const data = await response.json();
            
            // エラーレスポンスのチェック
            if (!response.ok) {
                const errorMessage = data.message || data.error || `HTTP ${response.status}: ${response.statusText}`;
                if (data.error === 'tx_hash_not_set') {
                    // tx_hashが設定されていない = トランザクション送信失敗
                    throw new Error('トランザクション送信に失敗しました。支払いが完了していない可能性があります。');
                }
                throw new Error(errorMessage);
            }
            
            // 最終ステータスのチェック
            if (data.status === 'SUCCEEDED' || data.status === 'FAILED' || data.status === 'CANCELED' || data.status === 'EXPIRED') {
                return { success: true, status: data.status, confirmations: data.confirmations || 0 };
            }
            
            // receipt取得済みかチェック
            if (data.status === 'PROCESSING') {
                receiptObtained = true;
            }
            
            if (data.confirmations >= 1) {
                // PROCESSINGになったので、完了表示またはリダイレクト
                return { success: true, status: 'PROCESSING', confirmations: data.confirmations };
            }
            
            // まだ確認待ち
            return { success: false, status: data.status || 'PENDING', confirmations: data.confirmations || 0 };
        } catch (error) {
            console.error('Confirmations確認エラー:', error);
            return { success: false, error: error.message };
        }
    };
    
    // ポーリング開始
    while (attempts < maxAttempts) {
        const result = await pollConfirmations();
        
        if (result.success) {
            return result;
        }
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        // receipt取得前は1秒、取得後は2秒待機
        const waitTime = receiptObtained ? 2000 : 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        attempts++;
    }
    
    throw new Error('Confirmations待機がタイムアウトしました');
}

/**
 * 現在の言語を取得（localStorageから）
 */
async function getCurrentLanguage() {
    // localStorageから取得（i18n-init.jsでパスやクエリから設定済み）
    const storedLang = localStorage.getItem('lang');
    const supported = ['en', 'ja'];
    
    if (storedLang && supported.indexOf(storedLang) >= 0) {
        return storedLang;
    }
    
    // デフォルト
    return 'en';
}

/**
 * OIDC認証URLを構築
 */
function buildOIDCUrl(params, lang = 'en') {
    try {
        // 必要なパラメータをチェック
        if (!params.client_id || !params.redirect_uri) {
            console.log('❌ 必要なOIDCパラメータが不足');
            return null;
        }

        // OIDC認証URLを構築（言語付き）
        const baseUrl = `${window.location.origin}/${lang}/oidc/authorize`;
        const queryParams = new URLSearchParams();
        
        Object.entries(params).forEach(([key, value]) => {
            if (value) {
                queryParams.append(key, value);
            }
        });

        return `${baseUrl}?${queryParams.toString()}`;
        
    } catch (error) {
        console.error('❌ OIDC URL構築エラー:', error);
        return null;
    }
}
/**
 * エラー表示
 */
function showError(title, message) {
    console.error(`❌ ${title}: ${message}`);
    
    // 簡易的なエラー表示
    alert(`${title}: ${message}`);
}

// Register Service Worker for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
    navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
        console.log('ServiceWorker registered: ', registration);
        })
        .catch((error) => {
        console.error('ServiceWorker registration failed: ', error);
        });
    });
}
  
// WalletConnect Signing Handler
async function handleWalletConnectSigning(requestData) {
    console.log('[WalletConnect Signing] Handling request:', requestData);
    
    const { method, params, chainId, requestId } = requestData;
    
    // UIにリクエスト情報を表示
    const methodEl = document.getElementById('signing-method');
    const detailsEl = document.getElementById('signing-details');
    
    if (methodEl) {
        methodEl.textContent = `Method: ${method}`;
    }
    
    if (detailsEl) {
        let detailsHtml = `<p><strong>Chain ID:</strong> ${chainId}</p>`;
        
        if (method === 'eth_sendTransaction') {
            const txParams = params[0];
            detailsHtml += `
                <p><strong>From:</strong> ${txParams.from}</p>
                <p><strong>To:</strong> ${txParams.to}</p>
                <p><strong>Value:</strong> ${txParams.value || '0x0'}</p>
                <p><strong>Gas:</strong> ${txParams.gas || 'Auto'}</p>
                <p><strong>Gas Price:</strong> ${txParams.gasPrice || 'Auto'}</p>
            `;
        } else if (method === 'personal_sign' || method === 'eth_sign') {
            const message = params[0];
            const address = params[1];
            detailsHtml += `
                <p><strong>Address:</strong> ${address}</p>
                <p><strong>Message:</strong> ${typeof message === 'string' ? message.substring(0, 100) + (message.length > 100 ? '...' : '') : JSON.stringify(message).substring(0, 100)}</p>
            `;
        } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
            const address = params[0];
            const typedData = params[1];
            detailsHtml += `
                <p><strong>Address:</strong> ${address}</p>
                <p><strong>Typed Data:</strong> ${typeof typedData === 'string' ? typedData.substring(0, 200) + (typedData.length > 200 ? '...' : '') : JSON.stringify(typedData).substring(0, 200)}</p>
            `;
        }
        
        detailsEl.innerHTML = detailsHtml;
    }
    
    // 承認/拒否ボタンのイベントリスナーを設定
    const approveBtn = document.querySelector('[data-action="walletconnectApprove"]');
    const rejectBtn = document.querySelector('[data-action="walletconnectReject"]');
    
    if (approveBtn) {
        approveBtn.onclick = async (e) => {
            e.preventDefault();
            await processWalletConnectSigning(requestData, true);
        };
    }
    
    if (rejectBtn) {
        rejectBtn.onclick = async (e) => {
            e.preventDefault();
            await processWalletConnectSigning(requestData, false);
        };
    }
}

function getWalletConnectHost() {
    const hostname = window.location.hostname;
    return hostname === 'dev.bitvoy.org' ? 'walletconnect_dev.bitvoy.org' : `walletconnect.${hostname}`;
}

async function processWalletConnectSigning(requestData, approved) {
    const { method, params, chainId, requestId } = requestData;
    
    if (!approved) {
        // 拒否された場合
        sessionStorage.setItem(`walletconnect.result.${requestId}`, JSON.stringify({
            success: false,
            error: 'User rejected'
        }));
        
        // walletconnect.bitvoy.orgに戻る
        window.location.href = `https://${getWalletConnectHost()}/walletconnect.html?resultId=${requestId}`;
        return;
    }
    
    try {
        // BitVoyMPCBridge.jsから署名関数をインポート
        const { bitvoySignMessage, bitvoySendTransaction } = await import('/js/BitVoyMPCBridge.js');
        
        let result;
        
        if (method === 'eth_sendTransaction') {
            const txParams = params[0];
            result = await bitvoySendTransaction({
                chainId,
                ...txParams
            });
        } else if (method === 'personal_sign' || method === 'eth_sign') {
            const message = params[0];
            const address = params[1];
            result = await bitvoySignMessage({
                chainId,
                address,
                message,
                type: 'personal_sign'
            });
        } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
            const address = params[0];
            const typedData = params[1];
            result = await bitvoySignMessage({
                chainId,
                address,
                message: typedData,
                type: 'eip712'
            });
        } else {
            throw new Error(`Unsupported method: ${method}`);
        }
        
        // 結果をsessionStorageに保存
        sessionStorage.setItem(`walletconnect.result.${requestId}`, JSON.stringify({
            success: true,
            result: result
        }));
        
        // walletconnect.bitvoy.orgに戻る
        window.location.href = `https://${getWalletConnectHost()}/walletconnect.html?resultId=${requestId}`;
        
    } catch (error) {
        console.error('[WalletConnect Signing] Error:', error);
        
        // エラーをsessionStorageに保存
        sessionStorage.setItem(`walletconnect.result.${requestId}`, JSON.stringify({
            success: false,
            error: error.message || 'Signing failed'
        }));
        
        // walletconnect.bitvoy.orgに戻る
        window.location.href = `https://${getWalletConnectHost()}/walletconnect.html?resultId=${requestId}`;
    }
}

// WalletConnect Deep Link Handler
(function() {
    // URLパラメータからWalletConnect URIを取得
    function getWalletConnectUriFromUrl() {
      const urlParams = new URLSearchParams(window.location.search);
      const uri = urlParams.get('uri');
      if (uri) {
          // URIをデコード
          try {
          return decodeURIComponent(uri);
          } catch (e) {
          console.error('[Deep Link] Failed to decode URI:', e);
          return uri; // デコードに失敗した場合はそのまま返す
          }
      }
      return null;
    }
    
    // ログイン状態を確認
    function isSignedIn() {
      const masterId = sessionStorage.getItem('mpc.masterid');
      return masterId && masterId.length > 0;
    }
    
    // ディープリンク処理
    function handleDeepLink() {
    const wcUri = getWalletConnectUriFromUrl();
    if (!wcUri) {
        return; // WalletConnect URIがない場合は何もしない
    }
    
    console.log('[Deep Link] WalletConnect URI detected:', wcUri);
    
    // URIをsessionStorageに保存（ログイン後に使用するため）
    sessionStorage.setItem('walletconnect.deepLinkUri', wcUri);
    
    if (isSignedIn()) {
        // ログイン済み → walletconnect.htmlへ遷移
        console.log('[Deep Link] User is signed in, redirecting to walletconnect.html');
        window.location.href = `walletconnect.html?uri=${encodeURIComponent(wcUri)}`;
    } else {
        // ログイン未済 → メッセージを表示してログイン処理を起動
        console.log('[Deep Link] User is not signed in, showing log-in message');
        
        // メッセージを表示
        const signinBanner = document.getElementById('walletconnect-signin-banner');
        if (signinBanner) {
          signinBanner.style.display = 'block';
          // i18nで翻訳を適用（i18nextが利用可能な場合）
          if (typeof i18next !== 'undefined' && i18next.isInitialized) {
              const message = i18next.t('walletconnect.deepLink.signinRequired');
              const messageEl = signinBanner.querySelector('p');
              if (messageEl) {
              messageEl.textContent = message;
              }
          }
        }
        
        // ログイン完了を監視
        const checkSignIn = setInterval(() => {
        if (isSignedIn()) {
            clearInterval(checkSignIn);
            console.log('[Deep Link] Log-in completed, redirecting to walletconnect.html');
            // メッセージを非表示
            if (signinBanner) {
            signinBanner.style.display = 'none';
            }
            const savedUri = sessionStorage.getItem('walletconnect.deepLinkUri');
            if (savedUri) {
            sessionStorage.removeItem('walletconnect.deepLinkUri');
            window.location.href = `walletconnect.html?uri=${encodeURIComponent(savedUri)}`;
            }
        }
        }, 500); // 500msごとにチェック
        
        // タイムアウト（30秒）
        setTimeout(() => {
        clearInterval(checkSignIn);
        }, 30000);
    }
    }
    
    // DOMContentLoadedまたは即座に実行
    if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleDeepLink);
    } else {
    handleDeepLink();
    }
})();

// ==============================
// BitVoyEnv: 環境判定 + 通知ボタン / 「ホーム画面に追加」制御
// ==============================
(function (window) {
  let deferredPrompt = null;

  // Android / PC Chrome 用: beforeinstallprompt を保存
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // beforeinstallpromptが来たら、ボタン状態を再評価
    if (window.BitVoyEnv && window.BitVoyEnv.initButtons) {
      window.BitVoyEnv.initButtons();
    }
  });

  // DOM読み込み後に初期化
  function initBitVoyEnv() {
    const env = detectEnv();
    // alert(JSON.stringify(env));
    const state = decideButtonStates(env);
    // alert(JSON.stringify(state));
    
    // デバッグ: Android ChromeでPWAでない場合のボタン表示状態を確認
    if (env.isAndroid && env.isChromeAndroid) {
      console.log('[BitVoyEnv] Android Chrome detected:', {
        isStandalone: env.isStandalone,
        showAddToHomeButton: state.showAddToHomeButton,
        canShowInstallPrompt: state.canShowInstallPrompt,
        localStorage: localStorage.getItem('addToHomeScreen')
      });
    }

    const btnNotify  = document.getElementById('push-subscribe-btn');
    const btnAddHome = document.getElementById('add-home-btn');
    const banner     = document.getElementById('pwa-install-banner');

    // ============ アプリ内ブラウザ検出バナーの初期化 ============
    initInAppBrowserBanner(env);

    // 通知ボタン
    if (btnNotify) {
      if (!state.showNotifyButton) {
        btnNotify.style.display = 'none';
        btnNotify.onclick = null;
      } else {
        btnNotify.style.display = '';
        btnNotify.disabled = !state.enableNotifyButton;
        btnNotify.onclick = (e) => {
          e.preventDefault();
          handleNotifyClick(env);
        };
        // ※ デスクトップではバナーは出さないポリシーのため、
        //   通知ボタンの有無では shouldShowBanner は変えない
      }
    }

    // ホーム画面に追加ボタン
    if (btnAddHome) {
      // 表示条件をチェック
      const shouldShowAddHome = 
        !env.isIOS && // iOSの場合は非表示（README-PWA.mdの方針に従う）
        !env.isDesktop && // デスクトップ（Mac/Windows）の場合も非表示
        localStorage.getItem('addToHomeScreen') !== 'true' && // 既に追加済みでない
        state.showAddToHomeButton; // state上「表示する」場合（Android ChromeでPWAでない場合は表示）

      if (shouldShowAddHome) {
        // 表示処理を先頭に配置
        btnAddHome.style.display = 'inline-block';
        const addToHomeText =
          (typeof i18next !== 'undefined' &&
            i18next.isInitialized &&
            i18next.t)
            ? i18next.t('actions.addToHomeScreen', { ns: 'common' })
            : 'ホーム画面に追加';
        btnAddHome.textContent = addToHomeText;
        btnAddHome.onclick = (e) => {
          e.preventDefault();
          handleAddToHomeClick(env);
        };
      } else {
        // 非表示処理
        btnAddHome.style.display = 'none';
        btnAddHome.onclick = null;
      }
      
      // バナーを表示/非表示（btnAddHomeの表示条件と一致させる）
      if (banner) {
        if (shouldShowAddHome) {
          banner.style.display = 'block';
        } else {
          banner.style.display = 'none';
        }
      }
    }
  }

  // DOMContentLoadedまたは既に読み込み済みの場合に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBitVoyEnv);
  } else {
    // DOMが既に読み込み済みの場合は即座に実行
    initBitVoyEnv();
  }

  // ============ 環境判定 ============
  function detectEnv() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const uaLower = ua.toLowerCase();

    // ==========
    // OS / デバイス
    // ==========
    const isIOS = /iphone|ipad|ipod/.test(uaLower);
    const isAndroid = /android/.test(uaLower);
    const isDesktop = !isIOS && !isAndroid;

    // ==========
    // アプリ内ブラウザ (LINE / X / Telegramなど)
    // ==========
    const isInAppBrowser = /line|telegram|instagram|fbav|fban|fb_iab|twitter|x-ios|x-apollo/i.test(uaLower);

    // ==========
    // ブラウザ種別
    // ==========
    const isChromeIOS = isIOS && /crios/.test(uaLower);

    const isSafari =
      isIOS &&
      !isInAppBrowser &&             // WebView を除外
      /safari/.test(uaLower) &&
      /version\//.test(uaLower) &&   // 本物Safari
      !/crios|fxios|edgios|opr\/|mercury/i.test(uaLower);

    const isChromeAndroid =
      isAndroid &&
      !isInAppBrowser &&
      /chrome/.test(uaLower) &&
      /safari/.test(uaLower) &&
      !/edg|opr/.test(uaLower) &&
      !/; wv\)/.test(uaLower);       // Android WebView除外

    const isChromeDesktop =
      isDesktop &&
      /chrome/.test(uaLower) &&
      /safari/.test(uaLower) &&
      !/edg|opr/.test(uaLower);

    // ==========
    // PWA (standalone) 判定
    // ==========
    const isStandalone =
      (window.matchMedia &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches)) ||
      window.navigator.standalone === true;

    // ==========
    // Push / Notification 対応
    // ==========
    const supportsPushApi =
      'serviceWorker' in navigator && 'PushManager' in window;

    const supportsNotifications = 'Notification' in window;

    return {
      ua,
      isIOS,
      isAndroid,
      isDesktop,
      isSafari,
      isChromeIOS,
      isChromeAndroid,
      isChromeDesktop,
      isStandalone,
      supportsPushApi,
      supportsNotifications,
      isInAppBrowser,
    };
  }

  // ============ ボタン状態の決定ロジック ============
  function decideButtonStates(env) {
    env = env || detectEnv();

    const {
      isIOS,
      isSafari,
      isChromeIOS,
      isAndroid,
      isChromeAndroid,
      isDesktop,
      isChromeDesktop,
      isStandalone,
      supportsPushApi,
      supportsNotifications,
      isInAppBrowser,
    } = env;

    // デフォルト値
    let showNotifyButton = false;
    let enableNotifyButton = false;
    let showAddToHomeButton = false;
    let canShowInstallPrompt = !!deferredPrompt;

    // --- アプリ内ブラウザ（LINE / X / Telegram 等） ---
    // ここでは通知は使わせず、「ホーム画面に追加」ボタンは
    // 「外部ブラウザで開いてください」メッセージ用のトリガーとして表示
    if (isInAppBrowser) {
      showNotifyButton = false;
      enableNotifyButton = false;
      showAddToHomeButton = true;      // クリックで専用ポップアップを出す想定
      canShowInstallPrompt = false;    // WebView からは beforeinstallprompt を使わない
      return {
        showNotifyButton,
        enableNotifyButton,
        showAddToHomeButton,
        canShowInstallPrompt,
      };
    }

    // --- iOS Safari ---
    if (isIOS && isSafari) {
      // 方針: iOSではホーム追加もPushも推奨しない
      showAddToHomeButton = false;
      showNotifyButton = false;
      enableNotifyButton = false;
    }
    // --- iOS Chrome ---
    else if (isChromeIOS) {
      // 通知・ホーム追加ともにUIは出さない
      showNotifyButton = false;
      enableNotifyButton = false;
      showAddToHomeButton = false;
    }
    // --- Android Chrome ---
    else if (isAndroid && isChromeAndroid) {
      if (supportsPushApi) {
        showNotifyButton = true;
        enableNotifyButton = true;
      }
      // PWAとして起動されていない時のみ「ホーム画面に追加」ボタンを表示
      showAddToHomeButton = !isStandalone;
      console.log('[BitVoyEnv] Android Chrome button state:', {
        isStandalone,
        showAddToHomeButton,
        isChromeAndroid
      });
    }
    // --- Android (Chrome以外) ---
    else if (isAndroid && !isInAppBrowser) {
      // Android Chrome以外でも、PWAでない場合は表示を試みる
      if (supportsPushApi) {
        showNotifyButton = true;
        enableNotifyButton = true;
      }
      showAddToHomeButton = !isStandalone;
      console.log('[BitVoyEnv] Android (non-Chrome) button state:', {
        isStandalone,
        showAddToHomeButton,
        isChromeAndroid
      });
    }
    // --- PC Chrome（Desktop） ---
    else if (isDesktop && isChromeDesktop) {
      // Desktop はホーム追加もPWA案内も出さない方針
      if (supportsPushApi && supportsNotifications) {
        showNotifyButton = true;
        enableNotifyButton = true;
      } else {
        showNotifyButton = false;
        enableNotifyButton = false;
      }
      showAddToHomeButton = false;
    }
    // --- その他ブラウザ ---
    else {
      if (supportsPushApi) {
        showNotifyButton = true;
        enableNotifyButton = true;
      } else {
        showNotifyButton = false;
        enableNotifyButton = false;
      }
      showAddToHomeButton = false;
    }

    // WebViewでは既に false にしているので、ここでは「通常ブラウザのみ」有効
    canShowInstallPrompt = !!deferredPrompt;

    return {
      showNotifyButton,
      enableNotifyButton,
      showAddToHomeButton,
      canShowInstallPrompt,
    };
  }

  // ============ 「ホーム画面に追加」ボタン用ハンドラ ============
  async function handleAddToHomeClick(env) {
    env = env || detectEnv();
    const {
      isIOS,
      isSafari,
      isChromeIOS,
      isAndroid,
      isDesktop,
      isInAppBrowser,
    } = env;

    // --- アプリ内ブラウザ (LINE / X / Telegram 等) ---
    if (isInAppBrowser) {
      if (isIOS) {
        alert('Safari等のブラウザで実行してください');
      } else if (isAndroid) {
        alert('Chrome等のブラウザで実行してください');
      } else {
        alert('このアプリ内ブラウザではホーム画面への追加は利用できません。外部ブラウザで開いてください。');
      }
      return;
    }

    // --- Desktop（Mac / Windows）---
    // ポリシー: DesktopではPWAインストールを推奨しない
    if (isDesktop) {
      console.log('[bitvoy-env] Desktop: Add to Home / PWA install is disabled by policy');
      alert('PC環境ではアプリインストール(PWA)は提供していません。ブラウザからご利用ください。');
      return;
    }

    // --- iOS ---
    // ポリシー: iOSでは「ホーム画面に追加」を提供しない
    if (isIOS) {
      console.log('[bitvoy-env] iOS: Add to Home is disabled by policy');
      return;
    }


    // --- Android（beforeinstallprompt対応ブラウザ） ---
    if (isAndroid) {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          const choice = await deferredPrompt.userChoice;
          console.log('[bitvoy-env] userChoice:', choice);
          // ユーザーが「追加」を選択した場合、localStorageに保存
          if (choice.outcome === 'accepted') {
            localStorage.setItem('addToHomeScreen', 'true');
            // ボタンとバナーを非表示
            const btnAddHome = document.getElementById('add-home-btn');
            const banner = document.getElementById('pwa-install-banner');
            if (btnAddHome) {
              btnAddHome.style.display = 'none';
            }
            if (banner) {
              banner.style.display = 'none';
            }
          }
        } catch (e) {
          console.warn('[bitvoy-env] beforeinstallprompt prompt() failed:', e);
        } finally {
          deferredPrompt = null;
          // ボタン状態を再評価
          if (window.BitVoyEnv && window.BitVoyEnv.initButtons) {
            window.BitVoyEnv.initButtons();
          }
        }
        return;
      } else {
        console.log('[bitvoy-env] Waiting for beforeinstallprompt event...');
        const message =
          typeof i18next !== 'undefined' &&
          i18next.isInitialized &&
          i18next.t
            ? i18next.t('pwa.waitingForInstallPrompt', { ns: 'index' })
            : 'Please try again when you are ready to add it to your home screen.';
        alert(message);
        return;
      }
    }

    console.log('[bitvoy-env] handleAddToHomeClick: nothing to do for this env');
  }

  // ============ 通知ボタン例（購読開始フック） ============
  async function handleNotifyClick(env) {
    env = env || detectEnv();
    const { supportsPushApi } = env;
    if (!supportsPushApi) {
      console.warn('[bitvoy-env] Push API not supported in this environment');
      return;
    }

    // BitVoy インスタンスが存在するか確認
    if (!window.bitvoyMPC || typeof window.bitvoyMPC.subscribeToPushNotifications !== 'function') {
      console.warn('[bitvoy-env] BitVoy instance not available or subscribeToPushNotifications not found');
      return;
    }

    // BitVoy 側の購読処理を呼び出す
    try {
      await window.bitvoyMPC.subscribeToPushNotifications();
      console.log('[bitvoy-env] Push notification subscription initiated');
    } catch (error) {
      console.error('[bitvoy-env] Failed to subscribe to push notifications:', error);
    }
  }

  // ============ アプリ内ブラウザ検出バナーの初期化 ============
  function initInAppBrowserBanner(env) {
    const wrap = document.getElementById('bvExternalWrap');
    const openInChromeBtn = document.getElementById('bvOpenInChrome');
    const copyBtn = document.getElementById('bvCopy');
    const textEl = wrap ? wrap.querySelector('.bv-text') : null;

    // 要素が存在しない場合は終了
    if (!wrap || !openInChromeBtn || !copyBtn) {
      return;
    }

    // showInAppBrowserBannerで既に表示されている場合は、非表示にしない
    if (wrap.style.display === 'block' && !env.isInAppBrowser) {
      // エラー時に表示されたバナーは維持する
      console.log('[InAppBrowserDetector] Banner already shown by showInAppBrowserBanner, keeping it visible');
      // Chromeボタンは常に非表示
      openInChromeBtn.style.display = 'none';
      return;
    }

    // アプリ内でのみ表示
    if (env.isInAppBrowser) {
      wrap.style.display = 'block';
      console.log('[InAppBrowserDetector] In-app browser detected:', {
        isInApp: env.isInAppBrowser,
        isIOS: env.isIOS,
        isAndroid: env.isAndroid
      });
    } else {
      wrap.style.display = 'none';
      return;
    }

    // Chromeボタンは常に非表示
    openInChromeBtn.style.display = 'none';

    // i18nextが利用可能な場合、翻訳を適用
    function updateTranslations() {
      if (typeof window.i18next !== 'undefined' && window.i18next.isInitialized) {
        try {
          if (textEl) {
            textEl.textContent = window.i18next.t('common.inAppBrowser.detected', { ns: 'common' });
          }
          // Androidの場合のみChromeボタンのテキストを設定
          if (!env.isIOS) {
            openInChromeBtn.textContent = window.i18next.t('common.inAppBrowser.openInChrome', { ns: 'common' });
          }
          copyBtn.textContent = window.i18next.t('common.inAppBrowser.copyUrl', { ns: 'common' });
        } catch (e) {
          console.warn('[InAppBrowserDetector] Failed to update translations:', e);
        }
      }
    }

    // i18nextの初期化を待つ
    if (typeof window.i18next !== 'undefined') {
      if (window.i18next.isInitialized) {
        updateTranslations();
      } else {
        // i18nextの初期化を待つ
        const checkI18n = setInterval(() => {
          if (window.i18next && window.i18next.isInitialized) {
            clearInterval(checkI18n);
            updateTranslations();
          }
        }, 100);
        
        // 最大5秒待つ
        setTimeout(() => {
          clearInterval(checkI18n);
        }, 5000);

        // 言語変更時にも更新
        if (window.i18next.on) {
          window.i18next.on('languageChanged', updateTranslations);
        }
      }
    }

    // iOS Safariスキーム変換
    function toIosSafariScheme(url) {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:') {
          u.protocol = 'x-safari-https:';
        } else if (u.protocol === 'http:') {
          u.protocol = 'x-safari-http:';
        }
        return u.toString();
      } catch (e) {
        console.warn('[InAppBrowserDetector] Failed to convert URL to Safari scheme:', e);
        return url;
      }
    }

    // クリップボードにコピー
    async function copyToClipboard(text) {
      const getMessage = () => {
        if (typeof window.i18next !== 'undefined' && window.i18next.isInitialized) {
          try {
            const translated = window.i18next.t('common.inAppBrowser.urlCopied', { ns: 'common' });
            // 翻訳が成功した場合（キーがそのまま返されていない場合）のみ使用
            if (translated && translated !== 'common.inAppBrowser.urlCopied') {
              return translated;
            }
          } catch (e) {
            // フォールバック
          }
        }
        return 'URLをコピーしました。Safari / Chromeで開いてください。';
      };

      try {
        // モダンブラウザのクリップボードAPI
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          alert(getMessage());
        } else {
          // フォールバック: document.execCommand
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert(getMessage());
        }
      } catch (e) {
        console.error('[InAppBrowserDetector] Failed to copy to clipboard:', e);
        // フォールバック: document.execCommand
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert(getMessage());
        } catch (e2) {
          console.error('[InAppBrowserDetector] Fallback copy also failed:', e2);
          alert('URLのコピーに失敗しました。手動でコピーしてください: ' + text);
        }
      }
    }

    // 現在のURLをTARGET_URLとして使用
    const TARGET_URL = window.location.href;

    // Chromeで開くボタンのイベント（Androidの場合のみ）
    if (!env.isIOS) {
      openInChromeBtn.onclick = () => {
        window.open(TARGET_URL, '_blank', 'noopener,noreferrer');
      };
    }

    // URLコピーボタンのイベント
    copyBtn.onclick = () => copyToClipboard(TARGET_URL);
  }

  // ============ アプリ内ブラウザバナーの表示（エラー時用） ============
  function showInAppBrowserBanner() {
    const wrap = document.getElementById('bvExternalWrap');
    const openInChromeBtn = document.getElementById('bvOpenInChrome');
    const copyBtn = document.getElementById('bvCopy');
    const textEl = wrap ? wrap.querySelector('.bv-text') : null;

    // 要素が存在しない場合は終了
    if (!wrap || !openInChromeBtn || !copyBtn) {
      console.warn('[InAppBrowserDetector] Banner elements not found');
      return;
    }

    // エラー時は強制的にバナーを表示（isInAppBrowserのチェックをスキップ）
    const env = detectEnv();
    wrap.style.display = 'block';

    // Chromeボタンは常に非表示
    openInChromeBtn.style.display = 'none';

    // i18nextが利用可能な場合、翻訳を適用
    function updateTranslations() {
      if (typeof window.i18next !== 'undefined' && window.i18next.isInitialized) {
        try {
          if (textEl) {
            const detectedText = window.i18next.t('common.inAppBrowser.detected', { ns: 'common' });
            if (detectedText && detectedText !== 'common.inAppBrowser.detected') {
              textEl.textContent = detectedText;
            }
          }
          // Androidの場合のみChromeボタンのテキストを設定
          if (!env.isIOS) {
            const browserText = window.i18next.t('common.inAppBrowser.openInChrome', { ns: 'common' });
            if (browserText && browserText !== 'common.inAppBrowser.openInChrome') {
              openInChromeBtn.textContent = browserText;
            }
          }
          const copyText = window.i18next.t('common.inAppBrowser.copyUrl', { ns: 'common' });
          if (copyText && copyText !== 'common.inAppBrowser.copyUrl') {
            copyBtn.textContent = copyText;
          }
        } catch (e) {
          console.warn('[InAppBrowserDetector] Failed to update translations:', e);
        }
      }
    }

    // 即座に翻訳を試行（i18nextが既に初期化されている場合）
    updateTranslations();

    // i18nextの初期化を待つ（まだ初期化されていない場合）
    if (typeof window.i18next !== 'undefined' && !window.i18next.isInitialized) {
      // i18nextの初期化を待つ
      const checkI18n = setInterval(() => {
        if (window.i18next && window.i18next.isInitialized) {
          clearInterval(checkI18n);
          updateTranslations();
        }
      }, 100);
      
      // 最大5秒待つ
      setTimeout(() => {
        clearInterval(checkI18n);
        // タイムアウト後も再度翻訳を試行
        updateTranslations();
      }, 5000);

      // 言語変更時にも更新
      if (window.i18next.on) {
        window.i18next.on('languageChanged', updateTranslations);
      }
    }

    // iOS Safariスキーム変換
    function toIosSafariScheme(url) {
      try {
        const u = new URL(url);
        if (u.protocol === 'https:') {
          u.protocol = 'x-safari-https:';
        } else if (u.protocol === 'http:') {
          u.protocol = 'x-safari-http:';
        }
        return u.toString();
      } catch (e) {
        console.warn('[InAppBrowserDetector] Failed to convert URL to Safari scheme:', e);
        return url;
      }
    }

    // クリップボードにコピー
    async function copyToClipboard(text) {
      const getMessage = () => {
        if (typeof window.i18next !== 'undefined' && window.i18next.isInitialized) {
          try {
            const translated = window.i18next.t('common.inAppBrowser.urlCopied', { ns: 'common' });
            // 翻訳が成功した場合（キーがそのまま返されていない場合）のみ使用
            if (translated && translated !== 'common.inAppBrowser.urlCopied') {
              return translated;
            }
          } catch (e) {
            // フォールバック
          }
        }
        return 'URLをコピーしました。Safari / Chromeで開いてください。';
      };

      try {
        // モダンブラウザのクリップボードAPI
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          alert(getMessage());
        } else {
          // フォールバック: document.execCommand
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert(getMessage());
        }
      } catch (e) {
        console.error('[InAppBrowserDetector] Failed to copy to clipboard:', e);
        // フォールバック: document.execCommand
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert(getMessage());
        } catch (e2) {
          console.error('[InAppBrowserDetector] Fallback copy also failed:', e2);
          alert('URLのコピーに失敗しました。手動でコピーしてください: ' + text);
        }
      }
    }

    // 現在のURLをTARGET_URLとして使用
    const TARGET_URL = window.location.href;

    // Chromeで開くボタンのイベント（Androidの場合のみ）
    if (!env.isIOS) {
      openInChromeBtn.onclick = () => {
        window.open(TARGET_URL, '_blank', 'noopener,noreferrer');
      };
    }

    // URLコピーボタンのイベント
    copyBtn.onclick = () => copyToClipboard(TARGET_URL);
  }

  // グローバル公開
  window.BitVoyEnv = {
    detectEnv,
    decideButtonStates,
    handleAddToHomeClick,
    handleNotifyClick,
    initButtons: initBitVoyEnv, // ボタン初期化関数を公開
    showInAppBrowserBanner, // アプリ内ブラウザバナー表示関数を公開
  };
})(window);

  // ==============================
  // BitVoyStorage ヘルパー関数（早期公開）
  // ==============================
  
  /**
   * BitVoyStorageのグローバルインスタンスを取得（必要に応じて作成）
   */
  async function getBitVoyStorageInstance() {
    // BitVoyStorageクラスが利用可能になるまで待機（最大5秒）
    if (!window.BitVoyStorage) {
      let waitCount = 0;
      const maxWait = 50; // 5秒
      while (!window.BitVoyStorage && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (!window.BitVoyStorage) {
        console.error('❌ BitVoyStorage class not available after waiting');
        return null;
      }
    }
    
    if (!window.bitvoyStorageInstance) {
      window.bitvoyStorageInstance = new window.BitVoyStorage();
    }
    
    if (!window.bitvoyStorageInstance.isInitialized) {
      await window.bitvoyStorageInstance.init();
    }
    
    return window.bitvoyStorageInstance;
  }

  // ==============================
  // My Setup Menu 機能
  // ==============================
  function setupMySetupMenu() {
    const mysetupMenu = document.getElementById('mysetup-menu');
    const pushNotificationToggle = document.getElementById('push-notification-toggle');
    const developerToggle = document.getElementById('developer-toggle');
    const mysetupNetworkSelector = document.getElementById('mysetup-network-selector');

    if (!mysetupMenu) {
      console.warn('[My Setup] mysetup-menu not found');
      return;
    }

    // My Setupメニューのクリックイベント（ルーティングで処理されるため、ここでは何もしない）
    // メニューリンクは既に#mysetupに設定されている

    // Push通知トグルの変更イベント
    if (pushNotificationToggle) {
      pushNotificationToggle.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        await handlePushNotificationToggle(isChecked);
      });
    }


    // Developerトグルの変更イベント
    if (developerToggle) {
      // 初期状態を復元（IndexedDBから読み込み）
      loadDeveloperMode().then(isDeveloperMode => {
        developerToggle.checked = isDeveloperMode;
        handleDeveloperToggle(isDeveloperMode);
      });

      developerToggle.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        try {
          await saveDeveloperMode(isChecked);
          handleDeveloperToggle(isChecked);
        } catch (error) {
          console.error('❌ Error saving developer mode:', error);
          // エラーが発生してもsessionStorageには保存されているので、UIは更新する
          handleDeveloperToggle(isChecked);
        }
      });
    }

    // My SetupページのNetworkセレクターの変更イベント
    if (mysetupNetworkSelector) {
      // 初期状態を復元（IndexedDBから読み込み）
      // IndexedDBの値が常に正しいので、それを優先する
      loadNetworkSetting().then(network => {
        if (network) {
          mysetupNetworkSelector.value = network;
          sessionStorage.setItem('mpc.current_network', network);
        }
      });

      mysetupNetworkSelector.addEventListener('change', async (e) => {
        const selectedNetwork = e.target.value;
        // IndexedDBとSessionStorageの両方に保存
        await saveNetworkSetting(selectedNetwork);
        sessionStorage.setItem('mpc.current_network', selectedNetwork);
        
        // Payment Settingsのトークンリストを更新
        const chainSelector = document.getElementById('mysetup-chain-selector');
        const tokenSelector = document.getElementById('mysetup-token-selector');
        if (chainSelector && chainSelector.value) {
          updateTokenSelector(chainSelector.value);
        }
        
        // BitVoyインスタンスが利用可能な場合、ネットワークを切り替え
        if (window.bitvoyMPC && typeof window.bitvoyMPC.switchNetwork === 'function') {
          window.bitvoyMPC.switchNetwork(selectedNetwork).then(result => {
            if (result.success) {
              console.log('✅ Network switched to:', selectedNetwork);
            } else {
              console.error('❌ Network switch failed:', result.error);
            }
          });
        }
      });
    }

    // チェーンとトークン選択UIの初期化
    initPaymentSettings();
  }

  /**
   * 言語セレクターの初期化
   */
  /**
   * メニューの言語セレクターを初期化
   */
  function initMenuLanguageSelector() {
    const languageSelector = document.getElementById('menu-language-selector');
    if (!languageSelector) {
      console.warn('[Menu] Language selector not found');
      return;
    }

    // 現在の言語設定を読み込み（localStorageから）
    const storedLang = localStorage.getItem('lang');
    const supported = ['en', 'ja'];
    const currentLang = (storedLang && supported.indexOf(storedLang) >= 0) ? storedLang : 'en';
    languageSelector.value = currentLang;
    console.log('[Menu] Language selector initialized with:', currentLang);

  }


  /**
   * Developerモード設定をIndexedDBに保存
   */
  async function saveDeveloperMode(isEnabled) {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.error('❌ BitVoyStorage not available');
        throw new Error('BitVoyStorage not available');
      }

      // IndexedDBに保存
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      const dataToSave = {
        key: 'developer-mode',
        value: isEnabled ? 'true' : 'false',
        updatedAt: new Date().toISOString()
      };

      console.log('💾 saveDeveloperMode - Saving to IndexedDB:', {
        key: dataToSave.key,
        value: dataToSave.value,
        store: storage.stores.mypage
      });

      await store.put(dataToSave);

      await transaction.done; // コミット完了を待つ

      console.log('✅ Developer mode setting saved to IndexedDB:', isEnabled);
      
      // 保存確認のため、すぐに読み込んで検証
      const verifyRequest = db.transaction([storage.stores.mypage], 'readonly')
        .objectStore(storage.stores.mypage)
        .get('developer-mode');
      const verified = await new Promise((resolve, reject) => {
        verifyRequest.onsuccess = () => resolve(verifyRequest.result);
        verifyRequest.onerror = () => reject(verifyRequest.error);
      });
      console.log('🔍 Verification - Data after save:', verified);
    } catch (error) {
      console.error('❌ Error saving developer mode setting:', error);
      throw error; // エラーを再スローして呼び出し元で処理できるようにする
    }
  }

  /**
   * localStorageからIndexedDBへの設定移行（初回のみ、移行後はlocalStorageを削除）
   */
  async function migrateSettingsToIndexedDB() {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        return;
      }

      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      // lang設定の移行は削除（localStorageのみを使用）

      // developer-mode設定の移行
      const devModeRequest = store.get('developer-mode');
      const devModeData = await new Promise((resolve, reject) => {
        devModeRequest.onsuccess = () => resolve(devModeRequest.result);
        devModeRequest.onerror = () => reject(devModeRequest.error);
    });

      if (!devModeData) {
        const storedDevMode = localStorage.getItem('developer-mode');
        if (storedDevMode) {
          await store.put({
            key: 'developer-mode',
            value: storedDevMode,
            updatedAt: new Date().toISOString()
          });
          // 移行後はlocalStorageから削除
          localStorage.removeItem('developer-mode');
          console.log('✅ Migrated developer-mode setting from localStorage to IndexedDB and removed from localStorage');
        }
      }

      await transaction.done; // コミット完了を待つ
    } catch (error) {
      console.error('❌ Error migrating settings to IndexedDB:', error);
    }
  }

  /**
   * Developerモード設定をIndexedDBから取得
   */
  async function loadDeveloperMode() {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        return false;
      }

      // IndexedDBから読み込み
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readonly');
      const store = transaction.objectStore(storage.stores.mypage);

      const request = store.get('developer-mode');
      const data = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      console.log('🔍 loadDeveloperMode - IndexedDB data:', {
        data: data,
        found: !!data,
        value: data?.value
      });

      if (data && data.value) {
        return data.value === 'true';
      }

      console.log('ℹ️ No developer mode data found in IndexedDB');
      return false;
    } catch (error) {
      console.error('❌ Error getting developer mode setting:', error);
      return false;
    }
  }

  /**
   * 支払い設定（チェーン・トークン）の初期化
   */
  async function initPaymentSettings() {
    const chainSelector = document.getElementById('mysetup-chain-selector');
    const tokenSelector = document.getElementById('mysetup-token-selector');

    if (!chainSelector || !tokenSelector) {
      console.warn('[My Setup] Payment settings selectors not found');
      return;
    }

    // チェーン選択ドロップダウンを初期化（crosschain.jsのSUPPORTED_CHAINSを使用）
    const SUPPORTED_CHAINS = [
      { chainId: 1, chainKey: 'ethereum', displayName: 'Ethereum' },
      { chainId: 137, chainKey: 'polygon', displayName: 'Polygon' },
      { chainId: 42161, chainKey: 'arbitrum', displayName: 'Arbitrum' },
      { chainId: 8453, chainKey: 'base', displayName: 'Base' },
      { chainId: 10, chainKey: 'optimism', displayName: 'Optimism' },
      { chainId: 43114, chainKey: 'avalanche', displayName: 'Avalanche' },
      { chainId: 56, chainKey: 'bsc', displayName: 'BNB Chain' }
    ];

    // チェーンオプションを追加
    SUPPORTED_CHAINS.forEach(chain => {
      const option = document.createElement('option');
      option.value = chain.chainKey;
      option.textContent = chain.displayName;
      chainSelector.appendChild(option);
    });

    // チェーン変更時にトークンリストを更新し、チェーン設定を自動保存
    chainSelector.addEventListener('change', async (e) => {
      const chainKey = e.target.value;
      updateTokenSelector(chainKey);
      // チェーンを選択した時点でチェーン設定を保存
      if (chainKey) {
        await savePaymentChain(chainKey);
        // トークンも選択されている場合、トークン設定も保存
        if (tokenSelector.value) {
          await savePaymentToken(tokenSelector.value);
        }
      }
    });

    // トークン変更時に自動保存（チェーンも選択されている場合）
    tokenSelector.addEventListener('change', async (e) => {
      const tokenId = e.target.value;
      // トークンを選択した時点でトークン設定を保存
      if (tokenId && chainSelector.value) {
        await savePaymentToken(tokenId);
        // チェーン設定も保存（念のため）
        await savePaymentChain(chainSelector.value);
      }
    });


    // 保存済み設定を読み込んで表示
    await loadPaymentSettings();
  }

  /**
   * トークン選択ドロップダウンを更新
   */
  function updateTokenSelector(chainKey) {
    const tokenSelector = document.getElementById('mysetup-token-selector');
    if (!tokenSelector || !chainKey) return;

    // 既存のオプションをクリア（最初の"Select Token"を除く）
    while (tokenSelector.children.length > 1) {
      tokenSelector.removeChild(tokenSelector.lastChild);
    }

    // productsオブジェクトを取得（coins-libs.jsから）
    const products = window.CoinsLibs?.products || window.products || {};
    if (!products || Object.keys(products).length === 0) {
      console.warn('[Payment Settings] products object not available, tokens may not be displayed correctly');
    }

    // 現在のNetwork設定を取得
    const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
    const isTestnet = currentNetwork === 'testnet';

    // チェーンIDを取得
    const SUPPORTED_CHAINS = [
      { chainId: 1, chainKey: 'ethereum', displayName: 'Ethereum' },
      { chainId: 137, chainKey: 'polygon', displayName: 'Polygon' },
      { chainId: 42161, chainKey: 'arbitrum', displayName: 'Arbitrum' },
      { chainId: 8453, chainKey: 'base', displayName: 'Base' },
      { chainId: 10, chainKey: 'optimism', displayName: 'Optimism' },
      { chainId: 43114, chainKey: 'avalanche', displayName: 'Avalanche' },
      { chainId: 56, chainKey: 'bsc', displayName: 'BNB Chain' }
    ];

    const chain = SUPPORTED_CHAINS.find(c => c.chainKey === chainKey);
    if (!chain) return;

    // Network設定に応じてトークンリストを決定
    // mainnet/testnetで同じproductIdを使用するため、トークンリストは共通
    const EVM_CCSWAP_TOKENS = [
      'USDC_ERC20', 'USDC_POL', 'USDC_ARB', 'USDC_BASE', 'USDC_OPT', 'USDC_AVAX',
      'USDT_ERC20', 'USDT_POL', 'USDT_ARB',
      'JPYC_ERC20', 'JPYC_POL', 'JPYC_AVAX',
      'WETH_ERC20',
      'ETH', 'POL'
    ];

    // getChainId関数を使用可能か確認
    const getChainId = window.CoinsLibs?.getChainId;

    // 該当チェーンのトークンのみをフィルタリング
    const availableTokens = EVM_CCSWAP_TOKENS.filter(productId => {
      if (!products || !products[productId]) return false;
      const product = products[productId];
      
      // 方法1: getChainId関数を使用（推奨）
      if (getChainId) {
        const productChainId = getChainId(productId, currentNetwork);
        if (productChainId === chain.chainId) {
          return true;
        }
      }
      
      // 方法2: product.chainを使用（フォールバック）
      // chainKeyとproduct.chainを比較（例: 'polygon' === 'polygon'）
      const productChain = product.chain ? product.chain.toLowerCase() : null;
      if (productChain === chainKey) {
        return true;
      }
      
      // ネイティブコインの特別処理（ETH, POL）
      if (productId === 'ETH' && chainKey === 'ethereum') {
        return true;
      }
      if (productId === 'POL' && chainKey === 'polygon') {
        return true;
      }
      
      return false;
    });

    // オプションを追加
    availableTokens.forEach(productId => {
      if (!products || !products[productId]) return;
      const product = products[productId];
      // nameから (SYMBOL - のパターンを削除して ( に置き換える
      // 例: "JPY Coin (JPYC - Polygon Amoy)" -> "JPY Coin (Polygon Amoy)"
      const cleanedName = product.name ? product.name.replace(/\([^-]+ - /g, '(') : chainKey;
      const optionText = `${product.symbol} - ${cleanedName}`;
      
      const option = document.createElement('option');
      option.value = productId;
      option.textContent = optionText;
      tokenSelector.appendChild(option);
    });
  }

  /**
   * チェーン設定をIndexedDBに保存
   */
  async function savePaymentChain(chainKey) {
    if (!chainKey) return;

    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.error('❌ BitVoyStorage not available');
        return;
      }

      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      await store.put({
        key: 'payment.preferredChain',
        value: chainKey,
        updatedAt: new Date().toISOString()
      });

      await transaction.done; // コミット完了を待つ

      console.log('✅ Payment chain saved to IndexedDB:', chainKey);
    } catch (error) {
      console.error('❌ Error saving payment chain:', error);
    }
  }

  /**
   * トークン設定をIndexedDBに保存
   */
  async function savePaymentToken(tokenId) {
    if (!tokenId) return;

    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.error('❌ BitVoyStorage not available');
        return;
      }

      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      await store.put({
        key: 'payment.preferredToken',
        value: tokenId,
        updatedAt: new Date().toISOString()
      });

      await transaction.done; // コミット完了を待つ

      console.log('✅ Payment token saved to IndexedDB:', tokenId);
    } catch (error) {
      console.error('❌ Error saving payment token:', error);
    }
  }

  /**
   * 支払い設定をIndexedDBに保存（後方互換性のため残す）
   * @param {boolean} showAlert - アラートを表示するかどうか（デフォルト: false）
   */
  async function savePaymentSettings(showAlert = false) {
    const chainSelector = document.getElementById('mysetup-chain-selector');
    const tokenSelector = document.getElementById('mysetup-token-selector');

    if (!chainSelector || !tokenSelector) return;

    const chainKey = chainSelector.value;
    const tokenId = tokenSelector.value;

    if (!chainKey || !tokenId) {
      if (showAlert) {
        alert('Please select both chain and token');
      }
      return;
    }

    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.error('❌ BitVoyStorage not available');
        if (showAlert) {
          alert('Storage not available');
        }
        return;
      }

      // IndexedDBに保存
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      // 個別の保存関数を使用
      await savePaymentChain(chainKey);
      await savePaymentToken(tokenId);

      if (showAlert) {
        const t = (k) => (window.i18next && window.i18next.t) ? window.i18next.t(k, { ns: 'index' }) : k;
        alert(t('mySetup.saved'));
      }

    } catch (error) {
      console.error('❌ Error saving payment settings:', error);
      if (showAlert) {
        alert('Failed to save settings: ' + error.message);
      }
    }
  }

  /**
   * 支払い設定をIndexedDBから読み込み
   */
  async function loadPaymentSettings() {
    try {
      // BitVoyStorageが利用可能か確認
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.warn('⚠️ BitVoyStorage not available, skipping load');
        return;
      }

      // IndexedDBから読み込み（設定がない場合は書き込みも行うため、readwriteを使用）
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      // チェーン設定を読み込み
      const chainRequest = store.get('payment.preferredChain');
      let chainData = await new Promise((resolve, reject) => {
        chainRequest.onsuccess = () => resolve(chainRequest.result);
        chainRequest.onerror = () => reject(chainRequest.error);
      });

      // トークン設定を読み込み
      const tokenRequest = store.get('payment.preferredToken');
      let tokenData = await new Promise((resolve, reject) => {
        tokenRequest.onsuccess = () => resolve(tokenRequest.result);
        tokenRequest.onerror = () => reject(tokenRequest.error);
      });

      // デフォルト値: PolygonのUSDC
      const DEFAULT_CHAIN = 'polygon';
      const DEFAULT_TOKEN = 'USDC_POL';

      // 設定が存在しない場合はデフォルト値を設定して保存
      if (!chainData || !chainData.value) {
        console.log('📝 No chain setting found, setting default to Polygon');
        const defaultChainData = {
          key: 'payment.preferredChain',
          value: DEFAULT_CHAIN,
          updatedAt: new Date().toISOString()
        };
        await store.put(defaultChainData);
        chainData = { value: DEFAULT_CHAIN };
      }

      if (!tokenData || !tokenData.value) {
        console.log('📝 No token setting found, setting default to USDC_POL');
        const defaultTokenData = {
          key: 'payment.preferredToken',
          value: DEFAULT_TOKEN,
          updatedAt: new Date().toISOString()
        };
        await store.put(defaultTokenData);
        tokenData = { value: DEFAULT_TOKEN };
      }

      await transaction.done; // コミット完了を待つ

      const chainSelector = document.getElementById('mysetup-chain-selector');
      const tokenSelector = document.getElementById('mysetup-token-selector');

      if (chainSelector) {
        chainSelector.value = chainData.value;
        // トークンリストを更新
        updateTokenSelector(chainData.value);
      }

      if (tokenSelector) {
        // 少し待ってからトークンを設定（updateTokenSelectorの完了を待つ）
        setTimeout(() => {
          tokenSelector.value = tokenData.value;
        }, 100);
      }

      console.log('✅ Payment settings loaded from IndexedDB');

    } catch (error) {
      console.error('❌ Error loading payment settings:', error);
    }
  }

  /**
   * Developerトグルの状態に応じてNetworkセレクターを表示/非表示
   */
  async function handleDeveloperToggle(isEnabled) {
    const developerNetworkSection = document.getElementById('developer-network-section');
    const mysetupNetworkSelector = document.getElementById('mysetup-network-selector');

    if (developerNetworkSection) {
      developerNetworkSection.style.display = isEnabled ? 'block' : 'none';
    }

    if (isEnabled && mysetupNetworkSelector) {
      // 開発者モードがONの場合、IndexedDBからネットワーク設定を読み込んで復元
      // IndexedDBの値が常に正しいので、それを優先する
      loadNetworkSetting().then(async network => {
        if (network) {
          mysetupNetworkSelector.value = network;
          // IndexedDBとSessionStorageの両方に保存（状態を確実に保存）
          await saveNetworkSetting(network);
          sessionStorage.setItem('mpc.current_network', network);
        }
      });
    } else if (!isEnabled) {
      // 開発者モードがOFFの場合、Networkをmainnetに設定
      const mainnet = 'mainnet';
      
      // IndexedDBに保存
      await saveNetworkSetting(mainnet);
      
      // sessionStorageに保存
      sessionStorage.setItem('mpc.current_network', mainnet);
      
      // BitVoyインスタンスが利用可能な場合、ネットワークを切り替え
      if (window.bitvoyMPC && typeof window.bitvoyMPC.switchNetwork === 'function') {
        window.bitvoyMPC.switchNetwork(mainnet).then(result => {
          if (result.success) {
            console.log('✅ Network switched to mainnet (developer mode OFF)');
          } else {
            console.warn('⚠️ Failed to switch network to mainnet:', result.error);
          }
        }).catch(error => {
          console.error('❌ Error switching network to mainnet:', error);
        });
      }
      
      console.log('✅ Network set to mainnet (developer mode OFF)');
    }
  }

  /**
   * ネットワーク設定をIndexedDBに保存
   */
  async function saveNetworkSetting(network) {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.error('❌ BitVoyStorage not available');
        return;
      }

      // IndexedDBに保存
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

      await store.put({
        key: 'mpc.current_network',
        value: network,
        updatedAt: new Date().toISOString()
      });

      await transaction.done; // コミット完了を待つ

      console.log('✅ Network setting saved to IndexedDB:', network);
    } catch (error) {
      console.error('❌ Error saving network setting:', error);
    }
  }

  /**
   * ネットワーク設定をIndexedDBから読み込み
   */
  async function loadNetworkSetting() {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        console.warn('⚠️ BitVoyStorage not available, skipping load');
        return null;
      }

      // IndexedDBから読み込み（設定がない場合は書き込みも行うため、readwriteを使用）
      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readwrite');
      const store = transaction.objectStore(storage.stores.mypage);

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
          value: DEFAULT_NETWORK,
          updatedAt: new Date().toISOString()
        };
        await store.put(defaultNetworkData);
        networkData = { value: DEFAULT_NETWORK };
      }

      await transaction.done; // コミット完了を待つ

      console.log('✅ Network setting loaded from IndexedDB:', networkData.value);
      return networkData.value;
    } catch (error) {
      console.error('❌ Error loading network setting:', error);
      return null;
    }
  }

  /**
   * Push通知トグルの状態を更新
   */
  async function updatePushNotificationToggle() {
    const pushNotificationToggle = document.getElementById('push-notification-toggle');
    if (!pushNotificationToggle) return;

    if (!window.bitvoyMPC || typeof window.bitvoyMPC.getPushSubscriptionStatus !== 'function') {
      pushNotificationToggle.checked = false;
      pushNotificationToggle.disabled = true;
      return;
    }

    try {
      const status = await window.bitvoyMPC.getPushSubscriptionStatus();
      pushNotificationToggle.checked = status.subscribed;
      pushNotificationToggle.disabled = !status.supported;

      if (!status.supported) {
        // 端末が対応してない → トグルを disabled にする
        const message = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t) 
          ? i18next.t('mySetup.notSupported', { ns: 'index' })
          : "通知機能を有効にするには、\nホーム画面への追加\nOSのアップデート\nをしてください。\n";
        alert(message);
        pushNotificationToggle.disabled = !status.supported;
      }
      
      if (status.permission === 'denied') {
        // もうユーザーに拒否されている → トグルOFF固定 + 「設定アプリで変更してください」メッセージ
        const message = (typeof i18next !== 'undefined' && i18next.isInitialized && i18next.t) 
          ? i18next.t('mySetup.permissionDenied', { ns: 'index' })
          : "通知を有効にするには、設定アプリ > 通知 > BitVoy から変更してください。";
        alert(message);
        pushNotificationToggle.checked = false;
        pushNotificationToggle.disabled = true;
      }
      
      if (status.subscribed) {
        // すでに購読中 → トグルON
        pushNotificationToggle.checked = true;
      }

    } catch (error) {
      console.error('[My Setup] Error updating push notification toggle:', error);
      pushNotificationToggle.checked = false;
    }
  }

  /**
   * Push通知トグルの変更を処理
   */
  async function handlePushNotificationToggle(isEnabled) {
    if (!window.bitvoyMPC) {
      console.warn('[My Setup] BitVoy instance not available');
      return;
    }

    try {
      if (isEnabled) {
        // 購読
        if (typeof window.bitvoyMPC.subscribeToPushNotifications === 'function') {
          await window.bitvoyMPC.subscribeToPushNotifications();
          console.log('[My Setup] Push notification subscription initiated');
        } else {
          // フォールバック: handleNotifyClickを使用
          if (window.BitVoyEnv && window.BitVoyEnv.handleNotifyClick) {
            await window.BitVoyEnv.handleNotifyClick();
          }
        }
      } else {
        // 購読解除
        if (typeof window.bitvoyMPC.unsubscribeToPushNotifications === 'function') {
          await window.bitvoyMPC.unsubscribeToPushNotifications();
          console.log('[My Setup] Push notification unsubscription initiated');
        }
      }
      
      // 状態を再確認
      await updatePushNotificationToggle();
    } catch (error) {
      console.error('[My Setup] Error handling push notification toggle:', error);
      // エラー時はトグルを元の状態に戻す
      await updatePushNotificationToggle();
    }
  }  

    /* ===========================
    * 1) 環境判定
    * =========================== */
    function detectClientEnv() {
        const uaRaw = navigator.userAgent || navigator.vendor || window.opera || '';
        const ua = uaRaw.toLowerCase();
        
        const isIOS = /iphone|ipad|ipod/.test(ua);
        const isAndroid = /android/.test(ua);
        const isDesktop = !isIOS && !isAndroid;
        
        const isChromeIOS = isIOS && /crios/.test(ua);
        const isSafariIOS =
            isIOS &&
            /safari/.test(ua) &&
            !/crios|fxios|edgios|opr\//.test(ua);
        
        const isChromeAndroid =
            isAndroid &&
            /chrome/.test(ua) &&
            /safari/.test(ua) &&
            !/edg|opr/.test(ua) &&
            !/; wv\)/.test(ua);
        
        const isInAppBrowser =
            /(line|fbav|fban|fb_iab|instagram|twitter|x-ios|x-apollo|telegram)/i.test(uaRaw);
        
        // standalone判定
        let isStandalone = false;
        if (typeof window.navigator.standalone === 'boolean') {
            isStandalone = window.navigator.standalone;
        }
        if (window.matchMedia &&
            (window.matchMedia('(display-mode: standalone)').matches ||
                window.matchMedia('(display-mode: fullscreen)').matches)) {
            isStandalone = true;
        }
        
        return {
            ua,
            isIOS,
            isAndroid,
            isDesktop,
            isSafariIOS,
            isChromeIOS,
            isChromeAndroid,
            isInAppBrowser,
            isStandalone
        };
    }
    
    /* ===========================
    * 2) beforeinstallprompt ハンドリング
    * =========================== */
    let deferredPrompt = null;
    
    window.addEventListener('beforeinstallprompt', (e) => {
    // デフォルトのミニバーを出させない
    e.preventDefault();
    deferredPrompt = e;
    // ここで「ホームへ追加」ボタンを表示してもOKだけど、
    // 今回は detectClientEnv() 側で出し分けするので何もしない
    });
    
    /* ===========================
    * 3) UI制御
    * =========================== */
    document.addEventListener('DOMContentLoaded', () => {
    const env = detectClientEnv();
    
    const overlayInApp = document.getElementById('overlay-inapp-warning');
    const overlayAndroid = document.getElementById('overlay-android-guide');
    
    const btnCloseInApp = document.getElementById('btn-close-inapp-warning');
    const btnCloseAndroid = document.getElementById('btn-close-android-guide');
    
    // まずオーバーレイを全部非表示
    if (overlayInApp) overlayInApp.style.display = 'none';
    if (overlayAndroid) overlayAndroid.style.display = 'none';
    
    /* ===========================
        * オーバーレイの閉じるボタン
        * =========================== */
    if (btnCloseInApp && overlayInApp) {
        btnCloseInApp.addEventListener('click', () => {
        overlayInApp.style.display = 'none';
        });
    }
    if (btnCloseAndroid && overlayAndroid) {
        btnCloseAndroid.addEventListener('click', () => {
        overlayAndroid.style.display = 'none';
        });
    }
    });

  // ==============================
  // Scan to Pay & Receive Pay 機能
  // ==============================
  
  /**
   * Scan to Pay ページの初期化
   */
  window.initScanToPay = function() {
    console.log('🔧 Initializing Scan to Pay page...');
    
    const video = document.getElementById('scantopay-video');
    const canvas = document.getElementById('scantopay-canvas');
    const scannerView = document.getElementById('scantopay-scanner-view');
    const confirmView = document.getElementById('scantopay-confirm-view');
    const cancelBtn = document.getElementById('scantopay-cancel-btn');
    const backBtn = document.getElementById('scantopay-back-btn');
    const approveBtn = document.getElementById('scantopay-approve-btn');
    
    if (!video || !canvas) {
      console.error('❌ Scan to Pay: Video or canvas element not found');
      return;
    }
    
    let scanActive = false;
    let stream = null;
    let ctx = null;
    let paymentData = null;
    let qrScanner = null;
    
    // キャンセルボタン
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        stopScan();
        window.location.hash = '#home';
      });
    }
    
    // 戻るボタン
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        stopScan();
        showScannerView();
      });
    }
    
    // 承認ボタン
    if (approveBtn) {
      approveBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!paymentData) return;
        
        // coins.jsの送金関数を使用
        if (typeof coinsShowSendForm === 'function' && typeof coinsApproval === 'function') {
          // 送金画面に遷移
          const productId = getProductIdFromChainAndToken(paymentData.chain, paymentData.token);
          if (!productId) {
            const t = (k, opts) => (window.i18next && window.i18next.t) ? window.i18next.t(k, opts) : k;
            alert(t('payments.unsupportedToken', { ns: 'index' }));
            return;
          }
          
          // 送金情報を設定
          window.selectedCoinForSend = productId;
          
          // 送金情報を先に設定してから#coinsページに遷移
          // これにより、#coinsページが表示された際に送金確認画面が直接表示される
          const sendAddressInput = document.getElementById('send-address');
          const sendAmountInput = document.getElementById('send-amount');
          
          if (sendAddressInput) {
            sendAddressInput.value = paymentData.to;
          }
          if (sendAmountInput) {
            sendAmountInput.value = paymentData.amount;
          }
          
          // #coinsページに遷移（handleRoute内で送金情報が設定されていることを検知して送金確認画面を表示）
          window.location.hash = '#coins';
        } else {
          console.error('❌ coins.js functions not available');
        }
      });
    }
    
    function showScannerView() {
      if (scannerView) scannerView.style.display = 'block';
      if (confirmView) confirmView.style.display = 'none';
      paymentData = null;
    }
    
    function showConfirmView(data) {
      if (scannerView) scannerView.style.display = 'none';
      if (confirmView) confirmView.style.display = 'block';
      
      // productIdからsymbolを取得
      const productId = getProductIdFromChainAndToken(data.chain, data.token);
      let displaySymbol = data.token; // デフォルトはtoken名
      
      if (productId && typeof products !== 'undefined' && products[productId]) {
        displaySymbol = products[productId].symbol || data.token;
      }
      
      // 確認情報を表示
      document.getElementById('scantopay-confirm-to').textContent = data.to;
      document.getElementById('scantopay-confirm-amount').textContent = `${data.amount} ${displaySymbol}`;
      document.getElementById('scantopay-confirm-token').textContent = displaySymbol;
      document.getElementById('scantopay-confirm-chain').textContent = data.chain;
      
      if (data.memo) {
        document.getElementById('scantopay-confirm-memo').textContent = data.memo;
        document.getElementById('scantopay-confirm-memo-row').style.display = 'table-row';
      } else {
        document.getElementById('scantopay-confirm-memo-row').style.display = 'none';
      }
      
      paymentData = data;
    }
    
    function stopScan() {
      scanActive = false;
      if (qrScanner) {
        qrScanner.stop();
        qrScanner.destroy();
        qrScanner = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
      if (video) {
        video.srcObject = null;
      }
    }
          
    function validateAndShowConfirm(data, userChain, userToken, t) {
                
      if (userChain && data.chain !== userChain) {
        alert(t('payments.chainMismatch', { ns: 'index', expected: userChain, got: data.chain }));
        return;
      }
      
      if (userToken && data.token !== userToken) {
        alert(t('payments.tokenMismatch', { ns: 'index', expected: userToken, got: data.token }));
        return;
      }
      
      // チェーンとトークンのサポート確認
      const productId = getProductIdFromChainAndToken(data.chain, data.token);
      if (!productId) {
        alert(t('payments.unsupportedChain', { ns: 'index' }) + ' / ' + t('payments.unsupportedToken', { ns: 'index' }));
        return;
      }
      
      stopScan();
      showConfirmView(data);
    }
    
    // QRスキャンを開始
    async function startScan() {
      if (typeof QrScanner === 'undefined') {
        console.error('❌ QrScanner is not loaded');
        alert('QR Scanner library is not loaded');
        return;
      }
      
      try {
        scanActive = true;
        
        // qr-scannerを使用してQRコードスキャンを開始
        qrScanner = new QrScanner(
          video,
          result => {
            console.log('✅ QR detected:', result.data);
            
            let data;
            try {
              data = JSON.parse(result.data);
            } catch (e) {
              console.warn('⚠️ QR data is not valid JSON:', e);
              // BitVoy QRではない → そのままスキャン続行
              return;
            }
            
            // BitVoy専用QRのフォーマットチェック
            if (!(data.v === 1 && data.type === 'bitvoy-pay' && data.to && data.chain && data.token && data.amount)) {
              console.warn('⚠️ Not BitVoy Pay QR format:', data);
              // いちいち alert せず、ただスキップして読み続けるのが UX 的に良い
              return;
            }
            
            // ここまで来たら「BitVoy用QR」とみなす
            const t = (k, opts) => (window.i18next && window.i18next.t) ? window.i18next.t(k, opts) : k;
            
            Promise.all([getUserPreferredChain(), getUserPreferredToken()])
              .then(([userChain, userToken]) => {
                validateAndShowConfirm(data, userChain, userToken, t);
              })
              .catch(err => {
                console.error('❌ Error getting user preferences:', err);
                // 失敗してもスキャンは続ける
              });
          },
          {
            preferredCamera: 'environment',
            returnDetailedScanResult: true,
            maxScansPerSecond: 10 // スキャン頻度を下げて安定性を向上
          }
        );
        
        await qrScanner.start();
      } catch (err) {
        console.error('❌ Camera access error:', err);
        alert('Camera access denied or not available');
        scanActive = false;
      }
    }
    
    // ページを離れるときにスキャンを停止（一度だけ登録）
    const hashChangeHandler = () => {
      if (window.location.hash !== '#scantopay') {
        stopScan();
        // イベントリスナーを削除（メモリリーク防止）
        window.removeEventListener('hashchange', hashChangeHandler);
      }
    };
    window.addEventListener('hashchange', hashChangeHandler);
    
    // スキャンを開始
    showScannerView();
    startScan();
  };
  
  /**
   * Receive Pay ページの初期化
   */
  window.initReceivePay = function() {
    console.log('🔧 Initializing Receive Pay page...');
    
    const amountInput = document.getElementById('receivepay-amount');
    const memoInput = document.getElementById('receivepay-memo');
    const generateBtn = document.getElementById('receivepay-generate-btn');
    const qrContainer = document.getElementById('receivepay-qr-container');
    const qrElement = document.getElementById('receivepay-qr');
    
    // グローバル変数としてQRCodeインスタンスを保持（重複生成を防ぐ）
    if (!window.receivepayQrcode) {
      window.receivepayQrcode = null;
    }
    
    if (!amountInput || !generateBtn) {
      console.error('❌ Receive Pay: Required elements not found');
      return;
    }
    
    // 既存のイベントリスナーを削除（重複登録を防ぐ）
    const newGenerateBtn = generateBtn.cloneNode(true);
    generateBtn.parentNode.replaceChild(newGenerateBtn, generateBtn);
    
    // QRコード生成
    if (newGenerateBtn) {
      newGenerateBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const amount = amountInput.value.trim();
        if (!amount) {
          alert('Please enter an amount');
          return;
        }
        
        // マイページで設定したチェーンとトークンを取得
        const userChain = await getUserPreferredChain() || 'Polygon';
        const userToken = await getUserPreferredToken() || 'USDC';
        const memo = memoInput.value.trim() || '';
        
        // ウォレットアドレスを取得
        const productId = getProductIdFromChainAndToken(userChain, userToken);
        if (!productId) {
          const t = (k) => (window.i18next && window.i18next.t) ? window.i18next.t(k) : k;
          alert(t('payments.unsupportedChain', { ns: 'index' }) + ' / ' + t('payments.unsupportedToken', { ns: 'index' }));
          return;
        }
        
        // getWalletAddress関数を取得（coins-libs.jsから）
        const getWalletAddress = window.CoinsLibs?.getWalletAddress || function(productId) {
          const getCurrentNetwork = window.CoinsLibs?.getCurrentNetwork || function() {
            return sessionStorage.getItem('mpc.current_network') || 'mainnet';
          };
          const network = getCurrentNetwork();
          return sessionStorage.getItem(`wallet.0.${network}.${productId}.address`);
        };
        
        // getNativeCoinForToken関数を取得（coins-libs.jsから）
        const getNativeCoinForToken = window.CoinsLibs?.getNativeCoinForToken || function(productId) {
          // トークンの場合、ネイティブコインを返す
          if (productId.includes('_ERC20')) {
            return 'ETH';
          } else if (productId.includes('_POL')) {
            return 'POL';
          } else if (productId.includes('_ARB')) {
            return 'ARB';
          } else if (productId.includes('_BASE')) {
            return 'BASE';
          } else if (productId.includes('_OPT')) {
            return 'OPT';
          } else if (productId.includes('_AVAX')) {
            return 'AVAX';
          }
          return null;
        };
        
        // ウォレットアドレスを取得
        let address = getWalletAddress(productId);
        
        // トークンの場合、ネイティブチェーンのアドレスをフォールバックとして使用
        if (!address) {
          const nativeCoinId = getNativeCoinForToken(productId);
          if (nativeCoinId) {
            address = getWalletAddress(nativeCoinId);
            if (address) {
              console.log(`🔄 Token ${productId}: Using ${nativeCoinId} address as fallback:`, address);
            }
          }
        }
        
        if (!address) {
          alert('Wallet address not found');
          return;
        }
        
        // QRコードデータを生成
        const qrData = {
          v: 1,
          type: 'bitvoy-pay',
          to: address,
          chain: userChain,
          token: userToken,
          amount: amount,
          memo: memo || undefined
        };
        
        // QRコードを生成
        const qrDataString = JSON.stringify(qrData);
        
        // QRコード要素を完全にクリア
        if (qrElement) {
          qrElement.innerHTML = '';
        }
        
        // QRCodeインスタンスを再利用または新規作成
        if (!window.receivepayQrcode) {
          window.receivepayQrcode = new QRCode(qrElement, '');
        } else {
          // 既存のインスタンスをクリア
          window.receivepayQrcode.clear();
        }
        
        // QRコードを生成（1つだけ）
        window.receivepayQrcode.makeCode(qrDataString);
        
        // QRコードコンテナを表示
        if (qrContainer) {
          qrContainer.style.display = 'block';
        }
      });
    }
  };
  
  /**
   * チェーン名とトークン名からproductIdを取得
   */
  function getProductIdFromChainAndToken(chain, token) {
    // chainKey（ethereum, polygon等）またはproductIdが渡される可能性がある
    // まず、productIdが渡された場合はそのまま返す
    if (typeof products !== 'undefined' && products[chain]) {
      // chainがproductIdの場合
      return chain;
    }
    
    // チェーン名を正規化
    const chainLower = chain.toLowerCase();
    const tokenUpper = token.toUpperCase();
    
    // チェーン名のマッピング（chainKeyからchainIdへの変換）
    const SUPPORTED_CHAINS = [
      { chainId: 1, chainKey: 'ethereum', displayName: 'Ethereum' },
      { chainId: 137, chainKey: 'polygon', displayName: 'Polygon' },
      { chainId: 42161, chainKey: 'arbitrum', displayName: 'Arbitrum' },
      { chainId: 8453, chainKey: 'base', displayName: 'Base' },
      { chainId: 10, chainKey: 'optimism', displayName: 'Optimism' },
      { chainId: 43114, chainKey: 'avalanche', displayName: 'Avalanche' },
      { chainId: 56, chainKey: 'bsc', displayName: 'BNB Chain' }
    ];
    
    const chainInfo = SUPPORTED_CHAINS.find(c => c.chainKey === chainLower);
    if (!chainInfo) {
      // 旧形式のマッピング（後方互換性のため）
      const chainMap = {
        'polygon': 'POL',
        'ethereum': 'ETH',
        'bitcoin': 'BTC',
        'solana': 'SOL',
        'ton': 'TON'
      };
      const chainKey = chainMap[chainLower] || chainUpper;
      
      // ネイティブコイン
      if (tokenUpper === chainKey) {
        return chainKey;
      }
      return null;
    }
    
    const chainId = chainInfo.chainId;
    
    // EVMチェーンのトークンリスト（Cross-chain Swap対応）
    const EVM_CCSWAP_TOKENS = [
      'USDC_ERC20', 'USDC_POL', 'USDC_ARB', 'USDC_BASE', 'USDC_OPT', 'USDC_AVAX',
      'USDT_ERC20', 'USDT_POL', 'USDT_ARB',
      'JPYC_ERC20', 'JPYC_POL', 'JPYC_AVAX',
      'WETH_ERC20',
      'ETH', 'POL'
    ];
    
    // 該当チェーンのトークンのみをフィルタリング
    const availableTokens = EVM_CCSWAP_TOKENS.filter(productId => {
      if (typeof products === 'undefined' || !products[productId]) return false;
      const product = products[productId];
      // cointypeからchainIdを取得して比較
      const productChainId = parseInt(product.cointype) || null;
      return productChainId === chainId;
    });
    
    // tokenがproductIdとして渡された場合
    if (availableTokens.includes(tokenUpper)) {
      return tokenUpper;
    }
    
    // tokenがシンボルとして渡された場合、該当チェーンのトークンから検索
    const matchingToken = availableTokens.find(productId => {
      if (typeof products === 'undefined' || !products[productId]) return false;
      const product = products[productId];
      return product.symbol.toUpperCase() === tokenUpper;
    });
    
    if (matchingToken) {
      return matchingToken;
    }
    
    return null;
  }
  
  /**
   * IndexedDBの設定をタブ間で同期するためのイベントリスナーを設定
   */
  function setupIndexedDBSync() {
    // 既に設定済みの場合はスキップ（重複登録を防ぐ）
    if (window._indexedDBSyncSetup) {
      console.log('⚠️ IndexedDB sync already setup, skipping...');
      return;
    }
    window._indexedDBSyncSetup = true;
    
    // 重複実行を防ぐためのフラグ
    let isReloading = false;
    let lastReloadTime = 0;
    const RELOAD_COOLDOWN = 2000; // 2秒間のクールダウン
    
    // 設定を再読み込みする共通関数
    const reloadSettings = async (source) => {
      // 既に実行中またはクールダウン中の場合はスキップ
      const now = Date.now();
      if (isReloading || (now - lastReloadTime < RELOAD_COOLDOWN)) {
        console.log(`⏭️ Skipping reloadSettings (${source}): already running or in cooldown`);
        return;
      }
      
      isReloading = true;
      lastReloadTime = now;
      console.log(`🔄 Reloading settings from IndexedDB (${source})...`);
        
      try {
        // Payment Settingsを再読み込み
        if (typeof loadPaymentSettings === 'function') {
          await loadPaymentSettings();
        }
        
        // Network設定を再読み込み
        if (typeof loadNetworkSetting === 'function') {
          const network = await loadNetworkSetting();
          if (network) {
            sessionStorage.setItem('mpc.current_network', network);
            // BitVoyインスタンスのnetworkも更新（switchNetworkは呼ばない）
            if (window.bitvoyMPC && typeof window.bitvoyMPC.loadNetworkFromIndexedDB === 'function') {
              await window.bitvoyMPC.loadNetworkFromIndexedDB();
            }
          }
        }
        
        // Developerモード設定を再読み込み
        const developerToggle = document.getElementById('developer-toggle');
        if (developerToggle && typeof loadDeveloperMode === 'function') {
          const isDeveloperMode = await loadDeveloperMode();
          // 現在の状態と異なる場合のみ更新（重複実行を防ぐ）
          if (developerToggle.checked !== isDeveloperMode) {
            developerToggle.checked = isDeveloperMode;
            // handleDeveloperToggleは呼ばない（既に設定が反映されているため）
          }
        }
        
        console.log(`✅ Settings reloaded from IndexedDB (${source})`);
      } catch (error) {
        console.error(`❌ Error reloading settings (${source}):`, error);
      } finally {
        isReloading = false;
      }
    };
    
    // ページがフォーカスされた時にIndexedDBから設定を再読み込み
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden) {
        // ページが表示された時（フォーカスされた時）
        await reloadSettings('visibilitychange');
      }
    });
    
    // windowフォーカス時にも再読み込み（visibilitychangeが発火しない場合に備えて）
    // ただし、visibilitychangeと同時に発火する可能性があるため、クールダウンで制御
    window.addEventListener('focus', async () => {
      await reloadSettings('window focus');
    });
  }

  /**
   * ユーザーの優先チェーンを取得（IndexedDBから）
   * 常に最新の値を取得するため、キャッシュしない
   */
  async function getUserPreferredChain() {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        return null;
      }

      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readonly');
      const store = transaction.objectStore(storage.stores.mypage);

      const request = store.get('payment.preferredChain');
      const data = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return data && data.value ? data.value : null;
    } catch (error) {
      console.error('❌ Error getting preferred chain:', error);
      return null;
    }
  }
  
  /**
   * ユーザーの優先トークンを取得（IndexedDBから）
   * 常に最新の値を取得するため、キャッシュしない
   */
  async function getUserPreferredToken() {
    try {
      const storage = await getBitVoyStorageInstance();
      if (!storage) {
        return null;
      }

      const db = storage.db;
      const transaction = db.transaction([storage.stores.mypage], 'readonly');
      const store = transaction.objectStore(storage.stores.mypage);

      const request = store.get('payment.preferredToken');
      const data = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      return data && data.value ? data.value : null;
    } catch (error) {
      console.error('❌ Error getting preferred token:', error);
      return null;
    }
  }  
