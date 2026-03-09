//
// coins.js for coins.html
// coins-libs.jsから独立したライブラリ関数を使用
//

// coins-libs.jsからグローバル変数と関数を参照
// coins-libs.jsが読み込まれていない場合は、後方互換性のためにローカル定義を使用
var products = window.products || (window.CoinsLibs && window.CoinsLibs.products);
var contracts = window.contracts || (window.CoinsLibs && window.CoinsLibs.contracts);

// coins-libs.jsでグローバル関数として定義されているため、再宣言は不要
// 直接使用するか、window.CoinsLibs経由でアクセス
// 以下の関数は coins-libs.js でグローバル関数として定義済み:
// - getStandardCoinsForUI, getCurrentNetwork, getWalletKeyPrefix, getWalletAddress,
//   setWalletAddress, getCoinIcon, getDisplayName, getNativeCoinForToken, digits,
//   getUSDValue, proxyRequest
// - getBTCBalance, getETHBalance, getPOLBalance, getSOLBalance, getSPLBalance,
//   getJettonBalance, getERC20Balance, getTONBalance
// - getTransactionHistory, getBitcoinTransactionHistory,
//   getEthereumTransactionHistory, getPolygonTransactionHistory, getSolanaTransactionHistory,
//   getTONTransactionHistory, getEthereumTokenTransactionHistory, getPolygonTokenTransactionHistory
// - getNetworkFromProductId, getCoinType, getTokenType, getERC20TokenContractAddress,
//   getPolygonTokenContractAddress, calculateSolanaATA, calculateTONJettonAddress,
//   calculateTokenAddress

// BitVoyクラスが利用可能になるまで待機
let coinsBitvoyMPC;
let coinsBitvoywallet;
let coinsMasterId;
var coinsCoinType = 0;	//0:BTC, 60:ETH, 607:TON

// 後方互換性のため、ローカル定義を保持（coins-libs.jsが読み込まれていない場合）
if (!products) {
	var products = {
	// =========================
	// メインネット - ネイティブコイン
	// =========================
	'BTC'        : {'symbol':'BTC',  'chain':'bitcoin',  'decimal':8,  'cointype':'0',    'tokentype':'',   'name':'Bitcoin (BTC)'},
	'ETH'        : {'symbol':'ETH',  'chain':'ethereum', 'decimal':18, 'cointype':'60',   'tokentype':'',   'name':'Ethereum (ETH)'},
	'POL'        : {'symbol':'POL',  'chain':'polygon',  'decimal':18, 'cointype':'137',  'tokentype':'',   'name':'Polygon (POL)'},
	'SOL'        : {'symbol':'SOL',  'chain':'solana',   'decimal':9,  'cointype':'501',  'tokentype':'',   'name':'Solana (SOL)'},
	'TON'        : {'symbol':'TON',  'chain':'ton',      'decimal':9,  'cointype':'607',  'tokentype':'',   'name':'Toncoin (TON)'},
	'BNB'        : {'symbol':'BNB',  'chain':'bsc',      'decimal':18, 'cointype':'56',   'tokentype':'',   'name':'BNB (BNB Smart Chain)'},
	'AVAX'       : {'symbol':'AVAX', 'chain':'avalanche','decimal':18, 'cointype':'43114','tokentype':'',   'name':'Avalanche (AVAX)'},
	'TRX'        : {'symbol':'TRX',  'chain':'tron',     'decimal':6,  'cointype':'195',  'tokentype':'',   'name':'TRON (TRX)'},

	// =========================
	// メインネット - USD Stablecoin (USDC)
	// =========================
	'USDC_ERC20' : {'symbol':'USDC','chain':'ethereum', 'decimal':6, 'cointype':'60',    'tokentype':'ERC20','name':'USD Coin (USDC - Ethereum)'},
	'USDC_POL'   : {'symbol':'USDC','chain':'polygon',  'decimal':6, 'cointype':'137',   'tokentype':'ERC20','name':'USD Coin (USDC - Polygon)'},
	'USDC_ARB'   : {'symbol':'USDC','chain':'arbitrum', 'decimal':6, 'cointype':'42161', 'tokentype':'ERC20','name':'USD Coin (USDC - Arbitrum)'},
	'USDC_BASE'  : {'symbol':'USDC','chain':'base',     'decimal':6, 'cointype':'8453',  'tokentype':'ERC20','name':'USD Coin (USDC - Base)'},
	'USDC_OPT'   : {'symbol':'USDC','chain':'optimism', 'decimal':6, 'cointype':'10',    'tokentype':'ERC20','name':'USD Coin (USDC - Optimism)'},
	'USDC_AVAX'  : {'symbol':'USDC','chain':'avalanche','decimal':6, 'cointype':'43114', 'tokentype':'ERC20','name':'USD Coin (USDC - Avalanche)'},
	'USDC_SOL'   : {'symbol':'USDC','chain':'solana',   'decimal':6, 'cointype':'501',   'tokentype':'SPL',  'name':'USD Coin (USDC - Solana)'},

	// =========================
	// メインネット - USD Stablecoin (USDT)
	// =========================
	'USDT_ERC20' : {'symbol':'USDT','chain':'ethereum', 'decimal':6,  'cointype':'60',    'tokentype':'ERC20','name':'Tether (USDT - Ethereum)'},
	'USDT_POL'   : {'symbol':'USDT','chain':'polygon',  'decimal':6,  'cointype':'137',   'tokentype':'ERC20','name':'Tether (USDT - Polygon)'},
	'USDT_SOL'   : {'symbol':'USDT','chain':'solana',   'decimal':6,  'cointype':'501',   'tokentype':'SPL',  'name':'Tether (USDT - Solana)'},
	'USDT_TON'   : {'symbol':'USDT','chain':'ton',      'decimal':9,  'cointype':'607',   'tokentype':'Jetton','name':'Tether (USDT - TON)'},
	'USDT_AVAX'  : {'symbol':'USDT','chain':'avalanche','decimal':6,  'cointype':'43114', 'tokentype':'ERC20','name':'Tether (USDT - Avalanche)'},
	'USDT_ARB'   : {'symbol':'USDT','chain':'arbitrum', 'decimal':6,  'cointype':'42161', 'tokentype':'ERC20','name':'Tether (USDT - Arbitrum)'},
	'USDT_BNB'   : {'symbol':'USDT','chain':'bsc',      'decimal':18, 'cointype':'56',    'tokentype':'ERC20','name':'Tether (USDT - BNB Chain)'},
	'USDT_TRON'  : {'symbol':'USDT','chain':'tron',     'decimal':6,  'cointype':'195',   'tokentype':'TRC20','name':'Tether (USDT - TRON)'},
	
	// =========================
	// メインネット - JPY Stablecoin (JPYC)
	// =========================
	'JPYC_ERC20' : {'symbol':'JPYC','chain':'ethereum','decimal':18,'cointype':'60',    'tokentype':'ERC20','name':'JPY Coin (JPYC - Ethereum)'},
	'JPYC_POL'   : {'symbol':'JPYC','chain':'polygon', 'decimal':18,'cointype':'137',   'tokentype':'ERC20','name':'JPY Coin (JPYC - Polygon)'},
	'JPYC_AVAX'  : {'symbol':'JPYC','chain':'avalanche','decimal':18,'cointype':'43114', 'tokentype':'ERC20','name':'JPY Coin (JPYC - Avalanche)'},

	// =========================
	// メインネット - Solana SPL トークン
	// =========================
	'JUP_SOL'    : {'symbol':'JUP', 'chain':'solana','decimal':6,'cointype':'501','tokentype':'SPL','name':'Jupiter (JUP - Solana)'},
	'BONK_SOL'   : {'symbol':'BONK','chain':'solana','decimal':5,'cointype':'501','tokentype':'SPL','name':'BONK (BONK - Solana)'},
	'WIF_SOL'    : {'symbol':'WIF', 'chain':'solana','decimal':6,'cointype':'501','tokentype':'SPL','name':'dogwifhat (WIF - Solana)'},
	'PYTH_SOL'   : {'symbol':'PYTH','chain':'solana','decimal':6,'cointype':'501','tokentype':'SPL','name':'Pyth Network (PYTH - Solana)'},
	'RNDR_SOL'   : {'symbol':'RNDR','chain':'solana','decimal':6,'cointype':'501','tokentype':'SPL','name':'Render (RNDR - Solana)'},

	// =========================
	// メインネット - DeFi / L2 トークン (EVM)
	// =========================
	'LINK_ERC20' : {'symbol':'LINK','chain':'ethereum','decimal':18,'cointype':'60',   'tokentype':'ERC20','name':'ChainLink (LINK - Ethereum)'},
	'ONDO_ERC20' : {'symbol':'ONDO','chain':'ethereum','decimal':18,'cointype':'60',   'tokentype':'ERC20','name':'Ondo Finance (ONDO - Ethereum)'},
	'UNI_ERC20'  : {'symbol':'UNI', 'chain':'ethereum','decimal':18,'cointype':'60',   'tokentype':'ERC20','name':'Uniswap (UNI - Ethereum)'},
	'AAVE_ERC20' : {'symbol':'AAVE','chain':'ethereum','decimal':18,'cointype':'60',   'tokentype':'ERC20','name':'Aave (AAVE - Ethereum)'},
	'AAVE_POL'   : {'symbol':'AAVE','chain':'polygon', 'decimal':18,'cointype':'137',  'tokentype':'ERC20','name':'Aave (AAVE - Polygon)'},
	'ARB_ARB'    : {'symbol':'ARB', 'chain':'arbitrum','decimal':18,'cointype':'42161','tokentype':'ERC20','name':'Arbitrum (ARB - Arbitrum)'},
	'OP_OPT'     : {'symbol':'OP',  'chain':'optimism','decimal':18,'cointype':'10',   'tokentype':'ERC20','name':'Optimism (OP - Optimism)'},

	// =========================
	// メインネット - Wrapped
	// =========================
	'WETH_ERC20' : {'symbol':'WETH','chain':'ethereum','decimal':18,'cointype':'60','tokentype':'ERC20','name':'Wrapped ETH (WETH - Ethereum)'},
	'WBTC_ERC20' : {'symbol':'WBTC','chain':'ethereum','decimal':8, 'cointype':'60','tokentype':'ERC20','name':'Wrapped BTC (WBTC - Ethereum)'},

	// =========================
	// メインネット - Gold-backed Tokens
	// =========================
	'XAUT_ERC20' : {'symbol':'XAUT','chain':'ethereum','decimal':6, 'cointype':'60','tokentype':'ERC20','name':'Tether Gold (XAUT - Ethereum)'},
	'PAXG_ERC20' : {'symbol':'PAXG','chain':'ethereum','decimal':18,'cointype':'60','tokentype':'ERC20','name':'PAX Gold (PAXG - Ethereum)'}
};

}

if (!contracts) {
	var contracts = {
	/* USDT */
	'USDT_ERC20' : "0xdAC17F958D2ee523a2206206994597C13D831ec7",     // Ethereum
	'USDT_POL'   : "0x3A3DF212b7AaE3a604E0Fe2d55b2bE59dE6dC507",     // Polygon
	'USDT_SOL'   : "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",   // Solana mint
	'USDT_TRON'  : "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj",             // TRON TRC20
	'USDT_AVAX'  : "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",     // Avalanche (USDt)
	'USDT_ARB'   : "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",     // Arbitrum
	'USDT_BNB'   : "0x55d398326f99059fF775485246999027B3197955",     // BNB Chain
	'USDT_TON'   : "EQCtd_ukQLYfB8AYx5-5MoE2tKfq2J3GdP5uHi7C7_Yd4_K7", // TON Jetton
	
	/* USDC */
	'USDC_ERC20' : "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",     // Ethereum
	'USDC_POL'   : "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",     // Polygon
	'USDC_ARB'   : "0xaf88d065e77c8C2239327C5EDb3A432268e5831",      // Arbitrum
	'USDC_BASE'  : "0xd9dAAfFa56E3fFd202dc58686e0dca263F725c3E",     // Base
	'USDC_OPT'   : "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",     // Optimism
	'USDC_AVAX'  : "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",     // Avalanche
	'USDC_SOL'   : "EPjFWdd5AufqSSqeM2qKxekfWRaT8YpuKwhRrbGMF6A",    // Solana mint

	/* JPYC */
	'JPYC_ERC20' : "0x2370f9d504c7a6e775bf6e14b3f12846b594cdae",     // Ethereum
	'JPYC_POL'   : "0x6AE7Dfc73E0dDE2aa99ac063DcF7e8A63265108c",     // Polygon
	'JPYC_AVAX'  : "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29",     // Avalanche (JPY Coin)

	/* Solana トークン (SPL mint) */
	'JUP_SOL'    : "JUP4Fb2cqiRUcaTHdrPC8hE88yFGkPjCZt21ywZQp",
	'BONK_SOL'   : "DezXAZ8z7PnrnDJcP6afpR7iCxo4gR7Mt2s7wNzbmV3C",
	'WIF_SOL'    : "WifcZ4a9u9bqRKuHz69sV3YxAakzgN26kSc1wh2WxVC",
	'PYTH_SOL'   : "PythnC7A6kWQWNrvdFMPcpzkWG7LEMLbP7DyFDn6KQp",
	'RNDR_SOL'   : "RNDR5w3wPPE8kBrYqMMR8LWYhFfHVfJESsNoYt7WTii",

	/* EVM DeFi / L2 */
	'LINK_ERC20' : "0x514910771AF9Ca656af840dff83E8264EcF986CA",
	'ONDO_ERC20' : "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3",     // Ondo Finance (Ethereum)
	'UNI_ERC20'  : "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
	'AAVE_ERC20' : "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
	'AAVE_POL'   : "0xdFa03049570Ad8AbAd33d3e4FfB58830d3D9b697",
	'ARB_ARB'    : "0x912CE59144191C1204E64559FE8253a0e49E6548",
	'OP_OPT'     : "0x4200000000000000000000000000000000000042",

	/* Wrapped */
	'WETH_ERC20' : "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2",
	'WBTC_ERC20' : "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",

	/* Gold-backed Tokens */
	'XAUT_ERC20' : "0x68749665FF8D2d112Fa859AA293F07A622782F38",     // Tether Gold (Ethereum)
	'PAXG_ERC20' : "0x45804880De22913dAFE09f4980848ECE6EcbAf78"      // PAX Gold (Ethereum)
};

}

// 関数定義はcoins-libs.jsから取得（上記のconst定義で既に参照済み）

var coinsFromAddress;
var coinsToAddress;
var coinsAmount;
var coinsFee;
var coinsFeeLevel;
var coinsWalletId;
// var coinsDerivepath; // HDWallet廃止により削除
var coinsAddressindex;
var coinsQrcode;

// 初期化フラグ
let coinsPageInitialized = false;
let coinsPageInitializing = false; // 初期化中フラグ（同時実行を防ぐ）

/**
 * 必要なライブラリが利用可能かチェック
 */
function coinsAreLibrariesReady() {
    return typeof BitVoy !== 'undefined' && typeof BitVoyWallet !== 'undefined';
}

/**
 * 共通の初期化トリガー関数（重複実行を防ぐ）
 * @param {string} source - 呼び出し元の識別子（ログ用）
 */
async function triggerCoinsPageInitialization(source) {
    // 既に初期化済みまたは初期化中の場合はスキップ
    if (coinsPageInitialized || coinsPageInitializing) {
        console.log(`⚠️ coins.js initialization skipped (${source}): already initialized or initializing`);
        return;
    }
    
    // 必要なライブラリが利用可能かチェック
    if (!coinsAreLibrariesReady()) {
        console.log(`⏳ coins.js initialization deferred (${source}): libraries not ready yet`);
        return;
    }
    
    // 初期化を開始
    console.log(`🚀 Starting coins.js initialization (${source})...`);
    coinsPageInitializing = true;
    try {
    await initializeCoinsPage();
        coinsPageInitialized = true;
        // グローバルスコープにも公開（app-spa.jsから参照される）
        window.coinsPageInitialized = true;
        console.log(`✅ coins.js initialization completed (${source})`);
    } catch (error) {
        console.error(`❌ coins.js initialization failed (${source}):`, error);
        // エラーが発生してもフラグをリセットして再試行可能にする
        coinsPageInitialized = false;
        window.coinsPageInitialized = false;
    } finally {
        coinsPageInitializing = false;
    }
}

console.log('🔧 coins.js loaded, setting up event listeners...');
console.log('🔧 coins.js script execution started at:', new Date().toISOString());

// ライブラリが準備できた時に初期化を試行（SPAではapp-spa.jsが#coins表示時に呼び出す）
document.addEventListener("bitvoy_libraries_ready", () => triggerCoinsPageInitialization('bitvoy_libraries_ready'));

// グローバルスコープで手動初期化を可能にする（app-spa.jsから呼び出される）
window.checkCoinsPageInitialization = function() {
    triggerCoinsPageInitialization('manual');
};

/**
 * ネットワークセレクターの初期化
 * 注意: #mysetup-page以外では、#network-selectorを参照せず、SessionStorageのmpc.current_networkを直接使用
 */
function initializeCoinsNetworkSelector() {
    // 現在のネットワークをセッションストレージから取得
    const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
    console.log('🔧 Network initialized from session storage:', currentNetwork);

    // 初期表示時に通貨一覧を更新
    coinsUpdateCoinListForNetwork(currentNetwork);
}

/**
 * ネットワーク別の通貨一覧を更新
 */
function coinsUpdateCoinListForNetwork(networkType) {
    // 現状、coinsViewCoin() がネットワークに応じてリストを再構築するため、
    // ここではデバッグログのみ出力する（将来、ネットワーク別表示制御を追加する場合はこの関数を拡張）
    console.log('🔄 coinsUpdateCoinListForNetwork called (no-op for now):', networkType);
}

