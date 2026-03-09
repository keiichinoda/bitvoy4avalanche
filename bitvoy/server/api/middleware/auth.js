// middleware/auth.js
// 認証ミドルウェア（JWT検証）

const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

let publicKey = null;

// 公開鍵を読み込み
async function loadPublicKey() {
    if (!publicKey) {
        try {
            const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '../../../config/jwt/public.pem');
            publicKey = await fs.readFile(publicKeyPath, 'utf8');
        } catch (error) {
            console.error('Failed to load JWT public key:', error);
            // フォールバック: 開発用のシークレット
            publicKey = process.env.JWT_SECRET || 'dev-jwt-secret';
        }
    }
    return publicKey;
}

async function authMiddleware(req, res, next) {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        
        // トークンがない場合は匿名アクセスとして処理
        if (!token) {
            console.log('⚠️ No token provided, proceeding as anonymous access');
            req.user = { sub: 'anonymous', op: 'anonymous' };
            req.masterId = 'anonymous';
            req.operation = 'anonymous';
            return next();
        }

        // JWTヘッダーを解析してアルゴリズムを確認
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            console.warn('⚠️ Invalid JWT format, proceeding as anonymous access');
            req.user = { sub: 'anonymous', op: 'anonymous' };
            req.masterId = 'anonymous';
            req.operation = 'anonymous';
            return next();
        }

        let header;
        try {
            header = JSON.parse(Buffer.from(tokenParts[0], 'base64url').toString());
        } catch (error) {
            console.warn('⚠️ Invalid JWT header, proceeding as anonymous access');
            req.user = { sub: 'anonymous', op: 'anonymous' };
            req.masterId = 'anonymous';
            req.operation = 'anonymous';
            return next();
        }

        const algorithm = header.alg || 'HS256';
        let key;

        if (algorithm === 'HS256') {
            // HS256の場合はシークレットキーを使用
            key = process.env.JWT_SECRET || 'dev-jwt-secret';
        } else {
            // RS256/ES256の場合は公開鍵を使用
            key = await loadPublicKey();
        }
        
        // JWT検証
        const decoded = jwt.verify(token, key, {
            algorithms: ['ES256', 'RS256', 'HS256'], // 複数のアルゴリズムをサポート
            issuer: process.env.JWT_ISSUER,
            audience: ['guardian-network', 'blockchain-access'] // JWTAuthorityServiceと一致
        });

        // 有効期限チェック
        if (decoded.exp && Date.now() >= decoded.exp * 1000) {
            console.warn('⚠️ Token expired, proceeding as anonymous access');
            req.user = { sub: 'anonymous', op: 'anonymous' };
            req.masterId = 'anonymous';
            req.operation = 'anonymous';
            return next();
        }

        // リクエストにユーザー情報を追加
        req.user = decoded;
        req.masterId = decoded.sub;
        req.operation = decoded.op;

        next();
    } catch (err) {
        console.error('JWT verification failed:', err.message);
        console.log('⚠️ Invalid token, proceeding as anonymous access');
        
        // 認証失敗時も匿名アクセスとして処理
        req.user = { sub: 'anonymous', op: 'anonymous' };
        req.masterId = 'anonymous';
        req.operation = 'anonymous';
        next();
    }
}

module.exports = authMiddleware; 