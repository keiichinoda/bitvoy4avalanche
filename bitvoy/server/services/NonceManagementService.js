const logger = require('../utils/logger');
const { ethers } = require('ethers');

/**
 * Nonce管理サービス
 * データベースベースのnonce管理を提供
 */
class NonceManagementService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Nonceを取得する（予約システムを使わず、next_nonceで管理）
     * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'）
     * @param {string} network - ネットワーク名（例: 'mainnet', 'testnet'）
     * @param {string} address - アドレス（lowercase推奨）
     * @param {string} idempotencyKey - 冪等キー（オプション、idempotencyKeyが指定されている場合は既存のnonceを返す）
     * @returns {Promise<number>} nonce値
     */
    async reserveNonce(chain, network, address, idempotencyKey = null, reservationTimeoutMinutes = 30) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // アドレスをlowercaseに正規化
            const normalizedAddress = address.toLowerCase();
            // chainとnetworkを小文字に正規化
            const normalizedChain = chain.toLowerCase();
            const normalizedNetwork = network.toLowerCase();

            // idempotencyKeyが指定されている場合、既存の予約を検索（statusに関係なく）
            if (idempotencyKey) {
                const [existingReservation] = await connection.query(
                    `SELECT nonce, status, tx_hash
                     FROM chain_nonce_reservation 
                     WHERE chain = ? AND network = ? AND address = ? AND idempotency_key = ?
                     ORDER BY created_at DESC 
                     LIMIT 1`,
                    [normalizedChain, normalizedNetwork, normalizedAddress, idempotencyKey]
                );
                const existingRows = existingReservation || [];

                if (existingRows.length > 0) {
                    const reservation = existingRows[0];
                    // 既存の予約があれば、statusに関係なく同じnonceを返す（重複予約を防ぐ）
                    const existingNonce = parseInt(reservation.nonce);
                    if (reservation.status === 'SENT' && reservation.tx_hash) {
                        logger.info(`📋 Found existing SENT transaction for idempotencyKey: ${idempotencyKey}, nonce: ${existingNonce}, tx_hash: ${reservation.tx_hash}`);
                    } else {
                        logger.info(`📋 Found existing reservation for idempotencyKey: ${idempotencyKey}, nonce: ${existingNonce}, status: ${reservation.status} (returning same nonce to prevent duplicate reservation)`);
                    }
                    await connection.commit();
                    connection.release();
                    return {
                        nonce: existingNonce,
                        reservationId: null // 予約システムを使わないためnull
                    };
                }
            }

            // chain_nonce_stateからnext_nonceを取得（なければ作成）
            await connection.query(
                `INSERT INTO chain_nonce_state (chain, network, address, next_nonce)
                 VALUES (?, ?, ?, 0)
                 ON DUPLICATE KEY UPDATE updated_at = NOW()`,
                [normalizedChain, normalizedNetwork, normalizedAddress]
            );

            // 現在のnext_nonceを取得
            const [stateResult] = await connection.query(
                `SELECT next_nonce FROM chain_nonce_state WHERE chain = ? AND network = ? AND address = ?`,
                [normalizedChain, normalizedNetwork, normalizedAddress]
            );
            const stateRows = Array.isArray(stateResult) ? stateResult : [];
            let nextNonce = parseInt(stateRows[0]?.next_nonce || 0);

            // next_nonceを+1して更新（次のnonceを確保）
            await connection.query(
                `UPDATE chain_nonce_state 
                 SET next_nonce = next_nonce + 1, updated_at = NOW()
                 WHERE chain = ? AND network = ? AND address = ?`,
                [normalizedChain, normalizedNetwork, normalizedAddress]
            );

            // 更新後のnext_nonceを取得
            const [updateResult] = await connection.query(
                `SELECT next_nonce FROM chain_nonce_state WHERE chain = ? AND network = ? AND address = ?`,
                [normalizedChain, normalizedNetwork, normalizedAddress]
            );
            const updateRows = Array.isArray(updateResult) ? updateResult : [];

            const returnedNonce = parseInt(updateRows[0]?.next_nonce || 0) - 1; // 更新前の値
            const afterNextNonce = parseInt(updateRows[0]?.next_nonce || 0); // 更新後の値

            await connection.commit();

            logger.info(`📋 Allocated nonce ${returnedNonce} for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress} (next_nonce: ${nextNonce} → ${afterNextNonce})`);

            return {
                nonce: returnedNonce,
                reservationId: null // 予約システムを使わないためnull
            };
        } catch (error) {
            await connection.rollback();
            logger.error(`❌ Failed to get nonce for ${chain}/${network}:${address}:`, error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * 送信成功時にnonceを記録する（予約システムを使わない場合、next_nonceは既に更新済み）
     * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'）
     * @param {string} network - ネットワーク名（例: 'mainnet', 'testnet'）
     * @param {string} address - アドレス
     * @param {number} nonce - nonce
     * @param {string} txHash - トランザクションハッシュ
     * @param {string} rawTxHash - 生トランザクションハッシュ（オプション）
     * @param {string} idempotencyKey - 冪等キー（オプション）
     * @returns {Promise<void>}
     */
    async confirmNonce(chain, network, address, nonce, txHash, rawTxHash = null, idempotencyKey = null) {
        try {
            const normalizedAddress = address.toLowerCase();
            const normalizedChain = chain.toLowerCase();
            const normalizedNetwork = network.toLowerCase();

            // 送信履歴を記録（idempotencyKeyがある場合のみ）
            if (idempotencyKey) {
                await this.db.query(
                    `INSERT INTO chain_nonce_reservation 
                     (chain, network, address, nonce, idempotency_key, status, tx_hash, raw_tx_hash)
                     VALUES (?, ?, ?, ?, ?, 'SENT', ?, ?)
                     ON DUPLICATE KEY UPDATE 
                         status = 'SENT',
                         tx_hash = VALUES(tx_hash),
                         raw_tx_hash = VALUES(raw_tx_hash),
                         updated_at = NOW()`,
                    [normalizedChain, normalizedNetwork, normalizedAddress, nonce, idempotencyKey, txHash, rawTxHash]
                );
            }

            // next_nonceは既に更新済みなので、ここでは何もしない
            logger.info(`✅ Recorded nonce ${nonce} for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress}, txHash: ${txHash}`);
        } catch (error) {
            logger.error(`❌ Failed to confirm nonce for ${chain}/${network}:${address}:`, error);
            throw error;
        }
    }

    /**
     * 送信失敗時にnonceを補正する（予約システムを使わない場合）
     * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'）
     * @param {string} network - ネットワーク名（例: 'mainnet', 'testnet'）
     * @param {string} address - アドレス
     * @param {number} nonce - nonce
     * @param {string} errorCode - エラーコード
     * @param {string} errorMessage - エラーメッセージ
     * @param {number} observedNextNonce - 観測された次のnonce（オプション）
     * @param {boolean} allowResign - 再署名を許可するか（デフォルト: true、予約システムを使わない場合は無視）
     * @returns {Promise<void>}
     */
    async failNonce(chain, network, address, nonce, errorCode, errorMessage, observedNextNonce = null, allowResign = true) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            const normalizedAddress = address.toLowerCase();
            const normalizedChain = chain.toLowerCase();
            const normalizedNetwork = network.toLowerCase();

            // observedNextNonceが指定されている場合、chain_nonce_stateを補正
            // nonce too lowエラーの場合、実際のnext_nonceに合わせる
            if (observedNextNonce !== null && observedNextNonce !== undefined) {
                await connection.query(
                    `UPDATE chain_nonce_state 
                     SET next_nonce = GREATEST(next_nonce, ?),
                         updated_at = NOW()
                     WHERE chain = ? AND network = ? AND address = ?`,
                    [observedNextNonce, normalizedChain, normalizedNetwork, normalizedAddress]
                );

                logger.info(`🔧 Corrected next_nonce to ${observedNextNonce} for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress} (nonce ${nonce} failed: ${errorCode})`);
            } else {
                // observedNextNonceが指定されていない場合、エラーの種類を判定
                // nonceが使用されていないエラー（insufficient funds, gas price too low等）の場合、next_nonceを-1する
                const errorMessageLower = errorMessage.toLowerCase();
                const isNonceNotUsed = 
                    errorMessageLower.includes('insufficient funds') ||
                    errorMessageLower.includes('gas price too low') ||
                    errorMessageLower.includes('gas price too high') ||
                    errorMessageLower.includes('replacement transaction underpriced') ||
                    errorMessageLower.includes('transaction underpriced') ||
                    errorMessageLower.includes('intrinsic gas too low') ||
                    errorMessageLower.includes('gas required exceeds allowance') ||
                    errorMessageLower.includes('execution reverted') ||
                    errorMessageLower.includes('transaction would revert') ||
                    errorCode === 'PREFLIGHT_REVERT';

                if (isNonceNotUsed) {
                    // nonceが使用されていないエラーの場合、next_nonceを-1してnonceを再利用可能にする
                    // 現在のnext_nonceを取得
                    const [currentState] = await connection.query(
                        `SELECT next_nonce FROM chain_nonce_state 
                         WHERE chain = ? AND network = ? AND address = ?`,
                        [normalizedChain, normalizedNetwork, normalizedAddress]
                    );
                    const currentRows = Array.isArray(currentState) ? currentState : [];
                    
                    const currentNextNonce = currentRows.length > 0 ? parseInt(currentRows[0].next_nonce) : null;
                    
                    await connection.query(
                        `UPDATE chain_nonce_state 
                         SET next_nonce = GREATEST(0, next_nonce - 1),
                             updated_at = NOW()
                         WHERE chain = ? AND network = ? AND address = ?`,
                        [normalizedChain, normalizedNetwork, normalizedAddress]
                    );
                    
                    const [updatedState] = await connection.query(
                        `SELECT next_nonce FROM chain_nonce_state 
                         WHERE chain = ? AND network = ? AND address = ?`,
                        [normalizedChain, normalizedNetwork, normalizedAddress]
                    );
                    const updatedRows = Array.isArray(updatedState) ? updatedState : [];
                    const updatedNextNonce = updatedRows.length > 0 ? parseInt(updatedRows[0].next_nonce) : null;

                    logger.info(`🔧 Decremented next_nonce for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress} (nonce ${nonce} not used due to: ${errorCode}, next_nonce: ${currentNextNonce} → ${updatedNextNonce})`);
                } else {
                    // その他のエラーの場合、nonceが使用された可能性があるため、補正しない
                    logger.warn(`⚠️ No observedNextNonce provided for failed nonce ${nonce}, error type unknown: ${errorCode} - ${errorMessage.substring(0, 100)}`);
                }
            }

            await connection.commit();

            logger.info(`❌ Failed nonce ${nonce} for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress}, error: ${errorCode} - ${errorMessage}`);
        } catch (error) {
            await connection.rollback();
            logger.error(`❌ Failed to record nonce failure for ${chain}/${network}:${address}:`, error);
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Nonceを補正する（nonce too lowエラー時）
     * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'）
     * @param {string} network - ネットワーク名（例: 'mainnet', 'testnet'）
     * @param {string} address - アドレス
     * @param {number} observedNextNonce - 観測された次のnonce
     * @returns {Promise<void>}
     */
    async correctNonce(chain, network, address, observedNextNonce) {
        try {
            const normalizedAddress = address.toLowerCase();
            const normalizedChain = chain.toLowerCase();
            const normalizedNetwork = network.toLowerCase();

            await this.db.query(
                `UPDATE chain_nonce_state 
                 SET next_nonce = GREATEST(next_nonce, ?),
                     updated_at = NOW()
                 WHERE chain = ? AND network = ? AND address = ?`,
                [observedNextNonce, normalizedChain, normalizedNetwork, normalizedAddress]
            );

            logger.info(`🔧 Corrected next_nonce to ${observedNextNonce} for ${normalizedChain}/${normalizedNetwork}:${normalizedAddress}`);
        } catch (error) {
            logger.error(`❌ Failed to correct nonce for ${chain}/${network}:${address}:`, error);
            throw error;
        }
    }

    /**
     * 既存の予約を取得する
     * @param {string} chain - チェーン名（例: 'polygon', 'ethereum'）
     * @param {string} network - ネットワーク名（例: 'mainnet', 'testnet'）
     * @param {string} address - アドレス
     * @param {string} idempotencyKey - 冪等キー
     * @returns {Promise<Object|null>}
     */
    async getReservation(chain, network, address, idempotencyKey) {
        try {
            const normalizedAddress = address.toLowerCase();
            const normalizedChain = chain.toLowerCase();
            const normalizedNetwork = network.toLowerCase();

            const [result] = await this.db.query(
                `SELECT * FROM chain_nonce_reservation 
                 WHERE chain = ? AND network = ? AND address = ? AND idempotency_key = ?
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [normalizedChain, normalizedNetwork, normalizedAddress, idempotencyKey]
            );
            const rows = Array.isArray(result) ? result : [];
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            logger.error(`❌ Failed to get reservation for ${chain}/${network}:${address}:`, error);
            throw error;
        }
    }

    /**
     * トランザクションからnonceとアドレスを抽出する
     * @param {string} signedTxHex - 署名済みトランザクションのhex
     * @returns {Promise<{nonce: number, from: string}>}
     */
    async extractNonceFromTransaction(signedTxHex) {
        try {
            const tx = ethers.Transaction.from(signedTxHex);
            
            // fromアドレスがnullの場合のエラーハンドリング
            if (!tx.from) {
                logger.warn('⚠️ Transaction from address is null, attempting to recover from signature');
                // 署名からアドレスを復元を試みる（ethers.js v6では自動的に計算されるはず）
                // もし復元できない場合はエラーをスロー
                throw new Error('Failed to extract from address from transaction. Transaction may be invalid or improperly signed.');
            }
            
            return {
                nonce: tx.nonce,
                from: tx.from.toLowerCase()
            };
        } catch (error) {
            logger.error('❌ Failed to extract nonce from transaction:', error);
            throw error;
        }
    }

    /**
     * エラーメッセージからobserved_next_nonceを抽出する
     * @param {string} errorMessage - エラーメッセージ（例: "nonce too low: next nonce 1, tx nonce 0"）
     * @returns {number|null}
     */
    extractObservedNextNonce(errorMessage) {
        try {
            // "next nonce 1" のパターンを検索
            const match = errorMessage.match(/next nonce (\d+)/i);
            if (match) {
                return parseInt(match[1]);
            }
            return null;
        } catch (error) {
            logger.error('❌ Failed to extract observed next nonce:', error);
            return null;
        }
    }
}

module.exports = NonceManagementService;