async function initializeCoinsPage() {
    try {
        console.log('🔧 initializeCoinsPage() called - starting BitVoy coins initialization...');
        
        // i18nextが初期化されるまで待つ
        // window.i18nextInitialized フラグまたは i18next.isInitialized/i18next.language をチェック
        const isI18nReady = (window.i18nextInitialized === true) ||
                           (typeof i18next !== 'undefined' && 
                            (i18next.isInitialized || i18next.language));
        
        if (isI18nReady) {
            // 既に初期化されている場合は即座に適用
            if (window.applyI18n) {
                window.applyI18n();
            }
        } else {
            // i18nextが初期化されるまで待つ（最大5秒）
            // イベントリスナーを設定して初期化完了を待つ
            let waitCount = 0;
            const maxWait = 50; // 5秒
            
            // イベントベースの待機（より確実）
            const initPromise = new Promise((resolve) => {
                if (typeof CustomEvent !== 'undefined') {
                    const handler = function() {
                        document.removeEventListener('i18nextInitialized', handler);
                        resolve(true);
                    };
                    document.addEventListener('i18nextInitialized', handler);
                } else {
                    resolve(false);
                }
            });
            
            // ポーリングベースの待機（フォールバック）
            while (waitCount < maxWait) {
                if (window.i18nextInitialized === true ||
                    (typeof i18next !== 'undefined' && 
                     (i18next.isInitialized || i18next.language))) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            // 初期化後に翻訳を適用
            if (window.i18nextInitialized === true ||
                (typeof i18next !== 'undefined' && 
                 (i18next.isInitialized || i18next.language))) {
                if (window.applyI18n) {
                    window.applyI18n();
                }
            } else {
                console.warn('⚠️ i18next did not initialize within timeout period');
            }
        }
        
        // ネットワークセレクターの初期化
        initializeCoinsNetworkSelector();
        
        // デバッグ: BitVoyConfigの状態確認
        console.log('=== BitVoyConfig Debug Info ===');
        console.log('typeof BitVoyConfig:', typeof BitVoyConfig);
        console.log('window.BitVoyConfig:', window.BitVoyConfig);
        console.log('BitVoyConfig:', BitVoyConfig);
        if (typeof BitVoyConfig !== 'undefined') {
        }
        console.log('===============================');

        // Check Passkey support
        if (!window.PublicKeyCredential) {
            alert("Error: this browser does not support Passkey, which is required for MPC wallets");
            return;
        }

        // Check required libraries (統一されたクラス名で確認)
        // 注意: window.BitVoyMPCはBitVoyクラスの内部実装のため、直接チェック不要
        console.log('=== Library Availability Check ===');
        console.log('window.BitVoyWallet:', typeof window.BitVoyWallet);
        console.log('window.BitVoy:', typeof window.BitVoy);
        console.log('window.BitVoyStorage:', typeof window.BitVoyStorage);
        console.log('window.MPCAddressGenerator:', typeof window.MPCAddressGenerator);
        console.log('window.bitvoyMPC:', typeof window.bitvoyMPC);
        console.log('==================================');
        
        // より詳細なライブラリチェック
        // window.BitVoyMPCはBitVoyクラスの内部実装のため、チェック不要
        const requiredLibraries = [
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
            const maxRetries = 15; // 最大15回リトライ
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
            const errorMessage = `Required MPC libraries not loaded: ${missingLibraries.join(', ')}\n\nAvailable: ${availableLibraries.join(', ')}\n\nPlease refresh the page and try again.`;
            alert(errorMessage);
            return;
        }

        console.log('🔧 All libraries available, using window.bitvoyMPC...');
        
        // window.bitvoyMPCを使用（app-spa.jsで既に初期化済み）
        // app-spa.jsの初期化が完了するまで待機
        let retryCount = 0;
        const maxRetries = 30; // 最大30回リトライ（6秒）
        const retryInterval = 200; // 200ms間隔
        
        while (!window.bitvoyMPC && retryCount < maxRetries) {
            console.log(`⏳ Waiting for window.bitvoyMPC... (${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryInterval));
            retryCount++;
        }
        
        if (!window.bitvoyMPC) {
            throw new Error('window.bitvoyMPC is not available. Please ensure app-spa.js is loaded and initialized.');
        }
        
        console.log('✅ window.bitvoyMPC is now available');
        coinsBitvoyMPC = window.bitvoyMPC; // window.bitvoyMPCへの参照
        
            		// 現在のネットワークを取得
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		console.log('Initializing BitVoyWallet with network:', currentNetwork);
        if (!window.BitVoyWallet) {
            throw new Error('window.BitVoyWallet is not available. Please ensure BitVoyWallet.js is loaded.');
        }
        coinsBitvoywallet = new window.BitVoyWallet(null, currentNetwork);
        console.log('✅ BitVoyWallet instance created successfully');
        
        // MasterIdを取得
        coinsMasterId = window.bitvoyMPC.getMasterId();
        window.coinsMasterId = coinsMasterId; // グローバルスコープでも公開（app-spa.jsから参照可能にする）
        console.log('🔧 MasterId:', coinsMasterId);

    if(!window.bitvoyMPC.isSignin()) {
            console.log('🔧 User not logged in, redirecting...');
        location.href = location.protocol + '//' + location.host;
        return;
    }

        console.log('🔧 User is logged in, setting up event listeners...');
        
        // イベントリスナーを設定
        coinsSetupEventListeners();

        // カスタムトークンを読み込み
        await loadCustomTokens();

        console.log('🔧 Starting initial view...');
        
        // 初期表示
        coinsViewCoin();
        
        console.log('✅ coins.js initialization completed');
    } catch (error) {
        console.error('❌ Error during initializeCoinsPage:', error);
        console.error('❌ Error stack:', error.stack);
    }
}

// getCoinIconとgetDisplayNameはcoins-libs.jsから取得（上記のconst定義で既に参照済み）

/**
 * イベントリスナーを設定
 */
function coinsSetupEventListeners() {
    // 送金通貨選択時のイベント
    const sendProductSelect = document.getElementById('send-productid');
    if (sendProductSelect) {
        sendProductSelect.addEventListener('change', () => {
            // 送金通貨が変更された際の処理を追加
            console.log('Send product changed to:', sendProductSelect.value);
        });
    }
    
    // 履歴表示のイベントリスナーを安全に設定
    coinsSetupHistoryEventListeners();
    
    // data-action属性を使用したイベントリスナーを設定
    coinsSetupDataActionEventListeners();
}

/**
 * 履歴表示のイベントリスナーを安全に設定
 */
function coinsSetupHistoryEventListeners() {
    // 現在の通貨一覧（products）に基づいて履歴要素を動的に生成
    const currentNetworkCoins = getStandardCoinsForUI();
    console.log(`🔧 Setting up history event listeners for coins:`, currentNetworkCoins);
    
    // タブ構造に対応：3つのコインリストを確認
    const coinListCoins = document.getElementById('coin-list-coins');
    const coinListGold = document.getElementById('coin-list-gold');
    const coinListRwa = document.getElementById('coin-list-rwa');
    
    // いずれかのコインリストが存在するか確認
    const hasCoinRows = (coinListCoins && coinListCoins.children.length > 0) ||
                        (coinListGold && coinListGold.children.length > 0) ||
                        (coinListRwa && coinListRwa.children.length > 0);
    
    if (!hasCoinRows) {
        console.log('🔍 No coin rows present yet, skipping history listener setup');
        return;
    }
    
    const standardHistoryElements = currentNetworkCoins.map(productId => ({
        id: `gohistory_${productId}`,
        action: () => coinsViewHistory(productId)
    }));
    
    // カスタムトークンの履歴要素を動的に追加
    const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
    const customHistoryElements = customTokens.map(token => ({
        id: `gohistory_${token.productId}`,
        action: () => coinsViewHistory(token.productId)
    }));
    
    // すべての履歴要素を結合
    const allHistoryElements = [...standardHistoryElements, ...customHistoryElements];
    
    allHistoryElements.forEach(({ id, action }) => {
        const element = document.getElementById(id);
        if (element) {
            element.onclick = action;
            console.log(`✅ Event listener set for ${id}`);
        } else {
            // 初期化タイミングによっては存在しないことがあるため、debugログのみにする
            console.debug(`🔍 Element with id '${id}' not found (may not be created yet)`);
        }
    });
    
    console.log(`📊 Total event listeners set: ${allHistoryElements.length}`);
}

/**
 * 全通貨の残高を更新
 */
async function coinsUpdateAllBalances() {
    try {
        // 表示対象の通貨一覧（現在は products 全体）
        const standardCoins = getStandardCoinsForUI();
        console.log(`🔄 Updating balances for coins:`, standardCoins);
        
        // カスタムトークンを取得
        const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
        const customProductIds = customTokens.map(token => token.productId);
        
        // すべての通貨を結合
        const allCoins = [...standardCoins, ...customProductIds];
        
        for (const productId of allCoins) {
            const address = getWalletAddress(productId);
            const amountId = "amount_"+productId;
            const coinName = products[productId] ? products[productId].symbol : 
                           customTokens.find(t => t.productId === productId)?.symbol || productId;
            
            // アドレスが存在する場合のみ残高を更新
            if (address) {
                await coinsUpdateBalance(productId, amountId, coinName);
            }
        }
        
        // 総残高も更新
        coinsUpdateTotalBalance();
        
    } catch (error) {
        console.error('Failed to update all balances:', error);
    }
}

/**
 * 総残高を更新
 */
async function coinsUpdateTotalBalance() {
    try {
        let totalUSD = 0;
        // 総残高計算対象の通貨一覧（現在は products 全体）
        const standardCoins = getStandardCoinsForUI();
        console.log(`💰 Calculating total balance for coins:`, standardCoins);
        
        // カスタムトークンを取得
        const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
        const customProductIds = customTokens.map(token => token.productId);
        
        // すべての通貨を結合
        const allCoins = [...standardCoins, ...customProductIds];
        
        for (const productId of allCoins) {
            const address = getWalletAddress(productId);
            
            // アドレスが存在する場合のみ残高を計算
            if (address) {
                try {
                    let balance = 0;
                    
                    // 標準通貨の処理
                    if (standardCoins.includes(productId)) {
                        switch(productId) {
                            case 'BTC':
                                balance = await getBTCBalance(address);
                                break;
                            case 'ETH':
                                balance = await getETHBalance(address);
                                break;
                            case 'POL':
                                balance = await getPOLBalance(address);
                                break;
                            case 'SOL':
                                balance = await getSOLBalance(address);
                                break;
                            case 'TON':
                                balance = await getTONBalance(address);
                                break;
							case 'AVAX':
                                balance = await getAVAXBalance(address);
                                break;
                            case 'JPYC_POL': {
                                const contractAddr = contracts[productId];
                                if (contractAddr) {
                                    balance = await getERC20Balance(address, contractAddr, 'polygon');
                                }
                                break;
                            }
                            case 'JPYC_AVAX':
                            case 'USDC_AVAX':
                            case 'USDT_AVAX': {
                                const contractAddr = contracts[productId];
                                if (contractAddr) {
                                    balance = await getERC20Balance(address, contractAddr, 'avalanche');
                                }
                                break;
                            }
                            case 'USDT_ERC20': {
                                const contractAddr = contracts[productId];
                                if (contractAddr) {
                                    balance = await getERC20Balance(address, contractAddr, 'ethereum');
                                }
                                break;
                            }
                            case 'BVT_SOL':
                                const bvtSplTokenMintAddress = products[productId].mintaddr;
                                balance = await getSPLBalance(address, bvtSplTokenMintAddress);
                                break;
                            case 'BVT_TON':
                                balance = await getJettonBalance(address);
                                break;
                            case 'BVT_ERC20':
                                balance = await getERC20Balance(address, '0xBVT1111111111111111111111111111111111111111');
                                break;
                            case 'BVT_POL':
                                balance = await getERC20Balance(address, '0xBVT111111111111111111111111111111111111111111');
                                break;
                            case 'USDT_SOL':
                                const splTokenMintAddress = products[productId].mintaddr;
                                balance = await getSPLBalance(address, splTokenMintAddress);
                                break;
                            case 'USDT_TON':
                                balance = await getJettonBalance(address);
                                break;
                        }
                    } else {
                        // カスタムトークンの処理
                        const customToken = customTokens.find(t => t.productId === productId);
                        if (customToken) {
                            switch(customToken.network) {
                                case 'ethereum':
                                case 'polygon':
                                case 'bsc':
                                case 'avalanche':
                                case 'arbitrum':
                                case 'base':
                                case 'optimism':
                                    balance = await getERC20Balance(address, customToken.contractAddress);
                                    break;
                                case 'solana':
                                    balance = await getSPLBalance(address, customToken.contractAddress);
                                    break;
                                case 'ton':
                                    balance = await getJettonBalance(address);
                                    break;
                            }
                        }
                    }
                    
                    const symbol = products[productId] ? products[productId].symbol : 
                                 customTokens.find(t => t.productId === productId)?.symbol || productId;
                    const usdValue = await getUSDValue(symbol, balance);
                    totalUSD += usdValue;
                    
                } catch (error) {
                    console.warn(`Failed to get balance for ${productId}:`, error);
                }
            }
        }
        
        // 総残高を表示
        const totalElement = document.querySelector('h1');
        if (totalElement) {
            // 常に小数点以下2桁で表示
            const formattedTotal = totalUSD.toFixed(2);
            totalElement.innerHTML = `$${formattedTotal}`;
        }
        
    } catch (error) {
        console.error('Failed to update total balance:', error);
    }
}

addEventListener("popstate", function coinsPagePopState(event) {
	console.log("location: " + document.location + ", state: " + JSON.stringify(event.state));
	var urlHash = location.hash;
	console.log("urlHash: " + urlHash);

	// coins.htmlの要素が存在する場合のみ処理
	if (!document.getElementById('coin-list') && !document.getElementById('viewCoin')) {
		return;
	}

	// SPAコンテキスト（index.html）では、#coinsページ内のハッシュのみ処理
	// 独立したcoins.htmlページとして動作する場合のみ処理
	if (window.location.pathname !== '/coins.html' && !window.location.pathname.endsWith('coins.html')) {
		// SPAコンテキストでは、#coinsページが表示されている場合のみ処理
		if (urlHash !== '#coins' && !urlHash.startsWith('#coins')) {
			return;
		}
		// #coinsページ内のハッシュを処理（例: #coins#viewCoin）
		const innerHash = urlHash.replace('#coins', '');
		if (innerHash) {
			if(innerHash == '#viewCoin') {
				coinsViewCoin();
			} else if(innerHash == '#viewHistory') {
				const state = JSON.stringify(event.state);
				coinsViewHistory(state.productId);
			} else if(innerHash == '#viewSend') {
				coinsViewSend(true);
			} else if(innerHash == '#viewReader') {
				coinsViewReader();
			}
		}
		return;
	}

	// 独立したcoins.htmlページとして動作する場合
	let state = JSON.stringify(event.state);
	if(urlHash == '#viewCoin') {
		coinsViewCoin();
	} else if(urlHash == '#viewHistory') {
		coinsViewHistory(state.productId);
	} else if(urlHash == '#viewSend') {
		coinsViewSend(true);
	} else if(urlHash == '#viewReader') {
		coinsViewReader();
	}
});

// 受信通貨選択時のイベントリスナー
const recvProductSelect = document.getElementById('recv-productid');
if (recvProductSelect) {
    recvProductSelect.addEventListener('change', (event) => {
	let productId = event.target.value;
	coinsShowQR(productId);
});
}

function coinsShowQR(productId) {
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
	
	document.querySelector('#recv-address').value = address;
	if (coinsQrcode) {
	coinsQrcode.clear();
	coinsQrcode.makeCode(address);
	}
}

function coinsCloseView() {
	document.querySelector('#viewIcon').hidden = true;
	document.querySelector('#viewCoin').hidden = true;
	document.querySelector('#viewHistory').hidden = true;
	document.querySelector('#viewCoinSelect').hidden = true;
	document.querySelector('#viewSend').hidden = true;
	document.querySelector('#viewReader').hidden = true;
	document.querySelector('#viewSendConfirm').hidden = true;
	document.querySelector('#viewReceive').hidden = true;
	document.querySelector('#viewAddToken').hidden = true;
}

async function coinsViewCoin() {
	// SPAコンテキストではURLを変更しない（#coinsページ内のビュー切り替えのみ）
	// 独立したcoins.htmlページとして動作する場合のみURLを変更
	if (window.location.pathname === '/coins.html' || window.location.pathname.endsWith('coins.html')) {
	history.pushState({ 'productId': null}, '', '#viewCoin');
	}
	
	// #coins-pageが表示されていることを確認
	const coinsPage = document.getElementById('coins-page');
	if (coinsPage && coinsPage.style.display === 'none') {
		console.log('⚠️ coins-page is hidden, showing it...');
		coinsPage.style.display = 'block';
		// 翻訳を再適用（#coins-pageが非表示だったため、翻訳が適用されていない可能性がある）
		if (typeof window.applyI18n === 'function') {
			console.log('🌐 Re-applying translations for #coins-page in coinsViewCoin()');
			window.applyI18n();
		}
	}
	
	// 送信途中の状態をリセット（HOMEに戻った後などに#coinsに戻った場合に対応）
	console.log('🔄 Resetting send form state...');
	
	// 送金フォームの入力値をクリア
	const sendAddressInput = document.querySelector('#send-address');
	const sendAmountInput = document.querySelector('#send-amount');
	if (sendAddressInput) {
		sendAddressInput.value = '';
	}
	if (sendAmountInput) {
		sendAmountInput.value = '';
	}
	
	// 送金関連の変数をリセット
	window.selectedCoinForSend = null;
	coinsFromAddress = null;
	coinsToAddress = null;
	coinsAmount = null;
	coinsFee = null;
	coinsWalletId = null;
	
	// 送金確認画面を非表示にする
	const viewSendConfirm = document.querySelector('#viewSendConfirm');
	if (viewSendConfirm) {
		viewSendConfirm.hidden = true;
	}
	
	coinsCloseView();
	const viewCoin = document.querySelector('#viewCoin');
	if (!viewCoin) {
		console.error('❌ Required elements not found:', { viewCoin: !!viewCoin });
		return;
	}
	
	// coinsMasterIdが設定されているか確認
	if (!coinsMasterId) {
		console.error('❌ coinsMasterId is not set, cannot display wallet list');
		alert('Wallet not initialized. Please log in first.');
		return;
	}
	
	// 一覧画面ではアイコンボタンを非表示（HTMLのデフォルトでhidden属性を設定済み）
	viewCoin.hidden = false;

	const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
	if (loadingEl) {
		loadingEl.classList.remove('hide');
	}

	try {
		console.log('🔄 Loading wallet list from sessionStorage...');
		
		// 既存のテーブル行をクリア
		const coinListCoins = document.getElementById('coin-list-coins');
		const coinListGold = document.getElementById('coin-list-gold');
		const coinListRwa = document.getElementById('coin-list-rwa');
		
		if (!coinListCoins || !coinListGold || !coinListRwa) {
			throw new Error('Coin list elements not found');
		}
		
		coinListCoins.innerHTML = '';
		coinListGold.innerHTML = '';
		coinListRwa.innerHTML = '';
		
		// SAアドレスを取得
		let saAddresses = null;
		try {
			const storage = new BitVoyStorage();
			await storage.init();
			saAddresses = await storage.getSmartAccountAddresses(coinsMasterId);

			// IndexedDBにない場合（リカバリー後など）はサーバーから取得して復元
			if (!saAddresses && coinsBitvoywallet) {
				try {
					const jwt = await coinsBitvoywallet.obtainJWT(coinsMasterId, 'blockchain_access');
					const resp = await fetch(`/walletapi/aa/smart-account/get`, {
						headers: { 'Authorization': `Bearer ${jwt}` }
					});
					if (resp.ok) {
						const data = await resp.json();
						if (data.smart_accounts && data.smart_accounts.length > 0) {
							const restored = { updatedAt: Date.now() };
							for (const sa of data.smart_accounts) {
								const key = sa.chain === 'ethereum' ? 'ethereum' : `${sa.chain}_${sa.currency}`;
								restored[key] = restored[key] || {};
								restored[key][sa.network] = sa.smart_account_address;
								restored.ownerEOA = restored.ownerEOA || sa.owner_eoa;
							}
							await storage.storeSmartAccountAddresses(coinsMasterId, restored);
							saAddresses = restored;
							console.log('✅ SA addresses restored from server after recovery:', saAddresses);
						}
					}
				} catch (fetchErr) {
					console.warn('⚠️ Failed to fetch SA addresses from server:', fetchErr);
				}
			}
		} catch (error) {
			console.warn('⚠️ Failed to get SA addresses:', error);
		}
		
		// カテゴリ別に分類する関数
		const getCoinCategory = (productId) => {
			// Goldタブ: XAUT, PAXG
			if (productId.startsWith('XAUT_') || productId.startsWith('PAXG_')) {
				return 'gold';
			}
			// RWAタブ: LINK, ONDO
			if (productId.startsWith('LINK_') || productId.startsWith('ONDO_')) {
				return 'rwa';
			}
			// その他はCoinsタブ
			return 'coins';
		};
		
		// コインを追加する関数
		const addCoinToCategory = (productId, category) => {
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
			
			const displayName = getDisplayName(productId);
			const amountId = "amount_"+productId;
			const html = `<tr id="gohistory_${productId}">
				<td><span class="coins-coin-icon">${getCoinIcon(productId)}</span> ${displayName}</td>
				<td id="${amountId}">0</td>
			</tr>`;
			
			let targetList;
			if (category === 'gold') {
				targetList = coinListGold;
			} else if (category === 'rwa') {
				targetList = coinListRwa;
			} else {
				targetList = coinListCoins;
			}
			
			targetList.insertAdjacentHTML('beforeend', html);
			
			// アドレスが存在する場合のみ残高を更新
			if (address) {
				const productInfo = products[productId];
				if (productInfo && productInfo.symbol) {
					console.log(`✅ Calling coinsUpdateBalance for ${productId} (address: ${address})`);
					coinsUpdateBalance(productId, amountId, productInfo.symbol);
				} else {
					console.warn(`⚠️ Product info not found for ${productId}, skipping balance update`, {
						productId,
						productInfo,
						availableProducts: Object.keys(products)
					});
				}
			} else {
				console.log(`⚠️ No address found for ${productId} (and no fallback available), skipping balance update`);
			}
		};
		
		// Coinsタブの場合、SAアドレスと通常アドレスを分けて表示
		if (coinListCoins) {
			// [Smart Account]セクション
			let hasSAAddresses = false;
			if (saAddresses) {
				const network = sessionStorage.getItem('mpc.current_network') || 'mainnet';
				
				// Polygon SAアドレス（USDC/JPYC別々に保存されている場合を優先）
				if (saAddresses.polygon_USDC?.[network] || saAddresses.polygon_JPYC?.[network]) {
					if (!hasSAAddresses) {
						const smartAccountText = (window.i18next && window.i18next.t) ? window.i18next.t('accountTypes.smartAccount', { ns: 'coins' }) : 'Smart Account';
						const saHeaderHtml = `<tr><td colspan="2" style="font-weight: bold; padding: 10px 0; border-top: 2px solid #ddd;">[${smartAccountText}]</td></tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHeaderHtml);
						hasSAAddresses = true;
					}
					
					if (saAddresses.polygon_USDC?.[network]) {
						const polygonSA_USDC = saAddresses.polygon_USDC[network];
						const saBalanceId = `sa_balance_USDC_POL_${network}`;
						const saHistoryId = `gohistory_sa_USDC_POL_${network}`;
						const saHtml = `<tr id="${saHistoryId}">
							<td><span class="coins-coin-icon">🔷</span> [SA] USDC (Polygon)</td>
							<td id="${saBalanceId}">0</td>
						</tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHtml);
						// 残高を更新
						coinsUpdateSABalance('USDC_POL', polygonSA_USDC, saBalanceId);
						// クリックイベントを設定
						const saRow = document.getElementById(saHistoryId);
						if (saRow) {
							saRow.style.cursor = 'pointer';
							saRow.addEventListener('click', () => {
								coinsViewSAHistory('USDC_POL', polygonSA_USDC);
							});
						}
					}
					
					if (saAddresses.polygon_JPYC?.[network]) {
						const polygonSA_JPYC = saAddresses.polygon_JPYC[network];
						const saBalanceId = `sa_balance_JPYC_POL_${network}`;
						const saHistoryId = `gohistory_sa_JPYC_POL_${network}`;
						const saHtml = `<tr id="${saHistoryId}">
							<td><span class="coins-coin-icon">🔷</span> [SA] JPYC (Polygon)</td>
							<td id="${saBalanceId}">0</td>
						</tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHtml);
						// 残高を更新
						coinsUpdateSABalance('JPYC_POL', polygonSA_JPYC, saBalanceId);
						// クリックイベントを設定
						const saRow = document.getElementById(saHistoryId);
						if (saRow) {
							saRow.style.cursor = 'pointer';
							saRow.addEventListener('click', () => {
								coinsViewSAHistory('JPYC_POL', polygonSA_JPYC);
							});
						}
					}
				}
				
				// Avalanche SAアドレス
				if (saAddresses.avalanche_USDC?.[network] || saAddresses.avalanche_JPYC?.[network]) {
					if (!hasSAAddresses) {
						const smartAccountText = (window.i18next && window.i18next.t) ? window.i18next.t('accountTypes.smartAccount', { ns: 'coins' }) : 'Smart Account';
						const saHeaderHtml = `<tr><td colspan="2" style="font-weight: bold; padding: 10px 0; border-top: 2px solid #ddd;">[${smartAccountText}]</td></tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHeaderHtml);
						hasSAAddresses = true;
					}

					if (saAddresses.avalanche_USDC?.[network]) {
						const avalancheSA_USDC = saAddresses.avalanche_USDC[network];
						const saBalanceId = `sa_balance_USDC_AVAX_${network}`;
						const saHistoryId = `gohistory_sa_USDC_AVAX_${network}`;
						const saHtml = `<tr id="${saHistoryId}">
							<td><span class="coins-coin-icon">🔺</span> [SA] USDC (Avalanche)</td>
							<td id="${saBalanceId}">0</td>
						</tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHtml);
						coinsUpdateSABalance('USDC_AVAX', avalancheSA_USDC, saBalanceId);
						const saRow = document.getElementById(saHistoryId);
						if (saRow) {
							saRow.style.cursor = 'pointer';
							saRow.addEventListener('click', () => {
								coinsViewSAHistory('USDC_AVAX', avalancheSA_USDC);
							});
						}
					}

					if (saAddresses.avalanche_JPYC?.[network]) {
						const avalancheSA_JPYC = saAddresses.avalanche_JPYC[network];
						const saBalanceId = `sa_balance_JPYC_AVAX_${network}`;
						const saHistoryId = `gohistory_sa_JPYC_AVAX_${network}`;
						const saHtml = `<tr id="${saHistoryId}">
							<td><span class="coins-coin-icon">🔺</span> [SA] JPYC (Avalanche)</td>
							<td id="${saBalanceId}">0</td>
						</tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHtml);
						coinsUpdateSABalance('JPYC_AVAX', avalancheSA_JPYC, saBalanceId);
						const saRow = document.getElementById(saHistoryId);
						if (saRow) {
							saRow.style.cursor = 'pointer';
							saRow.addEventListener('click', () => {
								coinsViewSAHistory('JPYC_AVAX', avalancheSA_JPYC);
							});
						}
					}
				}

				// Ethereum SAアドレス
				if (saAddresses.ethereum?.[network]) {
					if (!hasSAAddresses) {
						const smartAccountText = (window.i18next && window.i18next.t) ? window.i18next.t('accountTypes.smartAccount', { ns: 'coins' }) : 'Smart Account';
						const saHeaderHtml = `<tr><td colspan="2" style="font-weight: bold; padding: 10px 0; border-top: 2px solid #ddd;">[${smartAccountText}]</td></tr>`;
						coinListCoins.insertAdjacentHTML('beforeend', saHeaderHtml);
						hasSAAddresses = true;
					}
					const ethereumSA = saAddresses.ethereum[network];
					const saHtml = `<tr>
						<td><span class="coins-coin-icon">🔷</span> Ethereum SA</td>
						<td style="font-family: monospace; font-size: 0.9em;">${ethereumSA}</td>
					</tr>`;
					coinListCoins.insertAdjacentHTML('beforeend', saHtml);
				}
			}
			
			// [Normal Account]セクション
			if (hasSAAddresses) {
				const normalAccountText = (window.i18next && window.i18next.t) ? window.i18next.t('accountTypes.normalAccount', { ns: 'coins' }) : 'Normal Account';
				const normalHeaderHtml = `<tr><td colspan="2" style="font-weight: bold; padding: 10px 0; border-top: 2px solid #ddd;">[${normalAccountText}]</td></tr>`;
				coinListCoins.insertAdjacentHTML('beforeend', normalHeaderHtml);
			}
		}
		
		// 表示する通貨を決定（現在は products 全体）
		const standardCoins = getStandardCoinsForUI();
		console.log(`📋 Showing coins:`, standardCoins);
		
		standardCoins.forEach(productId => {
			const category = getCoinCategory(productId);
			addCoinToCategory(productId, category);
		});
		
		// カスタムトークンを表示
		const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
		customTokens.forEach(token => {
			const address = getWalletAddress(token.productId);
			if (address) {
				const category = getCoinCategory(token.productId);
				const displayName = getDisplayName(token.productId);
				const amountId = "amount_"+token.productId;
				const html = `<tr id="gohistory_${token.productId}">
					<td><span class="coins-coin-icon">${getCoinIcon(token.productId)}</span> ${displayName}</td>
					<td id="${amountId}">0</td>
				</tr>`;
				
				let targetList;
				if (category === 'gold') {
					targetList = coinListGold;
				} else if (category === 'rwa') {
					targetList = coinListRwa;
				} else {
					targetList = coinListCoins;
				}
				
				targetList.insertAdjacentHTML('beforeend', html);
				
				// 残高を更新
				coinsUpdateBalance(token.productId, amountId, token.symbol);
			}
		});
		
		// タブ切替機能を設定
		setupCoinsTabs();
		
		// 履歴表示のイベントリスナーを再設定
		coinsSetupHistoryEventListeners();
		
		console.log('✅ Wallet list loaded from sessionStorage');
		
	} catch (error) {
		console.error('❌ Error in coinsViewCoin:', error);
		alert("Could not be processed: " + error.message);
	} finally {
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
	}
}

/**
 * コイン一覧のタブ切替機能を設定
 */
function setupCoinsTabs() {
	const viewCoin = document.getElementById('viewCoin');
	if (!viewCoin) return;
	
	const tabs = viewCoin.querySelectorAll('.market-tab');
	const panels = viewCoin.querySelectorAll('.market-panel');
	if (!tabs.length || !panels.length) return;

	tabs.forEach(tab => {
		tab.addEventListener('click', () => {
			const targetId = tab.getAttribute('data-target');
			tabs.forEach(t => t.classList.remove('active'));
			panels.forEach(p => p.classList.remove('active'));
			tab.classList.add('active');
			panels.forEach(p => {
				if (p.id === targetId) {
					p.style.display = '';
					p.classList.add('active');
				} else {
					p.style.display = 'none';
				}
			});
			// 現在のタブをセッションストレージに保存
			sessionStorage.setItem('coins_active_tab', targetId);
		});
	});
	
	// 保存されたタブを復元
	const savedTab = sessionStorage.getItem('coins_active_tab');
	if (savedTab) {
		const savedTabElement = viewCoin.querySelector(`.market-tab[data-target="${savedTab}"]`);
		if (savedTabElement) {
			savedTabElement.click();
		}
	}
}

/**
 * 各通貨の残高を取得して表示を更新
 */
/**
 * SAアドレスの残高を更新
 * @param {string} productId - プロダクトID（USDC_POLまたはJPYC_POL）
 * @param {string} saAddress - SAアドレス
 * @param {string} amountId - 残高表示要素のID
 */
async function coinsUpdateSABalance(productId, saAddress, amountId) {
	try {
		console.log(`🔄 Updating SA balance for ${productId} at ${saAddress}...`);
		
		let balance = 0;
		let displayBalance = '0';
		
		const getERC20Balance = window.CoinsLibs?.getERC20Balance;
		const getContractAddress = window.CoinsLibs?.getContractAddress;
		
		if (!getERC20Balance || !getContractAddress) {
			console.error('Required functions not found in CoinsLibs');
			return;
		}
		
		// productId から chain を取得（USDC_AVAX → avalanche, USDC_POL → polygon）
		const productInfo = products[productId];
		const chain = productInfo?.chain || 'polygon';
		const decimals = productInfo ? productInfo.decimal : 6;
		const contractAddress = getContractAddress(productId);
		
		if (!contractAddress) {
			console.warn(`⚠️ No contract address found for ${productId}`);
			return;
		}
		
		balance = await getERC20Balance(saAddress, contractAddress, chain, decimals);
		displayBalance = digits(balance, 6);
		
		const balanceElement = document.getElementById(amountId);
		if (balanceElement) {
			balanceElement.textContent = displayBalance;
		}
		
		console.log(`✅ SA balance updated for ${productId}: ${displayBalance}`);
	} catch (error) {
		console.error(`❌ Failed to update SA balance for ${productId}:`, error);
		const balanceElement = document.getElementById(amountId);
		if (balanceElement) {
			balanceElement.textContent = '0';
		}
	}
}

async function coinsUpdateBalance(productId, amountId, coinName) {
	try {
		console.log(`🔄 Updating balance for ${productId}...`);
		
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
			console.log(`⚠️ No address found for ${productId} (and no fallback available)`);
			return;
		}
		
		console.log(`📍 Address for ${productId}: ${address}`);

		let balance = 0;
		let displayBalance = '0';
		let usdValue = 0;

		switch(productId) {
			case 'BTC':
				console.log('🪙 Getting BTC balance...');
				balance = await getBTCBalance(address);
				displayBalance = digits(balance, 8);
				// Remove any BTC suffix if it exists
				displayBalance = displayBalance.toString().replace(/\s*BTC\s*$/, '');
				usdValue = await getUSDValue('BTC', balance);
				break;
				
			case 'ETH':
				console.log('🔷 Getting ETH balance...');
				balance = await getETHBalance(address);
				displayBalance = digits(balance, 6);
				// Remove any ETH suffix if it exists
				displayBalance = displayBalance.toString().replace(/\s*ETH\s*$/, '');
				usdValue = await getUSDValue('ETH', balance);
				break;
				
			case 'POL':
				console.log('🔷 Getting POL balance...');
				console.log('🔷 POL address:', address);
				console.log('🔷 Calling getPOLBalance...');
				balance = await getPOLBalance(address);
				console.log('🔷 POL balance result:', balance);
				displayBalance = digits(balance, 6);
				// Remove any POL suffix if it exists
				displayBalance = displayBalance.toString().replace(/\s*POL\s*$/, '');
				usdValue = await getUSDValue('POL', balance);
				console.log('🔷 POL displayBalance:', displayBalance, 'USD:', usdValue);
				break;

			case 'AVAX':
				console.log('🔷 Getting AVAX balance...');
				balance = await getAVAXBalance(address);
				displayBalance = digits(balance, 6);
				displayBalance = displayBalance.toString().replace(/\s*AVAX\s*$/, '');
				usdValue = await getUSDValue('AVAX', balance);
				break;

			case 'SOL':
				console.log('☀️ Getting SOL balance...');
				balance = await getSOLBalance(address);
				displayBalance = digits(balance, 4);
				usdValue = await getUSDValue('SOL', balance);
				break;
				
			case 'TON':
				console.log('💎 Getting TON balance...');
				balance = await getTONBalance(address);
				displayBalance = digits(balance, 4);
				usdValue = await getUSDValue('TON', balance);
				break;
				
			case 'BVT_ERC20':
				console.log('🪙 Getting BVT (ERC20) balance...');
				balance = await getERC20Balance(address, '0xBVT1111111111111111111111111111111111111111');
				displayBalance = digits(balance, 4);
				coinName = 'BVT';
				usdValue = await getUSDValue('BVT', balance);
				break;

			case 'BVT_POL':
				console.log('🪙 Getting BVT (POL) balance...');
				balance = await getERC20Balance(address, '0xBVT111111111111111111111111111111111111111111');
				displayBalance = digits(balance, 4);
				coinName = 'BVT';
				usdValue = await getUSDValue('BVT', balance);
				break;
				
			case 'BVT_SOL':
				console.log('🪙 Getting BVT (SOL) balance...');
				const bvtSplTokenMintAddress = products[productId].mintaddr;
				balance = await getSPLBalance(address, bvtSplTokenMintAddress);
				displayBalance = digits(balance, 4);
				coinName = 'BVT';
				usdValue = await getUSDValue('BVT', balance);
				break;
				
			case 'BVT_TON':
				console.log('🪙 Getting BVT (TON) balance...');
				balance = await getJettonBalance(address);
				displayBalance = digits(balance, 4);
				coinName = 'BVT';
				usdValue = await getUSDValue('BVT', balance);
				break;
							
			case 'USDT_ERC20':
				console.log('💵 Getting USDT (ERC20) balance...');
				const usdtErc20Contract = getERC20TokenContractAddress(productId);
				const usdtErc20Product = products[productId];
				const usdtErc20Decimals = usdtErc20Product ? usdtErc20Product.decimal : 6;
				balance = await getERC20Balance(address, usdtErc20Contract, 'ethereum', usdtErc20Decimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDT';
				usdValue = balance; // USDTは1:1でUSD
				break;

			case 'USDC_ERC20':
				console.log('💵 Getting USDC (ERC20) balance...');
				const usdcErc20Contract = getERC20TokenContractAddress(productId);
				const usdcErc20Product = products[productId];
				const usdcErc20Decimals = usdcErc20Product ? usdcErc20Product.decimal : 6;
				balance = await getERC20Balance(address, usdcErc20Contract, 'ethereum', usdcErc20Decimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDC';
				usdValue = balance; // USDCは1:1でUSD
				break;

			case 'USDT_POL':
				console.log('💵 Getting USDT (POL) balance...');
				const usdtPolContract = getPolygonTokenContractAddress(productId);
				const usdtPolProduct = products[productId];
				const usdtPolDecimals = usdtPolProduct ? usdtPolProduct.decimal : 6;
				balance = await getERC20Balance(address, usdtPolContract, 'polygon', usdtPolDecimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDT';
				usdValue = balance; // USDTは1:1でUSD
				break;
				
			case 'USDT_SOL':
				console.log('💵 Getting USDT (SOL) balance...');
				const splTokenMintAddress = products[productId].mintaddr;
				balance = await getSPLBalance(address, splTokenMintAddress);
				displayBalance = digits(balance, 6);
				coinName = 'USDT';
				usdValue = balance; // USDTは1:1でUSD
				break;
				
			case 'USDT_TON':
				console.log('💵 Getting USDT (TON) balance...');
				balance = await getJettonBalance(address);
				displayBalance = digits(balance, 6);
				coinName = 'USDT';
				usdValue = balance; // USDTは1:1でUSD
				break;

			case 'JPYC_POL':
				console.log('🔷 Getting JPYC (POL) balance...');
				const jpycPolContract = getPolygonTokenContractAddress(productId);
				const productInfo = products[productId];
				const decimals = productInfo ? productInfo.decimal : 18;
				balance = await getERC20Balance(address, jpycPolContract, 'polygon', decimals);
				displayBalance = digits(balance, 6);
				usdValue = await getUSDValue('JPYC', balance);
				break;

			case 'JPYC_AVAX':
				console.log('🔷 Getting JPYC (AVAX) balance...');
				const jpycAvaxContract = getContractAddress(productId);
				const jpycAvaxProduct = products[productId];
				const jpycAvaxDecimals = jpycAvaxProduct ? jpycAvaxProduct.decimal : 18;
				balance = await getERC20Balance(address, jpycAvaxContract, 'avalanche', jpycAvaxDecimals);
				displayBalance = digits(balance, 6);
				usdValue = await getUSDValue('JPYC', balance);
				break;

			case 'USDC_AVAX':
				console.log('💵 Getting USDC (AVAX) balance...');
				const usdcAvaxContract = getContractAddress(productId);
				const usdcAvaxProduct = products[productId];
				const usdcAvaxDecimals = usdcAvaxProduct ? usdcAvaxProduct.decimal : 6;
				balance = await getERC20Balance(address, usdcAvaxContract, 'avalanche', usdcAvaxDecimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDC';
				usdValue = balance; // USDCは1:1でUSD
				break;

			case 'USDT_AVAX':
				console.log('💵 Getting USDT (AVAX) balance...');
				const usdtAvaxContract = getContractAddress(productId);
				const usdtAvaxProduct = products[productId];
				const usdtAvaxDecimals = usdtAvaxProduct ? usdtAvaxProduct.decimal : 6;
				balance = await getERC20Balance(address, usdtAvaxContract, 'avalanche', usdtAvaxDecimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDT';
				usdValue = balance; // USDTは1:1でUSD
				break;

			case 'USDC_POL':
				console.log('💵 Getting USDC (POL) balance...');
				const usdcPolContract = getPolygonTokenContractAddress(productId);
				const usdcPolProduct = products[productId];
				const usdcPolDecimals = usdcPolProduct ? usdcPolProduct.decimal : 6;
				balance = await getERC20Balance(address, usdcPolContract, 'polygon', usdcPolDecimals);
				displayBalance = digits(balance, 6);
				coinName = 'USDC';
				usdValue = balance; // USDCは1:1でUSD
				break;
										
				
			default:
				// カスタムトークンの処理
				const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
				const customToken = customTokens.find(t => t.productId === productId);
				
				if (customToken) {
					console.log(`🪙 Getting custom token ${customToken.symbol} (${customToken.network}) balance...`);
					
					switch(customToken.network) {
						case 'ethereum':
						case 'polygon':
						case 'bsc':
						case 'avalanche':
						case 'arbitrum':
						case 'base':
						case 'optimism':
							balance = await getERC20Balance(address, customToken.contractAddress);
							displayBalance = digits(balance, customToken.decimals);
							coinName = customToken.symbol;
							usdValue = await getUSDValue(customToken.symbol, balance);
							break;
							
						case 'solana':
							balance = await getSPLBalance(address, customToken.contractAddress);
							displayBalance = digits(balance, customToken.decimals);
							coinName = customToken.symbol;
							usdValue = await getUSDValue(customToken.symbol, balance);
							break;
							
						case 'ton':
							balance = await getJettonBalance(address);
							displayBalance = digits(balance, customToken.decimals);
							coinName = customToken.symbol;
							usdValue = await getUSDValue(customToken.symbol, balance);
							break;
							
						default:
							console.log(`⚠️ Balance fetching for ${productId} not implemented yet`);
							return;
					}
				} else {
					console.log(`⚠️ Balance fetching for ${productId} not implemented yet`);
					return;
				}
		}

		const element = document.querySelector('#'+amountId);
		if (element) {
			if (usdValue > 0) {
				element.innerHTML = `${displayBalance}<br><small style="color: #666;">$${digits(usdValue, 2)}</small>`;
			} else {
				element.innerHTML = `${displayBalance}`;
			}
			console.log(`✅ ${productId} Balance updated: ${displayBalance} ${coinName} ($${usdValue})`);
		} else {
			console.warn(`⚠️ Element not found for amountId: ${amountId}`);
		}

	} catch (error) {
		console.error(`❌ Failed to update balance for ${productId}:`, error);
		const element = document.querySelector('#'+amountId);
		if (element) {
			element.innerHTML = `0`;
		}
	}
}

// 残高取得関数とユーティリティ関数はcoins-libs.jsから取得（上記のconst定義で既に参照済み）
// 以下の関数定義はcoins-libs.jsに移動済み:
// - getUSDValue
// - getBTCBalance
// - getETHBalance
// - getPOLBalance
// - getSOLBalance
// - getSPLBalance
// - getJettonBalance
// - getERC20Balance
// - getTONBalance
// - proxyRequest

// 後方互換性のため、coins-libs.jsが読み込まれていない場合はローカル定義を使用
// これらの関数定義はcoins-libs.jsに移動済みのため、coins.js内の定義は削除
// 必要に応じて、coins-libs.jsが読み込まれていない場合のフォールバックを追加

// 残高取得関数とユーティリティ関数の定義はcoins-libs.jsに移動済み
// 以下の関数定義は削除されました:
// - getETHBalance
// - getPOLBalance
// - getSOLBalance
// - getSPLBalance
// - getJettonBalance
// - getERC20Balance
// - getTONBalance
// - proxyRequest

async function coinsViewHistory(productId) {
	// SPAコンテキストではURLを変更しない（#coinsページ内のビュー切り替えのみ）
	if (window.location.pathname === '/coins.html' || window.location.pathname.endsWith('coins.html')) {
	history.pushState({ 'productId': productId},'','#viewHistory');
	}
	coinsCloseView();
	document.querySelector('#viewHistory').hidden = false;
	
	// SAアドレスの場合（`sa_`プレフィックスが付いている場合）
	if (productId && productId.startsWith('sa_')) {
		// 実際のproductIdを取得（`sa_USDC_POL` → `USDC_POL`）
		const actualProductId = productId.replace('sa_', '');
		const saDisplayNames = {
			'USDC_POL':  '[SA] USDC (Polygon)',
			'JPYC_POL':  '[SA] JPYC (Polygon)',
			'USDC_AVAX': '[SA] USDC (Avalanche)',
			'JPYC_AVAX': '[SA] JPYC (Avalanche)',
		};
		const displayName = saDisplayNames[actualProductId] || `[SA] ${actualProductId}`;
		document.querySelector('#history-coin').innerHTML = displayName;
		
		// SAアドレス情報を復元
		let saAddress = window.currentHistorySAAddress;
		
		// window.currentHistorySAAddressが存在しない場合は、BitVoyStorageから取得
		if (!saAddress && coinsMasterId) {
			try {
				const storage = new BitVoyStorage();
				await storage.init();
				const saAddresses = await storage.getSmartAccountAddresses(coinsMasterId);
				if (saAddresses) {
					const network = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					if (actualProductId === 'USDC_POL' && saAddresses.polygon_USDC?.[network]) {
						saAddress = saAddresses.polygon_USDC[network];
					} else if (actualProductId === 'JPYC_POL' && saAddresses.polygon_JPYC?.[network]) {
						saAddress = saAddresses.polygon_JPYC[network];
					}
					// 取得したSAアドレスを保存
					window.currentHistorySAAddress = saAddress;
				}
			} catch (error) {
				console.warn('⚠️ Failed to get SA address from storage:', error);
			}
		}
		
		if (saAddress) {
			// SAアドレスの履歴を再表示
			await coinsViewSAHistory(actualProductId, saAddress);
			return; // coinsViewSAHistory内で処理が完了するため、ここで終了
		} else {
			console.error('❌ SA address not found for', actualProductId);
			document.querySelector('#history-history').innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ff6b6b;">SA address not found</td></tr>`;
			return;
		}
	} else {
		// 通常アカウントの場合
		document.querySelector('#history-coin').innerHTML = getDisplayName(productId);
	}
	
	// 現在のコイン情報を保存（アイコンボタン用）
	window.currentHistoryProductId = productId;
	window.currentHistorySAAddress = null; // 通常アカウントの場合はnull
	
	// 送信アイコンとSwapアイコンを表示する（通常アカウントの場合）
	// viewHistory内のアイコンボタンを検索
	const viewIconHistory = document.querySelector('#viewIconHistory');
	if (viewIconHistory) {
		const sendButton = viewIconHistory.querySelector('a[data-action="coinsViewSendFromHistory"]');
		if (sendButton && sendButton.closest('li')) {
			sendButton.closest('li').style.display = '';
		}
		const swapButton = viewIconHistory.querySelector('a[data-action="coinsViewSwap"]');
		if (swapButton && swapButton.closest('li')) {
			swapButton.closest('li').style.display = '';
		}
	}
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}

	let walletAddress = getWalletAddress(productId);
	
	// トークンの場合、ネイティブチェーンのアドレスをフォールバックとして使用
	if (!walletAddress) {
		const nativeCoinId = getNativeCoinForToken(productId);
		if (nativeCoinId) {
			walletAddress = getWalletAddress(nativeCoinId);
			if (walletAddress) {
				console.log(`🔄 Token ${productId}: Using ${nativeCoinId} address as fallback for history:`, walletAddress);
			}
		}
	}
	
	let coinName = products[productId].symbol;
	let html = '';
	let transactions = [];

	try {
		console.log(`📋 Fetching transaction history for ${productId}...`);
		
		// プロキシAPIを使用してトランザクション履歴を取得（coinsMasterIdを渡す）
		transactions = await getTransactionHistory(productId, walletAddress, coinsMasterId);
		
		// transactionsが配列であることを確認
		if (Array.isArray(transactions) && transactions.length > 0) {
			transactions.forEach((tx) => {
				const direction = tx.direction || 'Unknown';
				const txid = tx.txid || tx.hash || 'N/A';
				const txidShort = txid.length > 16 ? txid.substring(0, 8) + '...' + txid.substring(txid.length - 8) : txid;
				const amount = tx.amount || tx.value || '0';
				const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : 'N/A';
				
				html += `<tr>
					<td>${direction}</td>
					<td>${timestamp}</td>
					<td>${amount} ${coinName}</td>
					<td><a href="#" data-action="viewTransactionDetails" data-txid="${txid}" data-productid="${productId}" title="${txid}">${txidShort}</a></td>
				</tr>`;
			});
		} else {
			const noTransactionsText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.noTransactionsFound', { ns: 'coins' }) : 'No transactions found';
			html = `<tr><td colspan="4" style="text-align: center; color: #666;">${noTransactionsText}</td></tr>`;
		}
		
		document.querySelector('#history-history').innerHTML = html;
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}

	} catch(error) {
		console.error('❌ Error fetching transaction history:', error);
		const failedText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.failedToLoadTransactions') : 'Failed to load transactions';
		document.querySelector('#history-history').innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ff6b6b;">${failedText}</td></tr>`;
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
	}
}

