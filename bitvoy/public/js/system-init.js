/**
 * system-init.js - BitVoyシステム初期化モジュール
 * frost_wasmとBitVoyライブラリの初期化管理を担当
 */

// 初期化状態の管理
window.BitVoyInitializationState = {
    frostWasmReady: false,
    bitvoyLibrariesReady: false,
    systemReady: false
};

// 早期初期化を防ぐためのフラグ
window.BITVOY_LOADING = true;

// frost_wasm初期化待機
let frostWasmReady = false;
let bitvoyLibrariesReady = false;

// frost_wasm_readyイベントリスナーを即座に設定
window.addEventListener('frost_wasm_ready', function() {
    frostWasmReady = true;
    window.BitVoyInitializationState.frostWasmReady = true;
    console.log('✅ FROST WASM ready event received');
    
    // frost_wasmの関数が利用可能かチェック
    if (typeof window.frost_wasm !== 'undefined') {
        console.log('✅ frost_wasm functions are available');
        // 即座にBITVOY_LOADINGフラグをチェック
        if (window.BitVoyInitializationState.systemReady) {
            window.BITVOY_LOADING = false;
            console.log('✅ BitVoy initialization completed immediately after FROST WASM ready');
        }
    } else {
        console.warn('⚠️ frost_wasm ready event received but functions not available');
    }
});

// 既にfrost_wasmが準備できている場合のチェック
if (typeof window.frost_wasm !== 'undefined') {
    frostWasmReady = true;
    window.BitVoyInitializationState.frostWasmReady = true;
    console.log('✅ FROST WASM already available with functions');
} else if (typeof window.frost_wasm !== 'undefined') {
    console.warn('⚠️ frost_wasm object exists but functions not available');
}

// ライブラリ読み込み完了を監視する関数
function checkLibrariesLoaded() {
    const requiredLibraries = [
        'BitVoyConfig',
        'BitVoyStorage', 
        'BitVoyMPC',
        'BitVoyWallet',
        'BitVoy',
        'MPCAddressGenerator'
    ];
    
    const loadedLibraries = requiredLibraries.filter(lib => typeof window[lib] !== 'undefined');
    const missingLibraries = requiredLibraries.filter(lib => typeof window[lib] === 'undefined');
    
    console.log('📚 Library loading status:', {
        loaded: loadedLibraries,
        missing: missingLibraries,
        total: requiredLibraries.length,
        loadedCount: loadedLibraries.length
    });
    
    if (missingLibraries.length === 0) {
        console.log('✅ All BitVoy libraries loaded successfully');
        if (!bitvoyLibrariesReady) {
            bitvoyLibrariesReady = true;
            window.BitVoyInitializationState.bitvoyLibrariesReady = true;
            window.dispatchEvent(new CustomEvent('bitvoy_libraries_ready'));
        }
        return true;
    }
    return false;
}

// 定期的にライブラリ読み込みをチェック
const libraryCheckInterval = setInterval(() => {
    if (checkLibrariesLoaded()) {
        clearInterval(libraryCheckInterval);
    }
}, 100);

// 10秒後にタイムアウト
setTimeout(() => {
    clearInterval(libraryCheckInterval);
    if (!bitvoyLibrariesReady) {
        console.warn('⚠️ Library loading timeout, forcing bitvoy_libraries_ready event...');
        window.dispatchEvent(new CustomEvent('bitvoy_libraries_ready'));
    }
}, 10000);

window.addEventListener('bitvoy_libraries_ready', function() {
    bitvoyLibrariesReady = true;
    window.BitVoyInitializationState.bitvoyLibrariesReady = true;
    console.log('BitVoy libraries ready');
    
    // グローバルクラスの初期化を遅延実行
    setTimeout(() => {
        initializeGlobalClasses();
    }, 100);
});

// フォールバック: 2秒後に手動でbitvoy_libraries_readyイベントを発火
// 無効化: frost-wasm-init.jsが管理するため
/*
setTimeout(() => {
    if (!bitvoyLibrariesReady) {
        console.log('⚠️ bitvoy_libraries_ready event not fired, manually triggering...');
        window.dispatchEvent(new CustomEvent('bitvoy_libraries_ready'));
    }
}, 2000);
*/

// 代わりに、frost-wasm-init.jsの読み込み完了を待つ
console.log('⏳ Waiting for frost-wasm-init.js to complete library loading...');

// frost-wasm-init.jsの読み込み完了イベントを監視
window.addEventListener('frost_wasm_libraries_complete', function(event) {
    console.log('🎉 frost-wasm-init.js completed library loading:', event.detail);
    bitvoyLibrariesReady = true;
    
    // グローバルクラスの初期化を実行
    setTimeout(() => {
        initializeGlobalClasses();
    }, 100);
});

