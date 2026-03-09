/**
 * BitVoy ウォレット認証モジュール
 * OIDCプロバイダー用のBitVoy ウォレット認証機能（自動認証対応）
 */

const crypto = require('crypto');
const mysql = require('mysql2/promise');

class BitVoyWalletAuth {
    constructor(dbPool) {
        this.dbPool = dbPool;
    }

    /**
     * ユーザー認証状態をチェック
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async checkUserAuth(session, clientId) {
        try {
            if (!session.userId) {
                return { authenticated: false };
            }

            if (!clientId) {
                console.error('❌ checkUserAuth: client_idは必須です');
                return { authenticated: false };
            }

            // セキュリティ強化: idとclient_idの組み合わせで検索
            const [rows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE id = ? AND client_id = ?',
                [session.userId, clientId]
            );

            if (rows.length === 0) {
                return { authenticated: false };
            }

            const user = rows[0];
            return {
                authenticated: true,
                user: {
                    id: user.id,
                    master_id: user.master_id,
                    email: user.email,
                    name: user.name,
                    client_id: user.client_id
                }
            };
        } catch (error) {
            console.error('ユーザー認証チェックエラー:', error);
            return { authenticated: false };
        }
    }

    /**
     * BitVoy ウォレットの認証状態を自動検出
     * 毎回未ログインとして処理（Cookie使用なし）
     */
    async detectWalletAuth(req) {
        try {
            console.log('🔍 BitVoy 認証状態を自動検出中...');
            
            // 毎回未ログインとして処理
            console.log('❌ 毎回未ログインとして処理（Cookie使用なし）');
            return { authenticated: false };
            
        } catch (error) {
            console.error('認証状態検出エラー:', error);
            return { authenticated: false };
        }
    }

    /**
     * CookieからセッションIDを抽出
     */
    extractSessionFromCookie(req) {
        try {
            const cookies = req.headers.cookie;
            if (!cookies) return null;

            // BitVoyのセッションCookie名を確認
            const sessionPatterns = [
                /skey=([^;]+)/,
                /session=([^;]+)/,
                /bitvoy_session=([^;]+)/
            ];

            for (const pattern of sessionPatterns) {
                const match = cookies.match(pattern);
                if (match) {
                    return match[1];
                }
            }

            return null;
        } catch (error) {
            console.error('Cookie解析エラー:', error);
            return null;
        }
    }

