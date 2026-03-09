/**
 * BitVoy OIDC Payment Intent 管理ユーティリティ
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ulid } = require('ulid');
const webhookUtils = require('./webhook-utils');
const https = require('https');
const http = require('http');

/**
 * 通貨情報（WalletService.jsのPRODUCTSからコピー）
 */
const PRODUCTS = {
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

/**
 * 通貨コードとチェーンからdecimalを取得
 * @param {string} currency - 通貨コード（例: 'JPYC', 'USDC'）
 * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'、オプション）
 * @returns {number|null} decimal値、見つからない場合はnull
 */
function getCurrencyDecimal(currency, chain = null) {
    const currencyUpper = currency.toUpperCase();
    const chainLower = chain ? chain.toLowerCase() : null;
    
    // チェーンが指定されている場合、通貨コードとチェーンの組み合わせで検索
    if (chainLower) {
        // チェーン名のマッピング
        const chainMap = {
            'polygon': 'POL',
            'ethereum': 'ERC20',
            'arbitrum': 'ARB',
            'base': 'BASE',
            'optimism': 'OPT',
            'avalanche': 'AVAX',
            'bsc': 'BNB',
            'solana': 'SOL',
            'ton': 'TON',
            'tron': 'TRON'
        };
        
        const chainKey = chainMap[chainLower];
        if (chainKey) {
            // productIdを生成（例: JPYC_POL, USDC_ERC20）
            const productId = `${currencyUpper}_${chainKey}`;
            if (PRODUCTS[productId]) {
                return PRODUCTS[productId].decimal;
            }
        }
    }
    
    // チェーンが指定されていない、または見つからない場合、symbolで検索
    // 最初に見つかったエントリのdecimalを返す
    for (const [productId, product] of Object.entries(PRODUCTS)) {
        if (product.symbol && product.symbol.toUpperCase() === currencyUpper) {
            return product.decimal;
        }
    }
    
    // ネイティブコインの場合（例: ETH, POL）
    if (PRODUCTS[currencyUpper]) {
        return PRODUCTS[currencyUpper].decimal;
    }
    
    return null;
}

/**
 * Intent ID生成（ULID）
 */
function generateIntentId() {
    return `int_${ulid()}`;
}

/**
 * Nonce生成（再利用防止）
 */
function generateNonce() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Intent本文のJWS署名生成
 */
function signIntent(intentPayload, secret) {
    try {
        const token = jwt.sign(intentPayload, secret || process.env.JWT_SECRET || 'bitvoy-oidc-secret-key', {
            algorithm: 'HS256',
            expiresIn: '1h'
        });
        return token;
    } catch (error) {
        console.error('Intent署名生成エラー:', error);
        throw error;
    }
}

/**
 * Intent署名検証
 */
function verifyIntentSignature(intentToken, secret) {
    try {
        const decoded = jwt.verify(intentToken, secret || process.env.JWT_SECRET || 'bitvoy-oidc-secret-key');
        return decoded;
    } catch (error) {
        console.error('Intent署名検証エラー:', error);
        return null;
    }
}

/**
 * Intent検証（存在、ステータス、期限など）
 */
async function validateIntent(dbPool, intentId, clientId) {
    try {
        const [rows] = await dbPool.execute(
            'SELECT * FROM oidc_payment_intents WHERE intent_id = ?',
            [intentId]
        );

        if (rows.length === 0) {
            return { valid: false, error: 'invalid_intent', message: 'Intentが存在しません' };
        }

        const intent = rows[0];

        // rp_client_idの一致確認
        if (intent.rp_client_id !== clientId) {
            return { valid: false, error: 'invalid_intent', message: 'Intentへのアクセス権限がありません' };
        }

        // 期限切れチェック
        const now = new Date();
        const expiresAt = new Date(intent.expires_at);
        if (now > expiresAt) {
            // 期限切れの場合、ステータスを更新
            if (intent.status !== 'EXPIRED') {
                try {
                    await expireIntent(dbPool, intentId);
                } catch (error) {
                    console.error('Intent期限切れ更新エラー:', error);
                }
            }
            return { valid: false, error: 'intent_expired', message: 'Intentの有効期限が切れています' };
        }

        // ステータスチェック
        if (intent.status === 'CANCELED') {
            return { valid: false, error: 'intent_canceled', message: 'Intentがキャンセルされています' };
        }

        if (intent.status === 'SUCCEEDED') {
            return { valid: false, error: 'intent_already_completed', message: 'Intentは既に完了しています' };
        }

        if (intent.status === 'FAILED') {
            return { valid: false, error: 'intent_failed', message: 'Intentは失敗しています' };
        }

        if (intent.status === 'EXPIRED') {
            return { valid: false, error: 'intent_expired', message: 'Intentは期限切れです' };
        }

        return { valid: true, intent };
    } catch (error) {
        console.error('Intent検証エラー:', error);
        return { valid: false, error: 'server_error', message: 'Intent検証中にエラーが発生しました' };
    }
}

/**
 * Intentステータス更新とイベント記録
 */
async function updateIntentStatus(dbPool, intentId, newStatus, actorType = 'system', actorId = null, eventType = null, eventJson = null) {
    try {
        // 現在のIntentを取得
        const [intentRows] = await dbPool.execute(
            'SELECT status FROM oidc_payment_intents WHERE intent_id = ?',
            [intentId]
        );

        if (intentRows.length === 0) {
            throw new Error('Intentが見つかりません');
        }

        const prevStatus = intentRows[0].status;

        // ステータス更新
        await dbPool.execute(
            'UPDATE oidc_payment_intents SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE intent_id = ?',
            [newStatus, intentId]
        );

        // イベント記録
        await createIntentEvent(dbPool, intentId, prevStatus, newStatus, actorType, actorId, eventType, eventJson);

        return { success: true, prevStatus, newStatus };
    } catch (error) {
        console.error('Intentステータス更新エラー:', error);
        throw error;
    }
}

/**
 * イベントログ記録
 */
async function createIntentEvent(dbPool, intentId, prevStatus, newStatus, actorType = 'system', actorId = null, eventType = null, eventJson = null) {
    try {
        await dbPool.execute(
            `INSERT INTO oidc_payment_intent_events 
            (intent_id, prev_status, new_status, actor_type, actor_id, event_type, event_json) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                intentId,
                prevStatus,
                newStatus,
                actorType,
                actorId,
                eventType || `intent.${newStatus.toLowerCase()}`,
                eventJson ? JSON.stringify(eventJson) : null
            ]
        );
    } catch (error) {
        console.error('Intentイベント記録エラー:', error);
        throw error;
    }
}

/**
 * Intent取得
 */
/**
 * Intent取得（ID指定）
 */
async function getIntent(dbPool, intentId) {
    return await getIntentById(dbPool, intentId);
}

async function getIntentById(dbPool, intentId) {
    try {
        const [rows] = await dbPool.execute(
            'SELECT * FROM oidc_payment_intents WHERE intent_id = ?',
            [intentId]
        );

        if (rows.length === 0) {
            return null;
        }

        return rows[0];
    } catch (error) {
        console.error('Intent取得エラー:', error);
        throw error;
    }
}

/**
 * アクセス権限検証
 */
async function validateIntentAccess(dbPool, intentId, clientId) {
    try {
        const intent = await getIntentById(dbPool, intentId);
        if (!intent) {
            return { valid: false, error: 'invalid_intent' };
        }

        if (intent.rp_client_id !== clientId) {
            return { valid: false, error: 'invalid_intent' };
        }

        return { valid: true, intent };
    } catch (error) {
        console.error('Intentアクセス権限検証エラー:', error);
        return { valid: false, error: 'server_error' };
    }
}

/**
 * 小数点を含むamountをminor unitに変換
 * @param {string|number} amount - 金額（小数点を含む可能性がある）
 * @param {string} currency - 通貨コード（例: 'JPYC', 'USDC'）
 * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'、オプション）
 * @returns {BigInt} minor unitでの金額
 */
function convertAmountToMinorUnit(amount, currency, chain = null) {
    // decimalを取得
    const decimal = getCurrencyDecimal(currency, chain);
    
    if (decimal === null) {
        throw new Error(`Unsupported currency: ${currency}${chain ? ` on ${chain}` : ''}. Supported currencies: ${Object.keys(PRODUCTS).join(', ')}`);
    }
    
    // 文字列または数値を受け取る
    const amountStr = String(amount).trim();
    
    // 数値として有効かチェック
    const amountNum = parseFloat(amountStr);
    
    if (isNaN(amountNum) || amountNum < 0 || !isFinite(amountNum)) {
        throw new Error(`Invalid amount: ${amount}`);
    }
    
    // 100と100.0を同じ値として扱うため、すべてdecimalに基づいて変換
    // 精度の問題を避けるため、文字列操作で計算
    const amountStrParts = amountStr.split('.');
    const integerPart = amountStrParts[0] || '0';
    const decimalPart = amountStrParts[1] || '';
    
    // 小数点以下をdecimal桁に拡張（不足分は0埋め、超過分は切り捨て）
    const decimalPartPadded = (decimalPart + '0'.repeat(decimal)).substring(0, decimal);
    
    // 整数部分と小数部分を結合してBigIntに変換
    const minorUnitStr = integerPart + decimalPartPadded;
    
    return BigInt(minorUnitStr);
}

/**
 * minor unitを表示用の金額に変換
 * @param {BigInt|string} minorUnit - minor unitでの金額
 * @param {string} currency - 通貨コード
 * @param {string} chain - チェーン名（オプション）
 * @returns {number} 表示用の金額
 */
function convertMinorUnitToAmount(minorUnit, currency, chain = null) {
    const decimal = getCurrencyDecimal(currency, chain);
    
    if (decimal === null) {
        throw new Error(`Unsupported currency: ${currency}${chain ? ` on ${chain}` : ''}`);
    }
    
    const minorUnitBigInt = typeof minorUnit === 'string' ? BigInt(minorUnit) : minorUnit;
    const divisor = BigInt(Math.pow(10, decimal));
    
    // 整数部分と小数部分を分離
    const quotient = minorUnitBigInt / divisor;
    const remainder = minorUnitBigInt % divisor;
    
    // 小数部分を数値に変換
    const remainderNum = Number(remainder) / Number(divisor);
    
    return Number(quotient) + remainderNum;
}

/**
 * 金額照合
 */
function checkIntentAmount(intentAmount, paidAmount) {
    // BigInt同士の比較に変更
    const intentBigInt = typeof intentAmount === 'string' 
        ? BigInt(intentAmount) 
        : intentAmount;
    const paidBigInt = typeof paidAmount === 'string' 
        ? BigInt(paidAmount) 
        : paidAmount;
    
    // 許容誤差（例: 1 minor unit）
    const tolerance = BigInt(1);
    const diff = intentBigInt > paidBigInt 
        ? intentBigInt - paidBigInt 
        : paidBigInt - intentBigInt;
    
    return diff <= tolerance;
}

/**
 * 二重払い防止
 */
async function preventDoublePayment(dbPool, intentId) {
    try {
        const intent = await getIntentById(dbPool, intentId);
        if (!intent) {
            return { allowed: false, error: 'invalid_intent' };
        }

        if (intent.status === 'SUCCEEDED') {
            return { allowed: false, error: 'intent_already_completed' };
        }

        return { allowed: true };
    } catch (error) {
        console.error('二重払い防止チェックエラー:', error);
        return { allowed: false, error: 'server_error' };
    }
}

/**
 * Intent結果更新（tx_hash等）
 */
async function updateIntentResult(dbPool, intentId, result) {
    try {
        const {
            paid_amount,
            paid_at,
            tx_hash,
            tx_chain,
            tx_network,
            tx_block_number,
            status = 'SUCCEEDED'
        } = result;

        await dbPool.execute(
            `UPDATE oidc_payment_intents 
            SET paid_amount = ?, paid_at = ?, tx_hash = ?, tx_chain = ?, tx_network = ?, tx_block_number = ?, 
                status = ?, updated_at = CURRENT_TIMESTAMP(3) 
            WHERE intent_id = ?`,
            [
                paid_amount || null,
                paid_at || new Date(),
                tx_hash || null,
                tx_chain || null,
                tx_network || null,
                tx_block_number || null,
                status,
                intentId
            ]
        );

        // Webhook送信（非同期、即座に送信）
        if (status === 'SUCCEEDED') {
            try {
                const intent = await getIntentById(dbPool, intentId);
                if (intent) {
                    webhookUtils.sendWebhookAsync(dbPool, intent, 'intent.succeeded').catch(err => {
                        console.error('Webhook送信エラー（非同期）:', err);
                    });
                }
            } catch (error) {
                console.error('Webhook送信準備エラー:', error);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Intent結果更新エラー:', error);
        throw error;
    }
}

/**
 * Intent失敗更新
 */
async function updateIntentFailure(dbPool, intentId, failCode, failReason, actorType = 'system', actorId = null) {
    try {
        const intent = await getIntentById(dbPool, intentId);
        if (!intent) {
            throw new Error('Intentが見つかりません');
        }

        const prevStatus = intent.status;

        // ステータス更新（FAILED）
        await dbPool.execute(
            `UPDATE oidc_payment_intents 
            SET status = 'FAILED', fail_code = ?, fail_reason = ?, updated_at = CURRENT_TIMESTAMP(3) 
            WHERE intent_id = ?`,
            [failCode, failReason, intentId]
        );

        // イベント記録
        await createIntentEvent(
            dbPool,
            intentId,
            prevStatus,
            'FAILED',
            actorType,
            actorId,
            'intent.failed',
            { fail_code: failCode, fail_reason: failReason }
        );

        // Webhook送信（非同期、即座に送信）
        try {
            const updatedIntent = await getIntentById(dbPool, intentId);
            if (updatedIntent) {
                webhookUtils.sendWebhookAsync(dbPool, updatedIntent, 'intent.failed').catch(err => {
                    console.error('Webhook送信エラー（非同期）:', err);
                });
            }
        } catch (error) {
            console.error('Webhook送信準備エラー:', error);
        }

        return { success: true, prevStatus, newStatus: 'FAILED' };
    } catch (error) {
        console.error('Intent失敗更新エラー:', error);
        throw error;
    }
}

/**
 * Intent期限切れ更新
 */
async function expireIntent(dbPool, intentId) {
    try {
        const intent = await getIntentById(dbPool, intentId);
        if (!intent) {
            return { success: false, error: 'Intentが見つかりません' };
        }

        // 既に完了している場合は更新しない
        if (intent.status === 'SUCCEEDED' || intent.status === 'FAILED' || intent.status === 'CANCELED') {
            return { success: false, error: 'Intentは既に終了状態です' };
        }

        // 既に期限切れの場合は更新しない
        if (intent.status === 'EXPIRED') {
            return { success: false, error: 'Intentは既に期限切れです' };
        }

        const prevStatus = intent.status;

        // ステータス更新（EXPIRED）
        await dbPool.execute(
            `UPDATE oidc_payment_intents 
            SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP(3) 
            WHERE intent_id = ?`,
            [intentId]
        );

        // イベント記録
        await createIntentEvent(
            dbPool,
            intentId,
            prevStatus,
            'EXPIRED',
            'system',
            null,
            'intent.expired',
            { expires_at: intent.expires_at }
        );

        // Webhook送信（非同期、即座に送信）
        try {
            const updatedIntent = await getIntentById(dbPool, intentId);
            if (updatedIntent) {
                webhookUtils.sendWebhookAsync(dbPool, updatedIntent, 'intent.expired').catch(err => {
                    console.error('Webhook送信エラー（非同期）:', err);
                });
            }
        } catch (error) {
            console.error('Webhook送信準備エラー:', error);
        }

        return { success: true, prevStatus, newStatus: 'EXPIRED' };
    } catch (error) {
        console.error('Intent期限切れ更新エラー:', error);
        throw error;
    }
}

/**
 * 期限切れIntentの一括更新（バッチ処理用）
 */
async function expireExpiredIntents(dbPool) {
    try {
        const now = new Date();
        
        // 期限切れで、まだEXPIREDになっていないIntentを取得
        const [expiredIntents] = await dbPool.execute(
            `SELECT intent_id FROM oidc_payment_intents 
            WHERE expires_at < ? 
            AND status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED')`,
            [now]
        );

        let updatedCount = 0;
        for (const intent of expiredIntents) {
            try {
                await expireIntent(dbPool, intent.intent_id);
                updatedCount++;
            } catch (error) {
                console.error(`❌ Intent期限切れ更新エラー (${intent.intent_id}):`, error);
            }
        }

        console.log(`✅ 期限切れIntent更新完了: ${updatedCount}件`);
        return { success: true, updatedCount };
    } catch (error) {
        console.error('期限切れIntent一括更新エラー:', error);
        throw error;
    }
}

/**
 * Intentキャンセル更新
 */
async function cancelIntent(dbPool, intentId, actorType = 'user', actorId = null, reason = null) {
    try {
        const intent = await getIntentById(dbPool, intentId);
        if (!intent) {
            throw new Error('Intentが見つかりません');
        }

        // 既に完了している場合はキャンセルできない
        if (intent.status === 'SUCCEEDED') {
            return { success: false, error: 'intent_already_completed', message: 'Intentは既に完了しています' };
        }

        // 既にキャンセル済みの場合は更新しない
        if (intent.status === 'CANCELED') {
            return { success: true, message: 'Intentは既にキャンセル済みです' };
        }

        const prevStatus = intent.status;

        // ステータス更新（CANCELED）
        await dbPool.execute(
            `UPDATE oidc_payment_intents 
            SET status = 'CANCELED', updated_at = CURRENT_TIMESTAMP(3) 
            WHERE intent_id = ?`,
            [intentId]
        );

        // イベント記録
        await createIntentEvent(
            dbPool,
            intentId,
            prevStatus,
            'CANCELED',
            actorType,
            actorId,
            'intent.canceled',
            { reason: reason || 'User canceled' }
        );

        // Webhook送信（非同期、即座に送信）
        try {
            const updatedIntent = await getIntentById(dbPool, intentId);
            if (updatedIntent) {
                webhookUtils.sendWebhookAsync(dbPool, updatedIntent, 'intent.canceled').catch(err => {
                    console.error('Webhook送信エラー（非同期）:', err);
                });
            }
        } catch (error) {
            console.error('Webhook送信準備エラー:', error);
        }

        return { success: true, prevStatus, newStatus: 'CANCELED' };
    } catch (error) {
        console.error('Intentキャンセル更新エラー:', error);
        throw error;
    }
}

/**
 * return_url検証（Open Redirect対策）
 */
async function validateReturnUrl(dbPool, clientId, returnUrl) {
    try {
        if (!returnUrl) {
            return { valid: true }; // return_urlは任意
        }

        // クライアントのredirect_urisを取得
        const [rows] = await dbPool.execute(
            'SELECT redirect_uris FROM oidc_clients WHERE client_id = ? AND status = "active"',
            [clientId]
        );

        if (rows.length === 0) {
            return { valid: false, error: 'invalid_client' };
        }

        const client = rows[0];
        let redirectUris = [];

        if (typeof client.redirect_uris === 'string') {
            try {
                redirectUris = JSON.parse(client.redirect_uris);
            } catch (e) {
                redirectUris = [client.redirect_uris];
            }
        } else if (Array.isArray(client.redirect_uris)) {
            redirectUris = client.redirect_uris;
        }

        // return_urlが許可リストに含まれているか確認
        const isValid = redirectUris.some(uri => {
            try {
                const allowedUrl = new URL(uri);
                const returnUrlObj = new URL(returnUrl);
                // オリジンとパスが一致するか確認
                return allowedUrl.origin === returnUrlObj.origin && 
                       returnUrlObj.pathname.startsWith(allowedUrl.pathname);
            } catch (e) {
                return false;
            }
        });

        if (!isValid) {
            return { valid: false, error: 'invalid_return_url', message: 'return_urlが許可リストに含まれていません' };
        }

        return { valid: true };
    } catch (error) {
        console.error('return_url検証エラー:', error);
        return { valid: false, error: 'server_error' };
    }
}

/**
 * RPC API呼び出し
 */
async function callRPC(chain, network, method, params = []) {
    return new Promise((resolve, reject) => {
        // RPC URLを環境変数から取得
        let rpcUrl = null;
        const chainLow = chain ? chain.toLowerCase() : chain;
        const networkKey = network === 'testnet' ? 'testnet' : 'mainnet';
        
        if (chainLow === 'ethereum') {
            rpcUrl = process.env.ETHEREUM_RPC_URL ||
                     (networkKey === 'testnet'
                         ? 'https://ultra-damp-forest.ethereum-sepolia.quiknode.pro/e6832f1e08afd859579a0d18903267e719a00f59'
                         : 'https://spring-blue-forest.quiknode.pro/ee7841643311e50eda27cbd79667d5fc28fa492f');
        } else if (chainLow === 'polygon') {
            rpcUrl = process.env.POLYGON_RPC_URL ||
                     (networkKey === 'testnet'
                         ? 'https://thrilling-dawn-ensemble.matic-amoy.quiknode.pro/744e63006bfaa79280a25ac39aff899b8ba81e48'
                         : 'https://ancient-alpha-brook.matic.quiknode.pro/01c7323326942f546946125f22905ec7a5d8e3ed');
        } else if (chainLow === 'avalanche') {
            rpcUrl = networkKey === 'testnet'
                ? (process.env.AVALANCHE_TESTNET_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc')
                : (process.env.AVALANCHE_MAINNET_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc');
        } else {
            reject(new Error(`Unsupported chain: ${chain}`));
            return;
        }
        
        if (!rpcUrl) {
            reject(new Error(`RPC URL not configured for ${chain} (${networkKey})`));
            return;
        }
        
        const urlObj = new URL(rpcUrl);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: method,
            params: params
        });
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 10000
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.error) {
                        reject(new Error(`RPC error: ${response.error.message || JSON.stringify(response.error)}`));
                    } else {
                        resolve(response.result);
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse RPC response: ${error.message}`));
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('RPC request timeout'));
        });
        
        req.write(payload);
        req.end();
    });
}

/**
 * トランザクションreceiptを取得
 */
async function getTransactionReceipt(txHash, chain, network) {
    try {
        const receipt = await callRPC(chain, network, 'eth_getTransactionReceipt', [txHash]);
        
        if (!receipt || !receipt.blockNumber) {
            return null; // receipt未取得
        }
        
        return {
            blockNumber: parseInt(receipt.blockNumber, 16),
            blockHash: receipt.blockHash,
            status: receipt.status === '0x1' ? 'success' : 'reverted',
            gasUsed: receipt.gasUsed
        };
    } catch (error) {
        console.error('Receipt取得エラー:', error);
        throw error;
    }
}

/**
 * confirmationsを計算（receipt取得後）
 */
function calculateConfirmations(txBlockNumber, currentBlockNumber) {
    if (!txBlockNumber || !currentBlockNumber) {
        return 0;
    }
    return Math.max(0, currentBlockNumber - txBlockNumber + 1);
}

/**
 * 現在のブロック番号を取得
 */
async function getCurrentBlockNumber(chain, network) {
    try {
        const blockNumber = await callRPC(chain, network, 'eth_blockNumber', []);
        return parseInt(blockNumber, 16);
    } catch (error) {
        console.error('ブロック番号取得エラー:', error);
        throw error;
    }
}

/**
 * reorg検知（ブロックハッシュの確認）
 */
async function checkBlockHash(blockNumber, expectedHash, chain, network) {
    try {
        const block = await callRPC(chain, network, 'eth_getBlockByNumber', [
            '0x' + blockNumber.toString(16),
            false
        ]);
        
        if (!block || block.hash !== expectedHash) {
            return false; // reorg検出
        }
        
        return true; // 正常
    } catch (error) {
        console.error('ブロックハッシュ確認エラー:', error);
        throw error;
    }
}

module.exports = {
    // 通貨情報
    PRODUCTS,
    getCurrencyDecimal,
    
    // 変換関数
    convertAmountToMinorUnit,
    convertMinorUnitToAmount,
    
    // 既存の関数
    generateIntentId,
    generateNonce,
    signIntent,
    verifyIntentSignature,
    validateIntent,
    updateIntentStatus,
    createIntentEvent,
    getIntentById,
    validateIntentAccess,
    checkIntentAmount,
    preventDoublePayment,
    updateIntentResult,
    validateReturnUrl,
    
    // 新規追加関数
    updateIntentFailure,
    expireIntent,
    expireExpiredIntents,
    cancelIntent,
    
    // RPC関連関数
    callRPC,
    getTransactionReceipt,
    getCurrentBlockNumber,
    calculateConfirmations,
    checkBlockHash
};

