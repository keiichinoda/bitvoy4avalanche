/**
 * JWTAuthorityService.js - JWT Authority サービス
 * Guardian Network用JWT発行・検証・管理
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;

class JWTAuthorityService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.db = null;
        
        // JWT設定
        this.jwtConfig = config.jwt || {};
        if (!this.jwtConfig.issuer) throw new Error('JWT issuer not configured. Set JWT_ISSUER in environment.');
        
        // アクション別クォータ設定
        this.actionQuotas = {
            emergency_restore: { limit: 10, window: 3600 }, // 10回/時間
            device_recovery: { limit: 5, window: 3600 },    // 5回/時間
            account_migration: { limit: 1, window: 86400 }, // 1回/日
            emergency_sign: { limit: 50, window: 3600 },    // 50回/時間
            blockchain_access: { limit: 1000, window: 3600 }, // 1000回/時間（ブロックチェーンアクセス用）
            wallet_register: { limit: 100, window: 3600 },  // 100回/時間（ウォレット登録用）
            wallet_list: { limit: 1000, window: 3600 },   // 1000回/時間（ウォレット一覧取得用）
            test_action: { limit: 100, window: 300 }        // 100回/5分（テスト用）
        };
        
        // アクション別有効期限設定（秒単位）
        this.actionExpirySeconds = {
            wallet_list: 24 * 60 * 60, // 24時間
            // その他のアクションはデフォルトのexpirySecondsを使用
        };
        
        // 許可されたアクション
        this.allowedActions = Object.keys(this.actionQuotas);
        
        // チャレンジ一時保存（JWT発行用）
        this.challengeStore = new Map();
        
        // 鍵管理
        this.privateKey = null;
        this.publicKey = null;
        this.keyFingerprint = null;
        
        this.loadKeys();
    }

    /**
     * サービス初期化
     */
    async init(database) {
        try {
            this.db = database;
            
            // JWT鍵読み込み
            await this.loadJWTKeys();
            
            this.logger.info('✅ JWT Authority Service initialized', {
                algorithm: this.jwtConfig.algorithm,
                issuer: this.jwtConfig.issuer,
                keyFingerprint: this.keyFingerprint
            });
        } catch (error) {
            this.logger.error('❌ JWT Authority Service initialization failed:', error);
            throw error;
        }
    }

    /**
     * ヘルス状態確認
     */
    isHealthy() {
        return this.privateKey !== null && this.publicKey !== null;
    }

    /**
     * JWT鍵読み込み
     */
    async loadJWTKeys() {
        try {
            // 秘密鍵読み込み
            this.privateKey = await fs.readFile(this.jwtConfig.privateKeyPath, 'utf8');
            
            // 公開鍵読み込み
            this.publicKey = await fs.readFile(this.jwtConfig.publicKeyPath, 'utf8');
            
            // フィンガープリント生成
            this.keyFingerprint = crypto
                .createHash('sha256')
                .update(this.publicKey)
                .digest('hex')
                .substring(0, 16);
            
            this.logger.info('JWT keys loaded successfully', {
                keyFingerprint: this.keyFingerprint
            });
            
        } catch (error) {
            this.logger.error('Failed to load JWT keys:', error);
            throw error;
        }
    }

    /**
     * BitVoy Server用JWT発行（汎用サーバーアクション）
     * 例: emergency_restore, device_recovery, account_migration など
     */
    async issueServerJWT(masterId, action, context = {}) {
        try {
            // バリデーション
            if (!masterId || !action) {
                return { success: false, error: 'Missing masterId or action' };
            }

            if (!this.allowedActions.includes(action)) {
                return { success: false, error: `Unauthorized action: ${action}` };
            }

            // クォータ確認
            const quotaCheck = await this.checkActionQuota(masterId, action);
            if (!quotaCheck.allowed) {
                return { 
                    success: false, 
                    error: 'Quota exceeded',
                    retryAfter: quotaCheck.retryAfter,
                    remainingQuota: 0
                };
            }

            // JWT payload作成
            const now = Math.floor(Date.now() / 1000);
            // アクション別の有効期限を取得（wallet_listは24時間、その他はデフォルト）
            const expirySeconds = this.actionExpirySeconds[action] || this.jwtConfig.expirySeconds;
            const payload = {
                iss: this.jwtConfig.issuer,
                aud: this.jwtConfig.audience, // 配列のまま使用（検証時と一致させる）
                sub: masterId,
                exp: now + expirySeconds,
                iat: now,
                nbf: now,
                jti: crypto.randomUUID(), // JWT ID for replay protection
                
                // カスタムクレーム
                action: action,
                email_verified: context.emailVerified || false,
                guardian_quota: quotaCheck.remainingQuota,
                rate_limit: `${this.actionQuotas[action].limit}/${this.actionQuotas[action].window}s`,
                priority: context.priority || 'normal',
                session_id: context.sessionId || crypto.randomUUID(),
                auth_methods: context.authMethods || ['webauthn'],
                
                // コンテキスト情報
                blockchain: context.blockchain,
                reason: context.reason,
                amount: context.amount,
                destination: context.destination
            };

            // JWT署名
            const token = jwt.sign(payload, this.privateKey, {
                algorithm: this.jwtConfig.algorithm,
                keyid: this.keyFingerprint
            });

            // データベースに記録
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await this.storeJWTRecord(masterId, action, tokenHash, payload);

            // クォータ使用記録
            await this.recordQuotaUsage(masterId, action);

            this.logger.info('Server JWT issued successfully', {
                masterId,
                action,
                jti: payload.jti,
                expiresAt: new Date(payload.exp * 1000).toISOString(),
                remainingQuota: quotaCheck.remainingQuota - 1
            });

            return {
                success: true,
                token: token,
                expiresAt: payload.exp * 1000,
                remainingQuota: quotaCheck.remainingQuota - 1,
                action: action,
                jti: payload.jti
            };

        } catch (error) {
            this.logger.error('Server JWT issuance failed:', error);
            return {
                success: false,
                error: 'JWT issuance failed',
                details: error.message
            };
        }
    }

    /**
     * Guardian Share API用トークン発行
     * 仕様: README-guardian-share.md
     */
    async issueGuardianShareToken(masterId, deviceId, keyId = null, ops = []) {
        try {
            // バリデーション
            if (!masterId || !deviceId) {
                return { success: false, error: 'Missing masterId or deviceId' };
            }

            // ops から scope を生成
            const scopes = ops.map(op => `guardian:${op}`);
            const scope = scopes.join(' ');

            // JWT payload作成（仕様に準拠）
            const now = Math.floor(Date.now() / 1000);
            const expiresIn = 300; // 5 minutes (仕様推奨)
            const payload = {
                iss: this.jwtConfig.issuer,
                sub: masterId, // master_id
                aud: 'guardian', // 固定値
                exp: now + expiresIn,
                iat: now,
                jti: crypto.randomUUID(), // JWT ID for replay protection
                scope: scope,
                session_id: `bv-sess-${crypto.randomUUID().substring(0, 8)}`,
                device_id: deviceId,
            };

            // key_id が指定されている場合は追加
            if (keyId) {
                payload.key_id = keyId;
            }

            // JWT署名
            const token = jwt.sign(payload, this.privateKey, {
                algorithm: this.jwtConfig.algorithm,
                keyid: this.keyFingerprint
            });

            this.logger.info('Guardian Share Token issued successfully', {
                masterId,
                deviceId,
                keyId,
                scope,
                jti: payload.jti,
                expiresAt: new Date(payload.exp * 1000).toISOString()
            });

            return {
                success: true,
                token: token,
                expiresIn: expiresIn,
                expiresAt: payload.exp * 1000
            };

        } catch (error) {
            this.logger.error('Guardian Share Token issuance failed:', error);
            return {
                success: false,
                error: 'Guardian Share Token issuance failed',
                details: error.message
            };
        }
    }

    /**
     * Guardian Share Token検証
     * Guardian Share API用トークンの検証（audience: 'guardian'）
     */
    async verifyGuardianShareToken(token) {
        try {
            if (!token) {
                return { valid: false, error: 'Missing token' };
            }

            // JWT検証（Guardian Share Token用）
            const decoded = jwt.verify(token, this.publicKey, {
                algorithms: [this.jwtConfig.algorithm],
                issuer: this.jwtConfig.issuer,
                audience: 'guardian', // Guardian Share Tokenは固定値
                clockTolerance: 30 // 30秒の時計ずれ許容
            });

            // 必須クレーム確認
            if (!decoded.sub || !decoded.device_id || !decoded.scope) {
                return { valid: false, error: 'Missing required claims' };
            }

            this.logger.info('Guardian Share Token verification successful', {
                masterId: decoded.sub,
                deviceId: decoded.device_id,
                scope: decoded.scope,
                jti: decoded.jti
            });

            return {
                valid: true,
                payload: decoded,
                expiresIn: decoded.exp - Math.floor(Date.now() / 1000)
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'Invalid token' };
            } else {
                this.logger.error('Guardian Share Token verification failed:', error);
                return { valid: false, error: 'Token verification failed' };
            }
        }
    }

    /**
     * JWT検証
     */
    async verifyToken(token, masterId = null) {
        try {
            if (!token) {
                return { valid: false, error: 'Missing token' };
            }

            // JWT検証
            const decoded = jwt.verify(token, this.publicKey, {
                algorithms: [this.jwtConfig.algorithm],
                issuer: this.jwtConfig.issuer,
                audience: Array.isArray(this.jwtConfig.audience) ? this.jwtConfig.audience : [this.jwtConfig.audience],
                clockTolerance: 30 // 30秒の時計ずれ許容
            });

            // masterId確認（提供された場合）
            if (masterId && decoded.sub !== masterId) {
                return { valid: false, error: 'Token subject mismatch' };
            }

            // アクション確認
            if (!this.allowedActions.includes(decoded.action)) {
                return { valid: false, error: 'Invalid action in token' };
            }

            // データベースで無効化確認
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const tokenRecord = await this.getJWTRecord(tokenHash);
            
            if (tokenRecord && tokenRecord.revoked) {
                return { valid: false, error: 'Token has been revoked' };
            }

            // 使用回数更新
            if (tokenRecord) {
                await this.incrementTokenUsage(tokenRecord.id);
            }

            // 残りクォータ確認
            const quotaCheck = await this.checkActionQuota(decoded.sub, decoded.action);

            this.logger.info('JWT verification successful', {
                masterId: decoded.sub,
                action: decoded.action,
                jti: decoded.jti,
                remainingQuota: quotaCheck.remainingQuota
            });

            return {
                valid: true,
                payload: decoded,
                remainingQuota: quotaCheck.remainingQuota,
                expiresIn: decoded.exp - Math.floor(Date.now() / 1000)
            };

        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Token expired' };
            } else if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'Invalid token' };
            } else {
                this.logger.error('JWT verification failed:', error);
                return { valid: false, error: 'Token verification failed' };
            }
        }
    }

    /**
     * JWT無効化
     */
    async revokeToken(token, reason = 'manual_revocation') {
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            
            const query = `
                UPDATE jwt_tokens 
                SET revoked = true, revoked_at = NOW(), revocation_reason = ?
                WHERE token_hash = ?
            `;
            
            await this.db.query(query, [reason, tokenHash]);
            const [selectResult] = await this.db.query(
                'SELECT id, master_id, action FROM jwt_tokens WHERE token_hash = ?',
                [tokenHash]
            );
            
            if (selectResult && selectResult.length > 0) {
                const token = selectResult[0];
                this.logger.info('JWT revoked successfully', {
                    tokenId: token.id,
                    masterId: token.master_id,
                    action: token.action,
                    reason
                });
                return { success: true };
            } else {
                return { success: false, error: 'Token not found' };
            }

        } catch (error) {
            this.logger.error('JWT revocation failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // クォータ管理
    // ==========================================

    /**
     * アクションクォータ確認
     */
    async checkActionQuota(masterId, action) {
        try {
            if (!this.actionQuotas[action]) {
                return { allowed: false, error: 'Unknown action' };
            }

            const quota = this.actionQuotas[action];
            const windowStart = new Date(Date.now() - quota.window * 1000);

            const query = `
                SELECT COUNT(*) as usage_count
                FROM jwt_tokens 
                WHERE master_id = ? AND action = ? AND issued_at > ?
            `;
            
            const [result] = await this.db.query(query, [masterId, action, windowStart]);
            
            const usageCount = parseInt(result[0]?.usage_count || 0);
            const remainingQuota = Math.max(0, quota.limit - usageCount);
            
            return {
                allowed: usageCount < quota.limit,
                remainingQuota: remainingQuota,
                usageCount: usageCount,
                limit: quota.limit,
                windowSeconds: quota.window,
                retryAfter: usageCount >= quota.limit ? quota.window : null
            };

        } catch (error) {
            this.logger.error('Quota check failed:', error);
            return { allowed: false, error: 'Quota check failed' };
        }
    }

    /**
     * クォータ使用記録
     */
    async recordQuotaUsage(masterId, action) {
        try {
            // JWTレコードで記録済みのため、追加の記録は不要
            // 将来的にはRedisなどでリアルタイム制限も可能
            return { success: true };

        } catch (error) {
            this.logger.error('Quota usage recording failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ==========================================
    // データベース操作
    // ==========================================

    /**
     * JWTレコード保存
     */
    async storeJWTRecord(masterId, action, tokenHash, payload) {
        try {
            // UUIDを生成
            const id = crypto.randomUUID();
            const query = `
                INSERT INTO jwt_tokens (
                    id, master_id, token_hash, action, issued_at, expires_at, 
                    guardian_usage
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await this.db.query(query, [
                id,
                masterId,
                tokenHash,
                action,
                new Date(payload.iat * 1000),
                new Date(payload.exp * 1000),
                JSON.stringify([]) // Guardian使用履歴（初期値は空配列）
            ]);
            
            return id;

        } catch (error) {
            this.logger.error('Failed to store JWT record:', error);
            throw error;
        }
    }

    /**
     * JWTレコード取得
     */
    async getJWTRecord(tokenHash) {
        try {
            const query = `
                SELECT id, master_id, action, issued_at, expires_at, 
                       revoked, used_count, guardian_usage, jwt_payload
                FROM jwt_tokens 
                WHERE token_hash = ?
            `;
            
            const [result] = await this.db.query(query, [tokenHash]);
            
            const rows = Array.isArray(result) ? result : [];
            return rows[0] || null;

        } catch (error) {
            this.logger.error('Failed to get JWT record:', error);
            return null;
        }
    }

    /**
     * JWT使用回数更新
     */
    async incrementTokenUsage(tokenId) {
        try {
            const query = `
                UPDATE jwt_tokens 
                SET used_count = used_count + 1, last_used_at = NOW()
                WHERE id = ?
            `;
            
            await this.db.query(query, [tokenId]);

        } catch (error) {
            this.logger.error('Failed to increment token usage:', error);
            throw error;
        }
    }

    /**
     * Guardian使用履歴記録
     */
    async recordGuardianUsage(tokenHash, guardianNodeId, signature = null) {
        try {
            const guardianUsage = {
                nodeId: guardianNodeId,
                timestamp: Date.now(),
                signature: signature ? 'provided' : null
            };
            
            // MySQL用: JSON_MERGE_PRESERVEの代わりにJSON_ARRAY_APPENDまたはJSON_SETを使用
            const query = `
                UPDATE jwt_tokens 
                SET guardian_usage = JSON_ARRAY_APPEND(COALESCE(guardian_usage, '[]'), '$', ?)
                WHERE token_hash = ?
            `;
            
            await this.db.query(query, [JSON.stringify(guardianUsage), tokenHash]);

        } catch (error) {
            this.logger.error('Failed to record Guardian usage:', error);
            throw error;
        }
    }

    /**
     * 期限切れJWTクリーンアップ
     */
    async cleanupExpiredTokens() {
        try {
            // 有効期限から24時間経過したJWTを削除
            const query = `
                DELETE FROM jwt_tokens 
                WHERE expires_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
            `;
            
            const [result] = await this.db.query(query);
            
            const deletedCount = result.affectedRows || 0;
            
            if (deletedCount > 0) {
                this.logger.info(`Cleaned up ${deletedCount} expired JWT tokens`);
            }
            
            return deletedCount;

        } catch (error) {
            this.logger.error('JWT cleanup failed:', error);
            return 0;
        }
    }

    // ==========================================
    // 統計・監視
    // ==========================================

    /**
     * JWT統計取得
     */
    async getJWTStatistics(masterId = null, timeRange = '24h') {
        try {
            let timeCondition;
            switch (timeRange) {
                case '1h':
                    timeCondition = "issued_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)";
                    break;
                case '24h':
                    timeCondition = "issued_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)";
                    break;
                case '7d':
                    timeCondition = "issued_at > DATE_SUB(NOW(), INTERVAL 7 DAY)";
                    break;
                default:
                    timeCondition = "issued_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)";
            }
            
            let query, params;
            if (masterId) {
                query = `
                    SELECT 
                        COUNT(*) as total_tokens,
                        SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as active_tokens,
                        SUM(CASE WHEN revoked = true THEN 1 ELSE 0 END) as revoked_tokens,
                        COUNT(DISTINCT action) as unique_actions,
                        SUM(used_count) as total_usage,
                        AVG(used_count) as avg_usage_per_token
                    FROM jwt_tokens 
                    WHERE master_id = ? AND ${timeCondition}
                `;
                params = [masterId];
            } else {
                query = `
                    SELECT 
                        COUNT(*) as total_tokens,
                        SUM(CASE WHEN expires_at > NOW() THEN 1 ELSE 0 END) as active_tokens,
                        SUM(CASE WHEN revoked = true THEN 1 ELSE 0 END) as revoked_tokens,
                        COUNT(DISTINCT master_id) as unique_users,
                        COUNT(DISTINCT action) as unique_actions,
                        SUM(used_count) as total_usage,
                        AVG(used_count) as avg_usage_per_token
                    FROM jwt_tokens 
                    WHERE ${timeCondition}
                `;
                params = [];
            }
            
            const [result] = await this.db.query(query, params);
            
            // アクション別統計
            const actionQuery = `
                SELECT action, COUNT(*) as count, SUM(used_count) as usage
                FROM jwt_tokens 
                WHERE ${timeCondition} ${masterId ? 'AND master_id = ?' : ''}
                GROUP BY action
                ORDER BY count DESC
            `;
            
            const actionParams = masterId ? [masterId] : [];
            const [actionResult] = await this.db.query(actionQuery, actionParams);
            
            const stats = result[0] || {};
            stats.actions = Array.isArray(actionResult) ? actionResult : [];
            stats.timeRange = timeRange;
            stats.keyFingerprint = this.keyFingerprint;
            
            return stats;

        } catch (error) {
            this.logger.error('Failed to get JWT statistics:', error);
            throw error;
        }
    }

    /**
     * 不審なJWTアクティビティ検出
     */
    async detectSuspiciousActivity(masterId = null) {
        try {
            const suspicious = [];
            
            // 短時間での大量リクエスト
            const rapidQuery = `
                SELECT master_id, action, COUNT(*) as count
                FROM jwt_tokens 
                WHERE issued_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
                GROUP BY master_id, action
                HAVING COUNT(*) > 20
            `;
            
            const [rapidResult] = await this.db.query(rapidQuery);
            const rapid = (Array.isArray(rapidResult) ? rapidResult : []).map(row => ({
                type: 'rapid_requests',
                masterId: row.master_id,
                action: row.action,
                count: row.count,
                severity: 'high'
            }));
            
            suspicious.push(...rapid);
            
            // 異常な時間帯でのアクセス
            const nightQuery = `
                SELECT master_id, COUNT(*) as count
                FROM jwt_tokens 
                WHERE issued_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
                  AND HOUR(issued_at) BETWEEN 2 AND 5
                GROUP BY master_id
                HAVING COUNT(*) > 5
            `;
            
            const [nightResult] = await this.db.query(nightQuery);
            const nighttime = (Array.isArray(nightResult) ? nightResult : []).map(row => ({
                type: 'nighttime_activity',
                masterId: row.master_id,
                count: row.count,
                severity: 'medium'
            }));
            
            suspicious.push(...nighttime);
            
            // masterId フィルタ
            if (masterId) {
                return suspicious.filter(item => item.masterId === masterId);
            }
            
            return suspicious;

        } catch (error) {
            this.logger.error('Suspicious activity detection failed:', error);
            return [];
        }
    }

    /**
     * JWT設定情報取得
     */
    getJWTConfiguration() {
        return {
            algorithm: this.jwtConfig.algorithm,
            issuer: this.jwtConfig.issuer,
            audience: this.jwtConfig.audience,
            expirySeconds: this.jwtConfig.expirySeconds,
            allowedActions: this.allowedActions,
            actionQuotas: this.actionQuotas,
            keyFingerprint: this.keyFingerprint
        };
    }

    async loadKeys() {
        // JWT鍵の読み込み
    }

    async issueGuardianJWT(masterId, operation, payload) {
        // Guardian Node用JWT発行
    }

    async verifyJWT(token) {
        // JWT検証
    }

    /**
     * ブロックチェーンアクセス用JWT発行
     */
    async issueBlockchainJWT(masterId, operation, context = {}) {
        try {
            this.logger.info(`Issuing blockchain JWT for ${masterId}, operation: ${operation}`);

            // クォータチェック
            const quotaCheck = await this.checkActionQuota(masterId, operation);
            if (!quotaCheck.allowed) {
                return {
                    success: false,
                    error: `Quota exceeded for operation: ${operation}`,
                    remainingQuota: quotaCheck.remaining
                };
            }

            // JWTペイロード作成
            const payload = {
                iss: this.jwtConfig.issuer,
                aud: 'blockchain-access', // ブロックチェーンアクセス用は固定
                sub: masterId,
                op: operation,
                ctx: context,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + this.jwtConfig.expirySeconds,
                jti: crypto.randomBytes(16).toString('hex')
            };

            // JWT署名
            const token = jwt.sign(payload, this.privateKey, {
                algorithm: this.jwtConfig.algorithm,
                keyid: this.keyFingerprint
            });

            // トークンハッシュ生成
            const tokenHash = crypto
                .createHash('sha256')
                .update(token)
                .digest('hex');

            // データベースに記録
            await this.storeJWTRecord(masterId, operation, tokenHash, payload);
            
            // クォータ使用記録
            await this.recordQuotaUsage(masterId, operation);

            this.logger.info(`Blockchain JWT issued successfully for ${masterId}`, {
                operation: operation,
                tokenId: payload.jti,
                expiresAt: new Date(payload.exp * 1000)
            });

            return {
                success: true,
                token: token,
                expiresAt: new Date(payload.exp * 1000),
                remainingQuota: quotaCheck.remaining - 1
            };

        } catch (error) {
            this.logger.error(`Blockchain JWT issuance failed for ${masterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = JWTAuthorityService;