    /**
     * Authorization ヘッダーからJWTを抽出
     */
    extractJWTFromHeader(req) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return null;
            }
            return authHeader.substring(7);
        } catch (error) {
            console.error('JWT抽出エラー:', error);
            return null;
        }
    }

    /**
     * セッションIDからユーザー情報を取得
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async getUserFromSession(sessionId, clientId) {
        try {
            if (!clientId) {
                console.error('❌ getUserFromSession: client_idは必須です');
                return null;
            }

            // セキュリティ強化: idとclient_idの組み合わせで検索
            const [rows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE id = ? AND client_id = ?',
                [sessionId, clientId]
            );

            if (rows.length > 0) {
                return rows[0];
            }

            return null;
        } catch (error) {
            console.error('セッションからユーザー取得エラー:', error);
            return null;
        }
    }

    /**
     * JWTトークンを検証してユーザー情報を取得
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async validateJWTToken(token, clientId) {
        try {
            if (!clientId) {
                console.error('❌ validateJWTToken: client_idは必須です');
                return null;
            }

            // JWT検証ロジック（実際の実装では適切なJWTライブラリを使用）
            // ここでは簡易的な実装
            // セキュリティ強化: master_idとclient_idの組み合わせで検索
            const [rows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE master_id = ? AND client_id = ?',
                [token, clientId] // 実際はJWTからsubを抽出
            );

            if (rows.length > 0) {
                return rows[0];
            }

            return null;
        } catch (error) {
            console.error('JWT検証エラー:', error);
            return null;
        }
    }

    /**
     * パスキー認証状態をチェック
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async checkPasskeyAuth(req, clientId) {
        try {
            if (!clientId) {
                console.error('❌ checkPasskeyAuth: client_idは必須です');
                return null;
            }

            // パスキー認証状態をチェック
            // 実際の実装では、BitVoyのパスキー認証システムと連携
            const webauthnHeader = req.headers['x-webauthn-auth'];
            if (webauthnHeader) {
                // セキュリティ強化: master_idとclient_idの組み合わせで検索
                const [rows] = await this.dbPool.execute(
                    'SELECT * FROM users WHERE master_id = ? AND client_id = ?',
                    [webauthnHeader, clientId]
                );

                if (rows.length > 0) {
                    return rows[0];
                }
            }

            return null;
        } catch (error) {
            console.error('パスキー認証チェックエラー:', error);
            return null;
        }
    }

    /**
     * ユーザーセッションを作成
     */
    async createUserSession(userId, req) {
        try {
            req.session.userId = userId;
            req.session.authenticatedAt = new Date().toISOString();
            req.session.userAgent = req.get('User-Agent');
            req.session.ipAddress = req.ip;

            // セッションログを記録
            await this.logSession(userId, 'login', {
                userAgent: req.get('User-Agent'),
                ipAddress: req.ip,
                timestamp: new Date().toISOString()
            });

            return true;
        } catch (error) {
            console.error('セッション作成エラー:', error);
            return false;
        }
    }

    /**
     * セッションログを記録
     */
    async logSession(userId, eventType, eventData) {
        try {
            await this.dbPool.execute(
                'INSERT INTO user_sessions (user_id, event_type, event_data, created_at) VALUES (?, ?, ?, NOW())',
                [userId, eventType, JSON.stringify(eventData)]
            );
        } catch (error) {
            console.error('セッションログ記録エラー:', error);
        }
    }

    /**
     * ユーザーを検索または作成
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async findOrCreateUser(email, clientId, userData = {}) {
        try {
            if (!clientId) {
                throw new Error('client_idは必須です');
            }

            // 既存ユーザーを検索（emailとclient_idの組み合わせで検索）
            const [existingRows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE email = ? AND client_id = ?',
                [email, clientId]
            );

            if (existingRows.length > 0) {
                return existingRows[0];
            }

            // 新規ユーザーを作成（client_idを含める）
            const [result] = await this.dbPool.execute(
                `INSERT INTO users (
                    email, client_id, name, email_verified, created_at
                ) VALUES (?, ?, ?, ?, NOW())`,
                [
                    email,
                    clientId,
                    userData.name || `User_${email.split('@')[0]}`,
                    userData.email_verified || false
                ]
            );

            // 作成されたユーザーを取得（emailとclient_idの組み合わせで検索）
            const [newUserRows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE email = ? AND client_id = ?',
                [email, clientId]
            );

            return newUserRows[0];
        } catch (error) {
            console.error('ユーザー検索・作成エラー:', error);
            throw error;
        }
    }

    /**
     * master_idとclient_idを使用してユーザーを検索または作成
     * セキュリティ強化: クライアントごとにユーザーを分離
     */
    async findOrCreateUserByMasterId(masterId, clientId, userData = {}) {
        try {
            if (!masterId || !clientId) {
                throw new Error('master_idとclient_idは必須です');
            }

            // 既存ユーザーを検索（master_idとclient_idの組み合わせで検索）
            const [existingRows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE master_id = ? AND client_id = ?',
                [masterId, clientId]
            );

            if (existingRows.length > 0) {
                console.log('✅ 既存ユーザーを取得:', { master_id: masterId, client_id: clientId });
                return existingRows[0];
            }

            // 新規ユーザーを作成（client_idを含める）
            const [result] = await this.dbPool.execute(
                `INSERT INTO users (
                    master_id, client_id, name, email, email_verified, 
                    webauthn_credentials, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [
                    masterId,
                    clientId,
                    userData.name || `bv${masterId.substring(4, 14)}`,
                    userData.email || null,
                    userData.email_verified || false,
                    userData.webauthn_credentials ? JSON.stringify(userData.webauthn_credentials) : null
                ]
            );

            // 作成されたユーザーを取得
            const [newUserRows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE master_id = ? AND client_id = ?',
                [masterId, clientId]
            );

            console.log('✅ 新規ユーザーを作成:', { master_id: masterId, client_id: clientId });
            return newUserRows[0];
        } catch (error) {
            console.error('master_idとclient_idによるユーザー検索・作成エラー:', error);
            throw error;
        }
    }

    /**
     * sub（master_id）を使用してユーザーを認証
     * セキュリティ強化: client_idは必須（クライアントごとにユーザーを分離）
     */
    async authenticateBySub(sub, clientId) {
        try {
            if (!clientId) {
                console.error('❌ authenticateBySub: client_idは必須です');
                return null;
            }

            console.log('🔐 subによる認証開始:', { sub, clientId });
            
            // セキュリティ強化: master_idとclient_idの組み合わせで検索
            const [rows] = await this.dbPool.execute(
                'SELECT * FROM users WHERE master_id = ? AND client_id = ?',
                [sub, clientId]
            );

            if (rows.length === 0) {
                console.log('❌ ユーザーが見つかりません:', { sub, clientId });
                return null;
            }

            const user = rows[0];
            console.log('✅ ユーザー認証成功:', { master_id: user.master_id, client_id: user.client_id });
            
            return user;
        } catch (error) {
            console.error('subによる認証エラー:', error);
            return null;
        }
    }

    /**
     * ユーザーセッションを破棄
     */
    async destroyUserSession(req) {
        try {
            if (req.session.userId) {
                await this.logSession(req.session.userId, 'logout', {
                    timestamp: new Date().toISOString()
                });
            }

            req.session.destroy();
            return true;
        } catch (error) {
            console.error('セッション破棄エラー:', error);
            return false;
        }
    }
}

module.exports = BitVoyWalletAuth;