/**
 * SAアドレスの履歴を表示
 * @param {string} productId - プロダクトID（USDC_POLまたはJPYC_POL）
 * @param {string} saAddress - SAアドレス
 */
async function coinsViewSAHistory(productId, saAddress) {
	// SPAコンテキストではURLを変更しない（#coinsページ内のビュー切り替えのみ）
	if (window.location.pathname === '/coins.html' || window.location.pathname.endsWith('coins.html')) {
		history.pushState({ 'productId': `sa_${productId}`, 'saAddress': saAddress }, '', '#viewHistory');
	}
	coinsCloseView();
	document.querySelector('#viewHistory').hidden = false;
	
	// 表示名を設定
	const saDisplayNames = {
		'USDC_POL':  '[SA] USDC (Polygon)',
		'JPYC_POL':  '[SA] JPYC (Polygon)',
		'USDC_AVAX': '[SA] USDC (Avalanche)',
		'JPYC_AVAX': '[SA] JPYC (Avalanche)',
	};
	const displayName = saDisplayNames[productId] || `[SA] ${productId}`;
	document.querySelector('#history-coin').innerHTML = displayName;
	
	// 現在のコイン情報を保存（SAアドレスであることを示す）
	window.currentHistoryProductId = `sa_${productId}`;
	window.currentHistorySAAddress = saAddress;
	
	// 送信アイコンとSwapアイコンを非表示にする（SAアドレスの場合）
	// viewHistory内のアイコンボタンを検索
	const viewIconHistory = document.querySelector('#viewIconHistory');
	if (viewIconHistory) {
		const sendButton = viewIconHistory.querySelector('a[data-action="coinsViewSendFromHistory"]');
		if (sendButton && sendButton.closest('li')) {
			sendButton.closest('li').style.display = 'none';
			console.log('✅ Send button hidden for SA account');
		} else {
			console.warn('⚠️ Send button not found in #viewIconHistory');
		}
		const swapButton = viewIconHistory.querySelector('a[data-action="coinsViewSwap"]');
		if (swapButton && swapButton.closest('li')) {
			swapButton.closest('li').style.display = 'none';
			console.log('✅ Swap button hidden for SA account');
		} else {
			console.warn('⚠️ Swap button not found in #viewIconHistory');
		}
	} else {
		console.warn('⚠️ #viewIconHistory not found');
	}
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
			// applyI18n実行後もSAアカウントの場合はボタンを非表示に保つ
			const viewIconHistory = document.querySelector('#viewIconHistory');
			if (viewIconHistory) {
				const sendButton = viewIconHistory.querySelector('a[data-action="coinsViewSendFromHistory"]');
				if (sendButton && sendButton.closest('li')) {
					sendButton.closest('li').style.display = 'none';
				}
				const swapButton = viewIconHistory.querySelector('a[data-action="coinsViewSwap"]');
				if (swapButton && swapButton.closest('li')) {
					swapButton.closest('li').style.display = 'none';
				}
			}
		}, 50);
	}

	let coinName = products[productId].symbol;
	let html = '';
	let transactions = [];

	try {
		console.log(`📋 Fetching SA transaction history for ${productId} at ${saAddress}...`);
		
		// プロキシAPIを使用してトランザクション履歴を取得（SAアドレスを直接指定）
		transactions = await getTransactionHistory(productId, saAddress, coinsMasterId);
		
		// transactionsが配列であることを確認
		if (Array.isArray(transactions) && transactions.length > 0) {
			transactions.forEach((tx) => {
				const direction = tx.direction || 'Unknown';
				const txid = tx.txid || tx.hash || 'N/A';
				const txidShort = txid.length > 16 ? txid.substring(0, 8) + '...' + txid.substring(txid.length - 8) : txid;
				const amount = tx.amount || tx.value || '0';
				const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : 'N/A';
				
				html += `<tr>
					<td>${direction}</td>
					<td>${timestamp}</td>
					<td>${amount} ${coinName}</td>
					<td><a href="#" data-action="viewTransactionDetails" data-txid="${txid}" data-productid="${productId}" title="${txid}">${txidShort}</a></td>
				</tr>`;
			});
		} else {
			const noTransactionsText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.noTransactionsFound', { ns: 'coins' }) : 'No transactions found';
			html = `<tr><td colspan="4" style="text-align: center; color: #666;">${noTransactionsText}</td></tr>`;
		}
		
		document.querySelector('#history-history').innerHTML = html;
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}

	} catch(error) {
		console.error('❌ Error fetching SA transaction history:', error);
		const failedText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.failedToLoadTransactions') : 'Failed to load transactions';
		document.querySelector('#history-history').innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ff6b6b;">${failedText}</td></tr>`;
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
	}
}

