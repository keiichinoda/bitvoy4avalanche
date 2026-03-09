/**
 * Webhook送信ユーティリティ
 * Phase 1: 基本的なWebhook送信機能
 */
const crypto = require('crypto');
const https = require('https');
const http = require('http');

/**
 * Webhook URLを取得（RP設定から）
 */
async function getWebhookUrl(dbPool, rpClientId) {
    try {
        const [rows] = await dbPool.execute(
            'SELECT webhook_url FROM oidc_clients WHERE client_id = ? AND status = "active"',
            [rpClientId]
        );
        
        return rows.length > 0 ? rows[0].webhook_url : null;
    } catch (error) {
        console.error('Webhook URL取得エラー:', error);
        return null;
    }
}

/**
 * Webhookシークレットを取得
 */
async function getWebhookSecret(dbPool, rpClientId) {
    try {
        const [rows] = await dbPool.execute(
            'SELECT webhook_secret FROM oidc_clients WHERE client_id = ?',
            [rpClientId]
        );
        
        return rows.length > 0 ? rows[0].webhook_secret : null;
    } catch (error) {
        console.error('Webhookシークレット取得エラー:', error);
        return null;
    }
}

/**
 * Webhook署名生成
 */
function signWebhook(payload, secret) {
    if (!secret) {
        return null;
    }
    
    const payloadString = JSON.stringify(payload);
    const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');
    return `sha256=${signature}`;
}

/**
 * Webhook送信（同期）
 */
async function sendWebhook(url, payload, secret, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const payloadString = JSON.stringify(payload);
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const client = isHttps ? https : http;
        
        const signature = secret ? signWebhook(payload, secret) : null;
        const timestamp = new Date().toISOString();
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadString),
                'X-BitVoy-Event': payload.event,
                'X-BitVoy-Timestamp': timestamp,
                ...(signature && { 'X-BitVoy-Signature': signature })
            },
            timeout
        };
        
        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Webhook request timeout'));
        });
        
        req.write(payloadString);
        req.end();
    });
}

/**
 * Webhook送信履歴を記録
 */
async function recordWebhookDelivery(dbPool, intentId, rpClientId, eventType, targetUrl, requestHeaders, requestBody, signature, httpStatus, responseBody, attempt) {
    try {
        await dbPool.execute(
            `INSERT INTO oidc_payment_webhook_deliveries 
            (intent_id, rp_client_id, event_type, target_url, request_headers, request_body, signature, http_status, response_body, attempt, delivered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                intentId,
                rpClientId,
                eventType,
                targetUrl,
                JSON.stringify(requestHeaders),
                JSON.stringify(requestBody),
                signature,
                httpStatus,
                responseBody,
                attempt,
                httpStatus >= 200 && httpStatus < 300 ? new Date() : null
            ]
        );
    } catch (error) {
        console.error('Webhook送信履歴記録エラー:', error);
    }
}

/**
 * Webhookペイロード構築
 */
function buildWebhookPayload(intent, eventType) {
    const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        intent: {
            intent_id: intent.intent_id,
            status: intent.status,
            order_ref: intent.order_ref,
            amount: intent.amount,
            currency: intent.currency,
            chain: intent.chain,
            network: intent.network,
            payee: {
                type: intent.payee_type,
                address: intent.payee_address
            },
            created_at: intent.created_at,
            expires_at: intent.expires_at
        }
    };
    
    // ステータスに応じて追加情報を設定
    if (intent.status === 'SUCCEEDED' && intent.tx_hash) {
        payload.intent.result = {
            paid_at: intent.paid_at,
            tx_hash: intent.tx_hash,
            chain: intent.tx_chain,
            network: intent.tx_network,
            paid_amount: intent.paid_amount
        };
    } else if (intent.status === 'FAILED') {
        payload.intent.failure = {
            code: intent.fail_code,
            reason: intent.fail_reason
        };
    }
    
    return payload;
}

/**
 * Webhook送信（非同期、即座に送信）
 */
async function sendWebhookAsync(dbPool, intent, eventType) {
    try {
        const webhookUrl = await getWebhookUrl(dbPool, intent.rp_client_id);
        if (!webhookUrl) {
            console.log('⚠️ Webhook URLが設定されていません:', intent.rp_client_id);
            return { success: false, reason: 'webhook_url_not_configured' };
        }
        
        // Webhookシークレット取得
        const webhookSecret = await getWebhookSecret(dbPool, intent.rp_client_id);
        
        // ペイロード構築
        const payload = buildWebhookPayload(intent, eventType);
        
        // Webhook送信
        try {
            const result = await sendWebhook(webhookUrl, payload, webhookSecret);
            
            // 送信履歴記録
            const signature = webhookSecret ? signWebhook(payload, webhookSecret) : null;
            await recordWebhookDelivery(
                dbPool,
                intent.intent_id,
                intent.rp_client_id,
                eventType,
                webhookUrl,
                { 'Content-Type': 'application/json' },
                payload,
                signature,
                result.status,
                result.body,
                1
            );
            
            if (result.status >= 200 && result.status < 300) {
                console.log(`✅ Webhook送信成功 (${eventType}):`, intent.intent_id);
                return { success: true };
            } else {
                console.warn(`⚠️ Webhook送信警告 (HTTP ${result.status}):`, intent.intent_id);
                return { success: false, status: result.status, body: result.body };
            }
        } catch (error) {
            console.error(`❌ Webhook送信エラー (${eventType}):`, error.message);
            
            // エラー記録
            const signature = webhookSecret ? signWebhook(payload, webhookSecret) : null;
            await recordWebhookDelivery(
                dbPool,
                intent.intent_id,
                intent.rp_client_id,
                eventType,
                webhookUrl,
                { 'Content-Type': 'application/json' },
                payload,
                signature,
                null,
                error.message,
                1
            );
            
            return { success: false, error: error.message };
        }
    } catch (error) {
        console.error('Webhook送信処理エラー:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getWebhookUrl,
    getWebhookSecret,
    signWebhook,
    sendWebhook,
    sendWebhookAsync,
    buildWebhookPayload,
    recordWebhookDelivery
};