function initializeGlobalClasses() {
    try {
        // グローバルクラスの初期化
        if (typeof BitVoyStorage !== 'undefined') {
            window.BitVoyStorage = BitVoyStorage;
            console.log('BitVoyStorage initialized');
        }
        
        if (typeof BitVoyMPC !== 'undefined') {
            window.BitVoyMPC = BitVoyMPC;
            console.log('BitVoyMPC initialized');
        }
        
        if (typeof BitVoyWallet !== 'undefined') {
            window.BitVoyWallet = BitVoyWallet;
            console.log('BitVoyWallet initialized');
        }
        
        if (typeof BitVoy !== 'undefined') {
            window.BitVoy = BitVoy;
            console.log('BitVoy initialized');
        }
        
        // 初期化完了通知
        initializeBitVoySystem();
        
    } catch (error) {
        console.error('Global classes initialization failed:', error);
        showLoadingError('System initialization failed. Please refresh the page.');
    }
}

window.addEventListener('frost_wasm_error', function(event) {
    console.error('FROST WASM initialization error:', event.detail);
    showLoadingError('FROST WASM initialization failed. Please refresh the page.');
});

window.addEventListener('bitvoy_libraries_error', function(event) {
    console.error('BitVoy libraries loading error:', event.detail);
    showLoadingError('BitVoy libraries loading failed. Please refresh the page.');
});

// Hide loading screen once everything is loaded
window.addEventListener('load', function() {
    console.log('🔄 Page load event triggered, checking initialization status...');
    
    // BitVoyMPC初期化完了イベントを監視
    window.addEventListener('bitvoy_mpc_ready', function(event) {
        console.log('🎉 BitVoyMPC initialization completed:', event.detail);
        checkInitializationStatus();
    });
    
    // app-mpc.js初期化完了イベントを監視
    window.addEventListener('bitvoy_app_ready', function(event) {
        console.log('🎉 BitVoy App initialization completed:', event.detail);
        checkInitializationStatus();
    });
    
    // frost_wasmとBitVoyライブラリの初期化を待機
    const checkInitialization = () => {
        // 各コンポーネントの状態を詳細にチェック
        const componentStatus = {
            frostWasm: typeof window.frost_wasm !== 'undefined',
            bitvoyStorage: typeof window.BitVoyStorage !== 'undefined',
            bitvoyMPC: typeof window.BitVoyMPC !== 'undefined',
            bitvoyWallet: typeof window.BitVoyWallet !== 'undefined',
            bitvoy: typeof window.BitVoy !== 'undefined'
        };
        
        // すべての必須コンポーネントが利用可能で、システムが準備できていれば初期化を許可
        const allComponentsReady = Object.values(componentStatus).every(status => status === true);
        
        if (allComponentsReady && window.BitVoyInitializationState.systemReady) {
            checkInitializationStatus();
        } else {
            // デバッグ情報を出力
            console.log('⏳ Waiting for initialization...', {
                componentStatus,
                systemReady: window.BitVoyInitializationState.systemReady,
                frostWasmAvailable: typeof window.frost_wasm !== 'undefined'
            });
            
            // 継続的にチェック
            setTimeout(checkInitialization, 200);
        }
    };
    
    // 初期化状態の最終チェックとローディング完了処理
    function checkInitializationStatus() {
        const componentStatus = {
            frostWasm: typeof window.frost_wasm !== 'undefined',
            bitvoyStorage: typeof window.BitVoyStorage !== 'undefined',
            bitvoyMPC: typeof window.BitVoyMPC !== 'undefined',
            bitvoyWallet: typeof window.BitVoyWallet !== 'undefined',
            bitvoy: typeof window.BitVoy !== 'undefined'
        };
        
        const allComponentsReady = Object.values(componentStatus).every(status => status === true);
        
        if (allComponentsReady && window.BitVoyInitializationState.systemReady) {
            window.BITVOY_LOADING = false; // ローディング完了フラグ
            console.log('✅ BitVoy initialization completed, BITVOY_LOADING set to false');
            console.log('📊 Final component status:', componentStatus);
            
            setTimeout(function() {
                const loadingScreen = document.getElementById('mpc-loading');
                if (loadingScreen) {
                    loadingScreen.style.display = 'none';
                }
            }, 500);
        }
    }
    
    checkInitialization();
});

// Check Passkey support
if (!window.PublicKeyCredential) {
    // 下部バナーを表示（アプリ内ブラウザの可能性が高い）
    if (typeof window.BitVoyEnv !== 'undefined' && typeof window.BitVoyEnv.showInAppBrowserBanner === 'function') {
        window.BitVoyEnv.showInAppBrowserBanner();
    }
    alert('This browser does not support Passkey, which is required for MPC wallets. Please use a modern browser like Chrome, Firefox, Safari, or Edge.');
}

