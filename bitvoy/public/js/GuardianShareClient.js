/**
 * Guardian Share API Client
 * BitVoy Guardian Share Storage Client Library
 * 仕様: docs/README-guardian-share.md
 */

class GuardianShareClient {
    constructor(bitvoyServerUrl = window.location.origin) {
        this.bitvoyServerUrl = bitvoyServerUrl;
        this.guardianBaseUrl = null;
        this.guardianToken = null;
        this.guardianSessionId = null;
        this.tokenExpiresAt = null;
        this.sessionExpiresAt = null;
        this.deviceId = null;
        this.masterId = null;
    }

    /**
     * device_id 生成
     * WebAuthn Credential の PublicKey から device_id を生成
     * 
     * @param {PublicKeyCredential} credential - WebAuthn Credential
     * @returns {Promise<string>} device_id (例: "dev_8R6mKxF38k2yaT4YfGQv1p")
     */
    async generateDeviceId(credential) {
        try {
            // COSE PublicKey を取得
            const cosePk = this.extractCosePublicKey(credential);
            
            // COSE → Raw 公開鍵に変換
            const pkRaw = this.extractRawPublicKeyFromCOSE(cosePk);
            
            // SHA-256 ハッシュ
            const hashBuf = await crypto.subtle.digest('SHA-256', pkRaw);
            
            // Base58 エンコード（簡易実装: Base64 を使用）
            // 実際の実装では base58 ライブラリを使用
            const base58 = await this.base58Encode(new Uint8Array(hashBuf));
            
            return `dev_${base58}`;
        } catch (error) {
            console.error('[GuardianShareClient] Failed to generate device_id:', error);
            throw new Error(`Device ID generation failed: ${error.message}`);
        }
    }

    /**
     * COSE PublicKey を抽出
     */
    extractCosePublicKey(credential) {
        try {
            // attestationObject から COSE PublicKey を抽出
            const attestationObject = credential.response.attestationObject;
            // CBOR デコードが必要（簡易実装では仮定）
            // 実際の実装では CBOR ライブラリを使用
            return attestationObject;
        } catch (error) {
            throw new Error(`Failed to extract COSE public key: ${error.message}`);
        }
    }

    /**
     * COSE → Raw 公開鍵に変換
     */
    extractRawPublicKeyFromCOSE(cosePk) {
        try {
            // COSE key から raw public key を抽出
            // 簡易実装: CBOR デコード後に key フィールドから取得
            // 実際の実装では @cose-wg/cose-implementations などのライブラリを使用
            // ここでは仮想的な実装
            if (cosePk instanceof Uint8Array) {
                return cosePk;
            }
            // COSE 構造から raw key を抽出
            throw new Error('COSE to raw key conversion not implemented');
        } catch (error) {
            throw new Error(`Failed to extract raw public key: ${error.message}`);
        }
    }

    /**
     * Base58 エンコード（簡易実装）
     * 実際の実装では base58 ライブラリを使用
     */
    async base58Encode(buffer) {
        // 簡易実装: Base64 を使用（実際には Base58 ライブラリが必要）
        const base64 = btoa(String.fromCharCode(...buffer));
        // Base64 を Base58 風に変換（簡易）
        return base64.replace(/[+/=]/g, (match) => {
            const map = { '+': 'A', '/': 'B', '=': '' };
            return map[match];
        }).substring(0, 22); // 適切な長さに調整
    }

    /**
     * Guardian JWT設定（JWT方式）
     * 
     * @param {string} jwt - Guardian JWT token
     * @param {string} guardianBaseUrl - Guardian base URL
     * @param {number} expiresIn - Expiration time in seconds
     */
    setGuardianJWT(jwt, guardianBaseUrl, expiresIn = 300) {
        this.guardianToken = jwt;
        this.guardianBaseUrl = guardianBaseUrl || `${this.bitvoyServerUrl}/guardian`;
        this.tokenExpiresAt = Date.now() + (expiresIn * 1000);
        console.log('[GuardianShareClient] Guardian JWT set via JWT method');
    }

