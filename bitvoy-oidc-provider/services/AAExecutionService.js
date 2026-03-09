const { ethers } = require('ethers');
const aaUtils = require('../aa-utils');

class AAExecutionService {
    constructor(dbPool, bundlerRpcUrl, chain, network) {
        this.dbPool = dbPool;
        this.bundlerRpcUrl = bundlerRpcUrl;
        this.chain = chain;
        this.network = network;
        this.provider = new ethers.providers.JsonRpcProvider(bundlerRpcUrl);
    }
    
    /**
     * UserOperation送信
     */
    async sendUserOperation(intentId, userOp) {
        try {
            // Bundler RPC呼び出し
            const response = await fetch(this.bundlerRpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_sendUserOperation',
                    params: [userOp, this.getEntryPointAddress()]
                })
            });
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error.message);
            }
            
            const userOpHash = result.result;
            
            // Intentに保存
            await this.dbPool.execute(
                `UPDATE oidc_payment_intents 
                 SET aa_user_op_hash = ?, status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP(3)
                 WHERE intent_id = ?`,
                [userOpHash, intentId]
            );
            
            return userOpHash;
            
        } catch (error) {
            console.error('Send UserOperation error:', error);
            throw error;
        }
    }
    
    /**
     * UserOperation Receipt取得
     */
    async getUserOperationReceipt(userOpHash) {
        try {
            const response = await fetch(this.bundlerRpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'eth_getUserOperationReceipt',
                    params: [userOpHash]
                })
            });
            
            const result = await response.json();
            
            if (result.error || !result.result) {
                return null;
            }
            
            return result.result;
        } catch (error) {
            console.error('Get UserOperation Receipt error:', error);
            return null;
        }
    }
    
    /**
     * Intent確定処理（バッチ）
     */
    async processPendingIntents() {
        const [intents] = await this.dbPool.execute(
            `SELECT * FROM oidc_payment_intents
             WHERE execution_mode = 'AA'
             AND status = 'PROCESSING'
             AND aa_user_op_hash IS NOT NULL
             AND LOWER(COALESCE(tx_chain, chain)) = ?
             AND COALESCE(tx_network, network) = ?
             AND (tx_last_checked_at IS NULL OR tx_last_checked_at < DATE_SUB(NOW(), INTERVAL 10 SECOND))`,
            [this.chain.toLowerCase(), this.network]
        );
        
        for (const intent of intents) {
            try {
                const receipt = await this.getUserOperationReceipt(intent.aa_user_op_hash);
                
                if (receipt) {
                    // 確定処理
                    await this.confirmIntent(intent.intent_id, receipt);
                } else {
                    // まだ確定していない
                    await this.dbPool.execute(
                        `UPDATE oidc_payment_intents 
                         SET tx_last_checked_at = CURRENT_TIMESTAMP(3) 
                         WHERE intent_id = ?`,
                        [intent.intent_id]
                    );
                }
            } catch (error) {
                console.error(`Error processing intent ${intent.intent_id}:`, error);
            }
        }
    }
    
    /**
     * Intent確定
     * tx_hash, tx_block_number, tx_block_hashを設定するだけ
     * confirmations計算とSUCCEEDED更新は既存のSTANDARDフロー監視ジョブに任せる
     */
    async confirmIntent(intentId, receipt) {
        const txHash = receipt.receipt.transactionHash;
        const blockNumber = parseInt(receipt.receipt.blockNumber, 16); // hex → decimal
        const blockHash = receipt.receipt.blockHash;
        
        // Intent情報取得
        const [intentRows] = await this.dbPool.execute(
            `SELECT chain, network, aa_user_op_hash FROM oidc_payment_intents WHERE intent_id = ?`,
            [intentId]
        );
        
        if (!intentRows || intentRows.length === 0) {
            throw new Error(`Intent not found: ${intentId}`);
        }
        
        const intent = intentRows[0];
        
        // tx_hash, tx_block_number, tx_block_hashを設定するだけ
        // confirmations計算とSUCCEEDED更新は既存のSTANDARDフロー監視ジョブに任せる
        await this.dbPool.execute(
            `UPDATE oidc_payment_intents 
             SET tx_hash = ?,
                 tx_block_number = ?,
                 tx_block_hash = ?,
                 tx_chain = ?,
                 tx_network = ?,
                 status = 'PROCESSING',
                 tx_last_checked_at = CURRENT_TIMESTAMP(3),
                 updated_at = CURRENT_TIMESTAMP(3)
             WHERE intent_id = ?`,
            [txHash, blockNumber, blockHash, intent.chain, intent.network, intentId]
        );
        
        // Intentステータス更新イベント
        const intentUtils = require('../intent-utils');
        await intentUtils.updateIntentStatus(
            this.dbPool,
            intentId,
            'PROCESSING',
            'system',
            null,
            'intent.processing',
            { 
                tx_hash: txHash, 
                block_number: blockNumber,
                execution_mode: 'AA',
                user_op_hash: intent.aa_user_op_hash
            }
        );
        
        console.log(`✅ AA Intent tx_hash設定完了: ${intentId} → ${txHash}`);
    }
    
    /**
     * Webhook送信
     */
    async sendWebhook(intentId) {
        // webhook-utilsを使用してWebhook送信
        const webhookUtils = require('../webhook-utils');
        try {
            await webhookUtils.sendIntentWebhook(this.dbPool, intentId, 'SUCCEEDED');
        } catch (error) {
            console.error(`Failed to send webhook for intent ${intentId}:`, error);
        }
    }
    
    getEntryPointAddress() {
        const envKey = `${this.chain.toUpperCase()}_${this.network.toUpperCase()}_ENTRY_POINT_ADDRESS`;
        return process.env[envKey];
    }
}

module.exports = AAExecutionService;