// トランザクション履歴取得関数とユーティリティ関数の定義はcoins-libs.jsに移動済み（削除）
// 以下の関数定義はcoins-libs.jsに移動済み:
// - getTransactionHistory
// - getBitcoinTransactionHistory
// - getEthereumTransactionHistory
// - getPolygonTransactionHistory
// - getSolanaTransactionHistory
// - getTONTransactionHistory
// - getEthereumTokenTransactionHistory
// - getPolygonTokenTransactionHistory
// - getERC20TokenContractAddress
// - getPolygonTokenContractAddress
// - getNetworkFromProductId
// - getCoinType
// - getTokenType
// - calculateSolanaATA
// - calculateTONJettonAddress
// - calculateTokenAddress

function coinsViewTransactionDetails(txid, productId) {
	// トランザクション詳細を表示するモーダルや新しいページを開く処理を実装
	console.log(`Viewing transaction details for ${txid} (Product: ${productId})`);
	
	// balance_historyのトランザクションIDの場合は、アドレスページを開く
	if (txid.startsWith('balance_history_')) {
		const address = getWalletAddress(productId);
		if (address) {
			let explorerUrl = '';
			switch(productId) {
				case 'BTC':
					explorerUrl = `https://blockstream.info/address/${address}`;
					break;
				case 'ETH':
				case 'USDT_ERC20':
				case 'BVT_ERC20': {
					const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					explorerUrl = currentNetwork === 'testnet'
						? `https://sepolia.etherscan.io/address/${address}`
						: `https://etherscan.io/address/${address}`;
					break;
				}
				case 'POL':
				case 'USDT_POL':
				case 'BVT_POL': {
					const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					explorerUrl = currentNetwork === 'testnet'
						? `https://amoy.polygonscan.com/address/${address}`
						: `https://polygonscan.com/address/${address}`;
					break;
				}
				case 'AVAX':
				case 'JPYC_AVAX':
				case 'USDC_AVAX':
				case 'USDT_AVAX': {
					const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					explorerUrl = currentNetwork === 'testnet'
						? `https://testnet.snowtrace.io/address/${address}`
						: `https://snowtrace.io/address/${address}`;
					break;
				}
				case 'SOL':
				case 'USDT_SOL':
				case 'BVT_SOL': {
					const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					explorerUrl = currentNetwork === 'testnet'
						? `https://explorer.solana.com/address/${address}?cluster=testnet`
						: `https://solscan.io/account/${address}`;
					break;
				}
				case 'TON':
				case 'USDT_TON':
				case 'BVT_TON': {
					const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
					explorerUrl = currentNetwork === 'testnet'
						? `https://testnet.tonscan.org/address/${address}`
						: `https://tonscan.org/address/${address}`;
					break;
				}
				default:
					explorerUrl = `https://google.com/search?q=${address}`;
			}
			window.open(explorerUrl, '_blank');
		}
		return;
	}
	
	// 通常のトランザクションIDの場合は、トランザクションページを開く
	let explorerUrl = '';
	switch(productId) {
		case 'BTC':
			explorerUrl = `https://blockstream.info/tx/${txid}`;
			break;
		case 'ETH':
		case 'USDT_ERC20':
		case 'BVT_ERC20': {
			const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
			explorerUrl = currentNetwork === 'testnet'
				? `https://sepolia.etherscan.io/tx/${txid}`
				: `https://etherscan.io/tx/${txid}`;
			break;
		}
		case 'POL':
		case 'USDT_POL':
		case 'BVT_POL': {
			const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
			explorerUrl = currentNetwork === 'testnet'
				? `https://amoy.polygonscan.com/tx/${txid}`
				: `https://polygonscan.com/tx/${txid}`;
			break;
		}
		case 'AVAX':
		case 'JPYC_AVAX':
		case 'USDC_AVAX':
		case 'USDT_AVAX': {
			const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
			explorerUrl = currentNetwork === 'testnet'
				? `https://testnet.snowtrace.io/tx/${txid}`
				: `https://snowtrace.io/tx/${txid}`;
			break;
		}
		case 'SOL':
		case 'USDT_SOL':
		case 'BVT_SOL': {
			const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
			explorerUrl = currentNetwork === 'testnet'
				? `https://explorer.solana.com/tx/${txid}?cluster=testnet`
				: `https://solscan.io/tx/${txid}`;
			break;
		}
		case 'TON':
		case 'USDT_TON':
		case 'BVT_TON': {
			const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
			explorerUrl = currentNetwork === 'testnet'
				? `https://testnet.tonscan.org/tx/${txid}`
				: `https://tonscan.org/tx/${txid}`;
			break;
		}
		default:
			explorerUrl = `https://google.com/search?q=${txid}`;
	}
	
	// 新しいタブでブロックエクスプローラーを開く
	window.open(explorerUrl, '_blank');
}


