/**
 * coins-libs.js - コイン関連の独立したライブラリ関数
 * coins.htmlに依存しない処理を提供
 * index.htmlやcoins.htmlから共通利用可能
 */

// BigNumberライブラリを取得する関数
const getBigNumber = function() {
    return window.BigNumber || null;
};

// BitVoy Chain List (Mainnet/Testnet)
// - non-EVM (solana/ton/tron) は chainId を null にして統一
var CHAIN = {
	mainnet: {
		// =========================
		// EVM（全チェーン共通鍵）
		// =========================
		ethereum:  { chainId: 1, isActive: true },
		polygon:   { chainId: 137, isActive: true },
		arbitrum:  { chainId: 42161, isActive: false },
		base:      { chainId: 8453, isActive: false },
		optimism:  { chainId: 10, isActive: false },
		bsc:       { chainId: 56, isActive: false },
		avalanche: { chainId: 43114, isActive: true },

		// =========================
		// non-EVM
		// =========================
		bitcoin:   { chainId: null, isActive: true },
		solana:    { chainId: null, isActive: false },
		ton:       { chainId: null, isActive: false },
		tron:      { chainId: null, isActive: false },
	},

	testnet: {
		// =========================
		// EVM（全チェーン共通鍵）
		// =========================
		ethereum:  { chainId: 11155111, isActive: true }, // Sepolia
		polygon:   { chainId: 80002, isActive: true }, // Amoy
		arbitrum:  { chainId: 421614, isActive: false }, // Arbitrum Sepolia
		base:      { chainId: 84532, isActive: false }, // Base Sepolia
		optimism:  { chainId: 11155420, isActive: false }, // Optimism Sepolia
		bsc:       { chainId: 97, isActive: false }, // BSC Testnet
		avalanche: { chainId: 43113, isActive: true }, // Fuji

		// =========================
		// non-EVM
		// =========================
		bitcoin:   { chainId: null, isActive: true }, // testnetはcoinType=1だが内部HDPathは同一
		solana:    { chainId: null, isActive: false },         // devnet/testnet切替はRPCで
		ton:       { chainId: null, isActive: false },
		tron:      { chainId: null, isActive: false },
	}
};

// BitVoy Products Catalog (mainnet list only)
// - testnetでもこの同一リストを参照する（envは「接続先」と「contracts whitelist」で切替）
// - decimal/cointype は products 側に集約
// - tokentype: ''(native) / 'ERC20' / 'SPL' / 'Jetton' / 'TRC20'
var products = {
	// =========================
	// ネイティブコイン
	// =========================
	BTC:  { symbol:'BTC',  chain:'bitcoin',   decimal:8,  cointype:'0',   tokentype:'',      name:'Bitcoin (BTC)' },
	ETH:  { symbol:'ETH',  chain:'ethereum',  decimal:18, cointype:'60',  tokentype:'',      name:'Ethereum (ETH)' },
	POL:  { symbol:'POL',  chain:'polygon',   decimal:18, cointype:'966', tokentype:'',      name:'Polygon (POL)' },
	SOL:  { symbol:'SOL',  chain:'solana',    decimal:9,  cointype:'501', tokentype:'',      name:'Solana (SOL)' },
	TON:  { symbol:'TON',  chain:'ton',       decimal:9,  cointype:'607', tokentype:'',      name:'Toncoin (TON)' },
	BNB:  { symbol:'BNB',  chain:'bsc',       decimal:18, cointype:'60',  tokentype:'',      name:'BNB (BNB Smart Chain)' },
	AVAX: { symbol:'AVAX', chain:'avalanche', decimal:18, cointype:'60',  tokentype:'',      name:'Avalanche (AVAX)' },
	TRX:  { symbol:'TRX',  chain:'tron',      decimal:6,  cointype:'195', tokentype:'',      name:'TRON (TRX)' },
	// L2 / EVM（ネイティブは ETH）
	ETH_ARB:  { symbol:'ETH', chain:'arbitrum', decimal:18, cointype:'60', tokentype:'', name:'Ethereum (Arbitrum)' },
	ETH_BASE: { symbol:'ETH', chain:'base',     decimal:18, cointype:'60', tokentype:'', name:'Ethereum (Base)' },
	ETH_OPT:  { symbol:'ETH', chain:'optimism', decimal:18, cointype:'60', tokentype:'', name:'Ethereum (Optimism)' },

	// =========================
	// USD Stablecoin (USDC)
	// =========================
	USDC_ERC20: { symbol:'USDC', chain:'ethereum',  decimal:6, cointype:'60', tokentype:'ERC20', name:'USD Coin (USDC - Ethereum)' },
	USDC_POL:   { symbol:'USDC', chain:'polygon',   decimal:6, cointype:'966',tokentype:'ERC20', name:'USD Coin (USDC - Polygon)' },
	USDC_ARB:   { symbol:'USDC', chain:'arbitrum',  decimal:6, cointype:'60', tokentype:'ERC20', name:'USD Coin (USDC - Arbitrum)' },
	USDC_BASE:  { symbol:'USDC', chain:'base',      decimal:6, cointype:'60', tokentype:'ERC20', name:'USD Coin (USDC - Base)' },
	USDC_OPT:   { symbol:'USDC', chain:'optimism',  decimal:6, cointype:'60', tokentype:'ERC20', name:'USD Coin (USDC - Optimism)' },
	USDC_AVAX:  { symbol:'USDC', chain:'avalanche', decimal:6, cointype:'60', tokentype:'ERC20', name:'USD Coin (USDC - Avalanche)' },
	USDC_SOL:   { symbol:'USDC', chain:'solana',    decimal:6, cointype:'501',tokentype:'SPL',   name:'USD Coin (USDC - Solana)' },

	// =========================
	// USD Stablecoin (USDT)
	// =========================
	USDT_ERC20: { symbol:'USDT', chain:'ethereum',  decimal:6,  cointype:'60',  tokentype:'ERC20',  name:'Tether (USDT - Ethereum)' },
	USDT_POL:   { symbol:'USDT', chain:'polygon',   decimal:6,  cointype:'966', tokentype:'ERC20',  name:'Tether (USDT - Polygon)' },
	USDT_SOL:   { symbol:'USDT', chain:'solana',    decimal:6,  cointype:'501', tokentype:'SPL',    name:'Tether (USDT - Solana)' },
	USDT_TON:   { symbol:'USDT', chain:'ton',       decimal:9,  cointype:'607', tokentype:'Jetton', name:'Tether (USDT - TON)' },
	USDT_AVAX:  { symbol:'USDT', chain:'avalanche', decimal:6,  cointype:'60',  tokentype:'ERC20',  name:'Tether (USDT - Avalanche)' },
	USDT_ARB:   { symbol:'USDT', chain:'arbitrum',  decimal:6,  cointype:'60',  tokentype:'ERC20',  name:'Tether (USDT - Arbitrum)' },
	USDT_BNB:   { symbol:'USDT', chain:'bsc',       decimal:18, cointype:'60',  tokentype:'ERC20',  name:'Tether (USDT - BNB Chain)' },
	USDT_TRON:  { symbol:'USDT', chain:'tron',      decimal:6,  cointype:'195', tokentype:'TRC20',  name:'Tether (USDT - TRON)' },

	// =========================
	// JPY Stablecoin (JPYC)
	// =========================
	JPYC_ERC20: { symbol:'JPYC', chain:'ethereum',  decimal:18, cointype:'60', tokentype:'ERC20', name:'JPY Coin (JPYC - Ethereum)' },
	JPYC_POL:   { symbol:'JPYC', chain:'polygon',   decimal:18, cointype:'966',tokentype:'ERC20', name:'JPY Coin (JPYC - Polygon)' },
	JPYC_AVAX:  { symbol:'JPYC', chain:'avalanche', decimal:18, cointype:'60', tokentype:'ERC20', name:'JPY Coin (JPYC - Avalanche)' },

	// =========================
	// Solana SPL トークン
	// =========================
	JUP_SOL:  { symbol:'JUP',  chain:'solana', decimal:6, cointype:'501', tokentype:'SPL', name:'Jupiter (JUP - Solana)' },
	BONK_SOL: { symbol:'BONK', chain:'solana', decimal:5, cointype:'501', tokentype:'SPL', name:'BONK (BONK - Solana)' },
	WIF_SOL:  { symbol:'WIF',  chain:'solana', decimal:6, cointype:'501', tokentype:'SPL', name:'dogwifhat (WIF - Solana)' },
	PYTH_SOL: { symbol:'PYTH', chain:'solana', decimal:6, cointype:'501', tokentype:'SPL', name:'Pyth Network (PYTH - Solana)' },
	RNDR_SOL: { symbol:'RNDR', chain:'solana', decimal:6, cointype:'501', tokentype:'SPL', name:'Render (RNDR - Solana)' },

	// =========================
	// DeFi / L2 (EVM)
	// =========================
	LINK_ERC20:{ symbol:'LINK', chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'ChainLink (LINK - Ethereum)' },
	ONDO_ERC20:{ symbol:'ONDO', chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'Ondo Finance (ONDO - Ethereum)' },
	UNI_ERC20: { symbol:'UNI',  chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'Uniswap (UNI - Ethereum)' },
	AAVE_ERC20:{ symbol:'AAVE', chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'Aave (AAVE - Ethereum)' },
	AAVE_POL:  { symbol:'AAVE', chain:'polygon',  decimal:18, cointype:'966',tokentype:'ERC20', name:'Aave (AAVE - Polygon)' },
	ARB_ARB:   { symbol:'ARB',  chain:'arbitrum', decimal:18, cointype:'60', tokentype:'ERC20', name:'Arbitrum (ARB - Arbitrum)' },
	OP_OPT:    { symbol:'OP',   chain:'optimism', decimal:18, cointype:'60', tokentype:'ERC20', name:'Optimism (OP - Optimism)' },

	// =========================
	// Wrapped
	// =========================
	WETH_ERC20:{ symbol:'WETH', chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'Wrapped ETH (WETH - Ethereum)' },
	WBTC_ERC20:{ symbol:'WBTC', chain:'ethereum', decimal:8,  cointype:'60', tokentype:'ERC20', name:'Wrapped BTC (WBTC - Ethereum)' },

	// =========================
	// Gold-backed
	// =========================
	XAUT_ERC20:{ symbol:'XAUT', chain:'ethereum', decimal:6,  cointype:'60', tokentype:'ERC20', name:'Tether Gold (XAUT - Ethereum)' },
	PAXG_ERC20:{ symbol:'PAXG', chain:'ethereum', decimal:18, cointype:'60', tokentype:'ERC20', name:'PAX Gold (PAXG - Ethereum)' },
};

