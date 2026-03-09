/**
 * backend/utils/crypto-utils.js
 * Cryptographic utilities
 */

const crypto = require('crypto');

class CryptoUtils {
    static generateSecureRandom(length = 32) {
        return crypto.randomBytes(length);
    }
    
    static hash(data, algorithm = 'sha256') {
        return crypto.createHash(algorithm).update(data).digest('hex');
    }
    
    static encrypt(data, key, algorithm = 'aes-256-gcm') {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return {
            algorithm,
            iv: iv.toString('hex'),
            data: encrypted
        };
    }
    
    static decrypt(encryptedData, key) {
        const { algorithm, iv, data } = encryptedData;
        const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'));
        
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }
    
    static generateKeyPair(type = 'ec', options = { namedCurve: 'secp256k1' }) {
        return crypto.generateKeyPairSync(type, {
            ...options,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
    }
}

module.exports = CryptoUtils;