function coinsViewSend(show) {
	coinsCloseView();
	if(show) {
		// historyから来たわけではないので、フラグをリセット
		window.cameFromHistory = false;
		// 一覧表示状態からSendボタンをタップした場合、通貨選択画面を表示
		coinsShowCoinSelect();
	}
}

// 通貨選択画面を表示
function coinsShowCoinSelect() {
	coinsCloseView();
	document.querySelector('#viewCoinSelect').hidden = false;
	
	// タイトルを設定
	const selectCoinText = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.selectCoin') : 'Select Coin to Send';
	document.getElementById('coin-select-title').textContent = selectCoinText;
	
	// 利用可能な通貨リストを生成
	coinsGenerateCoinSelectList();
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
}

// 通貨選択リストを生成
function coinsGenerateCoinSelectList() {
	const coinSelectList = document.getElementById('coin-select-list');
	let html = '';
	
	// 標準通貨を取得（現在は products 全体）
	const standardCoins = getStandardCoinsForUI();
	// カスタムトークンを取得
	const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
	const customProductIds = customTokens.map(token => token.productId);
	
	// すべての通貨を結合
	const allCoins = [...standardCoins, ...customProductIds];
	
	allCoins.forEach(productId => {
		const address = getWalletAddress(productId);
		const displayName = getDisplayName(productId);
		const coinIcon = getCoinIcon(productId);
		const amountId = "amount_"+productId;
		const balanceElement = document.getElementById(amountId);
		const balance = balanceElement ? balanceElement.textContent : '0';
		
		const selectText = (window.i18next && window.i18next.t) ? window.i18next.t('actions.select', { ns: 'coins' }) : 'Select';
		html += `<tr>
			<td><span class="coins-coin-icon">${coinIcon}</span> ${displayName}</td>
			<td>${balance}</td>
			<td><a href="#" data-action="selectCoin" data-productid="${productId}" class="button small">${selectText}</a></td>
		</tr>`;
	});
	
	if (html === '') {
		const noCoinsText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.noCoinsAvailable') : 'No coins available';
		html = `<tr><td colspan="3" style="text-align: center; color: #666;">${noCoinsText}</td></tr>`;
	}
	
	coinSelectList.innerHTML = html;
}

// 履歴表示時からSend画面に遷移
function coinsViewSendFromHistory(show) {
	coinsCloseView();
	if(show) {
		// 現在の履歴で表示されているコインを直接Send画面に設定
		const currentProductId = coinsGetCurrentHistoryProductId();
		if(currentProductId) {
			// 選択された通貨を保存
			window.selectedCoinForSend = currentProductId;
			// historyから来たことを記録
			window.cameFromHistory = true;
			// Send画面を表示
			coinsShowSendForm(currentProductId);
		}
	}
}

// Send画面を表示（選択された通貨を設定）
function coinsShowSendForm(productId) {
	coinsCloseView();
	document.querySelector('#viewSend').hidden = false;
	
	// 送金フォームの入力フィールドをクリア（以前の値が残らないように）
	const sendAddressInput = document.querySelector('#send-address');
	const sendAmountInput = document.querySelector('#send-amount');
	if (sendAddressInput) {
		sendAddressInput.value = '';
	}
	if (sendAmountInput) {
		sendAmountInput.value = '';
	}
	
	// 選択された通貨を表示
	coinsUpdateSelectedCoinDisplay(productId);
	
	// 送金フォームのバリデーションを設定
	coinsSetupSendFormValidation();
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
}

// 選択された通貨の表示を更新
function coinsUpdateSelectedCoinDisplay(productId) {
	const coinIcon = getCoinIcon(productId);
	const displayName = getDisplayName(productId);
	const amountId = "amount_"+productId;
	const balanceElement = document.getElementById(amountId);
	const balance = balanceElement ? balanceElement.textContent : '0';
	
	const balanceLabel = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.balance', { ns: 'coins' }) : 'Balance';
	document.getElementById('selected-coin-icon').innerHTML = coinIcon;
	document.getElementById('selected-coin-name').innerHTML = displayName;
	document.getElementById('selected-coin-balance').innerHTML = `${balanceLabel}: ${balance}`;
	
	// 選択された通貨を保存
	window.selectedCoinForSend = productId;
}

/**
 * 送金フォームのバリデーションを設定
 * AmountとAddressが入力されている場合のみ「次へ」ボタンを有効化
 */
function coinsSetupSendFormValidation() {
	const amountInput = document.querySelector('#send-amount');
	const addressInput = document.querySelector('#send-address');
	const nextButton = document.querySelector('[data-action="viewSendConfirm"]');
	
	if (!amountInput || !addressInput || !nextButton) {
		return;
	}
	
	// バリデーション関数
	const validateForm = () => {
		const amountValue = amountInput.value ? amountInput.value.trim() : '';
		const addressValue = addressInput.value ? addressInput.value.trim() : '';
		const isValid = amountValue !== '' && addressValue !== '';
		
		// ボタンの有効/無効を切り替え
		if (isValid) {
			nextButton.classList.remove('disabled');
			nextButton.style.pointerEvents = 'auto';
			nextButton.style.opacity = '1';
		} else {
			nextButton.classList.add('disabled');
			nextButton.style.pointerEvents = 'none';
			nextButton.style.opacity = '0.5';
		}
	};
	
	// 初期状態を設定（無効）
	validateForm();
	
	// 既存のイベントリスナーを削除（重複防止）
	const existingAmountHandler = amountInput._validationHandler;
	const existingAddressHandler = addressInput._validationHandler;
	if (existingAmountHandler) {
		amountInput.removeEventListener('input', existingAmountHandler);
		amountInput.removeEventListener('change', existingAmountHandler);
	}
	if (existingAddressHandler) {
		addressInput.removeEventListener('input', existingAddressHandler);
		addressInput.removeEventListener('change', existingAddressHandler);
	}
	
	// 入力フィールドの変更を監視
	amountInput.addEventListener('input', validateForm);
	amountInput.addEventListener('change', validateForm);
	addressInput.addEventListener('input', validateForm);
	addressInput.addEventListener('change', validateForm);
	
	// ハンドラーを保存（後で削除するため）
	amountInput._validationHandler = validateForm;
	addressInput._validationHandler = validateForm;
}

// 履歴表示時からReceive画面に遷移
function coinsViewReceiveFromHistory(show) {
	coinsCloseView();
	if(show) {
		// 現在の履歴で表示されているコインを直接Receive画面に設定
		const currentProductId = coinsGetCurrentHistoryProductId();
		if(currentProductId) {
			// SAアドレスの場合（`sa_`プレフィックスが付いている場合）
			if (currentProductId.startsWith('sa_')) {
				// 実際のproductIdを取得（`sa_USDC_POL` → `USDC_POL`）
				const actualProductId = currentProductId.replace('sa_', '');
				// SAアドレスを使用して受信画面を表示
				if (window.currentHistorySAAddress) {
					coinsShowReceiveFormForSA(actualProductId, window.currentHistorySAAddress);
				} else {
					console.error('❌ SA address not found for receive');
				}
			} else {
				// 通常アカウントの場合
				// 選択された通貨を保存
				window.selectedCoinForReceive = currentProductId;
				// historyから来たことを記録
				window.cameFromHistory = true;
				// Receive画面を表示
				coinsShowReceiveForm(currentProductId);
			}
		}
	}
}

// Receive画面を表示（選択された通貨を設定）
function coinsShowReceiveForm(productId) {
	coinsCloseView();
	document.querySelector('#viewReceive').hidden = false;
	
	// 選択された通貨を表示
	coinsUpdateSelectedCoinDisplayForReceive(productId);
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
	
	// QRコードを初期化
	if (!coinsQrcode) {
		coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), "");
	}
	
	// 受信アドレスを更新
	coinsUpdateReceiveAddressForSelectedCoin(productId);
}

// Receive用の選択された通貨の表示を更新
function coinsUpdateSelectedCoinDisplayForReceive(productId) {
	const coinIcon = getCoinIcon(productId);
	const displayName = getDisplayName(productId);
	const amountId = "amount_"+productId;
	const balanceElement = document.getElementById(amountId);
	const balance = balanceElement ? balanceElement.textContent : '0';
	
	const balanceLabel = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.balance', { ns: 'coins' }) : 'Balance';
	document.getElementById('selected-coin-icon-receive').innerHTML = coinIcon;
	document.getElementById('selected-coin-name-receive').innerHTML = displayName;
	document.getElementById('selected-coin-balance-receive').innerHTML = `${balanceLabel}: ${balance}`;
	
	// 選択された通貨を保存
	window.selectedCoinForReceive = productId;
}

// getNativeCoinForToken関数はcoins-libs.jsから取得（上記のconst定義で既に参照済み）

// 選択された通貨の受信アドレスを更新
function coinsUpdateReceiveAddressForSelectedCoin(productId) {
	// SAアドレスの場合、window.currentHistorySAAddressを使用
	if (window.currentHistorySAAddress && window.selectedCoinForReceive && window.selectedCoinForReceive.startsWith('sa_')) {
		const address = window.currentHistorySAAddress;
		document.getElementById('recv-address').value = address;
		coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), address);
		return;
	}
	
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
	
	console.log('🔄 Updating receive address for:', productId, 'Address:', address);
	
	if (address) {
		document.getElementById('recv-address').value = address;
		
		// QRコードを更新
		if (coinsQrcode) {
			console.log('📱 Generating QR code for address:', address);
			coinsQrcode.clear();
			coinsQrcode.makeCode(address);
		} else {
			console.warn('⚠️ QR code instance not found, initializing...');
			// QRコードが初期化されていない場合は初期化
			coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), "");
			coinsQrcode.makeCode(address);
		}
	} else {
		console.warn('⚠️ No address found for productId:', productId);
		document.getElementById('recv-address').value = '';
		if (coinsQrcode) {
			coinsQrcode.clear();
		}
	}
}

/**
 * SAアドレス用の受信画面を表示
 * @param {string} productId - プロダクトID（USDC_POLまたはJPYC_POL）
 * @param {string} saAddress - SAアドレス
 */
function coinsShowReceiveFormForSA(productId, saAddress) {
	coinsCloseView();
	document.querySelector('#viewReceive').hidden = false;
	
	// 選択された通貨を表示（SAアドレスの場合）
	const saDisplayNames = {
		'USDC_POL':  '[SA] USDC (Polygon)',
		'JPYC_POL':  '[SA] JPYC (Polygon)',
		'USDC_AVAX': '[SA] USDC (Avalanche)',
		'JPYC_AVAX': '[SA] JPYC (Avalanche)',
	};
	const displayName = saDisplayNames[productId] || `[SA] ${productId}`;
	const coinIcon = productId.endsWith('_AVAX') ? '🔺' : '🔷';
	document.getElementById('selected-coin-icon-receive').innerHTML = coinIcon;
	document.getElementById('selected-coin-name-receive').innerHTML = displayName;
	document.getElementById('selected-coin-balance-receive').innerHTML = '';
	
	// 選択された通貨を保存（SAアドレスであることを示す）
	window.selectedCoinForReceive = `sa_${productId}`;
	window.currentHistorySAAddress = saAddress;
	window.cameFromHistory = true;
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
	
	// QRコードを初期化
	if (!coinsQrcode) {
		coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), "");
	}
	
	// SAアドレスを表示
	document.getElementById('recv-address').value = saAddress;
	if (coinsQrcode) {
		coinsQrcode.clear();
		coinsQrcode.makeCode(saAddress);
	} else {
		coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), saAddress);
	}
}

function coinsViewReader(show) {
	// SPAコンテキストではURLを変更しない（#coinsページ内のビュー切り替えのみ）
	if (window.location.pathname === '/coins.html' || window.location.pathname.endsWith('coins.html')) {
	history.pushState({ 'productId': null},'','#viewReader');
	}
	coinsCloseView();
	document.querySelector('#viewReader').hidden = !show;
}

