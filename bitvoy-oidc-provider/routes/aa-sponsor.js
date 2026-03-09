const express = require('express');
const router = express.Router();

/**
 * POST /aa/sponsor
 * Paymasterスポンサー取得API
 */
router.post('/sponsor', async (req, res) => {
    try {
        const {
            intent_id,
            chain_id,
            entry_point,
            smart_account,
            policy,
            user_op_partial
        } = req.body;
        
        const dbPool = req.app.get('dbPool');
        
        // Intent取得と検証
        const intentUtils = require('../intent-utils');
        const intent = await intentUtils.getIntent(dbPool, intent_id);
        if (!intent) {
            return res.status(404).json({ error: 'intent_not_found' });
        }
        
        // Paymaster設定取得
        const paymasterConfig = await getPaymasterConfig(dbPool, chain_id);
        if (!paymasterConfig || !paymasterConfig.is_active) {
            return res.status(503).json({ error: 'paymaster_unavailable' });
        }
        
        // Paymaster API呼び出し（外部Paymasterの場合）
        // または内部ロジックでpaymasterAndData生成
        const paymasterAndData = await generatePaymasterAndData(
            paymasterConfig,
            user_op_partial,
            intent
        );
        
        // ガス見積り（推奨値）
        const gasEstimate = await estimateGas(user_op_partial, paymasterAndData, chain_id);
        
        res.json({
            paymasterAndData,
            gas: {
                callGasLimit: gasEstimate.callGasLimit,
                verificationGasLimit: gasEstimate.verificationGasLimit,
                preVerificationGas: gasEstimate.preVerificationGas,
                maxFeePerGas: gasEstimate.maxFeePerGas,
                maxPriorityFeePerGas: gasEstimate.maxPriorityFeePerGas
            },
            valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5分
            valid_after: new Date().toISOString(),
            sponsor_id: paymasterConfig.config_id.toString()
        });
        
    } catch (error) {
        console.error('Sponsor API error:', error);
        res.status(500).json({ error: 'server_error', message: error.message });
    }
});

/**
 * Paymaster設定取得
 */
async function getPaymasterConfig(dbPool, chainId) {
    try {
        // chainIdからchainとnetworkを判定
        const chainNetwork = getChainNetworkFromChainId(chainId);
        if (!chainNetwork) {
            return null;
        }
        
        const [rows] = await dbPool.execute(
            `SELECT * FROM aa_paymaster_configs 
             WHERE chain = ? AND network = ? AND is_active = TRUE
             LIMIT 1`,
            [chainNetwork.chain, chainNetwork.network]
        );
        
        return rows[0] || null;
    } catch (error) {
        console.error('Failed to get paymaster config:', error);
        return null;
    }
}

/**
 * Chain IDからchainとnetworkを判定
 */
function getChainNetworkFromChainId(chainId) {
    const chainIdMap = {
        1: { chain: 'ethereum', network: 'mainnet' },
        5: { chain: 'ethereum', network: 'testnet' },
        137: { chain: 'polygon', network: 'mainnet' },
        80002: { chain: 'polygon', network: 'testnet' },
        43114: { chain: 'avalanche', network: 'mainnet' },
        43113: { chain: 'avalanche', network: 'testnet' }
    };
    return chainIdMap[chainId] || null;
}

/**
 * PaymasterAndData生成
 */
async function generatePaymasterAndData(paymasterConfig, userOpPartial, intent) {
    // 簡易実装: Paymasterアドレスをそのまま返す
    // 実際の実装では、PaymasterコントラクトのAPIを呼び出してpaymasterAndDataを生成
    if (paymasterConfig.paymaster_url) {
        // 外部Paymaster API呼び出し
        try {
            const response = await fetch(paymasterConfig.paymaster_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userOp: userOpPartial,
                    intent: intent
                })
            });
            
            const result = await response.json();
            return result.paymasterAndData || `0x${paymasterConfig.paymaster_address.slice(2)}`;
        } catch (error) {
            console.error('Paymaster API call failed:', error);
            // フォールバック: Paymasterアドレスのみ
            return `0x${paymasterConfig.paymaster_address.slice(2)}`;
        }
    } else {
        // 内部Paymaster: アドレスのみ返す
        return `0x${paymasterConfig.paymaster_address.slice(2)}`;
    }
}

/**
 * ガス見積り
 */
async function estimateGas(userOpPartial, paymasterAndData, chainId) {
    // 簡易実装: デフォルト値を返す
    // 実際の実装では、Bundler RPCのestimateUserOperationGasを呼び出す
    return {
        callGasLimit: '0x100000', // 1M gas
        verificationGasLimit: '0x50000', // 320K gas
        preVerificationGas: '0x10000', // 64K gas
        maxFeePerGas: '0x3b9aca00', // 1 gwei (デフォルト)
        maxPriorityFeePerGas: '0x3b9aca00' // 1 gwei (デフォルト)
    };
}

module.exports = router;