// BitVoy Safe Whitelist Contracts (Mainnet/Testnet)
// - canonical: 「正」として扱う（受取/送金/決済で許可）
// - products 側の decimal/tokentype と組み合わせて使う
var contracts = {
	// =========================
	// MAINNET
	// =========================
	mainnet: {
		// -------- USDC (Circle native as canonical) --------
		USDC: {
			ethereum:  { standard: "ERC20", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", canonical: true,  issuer: "Circle" },
			polygon:   { standard: "ERC20", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", canonical: true,  issuer: "Circle" },
			arbitrum:  { standard: "ERC20", address: "0xaf88d065e77c8C2239327C5EDb3A432268e5831f", canonical: true,  issuer: "Circle" },
			base:      { standard: "ERC20", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", canonical: true,  issuer: "Circle" },
			optimism:  { standard: "ERC20", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", canonical: true,  issuer: "Circle" },
			avalanche: { standard: "ERC20", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", canonical: true,  issuer: "Circle" },
			solana:    { standard: "SPL",   mint:    "EPjFWdd5AufqSSqeM2qKxekfWRaT8YpuKwhRrbGMF6A", canonical: true, issuer: "Circle" },
		},

		// -------- USDT (Tether) --------
		USDT: {
			ethereum:  { standard: "ERC20",  address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", canonical: true, issuer: "Tether" },
			polygon:   { standard: "ERC20",  address: "0xc2132D05D31c914a87c6611C10748aeb04b58e8F", canonical: true, issuer: "Tether" },
			arbitrum:  { standard: "ERC20",  address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", canonical: true, issuer: "Tether" },
			bsc:       { standard: "ERC20",  address: "0x55d398326f99059fF775485246999027B3197955", canonical: true, issuer: "Tether/Binance-Peg" },
			avalanche: { standard: "ERC20",  address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", canonical: true, issuer: "Tether" },
			solana:    { standard: "SPL",    mint:    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", canonical: true, issuer: "Tether" },
			tron:      { standard: "TRC20",  contract:"TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj", canonical: true, issuer: "Tether" },
			ton:       { standard: "Jetton", jettonRoot:"EQCtd_ukQLYfB8AYx5-5MoE2tKfq2J3GdP5uHi7C7_Yd4_K7", canonical: true, issuer: "Tether" },
		},

		// -------- JPYC --------
		JPYC: {
			ethereum:  { standard: "ERC20", address: "0x2370f9d504c7a6e775bf6e14b3f12846b594cdae", canonical: true, issuer: "JPYC" },
			polygon:   { standard: "ERC20", address: "0x6AE7Dfc73E0dDE2aa99ac063DcF7e8A63265108c", canonical: true, issuer: "JPYC" },
			avalanche: { standard: "ERC20", address: "0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29", canonical: true, issuer: "JPYC" }, // JPY Coin on Avalanche C-Chain
		},

		// -------- Solana SPL tokens --------
		JUP:  { solana: { standard: "SPL", mint: "JUP4Fb2cqiRUcaTHdrPC8hE88yFGkPjCZt21ywZQp", canonical: true } },
		BONK: { solana: { standard: "SPL", mint: "DezXAZ8z7PnrnDJcP6afpR7iCxo4gR7Mt2s7wNzbmV3C", canonical: true } },
		WIF:  { solana: { standard: "SPL", mint: "WifcZ4a9u9bqRKuHz69sV3YxAakzgN26kSc1wh2WxVC", canonical: true } },
		PYTH: { solana: { standard: "SPL", mint: "PythnC7A6kWQWNrvdFMPcpzkWG7LEMLbP7DyFDn6KQp", canonical: true } },
		RNDR: { solana: { standard: "SPL", mint: "RNDR5w3wPPE8kBrYqMMR8LWYhFfHVfJESsNoYt7WTii", canonical: true } },

		// -------- EVM DeFi / L2 --------
		LINK: { ethereum: { standard: "ERC20", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", canonical: true } },
		ONDO: { ethereum: { standard: "ERC20", address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3", canonical: true } },
		UNI:  { ethereum: { standard: "ERC20", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", canonical: true } },
		AAVE: {
			ethereum: { standard: "ERC20", address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9", canonical: true },
			polygon:  { standard: "ERC20", address: "0xdFa03049570Ad8AbAd33d3e4FfB58830d3D9b697", canonical: true },
		},
		ARB: { arbitrum: { standard: "ERC20", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", canonical: true } },
		OP:  { optimism: { standard: "ERC20", address: "0x4200000000000000000000000000000000000042", canonical: true } },

		// -------- Wrapped --------
		WETH: { ethereum: { standard: "ERC20", address: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2", canonical: true } },
		WBTC: { ethereum: { standard: "ERC20", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", canonical: true } },

		// -------- Gold-backed --------
		XAUT: { ethereum: { standard: "ERC20", address: "0x68749665FF8D2d112Fa859AA293F07A622782F38", canonical: true } },
		PAXG: { ethereum: { standard: "ERC20", address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", canonical: true } },
	},

	// =========================
	// TESTNET (あなたのローカル発行・検証用)
	// ※ products は mainnet と同じ一覧を参照する前提
	// ※ ここでは「その環境で使うアドレスだけ差し替える」
	// =========================
	testnet: {
		JPYC: {
			// polygon(amoy) は、ローカルテスト用のコントラクトアドレスになっている (BitVoy Original)
			polygon: { standard: "ERC20", address: "0xf72d15468a94871150AEDa9371060bf21783f3a7", canonical: true, issuer: "LocalTest" },
		},
		USDC: {
			ethereum: { standard: "ERC20", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", canonical: true, issuer: "TestToken" },
			// polygon(amoy) は、ローカルテスト用のコントラクトアドレスになっている (BitVoy Original)
			polygon:  { standard: "ERC20", address: "0x2c9410D676938575c9285496e1C24EB803309584", canonical: true, issuer: "LocalTest" },
			// Avalanche Fuji — Circle official testnet USDC
			avalanche: { standard: "ERC20", address: "0x5425890298aed601595a70AB815c96711a31Bc65", canonical: true, issuer: "Circle" },
		},
		USDT: {
			ethereum: { standard: "ERC20", address: "0x863F9f9D1dB21f3b4dCF28a0C7B3EB4D670C4552", canonical: true, issuer: "TestToken" },
			solana:   { standard: "SPL",   mint: "AL1LGFcr5omt6f5WLi7WpDYXCo4gHMVz8JVu2Ptut8c1", canonical: true, issuer: "TestToken" },
			ton:      { standard: "Jetton",jettonRoot: "kQD0GKBM8ZbryVk2aESmzfU6b9b_8era_IkvBSELujFZPsyy", canonical: true, issuer: "TestToken" },
			// polygon(amoy) を使うならここに address を入れる。0x000.. は入れない（=利用不可）
		},
		BVT: {
			// あなたが本当にデプロイしたら入れる（0x000.. は入れない）
			// ethereum: { standard:"ERC20", address:"0x...", canonical:true, issuer:"LocalTest" }
			// polygon:  { standard:"ERC20", address:"0x...", canonical:true, issuer:"LocalTest" }
			// solana:   { standard:"SPL",   mint:"...",     canonical:true, issuer:"LocalTest" }
			// ton:      { standard:"Jetton",jettonRoot:"...",canonical:true, issuer:"LocalTest" }
		},
	},
};

/**
 * チェーンとアドレスプロパティのマッピング
 * - トークンウォレット作成時に使用するベースアドレスのプロパティ名を返す
 */
const chainToAddressProp = {
	'ethereum': 'ethereum',
	'polygon': 'polygon',
	'arbitrum': 'ethereum',  // EVM系はethereumアドレスを使用
	'base': 'ethereum',
	'optimism': 'ethereum',
	'bsc': 'ethereum',
	'avalanche': 'ethereum',
	'solana': 'solana',
	'ton': 'ton',
	'tron': 'tron'
};

/**
 * UIで扱う標準コイン一覧を取得
 * - 現在のネットワーク(mainnet/testnet)でisActiveがtrueのチェーンのみを対象とする
 * - CHAINオブジェクトのisActiveフラグに基づいてフィルタリング
 */
function getStandardCoinsForUI() {
	const network = getCurrentNetwork();
	const activeChains = new Set();
	
	// 現在のネットワークでisActiveがtrueのチェーンを取得
	if (CHAIN && CHAIN[network]) {
		Object.keys(CHAIN[network]).forEach(chain => {
			if (CHAIN[network][chain].isActive === true) {
				activeChains.add(chain);
			}
		});
	}
	
	// productsから、activeChainsに含まれるチェーンのproductIdのみを返す
	return Object.keys(products).filter(productId => {
		const product = products[productId];
		return product && product.chain && activeChains.has(product.chain);
	});
}

/**
 * 現在選択中のネットワークを取得
 * - 不正な値や未設定の場合は 'mainnet' にフォールバック
 */
function getCurrentNetwork() {
	const network = sessionStorage.getItem('mpc.current_network');
	return network === 'testnet' ? 'testnet' : 'mainnet';
}

/**
 * ネットワーク別ウォレットキーのプレフィックスを取得
 * 形式: wallet.0.<network>.<productId>
 */
function getWalletKeyPrefix(productId) {
	const network = getCurrentNetwork();
	return `wallet.0.${network}.${productId}`;
}

/**
 * ネットワーク別のウォレットアドレスを取得
 * - 新形式: wallet.0.<network>.<productId>.address のみを使用
 * - mainnet/testnetで同じproductIdを使用するため、変換処理は不要
 */
function getWalletAddress(productId) {
	const prefix = getWalletKeyPrefix(productId);
	return sessionStorage.getItem(`${prefix}.address`);
}

/**
 * ネットワーク別のウォレットアドレスを保存
 * - 新形式: wallet.0.<network>.<productId>.address
 */
function setWalletAddress(productId, address) {
	const prefix = getWalletKeyPrefix(productId);
	sessionStorage.setItem(`${prefix}.address`, address);
}

/**
 * コインアイコンを取得（SVG画像を返す）
 */
function getCoinIcon(productId) {
	// productIdからSVGファイル名をマッピング
	const iconMap = {
		// メインネット - ネイティブコイン
		'BTC': 'icon_BTC.svg',
		'ETH': 'icon_ETH.svg',
		'POL': 'icon_POL.svg',
		'SOL': 'icon_SOL.svg',
		'TON': 'icon_TON.svg',
		'BNB': 'icon_BNB.svg',
		'AVAX': 'icon_AVAX.svg',
		'TRX': 'icon_TRX.svg',
		
		// メインネット - USDT (すべてのチェーン)
		'USDT_ERC20': 'icon_USDT.svg',
		'USDT_POL': 'icon_USDT.svg',
		'USDT_SOL': 'icon_USDT.svg',
		'USDT_TON': 'icon_USDT.svg',
		'USDT_AVAX': 'icon_USDT.svg',
		'USDT_ARB': 'icon_USDT.svg',
		'USDT_BNB': 'icon_USDT.svg',
		'USDT_TRON': 'icon_USDT.svg',
		
		// メインネット - USDC (すべてのチェーン)
		'USDC_ERC20': 'icon_USDC.svg',
		'USDC_POL': 'icon_USDC.svg',
		'USDC_ARB': 'icon_USDC.svg',
		'USDC_BASE': 'icon_USDC.svg',
		'USDC_OPT': 'icon_USDC.svg',
		'USDC_AVAX': 'icon_USDC.svg',
		'USDC_SOL': 'icon_USDC.svg',
		
		// メインネット - JPYC (すべてのチェーン)
		'JPYC_ERC20': 'icon_JPYC.svg',
		'JPYC_POL': 'icon_JPYC.svg',
		'JPYC_AVAX': 'icon_JPYC.svg',
		
		// メインネット - DeFi / L2 トークン
		'LINK_ERC20': 'icon_USDT.svg',
		'ONDO_ERC20': 'icon_USDT.svg',
		'UNI_ERC20': 'icon_USDT.svg',
		'AAVE_ERC20': 'icon_USDT.svg',
		'AAVE_POL': 'icon_USDT.svg',
		'ARB_ARB': 'icon_ARB.svg',
		'OP_OPT': 'icon_USDT.svg',
		
		// メインネット - Wrapped
		'WETH_ERC20': 'icon_ETH.svg',
		'WBTC_ERC20': 'icon_BTC.svg',
		
		// メインネット - Gold-backed Tokens
		'XAUT_ERC20': 'icon_USDT.svg',
		'PAXG_ERC20': 'icon_USDT.svg',
		
		// メインネット - Solana SPL トークン
		'JUP_SOL': 'icon_USDT.svg',
		'BONK_SOL': 'icon_USDT.svg',
		'WIF_SOL': 'icon_USDT.svg',
		'PYTH_SOL': 'icon_USDT.svg',
		'RNDR_SOL': 'icon_USDT.svg',
		
		// メインネット - BVT (デフォルトのUSDTアイコンを使用)
		'BVT_ERC20': 'icon_USDT.svg',
		'BVT_POL': 'icon_USDT.svg',
		'BVT_SOL': 'icon_USDT.svg',
		'BVT_TON': 'icon_USDT.svg',
	};
	
	const iconFile = iconMap[productId] || 'icon_USDT.svg';
	const iconPath = `/images/${iconFile}`;
	return `<img src="${iconPath}" alt="${productId}" class="coin-icon-img" style="width: 1.2em; height: 1.2em; vertical-align: middle; display: inline-block;">`;
}

/**
 * 表示名を取得
 */
	function getDisplayName(productId) {
	const displayNames = {
		// メインネット - ネイティブコイン
		'BTC':  'BTC (Bitcoin)',
		'SOL':  'SOL (Solana)',
		'TON':  'TON (TON)',
		'ETH':  'ETH (Ethereum)',
		'POL':  'POL (Polygon)',
		'AVAX': 'AVAX (Avalanche)',
		'BNB':  'BNB (BNB Smart Chain)',
		'TRX':  'TRX (TRON)',

		// メインネット - USDT
		'USDT_ERC20': 'USDT (Ethereum)',
		'USDT_POL': 'USDT (Polygon)',
		'USDT_SOL': 'USDT (Solana)',
		'USDT_TON': 'USDT (TON)',
		'USDT_AVAX': 'USDT (Avalanche)',
		'USDT_ARB': 'USDT (Arbitrum)',
		'USDT_BNB': 'USDT (BNB Chain)',
		'USDT_TRON': 'USDT (TRON)',
		
		// メインネット - USDC
		'USDC_ERC20': 'USDC (Ethereum)',
		'USDC_POL': 'USDC (Polygon)',
		'USDC_ARB': 'USDC (Arbitrum)',
		'USDC_BASE': 'USDC (Base)',
		'USDC_OPT': 'USDC (Optimism)',
		'USDC_AVAX': 'USDC (Avalanche)',
		'USDC_SOL': 'USDC (Solana)',
		
		// メインネット - JPYC
		'JPYC_ERC20': 'JPYC (Ethereum)',
		'JPYC_POL': 'JPYC (Polygon)',
		'JPYC_AVAX': 'JPYC (Avalanche)',
		
		// メインネット - BVT
		'BVT_ERC20': 'BVT (Ethereum)',
		'BVT_POL': 'BVT (Polygon)',
		'BVT_SOL': 'BVT (Solana)',
		'BVT_TON': 'BVT (TON)',
		
		// メインネット - DeFi / L2 トークン
		'LINK_ERC20': 'LINK (Ethereum)',
		'ONDO_ERC20': 'ONDO (Ethereum)',
		'UNI_ERC20': 'UNI (Ethereum)',
		'AAVE_ERC20': 'AAVE (Ethereum)',
		'AAVE_POL': 'AAVE (Polygon)',
		'ARB_ARB': 'ARB (Arbitrum)',
		'OP_OPT': 'OP (Optimism)',
		
		// メインネット - Wrapped
		'WETH_ERC20': 'WETH (Ethereum)',
		'WBTC_ERC20': 'WBTC (Ethereum)',
		
		// メインネット - Gold-backed Tokens
		'XAUT_ERC20': 'XAUT (Ethereum)',
		'PAXG_ERC20': 'PAXG (Ethereum)',
		
		// メインネット - Solana SPL トークン
		'JUP_SOL': 'JUP (Solana)',
		'BONK_SOL': 'BONK (Solana)',
		'WIF_SOL': 'WIF (Solana)',
		'PYTH_SOL': 'PYTH (Solana)',
		'RNDR_SOL': 'RNDR (Solana)',
	};
	
	// 定義された表示名がある場合
	if (displayNames[productId]) {
		return displayNames[productId];
	}
	
	// カスタムトークンの場合、セッションストレージから情報を取得
	const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
	const customToken = customTokens.find(t => t.productId === productId);
	
	if (customToken) {
		// 元のネットワーク名をそのまま表示（小文字のまま）
		return `${customToken.symbol} (${customToken.network})`;
	}
	
	return productId;
}

/**
 * トークンに対応するネイティブコインを取得
 * - mainnet/testnetで同じproductIdを使用する
 */
function getNativeCoinForToken(productId) {
	const product = products[productId];
	if (!product) return null;
	
	const chain = product.chain;
	if (!chain) return null;
	
	// chainに対応するネイティブコインのproductIdを探す
	const chainToNativeCoin = {
		'ethereum': 'ETH',
		'polygon': 'POL',
		'avalanche': 'AVAX',
		'bsc': 'BNB',
		'tron': 'TRX',
		'solana': 'SOL',
		'ton': 'TON',
		'bitcoin': 'BTC',
		'arbitrum': 'ETH',  // EVM系はETHと同じアドレス
		'base': 'ETH',      // EVM系はETHと同じアドレス
		'optimism': 'ETH'   // EVM系はETHと同じアドレス
	};
	
	return chainToNativeCoin[chain] || null;
}

/**
 * 数値フォーマット関数
 */
function digits(amount, digits) {
	let n = 1;
	for(let d = digits; d > 0; d--) { n *= 10; }
	amount = Math.round(amount * n) / n;
	return (amount);
}

/**
 * USD価値を取得（簡易版 - 本番ではCoinGecko API等を使用）
 */
async function getUSDValue(symbol, amount) {
	try {
		// 簡易的な価格設定（本番ではCoinGecko API等を使用）
		const prices = {
			'BTC': 100000,
			'ETH': 3000,
			'POL': 0.15,
			'SOL': 135,
			'TON': 1.8,
			'BVT': 1.5,
			'USDT': 1
		};
		
		const price = prices[symbol] || 0;
		return amount * price;
	} catch (error) {
		console.error('USD value fetch error:', error);
		return 0;
	}
}

/**
 * プロキシリクエストを実行
 */
async function proxyRequest(url, options = {}) {
	try {
		const headers = {
			'Content-Type': 'application/json',
			...options.headers
		};
		
		const response = await fetch(url, {
			...options,
			headers
		});
		
		// レスポンスの詳細ログ
		console.log(`📡 Proxy request: ${options.method || 'GET'} ${url}`);
		console.log(`📡 Response status: ${response.status}`);
		
		if (!response.ok) {
			console.warn(`⚠️ Proxy request failed: ${response.status} ${response.statusText}`);
		}
		
		return response;
	} catch (error) {
		console.error('❌ Proxy request error:', error);
		throw error;
	}
}

/**
 * Bitcoin残高取得 (プロキシ経由)
 */
async function getBTCBalance(address) {
	try {
		// 現在のネットワークを取得
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		console.log(`🪙 Fetching BTC balance via proxy for network: ${currentNetwork}`);
		
		// networkをパスパラメータとして含める: /proxyapi/blockchain/bitcoin/mainnet/address/.../utxo
		const proxyUrl = '/proxyapi/blockchain/bitcoin/' + currentNetwork + '/address/' + address + '/utxo';
		
		const response = await proxyRequest(proxyUrl, {
			method: 'GET'
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ BTC balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const responseData = await response.json();
		console.log('🪙 Proxy response:', responseData);
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data !== undefined) {
			const data = responseData.data;
			
			// Blockbook RPCアドオンのbb_getUTXOsレスポンス形式
			if (Array.isArray(data)) {
				const totalBalance = data.reduce((sum, utxo) => sum + parseFloat(utxo.value), 0);
				const balance = totalBalance / 100000000; // satoshi to BTC
				console.log(`🪙 BTC balance from proxy (UTXOs): ${balance} BTC (network: ${currentNetwork})`);
				return balance;
			} else if (typeof data === 'number') {
				// 直接残高が返される場合（bb_getAddress等）
				console.log(`🪙 BTC balance from proxy (direct): ${data} BTC (network: ${currentNetwork})`);
				return data;
			} else if (data && data.result) {
				// JSON-RPC形式のレスポンスの場合
				const totalBalance = data.result.reduce((sum, utxo) => sum + utxo.satoshis, 0);
				const balance = totalBalance / 1e8;
				console.log(`🪙 BTC balance from proxy (RPC): ${balance} BTC (network: ${currentNetwork})`);
				return balance;
			}
		}

		console.warn('⚠️ BTC balance response missing success or data, returning 0');
		return 0;
	} catch (error) {
		console.error('❌ BTC balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * Ethereum残高取得 (プロキシ経由)
 */
async function getETHBalance(address) {
	try {
		console.log('🔷 Fetching ETH balance via proxy...');
		
		// 現在のネットワークに基づいてエンドポイントを選択（networkをパスパラメータとして含める）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/ethereum/mainnet/address/...
		const proxyUrl = '/proxyapi/blockchain/ethereum/' + currentNetwork + '/address/' + address;
		
		console.log(`🔷 Using ETH endpoint for ${currentNetwork}: ${proxyUrl}`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'GET'
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ ETH balance fetch failed: HTTP ${response.status}`, errorText);
			throw new Error(`ETH proxy balance fetch failed: HTTP ${response.status}`);
		}

		const responseData = await response.json();
		console.log('🔷 Proxy response:', responseData);
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			
			if (typeof data === 'string') {
				// 16進数の残高をBigIntで変換してから10進数に変換（精度を保持）
				const balanceWei = BigInt(data);
				const balance = Number(balanceWei) / 1e18;
				console.log(`🔷 ETH balance from proxy (${currentNetwork}): ${balance} ETH`);
				return balance;
			} else if (data && typeof data === 'object' && data.result) {
				// JSON-RPC形式のレスポンスの場合
				const balanceWei = BigInt(data.result);
				const balance = Number(balanceWei) / 1e18;
				console.log(`🔷 ETH balance from proxy (${currentNetwork}, RPC): ${balance} ETH`);
				return balance;
			} else {
				console.warn('⚠️ Unexpected ETH balance response format:', data);
				return 0;
			}
		} else {
			console.warn('⚠️ ETH balance response missing success or data:', responseData);
			return 0;
		}
	} catch (error) {
		console.error('❌ ETH balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * Avalanche ネイティブ残高取得 (AVAX、プロキシ経由)
 */
async function getAVAXBalance(address) {
	try {
		if (!address || address.length !== 42 || !address.startsWith('0x')) {
			console.error('❌ Invalid AVAX address:', address);
			return 0;
		}
		const currentNetwork = getCurrentNetwork();
		const proxyUrl = '/proxyapi/blockchain/avalanche/' + currentNetwork + '/address/' + address;
		const response = await proxyRequest(proxyUrl, { method: 'GET' });
		if (!response.ok) return 0;
		const responseData = await response.json();
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			if (typeof data === 'string') {
				try {
					const balanceWei = BigInt(data);
					return Number(balanceWei) / 1e18;
				} catch (e) {
					return 0;
				}
			}
			if (data && typeof data === 'object' && data.result) {
				try {
					const balanceWei = BigInt(data.result);
					return Number(balanceWei) / 1e18;
				} catch (e) {
					return 0;
				}
			}
		}
		return 0;
	} catch (error) {
		console.error('❌ AVAX balance fetch error:', error);
		return 0;
	}
}

/**
 * Polygon残高取得 (プロキシ経由)
 */
async function getPOLBalance(address) {
	try {
		console.log('🔷 Fetching POL balance via proxy...');
		console.log('🔷 Address:', address);
		
		// アドレスの検証
		if (!address || address.length !== 42 || !address.startsWith('0x')) {
			console.error('❌ Invalid POL address:', address);
			return 0;
		}
		
		// 現在のネットワークに基づいてエンドポイントを選択（networkをパスパラメータとして含める）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/polygon/mainnet/address/...
		const proxyUrl = '/proxyapi/blockchain/polygon/' + currentNetwork + '/address/' + address;
		
		console.log(`🔷 Using POL endpoint for ${currentNetwork}: ${proxyUrl}`);
		console.log(`🔷 Request method: GET`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'GET'
		});

		console.log(`🔷 Response status: ${response.status} ${response.statusText}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ POL balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const responseData = await response.json();
		console.log('🔷 Proxy response:', JSON.stringify(responseData, null, 2));
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			console.log('🔷 Response data type:', typeof data, 'Value:', data);
			
			if (typeof data === 'string') {
				// 16進数の残高をBigIntで変換してから10進数に変換（精度を保持）
				try {
					const balanceWei = BigInt(data);
					const balance = Number(balanceWei) / 1e18;
					console.log(`🔷 POL balance from proxy (${currentNetwork}): ${balance} POL (wei: ${balanceWei.toString()})`);
					return balance;
				} catch (e) {
					console.error('❌ Failed to parse POL balance as BigInt:', e, 'data:', data);
					return 0;
				}
			} else if (data && typeof data === 'object' && data.result) {
				// JSON-RPC形式のレスポンスの場合
				try {
					const balanceWei = BigInt(data.result);
					const balance = Number(balanceWei) / 1e18;
					console.log(`🔷 POL balance from proxy (${currentNetwork}, RPC): ${balance} POL (wei: ${balanceWei.toString()})`);
					return balance;
				} catch (e) {
					console.error('❌ Failed to parse POL balance result as BigInt:', e, 'result:', data.result);
					return 0;
				}
			} else {
				console.warn('⚠️ Unexpected POL balance response format:', data, 'Type:', typeof data);
				return 0;
			}
		} else {
			console.warn('⚠️ POL balance response missing success or data:', responseData);
			if (responseData) {
				console.warn('   success:', responseData.success);
				console.warn('   data:', responseData.data);
				console.warn('   error:', responseData.error);
			}
			return 0;
		}
	} catch (error) {
		console.error('❌ POL balance fetch error:', error);
		console.error('   Error stack:', error.stack);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * Solana残高取得 (プロキシ経由)
 */
async function getSOLBalance(address) {
	try {
		console.log('☀️ Fetching SOL balance via proxy...');
		
		// 現在のネットワークに基づいてエンドポイントを選択（networkをパスパラメータとして含める）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/solana/mainnet
		const proxyUrl = '/proxyapi/blockchain/solana/' + currentNetwork;
		
		console.log(`☀️ Using SOL endpoint for ${currentNetwork}: ${proxyUrl}`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'getBalance',
				params: [address]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ SOL balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const responseData = await response.json();
		console.log('☀️ Proxy response:', responseData);
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			
			if (data && data.result && data.result.value !== undefined) {
				const balance = data.result.value / 1e9;
				console.log(`☀️ SOL balance from proxy (${currentNetwork}): ${balance} SOL`);
				return balance;
			} else {
				console.warn('⚠️ Unexpected SOL balance response format:', data);
				return 0;
			}
		} else {
			console.warn('⚠️ SOL balance response missing success or data:', responseData);
			return 0;
		}
	} catch (error) {
		console.error('❌ SOL balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * SPL Token残高取得 (プロキシ経由)
 */
async function getSPLBalance(address, tokenMintAddress = null) {
	try {
		console.log('🪙 Fetching SPL token balance via proxy...');
		
		// カスタムトークンの場合、tokenMintAddressを取得
		if (!tokenMintAddress) {
			const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
			const customToken = customTokens.find(t => t.contractAddress);
			if (customToken) {
				tokenMintAddress = customToken.contractAddress;
			} else {
				// デフォルトのUSDT SPL Mint Address
				tokenMintAddress = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
			}
		}
		
		// 現在のネットワークに基づいてエンドポイントを選択（networkをパスパラメータとして含める）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/solana/mainnet
		const proxyUrl = '/proxyapi/blockchain/solana/' + currentNetwork;
		
		console.log(`🪙 Using SPL endpoint for ${currentNetwork}: ${proxyUrl}`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'getTokenAccountsByOwner',
				params: [
					address,
					{ mint: tokenMintAddress },
					{ encoding: 'jsonParsed' }
				]
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ SPL balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const responseData = await response.json();
		console.log('🪙 Proxy response:', responseData);
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			
			if (data && data.result && data.result.value && data.result.value.length > 0) {
				const account = data.result.value[0];
				const balance = account.account.data.parsed.info.tokenAmount.uiAmount;
				console.log(`🪙 SPL token balance from proxy (${currentNetwork}): ${balance}`);
				return balance || 0;
			} else {
				console.warn('⚠️ Unexpected SPL balance response format:', data);
				return 0;
			}
		} else {
			console.warn('⚠️ SPL balance response missing success or data:', responseData);
			return 0;
		}
	} catch (error) {
		console.error('❌ SPL balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * Jetton Token残高取得 (プロキシ経由)
 */
async function getJettonBalance(address, jettonMasterAddress = null) {
	try {
		console.log('🪙 Fetching Jetton balance via proxy...');
		
		// カスタムトークンの場合、jettonMasterAddressを取得
		if (!jettonMasterAddress) {
			const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
			const customToken = customTokens.find(t => t.contractAddress);
			if (customToken) {
				jettonMasterAddress = customToken.contractAddress;
			} else {
				// デフォルトのUSDT Jetton Master Address on TON
				jettonMasterAddress = 'EQB-MPwrd1G6yKXmPJcJ8-MPwrd1G6yKXmPJcJ8-MPwrd1G6yKXmPJcJ8';
			}
		}
		
		// 現在のネットワークに基づいてエンドポイントを選択（パスパラメータ形式で統一）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		const proxyUrl = `/proxyapi/blockchain/ton/${currentNetwork}/jetton/getWallets`;
		
		console.log(`🪙 Using Jetton endpoint for ${currentNetwork}: ${proxyUrl}`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				owner_address: address,
				jetton_address: jettonMasterAddress
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ Jetton balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const data = await response.json();
		console.log('🪙 Proxy response:', data);
		
		if (data && data.ok && data.result && data.result.length > 0) {
			const balance = BigInt(data.result[0].balance);
			const balanceInTON = Number(balance) / 1e9;
			console.log(`🪙 Jetton balance from proxy (${currentNetwork}): ${balanceInTON}`);
			return balanceInTON;
		} else if (data && data.result && data.result.length > 0) {
			// 直接resultがある場合
			const balance = BigInt(data.result[0].balance);
			const balanceInTON = Number(balance) / 1e9;
			console.log(`🪙 Jetton balance from proxy (${currentNetwork}, direct): ${balanceInTON}`);
			return balanceInTON;
		} else {
			console.warn('⚠️ Unexpected Jetton balance response format:', data);
			return 0;
		}
	} catch (error) {
		console.error('❌ Jetton balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * ERC20 Token残高取得 (プロキシ経由)
 * @param {string} address - ウォレットアドレス
 * @param {string} tokenContractAddress - トークンコントラクトアドレス
 * @param {string} chain - チェーン名 ('ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum', 'base', 'optimism' など)
 * @param {number} decimals - トークンのdecimal数（デフォルト: 18）
 */
async function getERC20Balance(address, tokenContractAddress, chain = 'ethereum', decimals = 18) {
	try {
		console.log(`🪙 Fetching ERC20 token balance via proxy (chain: ${chain}, decimals: ${decimals})...`);
		
		// tokenContractAddressの検証
		if (!tokenContractAddress || tokenContractAddress === null || tokenContractAddress === undefined) {
			console.warn(`🪙 Invalid token contract address: ${tokenContractAddress}, returning 0`);
			return 0;
		}
		
		// アドレスの検証
		if (!address || address.length !== 42 || !address.startsWith('0x')) {
			console.error(`❌ Invalid address format: ${address}`);
			return 0;
		}
		
		// 現在のネットワークに基づいてエンドポイントを選択
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		
		// チェーンに応じたエンドポイントを選択（networkをパスパラメータとして含める）
		let proxyUrl;
		if (chain === 'polygon') {
			// networkをパスパラメータとして含める: /proxyapi/blockchain/polygon/mainnet
			proxyUrl = '/proxyapi/blockchain/polygon/' + currentNetwork;
		} else if (chain === 'ethereum') {
			// networkをパスパラメータとして含める: /proxyapi/blockchain/ethereum/mainnet
			proxyUrl = '/proxyapi/blockchain/ethereum/' + currentNetwork;
		} else if (chain === 'avalanche') {
			proxyUrl = '/proxyapi/blockchain/avalanche/' + currentNetwork;
		} else {
			// その他のチェーンはethereumエンドポイントを使用（EVM互換）
			proxyUrl = '/proxyapi/blockchain/ethereum/' + currentNetwork;
		}
		
		console.log(`🪙 Using ERC20 endpoint for ${chain} (${currentNetwork}): ${proxyUrl}`);
		console.log(`🪙 Token contract address: ${tokenContractAddress}, Wallet address: ${address}`);
		
		// ERC20 balanceOf function signature: 0x70a08231
		const data = '0x70a08231' + address.slice(2).padStart(64, '0');
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: Date.now(),
				method: 'eth_call',
				params: [
					{ to: tokenContractAddress, data },
					'latest'
				]
			})
		});

		if (response.ok) {
			const responseData = await response.json();
			console.log('🪙 Proxy response:', responseData);
			
			// WalletServiceのレスポンス形式に対応
			// proxyPolygonRequestは data: response.data.result を直接返す
			if (responseData && responseData.success && responseData.data) {
				let resultHex;
				
				// レスポンス形式の確認
				if (typeof responseData.data === 'string') {
					// 直接16進数文字列の場合
					resultHex = responseData.data;
				} else if (responseData.data && typeof responseData.data.result === 'string') {
					// ネストされた形式の場合
					resultHex = responseData.data.result;
				} else {
					console.warn('🪙 Unexpected response format:', responseData.data);
					return 0;
				}
				
				// 16進数をBigIntで変換してから10進数に変換（精度を保持）
				const balanceWei = BigInt(resultHex);
				const divisor = BigInt(10) ** BigInt(decimals);
				const quotient = balanceWei / divisor;
				const remainder = balanceWei % divisor;
				
				// 整数部分と小数部分を結合
				let balance;
				if (remainder === 0n) {
					balance = Number(quotient);
				} else {
					// 小数部分を計算
					const remainderStr = remainder.toString().padStart(decimals, '0');
					const remainderTrimmed = remainderStr.replace(/0+$/, '');
					balance = Number(quotient) + (remainderTrimmed ? Number('0.' + remainderTrimmed) : 0);
				}
				
				console.log(`🪙 ERC20 token balance from proxy (${chain}, ${currentNetwork}): ${balance} (wei: ${balanceWei.toString()}, decimals: ${decimals}, hex: ${resultHex})`);
				return balance;
			}
		}

		console.warn('🪙 ERC20 balance fetch failed: response not ok or invalid format');
		return 0;
	} catch (error) {
		console.error('❌ ERC20 balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * TON残高取得 (プロキシ経由)
 */
async function getTONBalance(address) {
	try {
		console.log('💎 Fetching TON balance via proxy...');
		
		// 現在のネットワークに基づいてエンドポイントを選択（パスパラメータ形式で統一）
		const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
		const proxyUrl = `/proxyapi/blockchain/ton/${currentNetwork}/getAddressBalance`;
		
		console.log(`💎 Using TON endpoint for ${currentNetwork}: ${proxyUrl}`);
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				address: address
			})
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ TON balance fetch failed: HTTP ${response.status}`, errorText);
			return 0;
		}

		const responseData = await response.json();
		console.log('💎 Proxy response:', responseData);
		
		// WalletServiceのレスポンス形式に対応
		if (responseData && responseData.success && responseData.data) {
			const data = responseData.data;
			
			if (data && data.ok && data.result) {
				const balance = Number(BigInt(data.result)) / 1e9;
				console.log(`💎 TON balance from proxy (${currentNetwork}): ${balance} TON`);
				return balance;
			} else if (data && data.result) {
				// 直接resultがある場合
				const balance = Number(BigInt(data.result)) / 1e9;
				console.log(`💎 TON balance from proxy (${currentNetwork}, direct): ${balance} TON`);
				return balance;
			} else {
				console.warn('⚠️ Unexpected TON balance response format:', data);
				return 0;
			}
		} else {
			console.warn('⚠️ TON balance response missing success or data:', responseData);
			return 0;
		}
	} catch (error) {
		console.error('❌ TON balance fetch error:', error);
		// エラーが発生した場合は0を返す（残高が0として表示される）
		return 0;
	}
}

/**
 * productIdからネットワークを取得
 * @deprecated productIdからネットワークを取得しない要件に従い削除
 * 代わりにproducts[productId].chainを使用してください
 */

/**
 * productIdからコインタイプを取得
 * - PRODUCTSからcointypeを取得する
 */
function getCoinType(productId) {
	const product = products[productId];
	if (!product) return '0';
	return product.cointype || '0';
}

/**
 * productIdとnetworkからchainIdを取得
 * - CHAIN[network][chain].chainIdから取得
 * @param {string} productId - プロダクトID
 * @param {string} network - ネットワーク ('mainnet' または 'testnet')
 * @returns {number|null} chainId (non-EVMチェーンの場合はnull)
 */
function getChainId(productId, network = null) {
	if (!productId || typeof productId !== 'string') {
		return null;
	}

	const product = products[productId];
	if (!product || !product.chain) {
		return null;
	}

	const chain = product.chain.toLowerCase();
	const currentNetwork = network || getCurrentNetwork();
	
	// CHAINからchainIdを取得
	if (CHAIN && CHAIN[currentNetwork] && CHAIN[currentNetwork][chain]) {
		return CHAIN[currentNetwork][chain].chainId;
	}
	
	return null;
}

/**
 * [非推奨・削除予定] productIdとnetworkからhdPathを取得
 * HDWallet廃止により、この関数は使用されなくなりました。
 * @deprecated HDWallet廃止により削除予定
 * @param {string} productId - プロダクトID
 * @param {string} network - ネットワーク ('mainnet' または 'testnet')
 * @returns {string} hdPath
 */
function getHDPath(productId, network = null) {
	console.warn('[DEPRECATED] getHDPath is deprecated. HDWallet has been removed.');
	// 後方互換性のため、デフォルト値を返す（実際には使用されない）
	return '/ethereum/0/0';
}

/**
 * productIdとnetworkからコントラクトアドレスを取得
 * - CONTRACTS[network][symbol][chain]から取得
 * @param {string} productId - プロダクトID
 * @param {string} network - ネットワーク ('mainnet' または 'testnet')
 * @returns {string|null} コントラクトアドレス (address, mint, jettonRoot, contract)
 */
function getContractAddress(productId, network = null) {
	if (!productId || typeof productId !== 'string') {
		return null;
	}

	const product = products[productId];
	if (!product || !product.chain) {
		return null;
	}

	const chain = product.chain.toLowerCase();
	const symbol = product.symbol;
	const currentNetwork = network || getCurrentNetwork();
	
	// CONTRACTSからコントラクトアドレスを取得
	if (contracts && contracts[currentNetwork] && contracts[currentNetwork][symbol] && contracts[currentNetwork][symbol][chain]) {
		const entry = contracts[currentNetwork][symbol][chain];
		if (entry.canonical === true) {
			// EVM: address, Solana: mint, TON: jettonRoot, TRON: contract
			return entry.address || entry.mint || entry.jettonRoot || entry.contract || null;
		}
	}
	
	return null;
}

/**
 * ネットワークに基づいてトークンタイプを取得
 */
function getTokenType(network) {
	const tokenTypes = {
		'ETH': 'ERC20',
		'POL': 'ERC20',
		'SOL': 'SPL',
		'TON': 'Jetton'
	};
	return tokenTypes[network] || '';
}

/**
 * [非推奨・削除予定] productIdからMPC-HD形式の派生パスを生成
 * HDWallet廃止により、この関数は使用されなくなりました。
 * @deprecated HDWallet廃止により削除予定
 * @param {string} productId - プロダクトID
 * @param {number} account - アカウント番号
 * @param {number} addressIndex - アドレスインデックス
 * @returns {string} hdPath
 */
function getMPCHDPath(productId, account = 0, addressIndex = 0) {
	console.warn('[DEPRECATED] getMPCHDPath is deprecated. HDWallet has been removed.');
	// 後方互換性のため、デフォルト値を返す（実際には使用されない）
	return '/ethereum/0/0';
}

/**
 * ERC20トークンのコントラクトアドレスを取得
 * - 標準トークン: getContractAddress を使用して contracts オブジェクトから取得
 * - 標準トークン: BitVoyConfig.tokens から取得
 * - カスタムトークン: sessionStorage.customTokens から取得
 */
function getERC20TokenContractAddress(productId) {
	try {
		// カスタムトークンから検索（Ethereum系）
		const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
		const customToken = customTokens.find(t => t.productId === productId && t.network === 'ethereum');
		if (customToken && customToken.contractAddress) {
			console.log(`🔍 Using custom ERC20 token contract for ${productId}: ${customToken.contractAddress}`);
			return customToken.contractAddress;
		}

		// getContractAddress を使用して contracts オブジェクトから取得（優先）
		const contractAddress = getContractAddress(productId);
		if (contractAddress) {
			console.log(`🔍 Using getContractAddress for ${productId}: ${contractAddress}`);
			return contractAddress;
		}

		// 旧形式のcontracts[productId]を確認（後方互換性のため）
		if (contracts && contracts[productId]) {
			console.log(`🔍 Using legacy contracts object for ${productId}: ${contracts[productId]}`);
			return contracts[productId];
		}

		// 標準トークン: BitVoyConfig.tokens から取得
		if (typeof BitVoyConfig !== 'undefined' && BitVoyConfig.tokens) {
			const env = BitVoyConfig.environment === 'testnet' ? 'testnet' : 'mainnet';
			const tokens = BitVoyConfig.tokens[env] || {};

			// USDT系
			if (productId.startsWith('USDT_')) {
				if (tokens.USDT_ERC20) {
					console.log(`🔍 Using configured USDT_ERC20 contract for ${productId}: ${tokens.USDT_ERC20}`);
					return tokens.USDT_ERC20;
				}
			}

			// BVT系
			if (productId.startsWith('BVT_') && tokens.BVT) {
				console.log(`🔍 Using configured BVT contract for ${productId}: ${tokens.BVT}`);
				return tokens.BVT;
			}
		}

		console.warn(`⚠️ No ERC20 contract address found for ${productId}`);
		return null;
	} catch (e) {
		console.error('getERC20TokenContractAddress error:', e);
		return null;
	}
}

/**
 * Polygonトークンのコントラクトアドレスを取得
 * - 標準トークン: getContractAddress を使用して contracts オブジェクトから取得（network別）
 * - 標準トークン: products 定義や BitVoyConfig.tokens から取得（必要に応じて拡張）
 * - カスタムトークン: sessionStorage.customTokens から取得
 * @param {string} productId - プロダクトID（例: 'JPYC_POL', 'USDC_POL'）
 * @returns {string|null} コントラクトアドレス、見つからない場合はnull
 */
function getPolygonTokenContractAddress(productId) {
	try {
		// 現在のネットワークを取得
		const currentNetwork = getCurrentNetwork();
		
		// カスタムトークンから検索（Polygon系）
		const customTokens = JSON.parse(sessionStorage.getItem('customTokens') || '[]');
		const customToken = customTokens.find(t => t.productId === productId && t.network === 'polygon');
		if (customToken && customToken.contractAddress) {
			console.log(`🔍 Using custom Polygon token contract for ${productId} (${currentNetwork}): ${customToken.contractAddress}`);
			return customToken.contractAddress;
		}

		// getContractAddress を使用して contracts オブジェクトから取得（優先）
		const contractAddress = getContractAddress(productId);
		if (contractAddress) {
			console.log(`🔍 Using getContractAddress for ${productId} (${currentNetwork}): ${contractAddress}`);
			return contractAddress;
		}

		// 旧形式のcontracts[productId]を確認（後方互換性のため）
		if (contracts && contracts[productId]) {
			console.log(`🔍 Using legacy contracts object for ${productId}: ${contracts[productId]}`);
			return contracts[productId];
		}

		// 標準トークン（USDT_POL など）は products 定義に mintaddr が含まれる場合がある
		const product = products[productId];
		if (product && product.mintaddr) {
			console.log(`🔍 Using products.mintaddr as Polygon token contract for ${productId}: ${product.mintaddr}`);
			return product.mintaddr;
		}

		console.warn(`⚠️ No Polygon token contract address found for ${productId} (network: ${currentNetwork})`);
		return null;
	} catch (e) {
		console.error('getPolygonTokenContractAddress error:', e);
		return null;
	}
}

/**
 * Solana ATAアドレスを計算
 */
async function calculateSolanaATA(ownerAddress, mintAddress) {
	try {
		// Solana Web3.jsを使用してATAを計算
		if (typeof window.SolanaWeb3 !== 'undefined') {
			const { PublicKey } = window.SolanaWeb3;
			const { getAssociatedTokenAddress } = window.SolanaWeb3;
			
			const owner = new PublicKey(ownerAddress);
			const mint = new PublicKey(mintAddress);
			
			const ata = await getAssociatedTokenAddress(mint, owner);
			return ata.toString();
		} else {
			// フォールバック: 簡易計算
			console.warn('Solana Web3.js not available, using fallback calculation');
			return ownerAddress; // 簡易版としてオーナーアドレスを返す
		}
	} catch (error) {
		console.error('Error calculating Solana ATA:', error);
		// フォールバック
		return ownerAddress;
	}
}

/**
 * TON Jettonアドレスを計算
 */
async function calculateTONJettonAddress(ownerAddress, jettonMasterAddress) {
	try {
		// TON Web.jsを使用してJettonアドレスを計算
		if (typeof window.TonWeb !== 'undefined') {
			const tonweb = new window.TonWeb();
			
			// Jettonマスターコントラクトとウォレット所有者のアドレスを作成
			const masterAddress = new TonWeb.utils.Address(jettonMasterAddress);
			const ownerTonAddress = new TonWeb.utils.Address(ownerAddress);

			// Jettonウォレットアドレスを計算
			const JettonWalletClass = TonWeb.token.jetton.JettonWallet;
			const jettonWallet = new JettonWalletClass(tonweb.provider, {
				jettonMasterAddress: masterAddress,
				walletAddress: ownerTonAddress,
			});

			// アドレスを取得
			const jettonWalletAddress = await jettonWallet.getAddress();
			const base64Address = jettonWalletAddress.toString(true, true, true);
			
			console.log("Generated Jetton Wallet Address: ", base64Address);
			return base64Address;
		} else {
			// フォールバック: 簡易計算
			console.warn('TON Web.js not available, using fallback calculation');
			return ownerAddress; // 簡易版としてオーナーアドレスを返す
		}
	} catch (error) {
		console.error('Error calculating TON Jetton address:', error);
		// フォールバック
		return ownerAddress;
	}
}

/**
 * トークンアドレスを計算
 */
async function calculateTokenAddress(network, contractAddress) {
	try {
		console.log(`🔧 Calculating token address for ${network} with contract ${contractAddress}`);
		
		// ネットワーク名を小文字に正規化して比較
		const networkLower = network.toLowerCase();
		
		switch (networkLower) {
			case 'ethereum':
				// ERC20の場合はETHと同じアドレスを使用
				const ethAddress = getWalletAddress('ETH');
				if (!ethAddress) {
					throw new Error('ETH address not found');
				}
				console.log(`✅ ERC20 token address: ${ethAddress}`);
				return ethAddress;
				
			case 'polygon':
				// ERC20の場合はPOLと同じアドレスを使用
				const polAddress = getWalletAddress('POL');
				if (!polAddress) {
					throw new Error('POL address not found');
				}
				console.log(`✅ ERC20 token address: ${polAddress}`);
				return polAddress;
				
			case 'solana':
				// Solanaの場合はATA（Associated Token Account）を計算
				const solAddress = getWalletAddress('SOL');
				if (!solAddress) {
					throw new Error('SOL address not found');
				}
				
				// ATAアドレスを計算（簡易版）
				const ataAddress = await calculateSolanaATA(solAddress, contractAddress);
				console.log(`✅ Solana ATA address: ${ataAddress}`);
				return ataAddress;
				
			case 'ton':
				// TONの場合はJettonアドレスを計算
				const tonAddress = getWalletAddress('TON');
				if (!tonAddress) {
					throw new Error('TON address not found');
				}
				
				// Jettonアドレスを計算（簡易版）
				const jettonAddress = await calculateTONJettonAddress(tonAddress, contractAddress);
				console.log(`✅ TON Jetton address: ${jettonAddress}`);
				return jettonAddress;
				
			default:
				throw new Error(`Unsupported network: ${network}`);
		}
	} catch (error) {
		console.error('❌ Error calculating token address:', error);
		throw error;
	}
}

/**
 * Ethereum / Ethereum Sepolia 上の ERC20トークン履歴を取得
 */
async function getEthereumTokenTransactionHistory(productId, address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const contractAddress = getERC20TokenContractAddress(productId);

		if (!contractAddress) {
			console.warn(`⚠️ No ERC20 contract address for ${productId}, returning empty history`);
			return [];
		}

		const proxyBase = '/proxyapi/blockchain/ethereum';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/ethereum/mainnet/address/.../tokentx
		const proxyUrl = `${proxyBase}/${currentNetwork}/address/${encodeURIComponent(address)}/tokentx`;

		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				productId,
				contractAddress
			})
		});

		const data = await response.json();

		if (data && data.success) {
			if (Array.isArray(data.data)) {
				return data.data;
			}
			if (Array.isArray(data.transactions)) {
				return data.transactions;
			}
		}

		return [];
	} catch (error) {
		console.error(`getEthereumTokenTransactionHistory error for ${productId}:`, error);
		return [];
	}
}

/**
 * Polygon / Polygon Amoy 上の ERC20トークン履歴を取得
 */
async function getPolygonTokenTransactionHistory(productId, address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const contractAddress = getPolygonTokenContractAddress(productId);

		if (!contractAddress) {
			console.warn(`⚠️ No Polygon token contract address for ${productId}, returning empty history`);
			return [];
		}

		const proxyBase = '/proxyapi/blockchain/polygon';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/polygon/mainnet/address/.../tokentx
		const proxyUrl = `${proxyBase}/${currentNetwork}/address/${encodeURIComponent(address)}/tokentx`;

		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({
				productId,
				contractAddress
			})
		});

		const data = await response.json();

		if (data && data.success) {
			if (Array.isArray(data.data)) {
				return data.data;
			}
			if (Array.isArray(data.transactions)) {
				return data.transactions;
			}
		}

		return [];
	} catch (error) {
		console.error(`getPolygonTokenTransactionHistory error for ${productId}:`, error);
		return [];
	}
}

/**
 * Avalanche ネイティブトランザクション履歴を取得（AVAX）
 */
async function getAvalancheTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const proxyUrl = `/proxyapi/blockchain/avalanche/${currentNetwork}/address/${encodeURIComponent(address)}/transactions`;
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ productId: 'AVAX', network: currentNetwork })
		});
		const data = await response.json();
		if (data && data.success && Array.isArray(data.data)) return data.data;
		return [];
	} catch (error) {
		console.error('getAvalancheTransactionHistory error:', error);
		return [];
	}
}

/**
 * Avalanche 上の ERC20 トークン履歴を取得
 */
async function getAvalancheTokenTransactionHistory(productId, address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const contractAddress = getContractAddress(productId);
		if (!contractAddress) {
			console.warn(`⚠️ No Avalanche token contract address for ${productId}, returning empty history`);
			return [];
		}
		const proxyBase = '/proxyapi/blockchain/avalanche';
		const proxyUrl = `${proxyBase}/${currentNetwork}/address/${encodeURIComponent(address)}/tokentx`;
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ productId, contractAddress })
		});
		const data = await response.json();
		if (data && data.success && Array.isArray(data.data)) {
			return data.data;
		}
		return [];
	} catch (error) {
		console.error(`getAvalancheTokenTransactionHistory error for ${productId}:`, error);
		return [];
	}
}

/**
 * Bitcoinトランザクション履歴を取得
 */
async function getBitcoinTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		
		// networkをパスパラメータとして含める: /proxyapi/blockchain/bitcoin/mainnet/address/.../transactions
		const proxyUrl = `/proxyapi/blockchain/bitcoin/${currentNetwork}/address/${encodeURIComponent(address)}/transactions`;
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ 
				productId: 'BTC',
				network: currentNetwork
			})
		});
		
		const responseData = await response.json();
		
		if (responseData && responseData.success) {
			if (Array.isArray(responseData.data)) {
				return responseData.data;
			} else if (typeof responseData.data === 'number') {
				return [];
			} else if (responseData.addressInfo) {
				// networkをパスパラメータとして含める: /proxyapi/blockchain/bitcoin/mainnet/address/.../txlist?productId=BTC
				const txListUrl = `/proxyapi/blockchain/bitcoin/${currentNetwork}/address/${encodeURIComponent(address)}/txlist?productId=BTC`;
				
				try {
					const txResponse = await proxyRequest(txListUrl, { method: 'GET' });
					const txData = await txResponse.json();
					
					if (txData && txData.success && Array.isArray(txData.data)) {
						return txData.data;
					}
				} catch (txError) {
					console.warn(`⚠️ Failed to get transaction list:`, txError);
				}
				
				return [];
			}
		}
		
		return [];
	} catch (error) {
		console.error('Bitcoin transaction history error:', error);
		return [];
	}
}

/**
 * Ethereumトランザクション履歴を取得
 */
async function getEthereumTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const proxyBase = '/proxyapi/blockchain/ethereum';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/ethereum/mainnet/address/.../transactions
		const proxyUrl = `${proxyBase}/${currentNetwork}/address/${encodeURIComponent(address)}/transactions`;

		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ 
				productId: 'ETH',
				network: currentNetwork
			})
		});
		
		const responseData = await response.json();
		
		if (responseData && responseData.success && responseData.data) {
			return responseData.data;
		}
		
		return [];
	} catch (error) {
		console.error('Ethereum transaction history error:', error);
		return [];
	}
}

/**
 * Polygonトランザクション履歴を取得
 */
async function getPolygonTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const proxyBase = '/proxyapi/blockchain/polygon';
		// networkをパスパラメータとして含める: /proxyapi/blockchain/polygon/mainnet/address/.../transactions
		const proxyUrl = `${proxyBase}/${currentNetwork}/address/${encodeURIComponent(address)}/transactions`;

		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ 
				productId: 'POL',
				network: currentNetwork
			})
		});
		
		const responseData = await response.json();
		
		if (responseData && responseData.success && responseData.data) {
			return responseData.data;
		}
		
		return [];
	} catch (error) {
		console.error('Polygon transaction history error:', error);
		return [];
	}
}

/**
 * Solanaトランザクション履歴を取得
 */
async function getSolanaTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		// networkをパスパラメータとして含める: /proxyapi/blockchain/solana/mainnet/address/.../transactions
		const proxyUrl = `/proxyapi/blockchain/solana/${currentNetwork}/address/${encodeURIComponent(address)}/transactions`;
		
		const response = await proxyRequest(proxyUrl, {
			method: 'POST',
			body: JSON.stringify({ productId: 'SOL' })
		});
		
		const responseData = await response.json();
		
		if (responseData && responseData.success && responseData.data) {
			return responseData.data;
		}
		
		return [];
	} catch (error) {
		console.error('Solana transaction history error:', error);
		return [];
	}
}

/**
 * TONトランザクション履歴を取得
 */
async function getTONTransactionHistory(address) {
	try {
		const currentNetwork = getCurrentNetwork();
		const proxyUrl = `/proxyapi/blockchain/ton/${currentNetwork}/getTransactions?address=${encodeURIComponent(address)}&limit=20`;
		
		const response = await proxyRequest(proxyUrl, {
			method: 'GET'
		});
		
		const responseData = await response.json();
		
		if (responseData && responseData.success && responseData.data) {
			return responseData.data;
		}
		
		return [];
	} catch (error) {
		console.error('TON transaction history error:', error);
		return [];
	}
}

/**
 * トランザクション履歴を取得（メイン関数）
 * @param {string} productId - プロダクトID
 * @param {string} address - ウォレットアドレス
 * @param {string} masterId - マスターID（オプション、BitVoy API使用時のみ必要）
 */
async function getTransactionHistory(productId, address, masterId = null) {
	try {
		let transactions = [];
		
		// BitVoy APIが失敗した場合、外部APIを使用
		switch(productId) {
			case 'BTC':
				transactions = await getBitcoinTransactionHistory(address);
				break;
			case 'ETH':
				transactions = await getEthereumTransactionHistory(address);
				break;
			case 'POL':
				transactions = await getPolygonTransactionHistory(address);
				break;
			case 'SOL':
				transactions = await getSolanaTransactionHistory(address);
				break;
			case 'TON':
				transactions = await getTONTransactionHistory(address);
				break;
			case 'AVAX':
				transactions = await getAvalancheTransactionHistory(address);
				break;
			default:
				// トークンの場合はチェーン別に専用のトークン履歴APIを使用する
				if (productId.includes('_ERC20')) {
					transactions = await getEthereumTokenTransactionHistory(productId, address);
				} else if (productId.includes('_POL')) {
					transactions = await getPolygonTokenTransactionHistory(productId, address);
				} else if (productId.includes('_AVAX')) {
					transactions = await getAvalancheTokenTransactionHistory(productId, address);
				} else if (productId.includes('_SOL')) {
					console.log(`🔍 Token ${productId} (SOL) history fallback not implemented, returning empty history`);
					transactions = [];
				} else if (productId.includes('_TON')) {
					console.log(`🔍 Token ${productId} (TON) history fallback not implemented, returning empty history`);
					transactions = [];
				}
				break;
		}
		
		return Array.isArray(transactions) ? transactions : [];
	} catch (error) {
		console.error('Error fetching transaction history:', error);
		return [];
	}
}

// グローバルスコープに公開（windowオブジェクトに追加）
if (typeof window !== 'undefined') {
	window.CoinsLibs = {
		// データ定義
		products,
		contracts,
		CHAIN,
		chainToAddressProp,
		
		// ユーティリティ関数
		getBigNumber,
		getStandardCoinsForUI,
		getCurrentNetwork,
		getWalletKeyPrefix,
		getWalletAddress,
		setWalletAddress,
		getCoinIcon,
		getDisplayName,
		getNativeCoinForToken,
		digits,
		getUSDValue,
		proxyRequest,
		getCoinType,
		getChainId,
		// getHDPath, // HDWallet廃止により削除
		getContractAddress,
		getTokenType,
		getERC20TokenContractAddress,
		getPolygonTokenContractAddress,
		calculateSolanaATA,
		calculateTONJettonAddress,
		calculateTokenAddress,
		// getMPCHDPath, // HDWallet廃止により削除
		
		// 残高取得関数
		getBTCBalance,
		getETHBalance,
		getAVAXBalance,
		getPOLBalance,
		getSOLBalance,
		getSPLBalance,
		getJettonBalance,
		getERC20Balance,
		getTONBalance,
		
		// トランザクション履歴取得関数
		getTransactionHistory,
		getBitcoinTransactionHistory,
		getEthereumTransactionHistory,
		getPolygonTransactionHistory,
		getSolanaTransactionHistory,
		getTONTransactionHistory,
		getEthereumTokenTransactionHistory,
		getPolygonTokenTransactionHistory,
		getAvalancheTokenTransactionHistory,
		getAVAXBalance,
		getAvalancheTransactionHistory
	};
	
	// 後方互換性のため、グローバル変数としても公開
	window.products = products;
	window.contracts = contracts;
}