async function coinsViewSendConfirm(show) {
	// 選択された通貨を使用
	let productId = window.selectedCoinForSend;
	if (!productId) {
		alert("No coin selected");
		return;
	}
	
	// バリデーション: AmountとAddressが入力されているか確認
	const amountInput = document.querySelector('#send-amount');
	const addressInput = document.querySelector('#send-address');
	
	if (!amountInput || !amountInput.value || amountInput.value.trim() === '') {
		const amountLabel = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.amount', { ns: 'coins' }) : 'Amount';
		alert(`${amountLabel} is required`);
		return;
	}
	
	if (!addressInput || !addressInput.value || addressInput.value.trim() === '') {
		const addressLabel = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.toAddress') : 'To Address';
		alert(`${addressLabel} is required`);
		return;
	}
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
	
	let chain = products[productId].chain;
	
	// MPC公開鍵から生成された実際のアドレスを取得（すべてのチェーン）
	const isEVMChain = chain === 'ethereum' || chain === 'polygon' || chain === 'arbitrum' || chain === 'base' || chain === 'optimism' || chain === 'avalanche' || chain === 'bsc';
	const isBitcoinChain = chain === 'bitcoin';
	const isSolanaChain = chain === 'solana';
	const isTONChain = chain === 'ton';
	
	if ((isEVMChain || isBitcoinChain || isSolanaChain || isTONChain) && coinsBitvoywallet && coinsMasterId) {
		try {
			// トークンの場合、ネイティブチェーンのproductIdを使用
			const addressProductId = getNativeCoinForToken(productId) || productId;
			
			let targetProductId;
			if (isBitcoinChain) {
				targetProductId = 'BTC';
			} else if (isSolanaChain) {
				targetProductId = 'SOL';
			} else if (isTONChain) {
				targetProductId = 'TON';
			} else {
				// Ethereum系チェーンのproductIdをマッピング
				const evmProductIdMap = {
					'ethereum': 'ETH',
					'polygon': 'POL',
					'arbitrum': 'ARB',
					'base': 'BASE',
					'optimism': 'OP',
					'avalanche': 'AVAX',
					'bsc': 'BNB'
				};
				targetProductId = evmProductIdMap[chain] || addressProductId;
			}
			
			const walletInfo = await coinsBitvoywallet.getMPCWalletInfo(coinsMasterId, targetProductId);
			coinsFromAddress = walletInfo.address;
			console.log(`💳 Using MPC wallet address for ${targetProductId}:`, coinsFromAddress);
		} catch (e) {
			console.warn('Failed to get MPC wallet info, falling back to sessionStorage:', e);
			coinsFromAddress = getWalletAddress(productId);
			
			// トークンの場合、ネイティブチェーンのアドレスをフォールバックとして使用
			if (!coinsFromAddress) {
				const nativeCoinId = getNativeCoinForToken(productId);
				if (nativeCoinId) {
					coinsFromAddress = getWalletAddress(nativeCoinId);
					if (coinsFromAddress) {
						console.log(`🔄 Token ${productId}: Using ${nativeCoinId} address as fallback for coinsFromAddress:`, coinsFromAddress);
					}
				}
			}
		}
	} else {
		// その他のチェーンは従来通り
		coinsFromAddress = getWalletAddress(productId);
		
		// トークンの場合、ネイティブチェーンのアドレスをフォールバックとして使用
		if (!coinsFromAddress) {
			const nativeCoinId = getNativeCoinForToken(productId);
			if (nativeCoinId) {
				coinsFromAddress = getWalletAddress(nativeCoinId);
				if (coinsFromAddress) {
					console.log(`🔄 Token ${productId}: Using ${nativeCoinId} address as fallback for coinsFromAddress:`, coinsFromAddress);
				}
			}
		}
	}
	coinsToAddress = document.querySelector('#send-address').value;
	coinsAmount = document.querySelector('#send-amount').value;

	const confirmInfo = {
		BTC:              { symbol: 'BTC',  display: 'Bitcoin',                 chain: 'BTC' },
		ETH:              { symbol: 'ETH',  display: 'Ethereum',                chain: 'ERC20' },
		POL:              { symbol: 'POL',  display: 'Polygon',                 chain: 'POL' },
		SOL:              { symbol: 'SOL',  display: 'Solana',                  chain: 'SOL' },
		TON:              { symbol: 'TON',  display: 'Toncoin',                 chain: 'TON' },
		AVAX:             { symbol: 'AVAX', display: 'Avalanche',               chain: 'AVAX' },
		USDC_ERC20:       { symbol: 'USDC', display: 'USDC',                    chain: 'ERC20' },
		USDC_POL:         { symbol: 'USDC', display: 'USDC',                    chain: 'POL' },
		USDC_ARB:         { symbol: 'USDC', display: 'USDC',                    chain: 'ARB' },
		USDC_BASE:        { symbol: 'USDC', display: 'USDC',                    chain: 'BASE' },
		USDC_OPT:         { symbol: 'USDC', display: 'USDC',                    chain: 'OPT' },
		USDC_AVAX:        { symbol: 'USDC', display: 'USDC',                    chain: 'AVAX' },
		USDC_SOL:         { symbol: 'USDC', display: 'USDC',                    chain: 'SOL' },
		USDT_TON:         { symbol: 'USDT', display: 'USDT',                    chain: 'TON' },
		USDT_ERC20:       { symbol: 'USDT', display: 'USDT',                    chain: 'ERC20' },
		USDT_POL:         { symbol: 'USDT', display: 'USDT',                    chain: 'POL' },
		USDT_SOL:         { symbol: 'USDT', display: 'USDT',                    chain: 'SOL' },
		USDT_AVAX:        { symbol: 'USDT', display: 'USDT',                    chain: 'AVAX' },
		USDT_ARB:         { symbol: 'USDT', display: 'USDT',                    chain: 'ARB' },
		USDT_BNB:         { symbol: 'USDT', display: 'USDT',                    chain: 'BNB' },
		USDT_TRON:        { symbol: 'USDT', display: 'USDT',                    chain: 'TRON' },
		JPYC_ERC20:       { symbol: 'JPYC', display: 'JPYC',                    chain: 'ERC20' },
		JPYC_POL:         { symbol: 'JPYC', display: 'JPYC',                    chain: 'POL' },
		JPYC_AVAX:        { symbol: 'JPYC', display: 'JPYC',                    chain: 'AVAX' },
		BVT_ERC20:        { symbol: 'BVT',  display: 'BVT',                     chain: 'ERC20' },
		BVT_POL:          { symbol: 'BVT',  display: 'BVT',                     chain: 'POL' },
		BVT_SOL:          { symbol: 'BVT',  display: 'BVT',                     chain: 'SOL' },
		BVT_TON:          { symbol: 'BVT',  display: 'BVT',                     chain: 'TON' }
	};

	const info = confirmInfo[productId];
	if (info) {
		document.querySelector('#confirm-spend').innerHTML = `-${coinsAmount} ${info.symbol}`;
		document.querySelector('#confirm-coinname').innerHTML = info.display;
		document.querySelector('#confirm-chain').innerHTML = info.chain;
	} else {
		console.warn('Unknown productId for confirm dialog:', productId);
	}
	document.querySelector('#confirm-from').innerHTML = coinsFromAddress;
	document.querySelector('#confirm-to').innerHTML = coinsToAddress;
	document.querySelector('#confirm-fee').innerHTML = "";
	document.querySelector('#confirm-fee-usd').innerHTML = "";
	document.querySelector('#confirm-total').innerHTML = "";

	coinsCloseView();
	document.querySelector('#viewSendConfirm').hidden = !show;

	let nowtime = Date.now();
	coinsFeeLevel = 'normal';	// fast:	data.feerate.fastestFee
								// normal:	data.feerate.halfHourFee
								// economy:	data.feerate.hourFee
	// coinsWalletId、coinsDerivepath、coinsAddressindexを取得
	coinsWalletId = sessionStorage.getItem('wallet.0.'+productId+'.walletid');
	
	// walletidが存在しない場合は、addressから生成
	if(coinsWalletId == null) {
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
		
		if (address) {
			// 簡易的なwalletid生成（addressと同じ）
			coinsWalletId = address;
			// Session Storageに保存
			sessionStorage.setItem('wallet.0.'+productId+'.walletid', coinsWalletId);
			console.log(`Generated walletid for ${productId}: ${coinsWalletId}`);
		} else {
			console.log(`No wallet found for productId: ${productId}`);
			console.log('Available wallet keys:', Object.keys(sessionStorage).filter(key => key.startsWith('wallet.0.')));
			alert("No wallet found for selected coin");
			return;
		}
	}
	
	// coinsDerivepath = sessionStorage.getItem('wallet.0.'+productId+'.derivepath'); // HDWallet廃止により削除
	coinsAddressindex = sessionStorage.getItem('wallet.0.'+productId+'.addressindex');
	
	console.log(`Wallet info for ${productId}:`, {
		coinsWalletId: coinsWalletId,
		// coinsDerivepath: HDWallet廃止により削除
		coinsAddressindex: coinsAddressindex,
		coinsFromAddress: coinsFromAddress
	});

	// 1. bitvoyapi.getEstimateFee
	// 2. bitvoyapi.createTX or bitvoyapi.createTokenTx
	// 3. Sign (wallet.CreateTransactionP2PKH or wallet.CreateTransationETH)
	// 4. bitvoyapi.txBroadcast

	const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
	if (loadingEl) {
		loadingEl.classList.remove('hide');
	}

	// トークンの場合、ネイティブチェーンのproductIdを使用して手数料を取得
	const feeProductId = getNativeCoinForToken(productId) || productId;
	
	// 現在のネットワークをサーバーに伝える（mainnet / testnet）
	const currentNetwork = getCurrentNetwork();
	const reqId = nowtime + '.1';

	// 新しいwalletapiエンドポイントを使用
	fetch('/walletapi/fee/estimate', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Requested-With': 'XMLHttpRequest'
		},
		body: JSON.stringify({
			reqId: reqId,
			productId: feeProductId,
			network: currentNetwork,
			protocol: undefined // 必要に応じて設定
		})
	})
	.then(response => {
		if (!response.ok) {
			throw new Error(`HTTP error! Status: ${response.status}`);
		}
		return response.json();
	})
	.then(data => {
		console.log('🔍 getEstimateFee response:', {
			status: data?.status,
			productId: productId,
			feeProductId: feeProductId,
			network: currentNetwork,
			fullData: data
		});
		if (data && data.status === 'OK') {
			const BN = window.BigNumber || null;
			if (!BN) {
				throw new Error("BigNumber library not loaded");
			}
			
			// デバッグ: USDレートとデータを確認
			console.log('🔍 Fee estimate data:', {
				productId: productId,
				usdrate: data.usdrate,
				usdrateType: typeof data.usdrate,
				feeRate: data.feeRate,
				baseValue: data.baseValue,
				fullData: data
			});
			
			let feeRate = 0;
			// feerateが存在するか確認
			if (data.feerate) {
				if (coinsFeeLevel === 'fast') {
					feeRate = data.feerate.fastestFee || 0;
				} else if (coinsFeeLevel === 'normal') {
					feeRate = data.feerate.halfHourFee || 0;
				} else if (coinsFeeLevel === 'economy') {
					feeRate = data.feerate.hourFee || 0;
				}
			} else if (data.feeRate) {
				// 直接feeRateが返される場合（トークンなど）
				feeRate = data.feeRate;
			}
			
			// feeRateが0またはundefinedの場合、エラーをログに記録
			if (!feeRate || feeRate === 0) {
				console.warn('⚠️ Fee rate is missing or zero:', {
					productId: productId,
					feeProductId: feeProductId,
					feerate: data.feerate,
					feeRate: data.feeRate,
					data: data
				});
			}
			
			let fee = 0;
			let feeDisplay = '';
			
			// トークンの場合、ネイティブチェーンのproductIdを取得して手数料計算に使用
			const nativeCoinId = getNativeCoinForToken(productId);
			const feeCalcProductId = nativeCoinId || productId;
			
			// チェーン別の手数料計算
			if (feeCalcProductId === 'BTC') {
				// Bitcoin: 手数料レート（sat/vB）から実際の手数料を計算
				// 標準的なP2PKHトランザクションサイズ: 約225バイト
				const estimatedTxSize = 225;
				fee = new BN(feeRate).times(estimatedTxSize); // satoshi単位
				feeDisplay = (fee.div(100000000)).toString() + ' BTC'; // BTC単位で表示
			} else if (feeCalcProductId === 'ETH') {
				// Ethereum: ガス価格（Gwei）× ガス制限
				// feeRateは既にGwei単位（1e9倍）で返されている
				// baseValueはガス制限（21000など）
				const gasLimit = (data.baseValue !== '' && data.baseValue !== undefined) 
					? parseInt(data.baseValue, 10) 
					: 21000; // デフォルトのガス制限
				
				console.log('🔍 Fee calculation debug:', {
					feeRate: feeRate,
					gasLimit: gasLimit,
					baseValue: data.baseValue,
					feeRateType: typeof feeRate
				});
				
				// ガス価格（Gwei）× ガス制限 = wei単位のガス代
				// feeRateは既にGwei単位（1e9倍）なので、そのまま使用
				// 例: 1 Gwei × 21000 = 21000000000000 wei = 0.000021 ETH
				fee = new BN(gasLimit).times(feeRate);
				
				// wei単位からETH単位に変換（1e18で割る）
				const feeEth = fee.div(1000000000000000000).toFixed(18).replace(/\.?0+$/, '');
				feeDisplay = feeEth + ' ' + (nativeCoinId || 'ETH');
				
				console.log('🔍 Calculated fee:', {
					feeWei: fee.toString(),
					feeEth: feeEth
				});
			} else if (feeCalcProductId === 'POL') {
				// Polygon: ガス価格（Gwei）× ガス制限（Ethereumと同じEVM互換）
				// feeRateは既にGwei単位（1e9倍）で返されている
				// baseValueはガス制限（21000など）
				const gasLimit = (data.baseValue !== '' && data.baseValue !== undefined) 
					? parseInt(data.baseValue, 10) 
					: 21000; // デフォルトのガス制限
				
				console.log('🔍 Polygon fee calculation debug:', {
					feeRate: feeRate,
					gasLimit: gasLimit,
					baseValue: data.baseValue,
					feeRateType: typeof feeRate
				});
				
				// ガス価格（Gwei）× ガス制限 = wei単位のガス代
				// feeRateは既にGwei単位（1e9倍）なので、そのまま使用
				// 例: 1 Gwei × 21000 = 21000000000000 wei = 0.000021 POL
				fee = new BN(gasLimit).times(feeRate);
				
				// wei単位からPOL単位に変換（1e18で割る）
				const feePol = fee.div(1000000000000000000).toFixed(18).replace(/\.?0+$/, '');
				feeDisplay = feePol + ' ' + (nativeCoinId || 'POL');
				
				console.log('🔍 Calculated Polygon fee:', {
					feeWei: fee.toString(),
					feePol: feePol
				});
			} else if (feeCalcProductId === 'SOL') {
				// Solana: 固定手数料（5000 lamports）
				fee = new BN(feeRate);
				feeDisplay = (fee.div(1000000000)).toString() + ' SOL';
			} else if (feeCalcProductId === 'TON') {
				// TON: 固定手数料
				fee = new BN(feeRate);
				feeDisplay = fee.toString() + ' TON';
			} else {
				// その他のトークン
				fee = new BN(feeRate);
				feeDisplay = fee.toString();
			}
		
			// USD換算（手数料を適切な単位で計算）
			let feeusd;
			if (feeCalcProductId === 'BTC') {
				// Bitcoin: satoshi単位の手数料をUSDに変換
				feeusd = new BN(data.usdrate).times(fee).div(100000000).dp(2);
			} else if (feeCalcProductId === 'ETH') {
				// Ethereum: wei単位の手数料をETH単位に変換してからUSDに変換
				// feeはwei単位なので、1e18で割ってETH単位に変換
				const feeEth = fee.div(1000000000000000000);
				feeusd = new BN(data.usdrate).times(feeEth).dp(2);
			} else if (feeCalcProductId === 'POL') {
				// Polygon: wei単位の手数料をPOL単位に変換してからUSDに変換
				// feeはwei単位なので、1e18で割ってPOL単位に変換
				const feePol = fee.div(1000000000000000000);
				
				// USDレートの検証
				if (!data.usdrate || data.usdrate === '0' || data.usdrate === 0) {
					console.error('⚠️ USD rate is missing or zero for Polygon:', data.usdrate);
					feeusd = new BN(0);
				} else {
					feeusd = new BN(data.usdrate).times(feePol).dp(2);
					console.log('🔍 Polygon fee USD calculation:', {
						feeWei: fee.toString(),
						feePol: feePol.toString(),
						usdrate: data.usdrate,
						feeusd: feeusd.toString()
					});
				}
			} else {
				// その他: そのままUSDに変換
				feeusd = new BN(data.usdrate).times(fee).dp(2);
			}
		
			document.querySelector('#confirm-fee').innerHTML = feeDisplay;
			document.querySelector('#confirm-fee-usd').innerHTML = '($' + feeusd + ')';
			
			// 総額計算（送金額 + 手数料）
			let totalAmount;
			if (feeCalcProductId === 'BTC') {
				// Bitcoin: 送金額（BTC） + 手数料（BTC）
				totalAmount = new BN(coinsAmount).plus(fee.div(100000000)).times(data.usdrate).dp(2);
			} else if (feeCalcProductId === 'ETH') {
				// Ethereum: 送金額（ETH） + 手数料（ETH）
				// fee は wei 単位なので、ETH に変換してから加算
				const feeEth = fee.div(1000000000000000000);
				totalAmount = new BN(coinsAmount).plus(feeEth).times(data.usdrate).dp(2);
			} else if (feeCalcProductId === 'POL') {
				// Polygon: 送金額（POL） + 手数料（POL）
				// fee は wei 単位なので、POL に変換してから加算
				const feePol = fee.div(1000000000000000000);
				
				// USDレートの検証
				if (!data.usdrate || data.usdrate === '0' || data.usdrate === 0) {
					console.error('⚠️ USD rate is missing or zero for Polygon (total):', data.usdrate);
					totalAmount = new BN(0);
			} else {
					totalAmount = new BN(coinsAmount).plus(feePol).times(data.usdrate).dp(2);
					console.log('🔍 Polygon total USD calculation:', {
						coinsAmount: coinsAmount,
						feePol: feePol.toString(),
						usdrate: data.usdrate,
						totalAmount: totalAmount.toString()
					});
				}
			} else {
				// その他: 送金額 + 手数料（既に表示単位になっている前提）
				totalAmount = new BN(coinsAmount).plus(fee).times(data.usdrate).dp(2);
			}
			document.querySelector('#confirm-total').innerHTML = '$' + totalAmount;
		} else {
			const errorMsg = data?.error || data?.message || `Failed to get fees. Status: ${data?.status || 'unknown'}`;
			console.error('❌ getEstimateFee failed:', {
				status: data?.status,
				error: data?.error,
				message: data?.message,
				productId: productId,
				feeProductId: feeProductId,
				network: currentNetwork,
				response: data
			});
			throw new Error(errorMsg);
		}
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
	})
	.catch(error => {
		console.log(error);
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
		alert("Could not be processed: " + error)
	});
}

function coinsViewReceive(show) {
	if(show) {
		coinsCloseView();
		// historyから来たわけではないので、フラグをリセット
		window.cameFromHistory = false;
		// 一覧表示状態からReceiveボタンをタップした場合、通貨選択画面を表示
		coinsShowCoinSelectForReceive();
	} else {
		document.querySelector('#viewReceive').hidden = true;
	}
}

// Receive用の通貨選択画面を表示
function coinsShowCoinSelectForReceive() {
	coinsCloseView();
	document.querySelector('#viewCoinSelect').hidden = false;
	
	// タイトルを設定
	const selectCoinReceiveText = (window.i18next && window.i18next.t) ? window.i18next.t('sendForm.selectCoinReceive') : 'Select Coin to Receive';
	document.getElementById('coin-select-title').textContent = selectCoinReceiveText;
	
	// 利用可能な通貨リストを生成（Receive用）
	coinsGenerateCoinSelectListForReceive();
	
	// 多言語化を適用
	if (window.applyI18n) {
		setTimeout(function() {
			window.applyI18n();
		}, 50);
	}
}

// Receive用の通貨選択リストを生成
function coinsGenerateCoinSelectListForReceive() {
	const coinSelectList = document.getElementById('coin-select-list');
	let html = '';
	
	// 標準通貨を取得（現在は products 全体）
	const standardCoins = getStandardCoinsForUI();
	
	// カスタムトークンを取得
	const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
	const customProductIds = customTokens.map(token => token.productId);
	
	// すべての通貨を結合
	const allCoins = [...standardCoins, ...customProductIds];
	
	allCoins.forEach(productId => {
		const address = getWalletAddress(productId);
		const displayName = getDisplayName(productId);
		const coinIcon = getCoinIcon(productId);
		const amountId = "amount_"+productId;
		const balanceElement = document.getElementById(amountId);
		const balance = balanceElement ? balanceElement.textContent : '0';
		
		const selectText = (window.i18next && window.i18next.t) ? window.i18next.t('actions.select', { ns: 'coins' }) : 'Select';
		html += `<tr>
			<td><span class="coins-coin-icon">${coinIcon}</span> ${displayName}</td>
			<td>${balance}</td>
			<td><a href="#" data-action="selectCoinForReceive" data-productid="${productId}" class="button small">${selectText}</a></td>
		</tr>`;
	});
	
	if (html === '') {
		const noCoinsText = (window.i18next && window.i18next.t) ? window.i18next.t('messages.noCoinsAvailable') : 'No coins available';
		html = `<tr><td colspan="3" style="text-align: center; color: #666;">${noCoinsText}</td></tr>`;
	}
	
	coinSelectList.innerHTML = html;
}

/**
 * 受信アドレスを更新
 */
function coinsUpdateReceiveAddress() {
	const productId = document.getElementById('recv-productid').value;
	const address = getWalletAddress(productId);
	
	console.log('🔄 Updating receive address for:', productId, 'Address:', address);
	
	if (address) {
		document.getElementById('recv-address').value = address;
		
		// QRコードを更新
		if (coinsQrcode) {
			console.log('📱 Generating QR code for address:', address);
			coinsQrcode.clear();
			coinsQrcode.makeCode(address);
		} else {
			console.warn('⚠️ QR code instance not found, initializing...');
			// QRコードが初期化されていない場合は初期化
			coinsQrcode = new QRCode(document.getElementById("recv-address-qr"), "");
			coinsQrcode.makeCode(address);
		}
	} else {
		console.warn('⚠️ No address found for productId:', productId);
		document.getElementById('recv-address').value = '';
		if (coinsQrcode) {
			coinsQrcode.clear();
		}
	}
}

/**
 * 送金承認処理
 */
