const crypto = require('crypto');

/**
 * PublicKeyPackageからフィンガープリントを生成
 * @param {Object} publicKeyPackage - FROST PublicKeyPackage
 * @returns {string} SHA256ハッシュ（64文字の16進文字列）
 */
function generatePubkeyFingerprint(publicKeyPackage) {
    try {
        console.log('generatePubkeyFingerprint: Input publicKeyPackage:', {
            type: typeof publicKeyPackage,
            isNull: publicKeyPackage === null,
            isUndefined: publicKeyPackage === undefined,
            keys: publicKeyPackage ? Object.keys(publicKeyPackage) : 'N/A',
            sample: publicKeyPackage ? JSON.stringify(publicKeyPackage).substring(0, 200) + '...' : 'N/A'
        });
        
        // verifying_keyのみを使用（公開鍵パッケージの核心部分）
        const verifyingKey = publicKeyPackage.verifying_key;
        
        if (!verifyingKey) {
            throw new Error('verifying_key not found in publicKeyPackage');
        }
        
        // verifying_keyを正規化してJSON文字列に変換
        const normalizedJson = JSON.stringify(verifyingKey, Object.keys(verifyingKey).sort());
        
        // SHA256ハッシュを計算
        const hash = crypto.createHash('sha256');
        hash.update(normalizedJson);
        
        return hash.digest('hex');
    } catch (error) {
        console.error('Failed to generate pubkey fingerprint:', error);
        throw new Error(`Invalid publicKeyPackage: ${error.message}`);
    }
}

/**
 * エポックの一意識別子を生成
 * @param {string} masterId - マスターID
 * @param {string} curveType - 曲線タイプ
 * @param {number} epochCounter - エポックカウンター
 * @param {string} pubkeyFingerprint - 公開鍵フィンガープリント
 * @returns {string} エポックの一意識別子
 */
function generateEpochId(masterId, curveType, epochCounter, pubkeyFingerprint) {
    return `${masterId}_${curveType}_${epochCounter}_${pubkeyFingerprint}`;
}

/**
 * エポックIDから構成要素を解析
 * @param {string} epochId - エポックID
 * @returns {Object} 解析結果
 */
function parseEpochId(epochId) {
    const parts = epochId.split('_');
    if (parts.length < 4) {
        throw new Error('Invalid epoch ID format');
    }
    
    const pubkeyFingerprint = parts.slice(-1)[0];
    const epochCounter = parseInt(parts.slice(-2)[0]);
    const curveType = parts.slice(-3)[0];
    const masterId = parts.slice(0, -3).join('_');
    
    return {
        masterId,
        curveType,
        epochCounter,
        pubkeyFingerprint
    };
}

/**
 * 次のエポックカウンターを取得
 * @param {Object} db - データベース接続
 * @param {string} masterId - マスターID
 * @param {string} curveType - 曲線タイプ
 * @param {string} pubkeyFingerprint - 公開鍵フィンガープリント（オプション）
 * @returns {number} 次のエポックカウンター
 */
async function getNextEpochCounter(db, masterId, curveType) {
    try {
        const client = await db.connect();
        
        // (master_id, curve_type)で最大のepoch_counterを取得
        const query = `
            SELECT MAX(epoch_counter) as max_epoch_counter
            FROM server_shares 
            WHERE master_id = ? AND curve_type = ?
        `;
        
        const [result] = await client.query(query, [masterId, curveType]);
        const rows = result || [];
        client.release();
        
        const maxEpochCounter = rows[0]?.max_epoch_counter;
        const nextEpochCounter = (maxEpochCounter === null) ? 0 : maxEpochCounter + 1;
        
        console.log(`[getNextEpochCounter] masterId=${masterId}, curveType=${curveType}`);
        console.log(`[getNextEpochCounter] max_epoch_counter=${maxEpochCounter}, next_epoch_counter=${nextEpochCounter}`);
        
        return nextEpochCounter;
    } catch (error) {
        console.error('Failed to get next epoch counter:', error);
        throw error;
    }
}

/**
 * エポック情報を検証
 * @param {Object} epochInfo - エポック情報
 * @returns {boolean} 検証結果
 */
function validateEpochInfo(epochInfo) {
    const { masterId, curveType, epochCounter, pubkeyFingerprint } = epochInfo;
    
    if (!masterId || typeof masterId !== 'string') {
        throw new Error('Invalid masterId');
    }
    
    if (!curveType || !['secp256k1', 'ed25519'].includes(curveType)) {
        throw new Error('Invalid curveType');
    }
    
    if (typeof epochCounter !== 'number' || epochCounter < 0 || !Number.isInteger(epochCounter)) {
        throw new Error('Invalid epochCounter');
    }
    
    if (!pubkeyFingerprint || typeof pubkeyFingerprint !== 'string' || pubkeyFingerprint.length !== 64) {
        throw new Error('Invalid pubkeyFingerprint');
    }
    
    return true;
}

module.exports = {
    generatePubkeyFingerprint,
    generateEpochId,
    parseEpochId,
    getNextEpochCounter,
    validateEpochInfo
};