// Enhanced error handling for unified architecture with frost_wasm
window.addEventListener('error', function(event) {
    console.error('Script error:', event.error);
    
    // 早期初期化中のエラーを特別処理
    if (window.BITVOY_LOADING) {
        console.warn('Error occurred during initialization phase:', event.error);
        return;
    }
    
    // Specific error handling for different components
    if (event.error && event.error.message) {
        const errorMessage = event.error.message;
        
        // Skip BitVoyConfig-related errors as they're non-critical
        if (errorMessage.includes('BitVoyConfig')) {
            console.warn('BitVoyConfig not loaded - using default settings');
            return;
        }
        
        // CSP関連エラーの特別処理
        if (errorMessage.includes('Content Security Policy') || errorMessage.includes('unsafe-eval')) {
            console.warn('CSP restriction detected - FROST WASM may fall back to JavaScript implementation');
            showLoadingWarning('WebAssembly restricted by browser security. Using JavaScript fallback.');
            return;
        }
        
        if (errorMessage.includes('BitVoyStorage')) {
            console.error('Storage system initialization failed');
            showLoadingError('Storage initialization failed. Please refresh the page.');
        } else if (errorMessage.includes('frost_wasm')) {
            console.error('FROST WASM initialization failed');
            showLoadingWarning('FROST WASM initialization failed. Using JavaScript fallback.');
        } else if (errorMessage.includes('MPC') || errorMessage.includes('Passkey')) {
            console.error('MPC system initialization failed');
            showLoadingError('MPC initialization failed. Please check browser compatibility.');
        } else if (errorMessage.includes('BitVoyWallet')) {
            console.error('Wallet system initialization failed');
            showLoadingError('Wallet initialization failed. Please try again.');
        } else if (errorMessage.includes('JWT')) {
            console.error('JWT authentication system failed');
            showLoadingError('JWT authentication failed. Guardian Node features may be limited.');
        }
    }
});

// Show loading error function
function showLoadingError(message) {
    const loadingScreen = document.getElementById('mpc-loading');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div style="text-align: center; color: #ff6b6b;">
                <div style="margin-bottom: 20px;">❌ Initialization Failed</div>
                <div style="font-size: 14px; opacity: 0.8;">${message}</div>
                <div style="margin-top: 20px;">
                    <button onclick="location.reload()" style="padding: 10px 20px; background: #4ECDC4; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }
}

// Show loading warning function
function showLoadingWarning(message) {
    const loadingScreen = document.getElementById('mpc-loading');
    if (loadingScreen) {
        loadingScreen.innerHTML = `
            <div style="text-align: center; color: #FFC107;">
                <div style="margin-bottom: 20px;">⚠️ Performance Notice</div>
                <div style="font-size: 14px; opacity: 0.8;">${message}</div>
                <div style="margin-top: 20px;">
                    <button onclick="document.getElementById('mpc-loading').style.display='none'" style="padding: 10px 20px; background: #4ECDC4; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Continue
                    </button>
                </div>
            </div>
        `;
        
        // 5秒後に自動的に閉じる
        setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
        }, 5000);
    }
}

// BitVoyシステム初期化
function initializeBitVoySystem() {
    console.log('Initializing BitVoy MPC Unified Architecture v3.0 with FROST WASM');
    
    // Check if all required classes are available
    const requiredClasses = ['BitVoyStorage', 'BitVoyMPC', 'BitVoyWallet', 'BitVoy'];
    const missingClasses = requiredClasses.filter(className => !window[className]);
    
    if (missingClasses.length > 0) {
        console.warn('Some required classes are not yet available:', missingClasses);
        console.log('⏳ Waiting for frost-wasm-init.js to complete loading...');
        
        // frost-wasm-init.jsの読み込み完了を待つ
        setTimeout(() => {
            const stillMissing = requiredClasses.filter(className => !window[className]);
            if (stillMissing.length > 0) {
                console.error('Still missing required classes after wait:', stillMissing);
                showLoadingError(`Missing components: ${stillMissing.join(', ')}`);
            } else {
                console.log('✅ All required classes are now available');
                completeBitVoySystemInitialization();
            }
        }, 1000);
        
        return;
    }

    completeBitVoySystemInitialization();
}

// システム初期化完了処理
function completeBitVoySystemInitialization() {
    // システム初期化完了フラグを設定
    window.BitVoyInitializationState.systemReady = true;
    
    console.log('BitVoy MPC Unified Architecture with FROST WASM loaded successfully');
    console.log('Guardian Node Features: JWT-only authentication, powered by frost_wasm');
}

// Initialize global classes but let app-mpc.js handle button events
document.addEventListener('DOMContentLoaded', function() {
    // 初期化チェックは bitvoy_libraries_ready イベントで処理
    console.log('DOM loaded, waiting for FROST WASM and BitVoy libraries...');
});

// Additional debugging information (optional config)
if (typeof BitVoyConfig !== 'undefined' && BitVoyConfig.debug && BitVoyConfig.debug.enabled) {
    console.log('BitVoy MPC Debug Mode Enabled');
    console.log('Environment:', BitVoyConfig.environment);
    console.log('Features:', BitVoyConfig.features);
    console.log('FROST WASM: Enabled');
    console.log('JWT Authentication: Enabled for Guardian Nodes');
} else {
    console.log('BitVoy MPC running in production mode with FROST WASM and JWT authentication');
} 