async function coinsApproval() {

// 1. createTx
// 2. MPC署名
// 3. 署名付きトランザクション構築
// 4. bitvoyapi.txBroadcast

			try {
			console.log("MPC署名による送金開始");
			
			// 選択された通貨を使用
			let productId = window.selectedCoinForSend;
			if (!productId) {
				alert("No coin selected");
				return;
			}
			
			// カスタムトークンの場合の処理
			let chain, decimal;
			if (products[productId]) {
				chain = products[productId].chain;
				decimal = products[productId].decimal;
			} else {
				// カスタムトークンの場合
				const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
				const customToken = customTokens.find(t => t.productId === productId);
				if (customToken) {
					chain = customToken.network;
					decimal = customToken.decimals;
				} else {
					alert("Invalid token selected");
					return;
				}
			}

			const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
	if (loadingEl) {
		loadingEl.classList.remove('hide');
	}

			// クライアント側でトランザクション作成
			// productId から直接判定（chain は 'ethereum', 'polygon' などの小文字形式のため）
			let txHash;
			
			// ネイティブコインの場合
			if (productId === 'BTC') {
					txHash = await executeBitcoinMPCTransaction();
			} else if (productId === 'ETH') {
					txHash = await executeEthereumMPCTransaction();
			} else if (productId === 'POL') {
				txHash = await executePolygonMPCTransaction();
			} else if (productId === 'SOL') {
					txHash = await executeSolanaMPCTransaction();
			} else if (productId === 'TON') {
					txHash = await executeTONMPCTransaction();
			} else if (chain === 'ethereum' || productId.endsWith('_ERC20')) {
				// Ethereum チェーンのトークン（ERC20）
				txHash = await executeEthereumMPCTransaction();
			} else if (chain === 'polygon' || productId.endsWith('_POL')) {
				// Polygon チェーンのトークン
				txHash = await executePolygonMPCTransaction();
			} else if (chain === 'avalanche' || productId.endsWith('_AVAX')) {
				// Avalanche チェーンのトークン（JPYC_AVAX 等）
				txHash = await executeAvalancheMPCTransaction();
			} else if (chain === 'solana' || productId.endsWith('_SOL')) {
				// Solana チェーンのトークン（SPL）
				txHash = await executeSolanaMPCTransaction();
			} else if (chain === 'ton' || productId.endsWith('_TON')) {
				// TON チェーンのトークン（Jetton）
				txHash = await executeTONMPCTransaction();
			} else {
					throw new Error(`${productId}のMPCトランザクションはまだ実装されていません`);
			}

		if (txHash) {
			// 翻訳を取得
			const t = (key) => {
				if (window.i18next && window.i18next.t) {
					const translated = window.i18next.t(key);
					// キーが解決されていない場合（キー自体が返された場合）はフォールバックを使用
					if (translated === key) {
						const fallbacks = {
							'coins.messages.transferCompleted': '送金完了！',
							'coins.messages.transactionHash': 'トランザクションハッシュ',
							'coins.messages.transactionFailed': 'トランザクション失敗 - ハッシュが返されませんでした'
						};
						return fallbacks[key] || key;
					}
					return translated;
				}
				// フォールバック（i18nextが未初期化の場合）
				const fallbacks = {
					'coins.messages.transferCompleted': '送金完了！',
					'coins.messages.transactionHash': 'トランザクションハッシュ',
					'coins.messages.transactionFailed': 'トランザクション失敗 - ハッシュが返されませんでした'
				};
				return fallbacks[key] || key;
			};
			const transferCompleted = t('coins.messages.transferCompleted');
			const transactionHash = t('coins.messages.transactionHash');
			alert(`${transferCompleted} ${transactionHash}: ${txHash.substring(0, 16)}...`);
			// ダイアログを閉じた後に#coinsの一覧に戻る
			coinsViewCoin(); // 残高更新と送金確認画面の非表示
		} else {
			const t = (key) => {
				if (window.i18next && window.i18next.t) {
					return window.i18next.t(key);
				}
				// フォールバック（i18nextが未初期化の場合）
				const fallbacks = {
					'coins.messages.transactionFailed': 'トランザクション失敗 - ハッシュが返されませんでした'
				};
				return fallbacks[key] || key;
			};
			throw new Error(t('coins.messages.transactionFailed'));
		}

	} catch (error) {
		console.error("MPCトランザクション失敗:", error);
		console.error("エラーの詳細:", {
			name: error.name,
			message: error.message,
			stack: error.stack
		});
		alert('送金失敗: ' + (error.message || 'Unknown error'));
		// ダイアログを閉じた後に#coinsの一覧に戻る
		coinsViewCoin(); // 送金確認画面の非表示
	} finally {
		const loadingEl = document.querySelector('#coins-loading') || document.querySelector('#loading');
		if (loadingEl) {
			loadingEl.classList.add('hide');
		}
	}
}

/**
 * Bitcoin MPCトランザクション実行
 */
async function executeBitcoinMPCTransaction() {
	try {
		console.log("Bitcoin MPCトランザクション開始");
		console.log("デバッグ情報:", {
			coinsBitvoywallet: typeof coinsBitvoywallet,
			coinsFromAddress,
			coinsToAddress,
			coinsAmount,
			coinsFeeLevel,
			coinsMasterId
		});
		
		// 1. クライアント側でトランザクション構築
		// テストネットの場合は低速手数料を使用
		const adjustedFeeLevel = (sessionStorage.getItem('mpc.current_network') === 'testnet') ? 'hour' : coinsFeeLevel;
		console.log(`Using fee level: ${adjustedFeeLevel} (original: ${coinsFeeLevel})`);
		
		const transactionData = await coinsBitvoywallet.buildBitcoinTransaction(
			coinsFromAddress,
			coinsToAddress,
			coinsAmount,
			adjustedFeeLevel
		);
		
		// 2. MPC署名実行
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'bitcoin',
				transactionType: 'transfer',
				amount: coinsAmount,
				fee: transactionData.fee
			}
		);
		
		// 3. 署名付きトランザクション構築
		// P2WPKH用: 公開鍵を取得してsignatureオブジェクトに追加
		const walletInfo = await coinsBitvoywallet.getMPCWalletInfo(coinsMasterId, 'BTC');
		const publicKeyHex = walletInfo.publicKey || null;
		
		// signatureオブジェクトに公開鍵を追加（P2WPKH用）
		// NOTE: signatureは文字列なので、そのままspreadすると
		//  {0: '\"', 1: '0', ...} のような想定外オブジェクトになる。
		//  ここでは明示的にsignatureフィールドに格納する。
		const signatureWithPubKey = {
			signature: signature,
			publicKey: publicKeyHex
		};
		
		const signedTransaction = await coinsBitvoywallet.buildSignedBitcoinTransaction(
			transactionData.unsignedTx,
			signatureWithPubKey,
			coinsFromAddress  // P2WPKH判定用
		);
		
		// 4. ブロードキャスト
		const txHash = await coinsBitvoywallet.broadcastBitcoinTransaction(signedTransaction);
		
		console.log("Bitcoin MPCトランザクション完了:", txHash);
		return txHash;
		
	} catch (error) {
		console.error("Bitcoin MPCトランザクション失敗:", error);
		console.error("Bitcoin MPCエラーの詳細:", {
			name: error.name,
			message: error.message,
			stack: error.stack
		});
		throw error;
	}
}

/**
 * Ethereum MPCトランザクション実行
 */
async function executeEthereumMPCTransaction() {
	try {
		console.log("Ethereum MPCトランザクション開始");

		console.log("🔍 Address check:", {
			coinsFromAddress: coinsFromAddress,
			coinsToAddress: coinsToAddress,
			coinsAmount: coinsAmount,
			coinsFeeLevel: coinsFeeLevel
		});
		
		// idempotencyKeyを生成（タイムスタンプ + ランダム文字列）
		const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
		console.log(`🔑 Generated idempotencyKey: ${idempotencyKey}`);
		
		// productIdを取得してトークンタイプを判定
		const productId = window.selectedCoinForSend;
		const product = products[productId];
		const isERC20Token = product && (product.tokentype === 'ERC20' || productId !== 'ETH');
		
		let transactionData;
		
		if (isERC20Token && productId !== 'ETH') {
			// ERC20トークンの場合（JPYC_ERC20など）
			console.log(`🔷 Building Ethereum ERC20 transaction for ${productId}`);
			
			// コントラクトアドレスを取得
			const getERC20TokenContractAddress = window.CoinsLibs?.getERC20TokenContractAddress;
			if (!getERC20TokenContractAddress) {
				throw new Error('getERC20TokenContractAddress function not found. Please ensure coins-libs.js is loaded.');
			}
			
			const contractAddress = getERC20TokenContractAddress(productId);
			if (!contractAddress) {
				throw new Error(`Contract address not found for ${productId}`);
			}
			
			const decimals = product ? product.decimal : 18;
			
			console.log(`🔷 ERC20 token info:`, {
				productId,
				contractAddress,
				decimals,
				amount: coinsAmount
			});
			
			// 1. ERC20トークン送金トランザクション構築
			transactionData = await coinsBitvoywallet.buildEthereumERC20Transaction(
				coinsFromAddress,
				coinsToAddress,
				contractAddress,
				coinsAmount,
				decimals,
				coinsFeeLevel,
				productId, // productIdを渡してネットワーク判定を確実に
				idempotencyKey
			);
		} else {
			// ネイティブトークン（ETH）の場合
			console.log(`🔷 Building Ethereum native transaction for ${productId || 'ETH'}`);
			
			// 1. クライアント側でトランザクション構築
			transactionData = await coinsBitvoywallet.buildEthereumTransaction(
				coinsFromAddress,
				coinsToAddress,
				coinsAmount,
				coinsFeeLevel,
				productId, // productIdを渡してネットワーク判定を確実に
				idempotencyKey
			);
		}
		
		// 2. MPC署名実行
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'ethereum',
				transactionType: isERC20Token && productId !== 'ETH' ? 'token_transfer' : 'transfer',
				amount: coinsAmount,
				gasPrice: transactionData.gasPrice,
				gasLimit: transactionData.gasLimit
			}
		);
		
		// 3. 署名付きトランザクション構築（expectedFromAddressを渡す）
		const signedTransaction = await coinsBitvoywallet.buildSignedEthereumTransaction(
			transactionData.unsignedTx,
			signature,
			coinsFromAddress  // expectedFromAddressとして渡す
		);
		
		// 4. ブロードキャスト
		const txHash = await coinsBitvoywallet.broadcastEthereumTransaction(signedTransaction, idempotencyKey);
		
		console.log("Ethereum MPCトランザクション完了:", txHash);
		return txHash;
		
	} catch (error) {
		console.error("Ethereum MPCトランザクション失敗:", error);
		throw error;
	}
}

/**
 * Polygon MPCトランザクション実行
 */
async function executePolygonMPCTransaction() {
	try {
		console.log("Polygon MPCトランザクション開始");

		console.log("🔍 Address check:", {
			coinsFromAddress: coinsFromAddress,
			coinsToAddress: coinsToAddress,
			coinsAmount: coinsAmount,
			coinsFeeLevel: coinsFeeLevel
		});
		
		// idempotencyKeyを生成（タイムスタンプ + ランダム文字列）
		const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
		console.log(`🔑 Generated idempotencyKey: ${idempotencyKey}`);
		
		// productIdを取得してトークンタイプを判定
		const productId = window.selectedCoinForSend;
		const product = products[productId];
		const isERC20Token = product && (product.tokentype === 'ERC20' || productId !== 'POL');
		
		let transactionData;
		
		if (isERC20Token && productId !== 'POL') {
			// ERC20トークンの場合（JPYC_POLなど）
			console.log(`🔷 Building Polygon ERC20 transaction for ${productId}`);
			
			// コントラクトアドレスを取得
			const getPolygonTokenContractAddress = window.CoinsLibs?.getPolygonTokenContractAddress;
			if (!getPolygonTokenContractAddress) {
				throw new Error('getPolygonTokenContractAddress function not found. Please ensure coins-libs.js is loaded.');
			}
			
			const contractAddress = getPolygonTokenContractAddress(productId);
			if (!contractAddress) {
				throw new Error(`Contract address not found for ${productId}`);
			}
			
			const decimals = product ? product.decimal : 18;
			
			console.log(`🔷 ERC20 token info:`, {
				productId,
				contractAddress,
				decimals,
				amount: coinsAmount
			});
			
			// 1. ERC20トークン送金トランザクション構築
			transactionData = await coinsBitvoywallet.buildPolygonERC20Transaction(
				coinsFromAddress,
				coinsToAddress,
				contractAddress,
				coinsAmount,
				decimals,
				coinsFeeLevel,
				productId, // productIdを渡してネットワーク判定を確実に
				idempotencyKey
			);
		} else {
			// ネイティブトークン（POL）の場合
			console.log(`🔷 Building Polygon native transaction for ${productId || 'POL'}`);
			
			// 1. クライアント側でトランザクション構築
			transactionData = await coinsBitvoywallet.buildPolygonTransaction(
				coinsFromAddress,
				coinsToAddress,
				coinsAmount,
				coinsFeeLevel,
				productId, // productIdを渡してネットワーク判定を確実に
				idempotencyKey
			);
		}
		
		// 2. MPC署名実行
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'polygon',
				transactionType: isERC20Token && productId !== 'POL' ? 'token_transfer' : 'transfer',
				amount: coinsAmount,
				gasPrice: transactionData.gasPrice,
				gasLimit: transactionData.gasLimit
			}
		);
		
		// 3. 署名付きトランザクション構築（expectedFromAddressを渡す）
		const signedTransaction = await coinsBitvoywallet.buildSignedPolygonTransaction(
			transactionData.unsignedTx,
			signature,
			coinsFromAddress  // expectedFromAddressとして渡す
		);
		
		// 4. ブロードキャスト
		const txHash = await coinsBitvoywallet.broadcastPolygonTransaction(signedTransaction, idempotencyKey);
		
		console.log("Polygon MPCトランザクション完了:", txHash);
		return txHash;
		
	} catch (error) {
		console.error("Polygon MPCトランザクション失敗:", error);
		throw error;
	}
}

/**
 * Avalanche MPCトランザクション実行（ネイティブ AVAX / ERC20 トークン: JPYC_AVAX 等）
 */
async function executeAvalancheMPCTransaction() {
	try {
		const productId = window.selectedCoinForSend;
		const product = products[productId];
		const isERC20Token = product && (product.tokentype === 'ERC20' || productId !== 'AVAX');
		const getContractAddress = window.CoinsLibs?.getContractAddress;
		if (!getContractAddress && isERC20Token) {
			throw new Error('getContractAddress not found. Ensure coins-libs.js is loaded.');
		}
		const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
		let transactionData;
		if (productId === 'AVAX') {
			// ネイティブ AVAX 送金
			transactionData = await coinsBitvoywallet.buildAvalancheTransaction(
				coinsFromAddress,
				coinsToAddress,
				coinsAmount,
				coinsFeeLevel,
				productId,
				idempotencyKey
			);
		} else if (isERC20Token) {
			const contractAddress = getContractAddress(productId);
			if (!contractAddress) {
				throw new Error(`Contract address not found for ${productId}`);
			}
			const decimals = product ? product.decimal : 18;
			transactionData = await coinsBitvoywallet.buildAvalancheERC20Transaction(
				coinsFromAddress,
				coinsToAddress,
				contractAddress,
				coinsAmount,
				decimals,
				coinsFeeLevel,
				productId,
				idempotencyKey
			);
		} else {
			throw new Error(`${productId} の送金は未対応です。`);
		}
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'avalanche',
				transactionType: productId === 'AVAX' ? 'transfer' : 'token_transfer',
				amount: coinsAmount,
				gasPrice: transactionData.gasPrice,
				gasLimit: transactionData.gasLimit
			}
		);
		const signedTransaction = await coinsBitvoywallet.buildSignedAvalancheTransaction(
			transactionData.unsignedTx,
			signature,
			coinsFromAddress
		);
		const txHash = await coinsBitvoywallet.broadcastAvalancheTransaction(signedTransaction, idempotencyKey);
		console.log("Avalanche MPCトランザクション完了:", txHash);
		return txHash;
	} catch (error) {
		console.error("Avalanche MPCトランザクション失敗:", error);
		throw error;
	}
}

/**
 * Solana MPCトランザクション実行
 */
async function executeSolanaMPCTransaction() {
	try {
		console.log("Solana MPCトランザクション開始");
		
		// 1. クライアント側でトランザクション構築
		const transactionData = await coinsBitvoywallet.buildSolanaTransaction(
			coinsFromAddress,
			coinsToAddress,
			coinsAmount
		);
		
		// 2. MPC署名実行
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'solana',
				transactionType: 'transfer',
				amount: coinsAmount
			}
		);
		
		// 3. 署名付きトランザクション構築
		const signedTransaction = await coinsBitvoywallet.buildSignedSolanaTransaction(
			transactionData.unsignedTx,
			signature
		);
		
		// 4. ブロードキャスト
		const txHash = await coinsBitvoywallet.broadcastSolanaTransaction(signedTransaction);
		
		console.log("Solana MPCトランザクション完了:", txHash);
		return txHash;
		
	} catch (error) {
		console.error("Solana MPCトランザクション失敗:", error);
		throw error;
	}
}

/**
 * TON MPCトランザクション実行
 */
async function executeTONMPCTransaction() {
	try {
		console.log("TON MPCトランザクション開始");
		
		// 1. クライアント側でトランザクション構築
		const transactionData = await coinsBitvoywallet.buildTONTransaction(
			coinsFromAddress,
			coinsToAddress,
			coinsAmount
		);
		
		// 2. MPC署名実行
		const signature = await coinsBitvoyMPC.signWithMPC(
			coinsMasterId,
			transactionData.messageHash,
			{
				blockchain: 'ton',
				transactionType: 'transfer',
				amount: coinsAmount
			}
		);
		
		// 3. 署名付きトランザクション構築
		const signedTransaction = await coinsBitvoywallet.buildSignedTONTransaction(
			transactionData.unsignedTx,
			signature
		);
		
		// 4. ブロードキャスト
		const txHash = await coinsBitvoywallet.broadcastTONTransaction(signedTransaction);
		
		console.log("TON MPCトランザクション完了:", txHash);
		return txHash;
		
	} catch (error) {
		console.error("TON MPCトランザクション失敗:", error);
		throw error;
	}
}

//
// TX
//
function coinsTXcloseView() {
	document.querySelector('#viewSend').hidden = true;
	document.querySelector('#viewReader').hidden = true;
	document.querySelector('#viewSendConfirm').hidden = true;
	document.querySelector('#viewReceive').hidden = true;
}

//
// Scan QR
//
const video  = document.querySelector('#js-video')
const canvas = document.querySelector('#js-canvas')
var qrScanner = null
var scan = false

const setAddress = function(code) {
	document.querySelector('#send-address').value = code
}

const coinsStopScan = () => {
	if (qrScanner) {
		qrScanner.stop();
		qrScanner.destroy();
		qrScanner = null;
	}
	if(video && video.srcObject) {
		const tracks = video.srcObject.getTracks();
		tracks.forEach(track => {
  			track.stop();
		});
		video.srcObject = null;
	}
	scan = false
}

const coinsCancelScan = () => {
	coinsStopScan()
	coinsViewReader(false)
	// 送金画面に戻る
	const viewSend = document.querySelector('#viewSend');
	if (viewSend) {
		viewSend.hidden = false;
	}
}

const coinsScanQR = () => {
	if (typeof QrScanner === 'undefined') {
		console.error('❌ QrScanner is not loaded');
		alert('QR Scanner library is not loaded');
		return;
	}

	scan = true
	coinsViewReader(true)

	// qr-scannerを使用してQRコードスキャンを開始
	qrScanner = new QrScanner(
		video,
		result => {
			console.log('✅ QR code detected:', result.data);
			setAddress(result.data);
			coinsStopScan();
			coinsCloseView();
			// 送金画面に戻る（coinsViewSendは通貨選択画面を表示するため、直接#viewSendを表示）
			const viewSend = document.querySelector('#viewSend');
			if (viewSend) {
				viewSend.hidden = false;
			}
		},
		{
			preferredCamera: 'environment',
			returnDetailedScanResult: true,
			maxScansPerSecond: 10 // スキャン頻度を下げて安定性を向上
		}
	);

	qrScanner.start().catch(err => {
		console.error('❌ QR Scanner start error:', err);
		alert('Camera access denied or not available');
		coinsStopScan();
	});
}

