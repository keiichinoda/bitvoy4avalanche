/**
 * MPC API - サーバー側の独立シェア生成
 * Party A (BitVoy Server) として独立してシェアを生成
 */

const crypto = require('crypto');
const { secp256k1 } = require('@noble/secp256k1');
const { logger } = require('../utils/logger');

class MPCAPI {
    constructor() {
        this.activeSessions = new Map();
    }

    /**
     * サーバー側で独立してシェアを生成
     * POST /api/mpc/generate-share
     */
    async generateServerShare(req, res) {
        try {
            const { masterId, sessionId, partyId, threshold, totalParties } = req.body;
            
            logger.info('Server share generation requested', { masterId, sessionId, partyId });
            
            // 入力検証
            if (!masterId || !sessionId || partyId !== 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid parameters'
                });
            }
            
            // サーバー側で独立してシェアを生成
            const serverShare = await this.generateIndependentShare();
            const serverCommitment = await this.generateCommitment(serverShare);
            
            // セッションに保存
            const session = {
                masterId,
                sessionId,
                partyId,
                share: serverShare,
                commitment: serverCommitment,
                timestamp: Date.now()
            };
            
            this.activeSessions.set(sessionId, session);
            
            logger.info('Server share generated successfully', { sessionId });
            
            res.json({
                success: true,
                shareId: `server_${sessionId}`,
                share: serverShare,
                commitment: serverCommitment,
                partyId: partyId,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Server share generation failed', { error: error.message });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * コミットメント交換
     * POST /api/mpc/exchange-commitments
     */
    async exchangeCommitments(req, res) {
        try {
            const { masterId, sessionId, commitments } = req.body;
            
            logger.info('Commitment exchange requested', { masterId, sessionId });
            
            // セッション取得
            const session = this.activeSessions.get(sessionId);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    error: 'Session not found'
                });
            }
            
            // コミットメントの検証
            await this.verifyCommitments(session, commitments);
            
            // サーバーのコミットメントを他のパーティーに送信
            const serverCommitment = {
                partyId: session.partyId,
                commitment: session.commitment
            };
            
            logger.info('Commitments exchanged successfully', { sessionId });
            
            res.json({
                success: true,
                serverCommitment: serverCommitment,
                receivedCommitments: commitments,
                timestamp: Date.now()
            });
            
        } catch (error) {
            logger.error('Commitment exchange failed', { error: error.message });
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * サーバー側で独立してシェアを生成
     */
    async generateIndependentShare() {
        try {
            // セキュアな乱数生成
            const privateKey = crypto.randomBytes(32);
            
            // secp256k1曲線での公開鍵導出
            const publicKey = secp256k1.getPublicKey(privateKey);
            
            return {
                privateKey: privateKey.toString('hex'),
                publicKey: Buffer.from(publicKey).toString('hex'),
                algorithm: 'secp256k1',
                generatedBy: 'BitVoy_Server',
                timestamp: Date.now()
            };
        } catch (error) {
            throw new Error(`Server share generation failed: ${error.message}`);
        }
    }

    /**
     * コミットメント生成
     */
    async generateCommitment(share) {
        try {
            // シェアのハッシュをコミットメントとして使用
            const shareData = JSON.stringify(share);
            const hash = crypto.createHash('sha256').update(shareData).digest('hex');
            
            return {
                hash: hash,
                timestamp: Date.now(),
                algorithm: 'SHA-256',
                generatedBy: 'BitVoy_Server'
            };
        } catch (error) {
            throw new Error(`Commitment generation failed: ${error.message}`);
        }
    }

    /**
     * コミットメントの検証
     */
    async verifyCommitments(session, commitments) {
        for (const commitment of commitments) {
            if (commitment.partyId === session.partyId) {
                // 自分のコミットメントの整合性チェック
                const expectedCommitment = await this.generateCommitment(session.share);
                if (commitment.commitment.hash !== expectedCommitment.hash) {
                    throw new Error(`Commitment verification failed for party ${commitment.partyId}`);
                }
            }
        }
    }

    /**
     * セッションのクリーンアップ
     */
    cleanupSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }
}

module.exports = MPCAPI; 