    /**
     * Guardian トークン取得（セッション方式 - 非推奨）
     * BitVoy サーバから guardian_token を取得
     * 
     * @param {string} masterId - Master ID
     * @param {string} deviceId - Device ID
     * @param {string} keyId - Key ID (optional)
     * @param {string[]} ops - Operations (optional)
     * @returns {Promise<Object>} { guardian_base_url, guardian_token, expires_in }
     */
    async getGuardianToken(masterId, deviceId, keyId = null, ops = ['share.save', 'share.get']) {
        try {
            const response = await fetch(`${this.bitvoyServerUrl}/guardianapi/guardian/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('bv_session') || ''}` // セッショントークン
                },
                body: JSON.stringify({
                    device_id: deviceId,
                    key_id: keyId,
                    ops: ops
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to get guardian token');
            }

            const data = await response.json();
            this.guardianBaseUrl = data.guardian_base_url;
            this.guardianToken = data.guardian_token;
            this.tokenExpiresAt = Date.now() + (data.expires_in * 1000);
            this.masterId = data.master_id;

            return data;
        } catch (error) {
            console.error('[GuardianShareClient] Failed to get guardian token:', error);
            throw error;
        }
    }

    /**
     * Guardian セッション初期化
     * 
     * @param {string} clientVersion - Client version (optional)
     * @returns {Promise<Object>} { guardian_session_id, master_id, device_id, allowed_ops, expires_at }
     */
    async initSession(clientVersion = 'web-1.0.0') {
        try {
            if (!this.guardianToken) {
                throw new Error('Guardian token not available. Call getGuardianToken() first.');
            }

            const response = await fetch(`${this.guardianBaseUrl}/guardianapi/session/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.guardianToken}`
                },
                body: JSON.stringify({
                    client_info: {
                        device_id: this.deviceId,
                        client_version: clientVersion
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to initialize session');
            }

            const data = await response.json();
            this.guardianSessionId = data.guardian_session_id;
            this.deviceId = data.device_id;
            this.sessionExpiresAt = new Date(data.expires_at).getTime();

            return data;
        } catch (error) {
            console.error('[GuardianShareClient] Failed to initialize session:', error);
            throw error;
        }
    }

    /**
     * シェア保存
     * 
     * @param {string} keyId - Key ID
     * @param {string} shareId - Share ID
     * @param {string} ciphertext - Base64 エンコードされた暗号化シェア
     * @param {number} version - Version (optional)
     * @param {Object} meta - Metadata (optional)
     * @returns {Promise<Object>} { status, master_id, device_id, key_id, share_id, version, created_at }
     */
    async saveShare(keyId, shareId, ciphertext, version = 1, meta = null) {
        try {
            if (!this.guardianToken) {
                throw new Error('Guardian token not available. Call setGuardianJWT() or getGuardianToken() first.');
            }

            // JWT方式ではguardianSessionIdがなくてもkeyIdを使用
            const effectiveKeyId = this.guardianSessionId || keyId;
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.guardianToken}`
            };
            
            // セッション方式の場合のみX-Guardian-Sessionヘッダーを追加
            if (this.guardianSessionId) {
                headers['X-Guardian-Session'] = this.guardianSessionId;
            }

            // BitVoyサーバ経由でアクセス（/mpcapi/guardian/shares）
            const response = await fetch(`${this.bitvoyServerUrl}/mpcapi/guardian/shares`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    key_id: effectiveKeyId,
                    share_id: shareId,
                    ciphertext: ciphertext,
                    version: version,
                    meta: meta
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save share');
            }

            return await response.json();
        } catch (error) {
            console.error('[GuardianShareClient] Failed to save share:', error);
            throw error;
        }
    }

    /**
     * シェア取得
     * 
     * @param {string} keyId - Key ID
     * @param {string} shareId - Share ID
     * @returns {Promise<Object>} { key_id, share_id, ciphertext, version, meta, updated_at }
     */
    async getShare(keyId, shareId) {
        try {
            if (!this.guardianToken) {
                throw new Error('Guardian token not available. Call setGuardianJWT() or getGuardianToken() first.');
            }

            // JWT方式ではguardianSessionIdがなくてもkeyIdを使用
            const effectiveKeyId = this.guardianSessionId || keyId;
            const headers = {
                'Authorization': `Bearer ${this.guardianToken}`
            };
            
            // セッション方式の場合のみX-Guardian-Sessionヘッダーを追加
            if (this.guardianSessionId) {
                headers['X-Guardian-Session'] = this.guardianSessionId;
            }

            // BitVoyサーバ経由でアクセス（/mpcapi/guardian/shares）
            const response = await fetch(
                `${this.bitvoyServerUrl}/mpcapi/guardian/shares?key_id=${encodeURIComponent(effectiveKeyId)}&share_id=${encodeURIComponent(shareId)}`,
                {
                    method: 'GET',
                    headers: headers
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to get share');
            }

            return await response.json();
        } catch (error) {
            console.error('[GuardianShareClient] Failed to get share:', error);
            throw error;
        }
    }

    /**
     * トークンの有効性チェック
     */
    isTokenValid() {
        if (!this.tokenExpiresAt) {
            return false;
        }
        return Date.now() < this.tokenExpiresAt - 60000; // 1分のマージン
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GuardianShareClient;
} else if (typeof window !== 'undefined') {
    window.GuardianShareClient = GuardianShareClient;
}