//
// Copy text to clipboard
//
function coinsCopyToClipboard(text) {
	// Create a temporary textarea element
	const textarea = document.createElement('textarea');
	textarea.value = text;
	document.body.appendChild(textarea);

	// Select and copy the text
	textarea.select();
	document.execCommand('copy');

	// Clean up and remove the textarea
	document.body.removeChild(textarea);
}

/**
 * data-action属性を使用したイベントリスナーを設定
 */
function coinsSetupDataActionEventListeners() {
    // ドキュメント全体にイベントリスナーを追加（イベント委譲）
    document.addEventListener('click', function(event) {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        
        event.preventDefault();
        
        // coins-page内の要素のみを処理（nfts-pageなどの他のページのアクションは無視）
        const coinsPage = document.getElementById('coins-page');
        if (!coinsPage || !coinsPage.contains(target)) {
            return; // coins-page外の要素は処理しない
        }
        
        const action = target.getAttribute('data-action');
        console.log('Action triggered:', action);
        
        switch(action) {
            case 'coinsViewSend':
                coinsViewSend(true);
                break;
            case 'coinsViewReceive':
                coinsViewReceive(true);
                break;
            case 'coinsViewSendFromHistory':
                coinsViewSendFromHistory(true);
                break;
            case 'coinsViewReceiveFromHistory':
                coinsViewReceiveFromHistory(true);
                break;
            case 'coinsScanQR':
                coinsScanQR();
                break;
            case 'coinsCancelScan':
                coinsCancelScan();
                break;
            case 'coinsViewSendConfirm':
                // 無効な状態のボタンがクリックされた場合は処理を中断
                if (target.classList.contains('disabled') || target.style.pointerEvents === 'none') {
                    return;
                }
                coinsViewSendConfirm(true);
                break;
            case 'coinsApproval':
                coinsApproval();
                break;
            case 'viewTransactionDetails':
                const txid = target.getAttribute('data-txid');
                const productId = target.getAttribute('data-productid');
                if (txid && productId) {
                    coinsViewTransactionDetails(txid, productId);
                }
                break;
            case 'selectCoin':
                const selectedProductId = target.getAttribute('data-productid');
                if (selectedProductId) {
                    coinsShowSendForm(selectedProductId);
                }
                break;
            case 'selectCoinForReceive':
                const selectedProductIdForReceive = target.getAttribute('data-productid');
                if (selectedProductIdForReceive) {
                    coinsShowReceiveForm(selectedProductIdForReceive);
                }
                break;
            case 'coinsBackToCoinList':
                coinsViewCoin();
                break;
            case 'coinsBackToHistoryOrCoinList':
                // historyから来た場合はhistoryに戻る、そうでない場合はコイン一覧に戻る
                if (window.cameFromHistory && window.currentHistoryProductId) {
                    coinsViewHistory(window.currentHistoryProductId);
                    window.cameFromHistory = false; // フラグをリセット
                } else {
                    coinsViewCoin();
                }
                break;
            case 'coinsBackToCoins':
                // #coinsページに戻る
                // historyから戻る場合は、#coinsページ内でcoinsViewCoin()を直接呼び出す
                coinsViewCoin();
                break;
            case 'coinsCopyToClipboard':
                const targetId = target.getAttribute('data-target');
                if (targetId) {
                    const element = document.getElementById(targetId);
                    if (element) {
                        coinsCopyToClipboard(element.value);
                    }
                }
                break;
            case 'signOut':
                // bitvoy-signout-init.jsで処理されるため、ここでは何もしない
                break;
            case 'coinsShowAddToken':
                coinsShowAddTokenForm();
                break;
            case 'coinsAddToken':
                addCustomToken();
                break;
            case 'removeToken':
                const tokenToRemove = target.getAttribute('data-productid');
                if (tokenToRemove) {
                    removeCustomToken(tokenToRemove);
                }
                break;
            case 'coinsViewSwap':
                // 履歴画面からSwapに遷移する場合、現在のproductIdを保存
                if (window.currentHistoryProductId) {
                    sessionStorage.setItem('swap.fromProductId', window.currentHistoryProductId);
                    console.log('💾 Saved productId for Swap:', window.currentHistoryProductId);
                }
                // SPAとして#swap-pageに遷移
                window.location.hash = '#swap';
                break;
            default:
                console.warn('Unknown action:', action);
        }
    });
}

// 現在の履歴で表示されているコインのproductIdを取得
function coinsGetCurrentHistoryProductId() {
	// まず保存されたコイン情報を確認
	if(window.currentHistoryProductId) {
		return window.currentHistoryProductId;
	}
	
	// フォールバック: DOMから取得
	const historyCoinElement = document.querySelector('#history-coin');
	if(historyCoinElement) {
		const coinName = historyCoinElement.textContent;
		// コイン名からproductIdを逆引き
		for(const [productId, product] of Object.entries(products)) {
			if(product.name === coinName || product.symbol === coinName) {
				return productId;
			}
		}
	}
	return null;
}

/**
 * トークン追加フォームを表示
 */
function coinsShowAddTokenForm() {
    console.log('🔧 Showing add token form...');
    coinsCloseView();
    document.querySelector('#viewAddToken').hidden = false;
    
    // 多言語化を適用
    if (window.applyI18n) {
        setTimeout(function() {
            window.applyI18n();
        }, 50);
    }
    
    // フォームをリセット（デフォルトは Ethereum）
    document.getElementById('token-network').value = 'ethereum';
    document.getElementById('token-contract-address').value = '';
    document.getElementById('token-name').value = '';
    document.getElementById('token-symbol').value = '';
    document.getElementById('token-decimals').value = '18';
}

/**
 * カスタムトークンを追加
 */
async function addCustomToken() {
    try {
        console.log('🔧 Adding custom token...');
        
        // フォームから値を取得
        const originalNetwork = document.getElementById('token-network').value;
        const contractAddress = document.getElementById('token-contract-address').value.trim();
        const tokenName = document.getElementById('token-name').value.trim();
        const tokenSymbol = document.getElementById('token-symbol').value.trim().toUpperCase();
        const decimals = parseInt(document.getElementById('token-decimals').value);
        
        // バリデーション
        if (!contractAddress || !tokenName || !tokenSymbol) {
            alert('Please fill in all required fields');
            return;
        }
        
        if (decimals < 0 || decimals > 18) {
            alert('Decimals must be between 0 and 18');
            return;
        }
        
        // ネットワーク固有のバリデーション（元のネットワーク名を使用）
        const networkLower = originalNetwork.toLowerCase();
        if ((networkLower === 'ethereum' || networkLower === 'polygon' || networkLower === 'bsc' || 
             networkLower === 'avalanche' || networkLower === 'arbitrum' || networkLower === 'base' || 
             networkLower === 'optimism') && !contractAddress.startsWith('0x')) {
            alert('Contract address must start with 0x');
            return;
        }

        if (networkLower === 'solana' && !contractAddress.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
            alert('Invalid Solana token mint address');
            return;
        }
        
        if (networkLower === 'ton' && !contractAddress.match(/^EQ[A-Za-z0-9_-]{46}$/)) {
            alert('Invalid TON Jetton Master address');
            return;
        }
        
        // ネットワーク名を正規化（小文字のネットワーク名を大文字のproductIdに変換）
        const networkMap = {
            'ethereum': 'ETH',
            'polygon': 'POL',
            'solana': 'SOL',
            'ton': 'TON',
            'bitcoin': 'BTC',
            'bsc': 'BNB',
            'avalanche': 'AVAX',
            'arbitrum': 'ARB',
            'base': 'BASE',
            'optimism': 'OPT'
        };
        const network = networkMap[networkLower] || originalNetwork.toUpperCase();
        console.log(`🔧 Network normalized: ${originalNetwork} -> ${network}`);
        
        // トークンアドレスを計算（元のネットワーク名を使用）
        const tokenAddress = await calculateTokenAddress(originalNetwork, contractAddress);
        if (!tokenAddress) {
            alert('Failed to calculate token address');
            return;
        }
        
        // カスタムトークンのproductIdを生成
        const customProductId = `${tokenSymbol}_${network}`;
        
        // サーバーサイドにカスタムトークンを登録
        console.log('🔄 Registering custom token to server...');
        
        // JWTトークンを取得
        let jwtToken = null;
        if (coinsBitvoywallet && typeof coinsBitvoywallet.obtainJWT === 'function') {
            try {
                jwtToken = await coinsBitvoywallet.obtainJWT(coinsMasterId, 'blockchain_access');
            } catch (jwtError) {
                console.warn('⚠️ Failed to obtain JWT, proceeding without authentication:', jwtError);
            }
        }
        
        const reqId = Date.now() + '.1';
        const response = await fetch('/walletapi/custom-token/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
            },
            body: JSON.stringify({
                reqId: reqId,
                masterId: coinsMasterId,
                productId: customProductId,
                network: originalNetwork,
                contractAddress: contractAddress,
                name: tokenName,
                symbol: tokenSymbol,
                decimals: decimals.toString(),
                tokenAddress: tokenAddress
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const serverData = await response.json();
        console.log('📦 Server response:', serverData);
        
        if (serverData.status !== 'OK') {
            throw new Error(serverData.message || 'Failed to register token on server');
        }
        
        // トークン情報をproductsオブジェクトに追加
        const tokenInfo = {
            symbol: tokenSymbol,
            chain: network,
            decimal: decimals,
            cointype: getCoinType(network),
            tokentype: getTokenType(network),
            name: `${tokenName} (${tokenSymbol} - ${network})`,
            contractAddress: contractAddress
        };
        
        // Solanaの場合はmintaddrも追加
        if (network === 'SOL') {
            tokenInfo.mintaddr = contractAddress;
        }
        
        products[customProductId] = tokenInfo;
        
        // セッションストレージにトークン情報を保存（ネットワーク別キー）
        setWalletAddress(customProductId, tokenAddress);
        sessionStorage.setItem(`wallet.0.${customProductId}.contractAddress`, contractAddress);
        sessionStorage.setItem(`wallet.0.${customProductId}.tokenInfo`, JSON.stringify(tokenInfo));
        
        // カスタムトークンリストをセッションストレージに保存（元のネットワーク名を使用）
        const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
        customTokens.push({
            productId: customProductId,
            network: originalNetwork,
            contractAddress: contractAddress,
            name: tokenName,
            symbol: tokenSymbol,
            decimals: decimals,
            address: tokenAddress
        });
        sessionStorage.setItem('customTokens', JSON.stringify(customTokens));
        
        console.log('✅ Custom token added:', customProductId, tokenInfo);
        
        // 成功メッセージを表示
        alert(`Token ${tokenSymbol} added successfully!`);
        
        // メイン画面に戻る
        coinsViewCoin();
        
    } catch (error) {
        console.error('❌ Error adding custom token:', error);
        alert('Failed to add token: ' + error.message);
    }
}

// 以下の関数定義はcoins-libs.jsに移動済み（削除）:
// - getCoinType
// - getTokenType
// - calculateTokenAddress
// - calculateSolanaATA
// - calculateTONJettonAddress

/**
 * カスタムトークンを読み込み
 */
async function loadCustomTokens() {
    try {
        // サーバーサイドからカスタムトークンを取得
        console.log('🔄 Loading custom tokens from server...');
        
        // JWTトークンを取得
        let jwtToken = null;
        if (coinsBitvoywallet && typeof coinsBitvoywallet.obtainJWT === 'function') {
            try {
                jwtToken = await coinsBitvoywallet.obtainJWT(coinsMasterId, 'blockchain_access');
            } catch (jwtError) {
                console.warn('⚠️ Failed to obtain JWT, proceeding without authentication:', jwtError);
            }
        }
        
        const reqId = Date.now() + '.1';
        const response = await fetch('/walletapi/custom-token/get', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
            },
            body: JSON.stringify({
                reqId: reqId,
                masterId: coinsMasterId
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.customTokens) {
                // サーバーから取得したカスタムトークンを処理
                const serverCustomTokens = data.customTokens;
                
                // セッションストレージのカスタムトークンリストを更新
                const customTokensList = [];
                
                serverCustomTokens.forEach(wallet => {
                    const productId = wallet.productId;
                    if (productId && !products[productId]) {
                        // サーバーから返されたネットワーク情報を使用（フォールバックあり）
                        let network = wallet.network || 'ethereum'; // デフォルトはethereum
                        
                        // ネットワーク名が存在しない場合、productIdから推測
                        if (!wallet.network) {
                            const parts = productId.split('_');
                            if (parts.length > 1) {
                                const networkPart = parts[parts.length - 1];
                                // ネットワーク名のマッピング
                                const networkMap = {
                                    'ETH': 'ethereum',
                                    'ERC20': 'ethereum',
                                    'POL': 'polygon',
                                    'SOL': 'solana',
                                    'TON': 'ton',
                                    'BTC': 'bitcoin',
                                    'BNB': 'bsc',
                                    'AVAX': 'avalanche',
                                    'ARB': 'arbitrum',
                                    'BASE': 'base',
                                    'OPT': 'optimism'
                                };
                                network = networkMap[networkPart] || networkPart.toLowerCase();
                            }
                        }
                        
                        // トークン情報をproductsオブジェクトに追加
                        const tokenInfo = {
                            symbol: wallet.tokenSymbol,
                            chain: network.toUpperCase(),
                            decimal: wallet.decimals || 18,
                            cointype: wallet.coinType,
                            tokentype: getTokenType(network),
                            name: wallet.tokenName || `${wallet.tokenSymbol} (${network})`,
                            contractAddress: wallet.contractAddress
                        };
                        
                        if (network.toUpperCase() === 'SOL' || network === 'solana') {
                            tokenInfo.mintaddr = wallet.contractAddress;
                        }
                        
                        products[productId] = tokenInfo;
                        
                        // セッションストレージに保存（ネットワーク別キー）
                        if (wallet.address) {
                            setWalletAddress(productId, wallet.address);
                        }
                        sessionStorage.setItem(`wallet.0.${productId}.contractAddress`, wallet.contractAddress);
                        sessionStorage.setItem(`wallet.0.${productId}.tokenInfo`, JSON.stringify(tokenInfo));
                        
                        // カスタムトークンリストに追加（元のネットワーク名を使用）
                        customTokensList.push({
                            productId: productId,
                            network: network,
                            contractAddress: wallet.contractAddress,
                            name: wallet.tokenName || wallet.tokenSymbol,
                            symbol: wallet.tokenSymbol,
                            decimals: wallet.decimals || 18,
                            address: wallet.address
                        });
                        
                        console.log(`✅ Loaded custom token from server: ${productId} (network: ${network})`);
                    }
                });
                
                // セッションストレージにカスタムトークンリストを保存
                sessionStorage.setItem('customTokens', JSON.stringify(customTokensList));
                
                console.log(`✅ Loaded ${serverCustomTokens.length} custom tokens from server`);
            }
        } else {
            console.warn('⚠️ Failed to load custom tokens from server:', response.status);
        }
        
        // クライアントサイドのセッションストレージからも読み込み（フォールバック）
        const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
        
        customTokens.forEach(token => {
            if (token.productId && !products[token.productId]) {
                // トークン情報をproductsオブジェクトに追加
                const tokenInfo = {
                    symbol: token.symbol,
                    chain: token.network.toUpperCase(),
                    decimal: token.decimals,
                    cointype: getCoinType(token.network),
                    tokentype: getTokenType(token.network),
                    name: `${token.name} (${token.symbol} - ${token.network})`,
                    contractAddress: token.contractAddress
                };
                
                if (token.network.toUpperCase() === 'SOL') {
                    tokenInfo.mintaddr = token.contractAddress;
                }
                
                products[token.productId] = tokenInfo;
                
                // セッションストレージに保存（ネットワーク別キー）
                if (token.address) {
                setWalletAddress(token.productId, token.address);
                }
                sessionStorage.setItem(`wallet.0.${token.productId}.contractAddress`, token.contractAddress);
                sessionStorage.setItem(`wallet.0.${token.productId}.tokenInfo`, JSON.stringify(tokenInfo));
            }
        });
        
        console.log('✅ Custom tokens loaded from session storage:', customTokens.length);
    } catch (error) {
        console.error('❌ Error loading custom tokens:', error);
    }
}

// getNetworkFromProductId関数はcoins-libs.jsに移動済み（削除）

/**
 * カスタムトークンを削除
 */
async function removeCustomToken(productId) {
    try {
        console.log('🔧 Removing custom token:', productId);
        
        if (!confirm(`Are you sure you want to remove ${productId}?`)) {
            return;
        }
        
        // サーバーサイドからカスタムトークンを削除
        console.log('🔄 Removing custom token from server...');
        
        // JWTトークンを取得
        let jwtToken = null;
        if (coinsBitvoywallet && typeof coinsBitvoywallet.obtainJWT === 'function') {
            try {
                jwtToken = await coinsBitvoywallet.obtainJWT(coinsMasterId, 'blockchain_access');
            } catch (jwtError) {
                console.warn('⚠️ Failed to obtain JWT, proceeding without authentication:', jwtError);
            }
        }
        
        const reqId = Date.now() + '.1';
        const response = await fetch('/walletapi/custom-token/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(jwtToken ? { 'Authorization': `Bearer ${jwtToken}` } : {})
            },
            body: JSON.stringify({
                reqId: reqId,
                masterId: coinsMasterId,
                productId: productId
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const serverData = await response.json();
        console.log('📦 Server response:', serverData);
        
        if (serverData.status !== 'OK') {
            throw new Error(serverData.message || 'Failed to remove token from server');
        }
        
        // クライアントサイドからも削除
        // productsオブジェクトから削除
        delete products[productId];
        
        // セッションストレージから削除
        sessionStorage.removeItem(`wallet.0.${productId}.address`);
        sessionStorage.removeItem(`wallet.0.${productId}.contractAddress`);
        sessionStorage.removeItem(`wallet.0.${productId}.tokenInfo`);
        
        // カスタムトークンリストから削除
        const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
        const updatedCustomTokens = customTokens.filter(token => token.productId !== productId);
        sessionStorage.setItem('customTokens', JSON.stringify(updatedCustomTokens));
        
        console.log('✅ Custom token removed:', productId);
        
        // 成功メッセージを表示
        alert(`Token ${productId} removed successfully!`);
        
        // メイン画面に戻る
        coinsViewCoin();
        
    } catch (error) {
        console.error('❌ Error removing custom token:', error);
        alert('Failed to remove token: ' + error.message);
    }
}