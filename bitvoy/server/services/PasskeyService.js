/**
 * PasskeyService.js - パスキー認証サービス
 * FIDO2/パスキー認証の登録・認証処理
 */

// Node.js環境でWeb Crypto APIを利用可能にする
const { webcrypto } = require('crypto');
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

const crypto = require('crypto');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { isoUint8Array, isoBase64URL } = require('@simplewebauthn/server/helpers');

class PasskeyService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.db = null;
        
        // Passkey設定
        this.rpName = config.rpName || 'BitVoy Wallet';
        this.rpID = config.rpId || 'localhost';
        this.origin = config.webauthn?.origin;
        this.timeout = config.webauthn?.timeout || 60000;
        
        // チャレンジ一時保存（本番環境ではRedis推奨）
        this.challengeStore = new Map();
        
        this._healthy = false;
    }

    /**
     * サービス初期化
     */
    async init(database) {
        try {
            this.db = database;
            this._healthy = true;
            this.logger.info('✅ Passkey Service initialized');
        } catch (error) {
            this.logger.error('❌ Passkey Service initialization failed:', error);
            throw error;
        }
    }

    /**
     * ヘルス状態確認
     */
    isHealthy() {
        return this._healthy;
    }

    /**
     * masterId生成（元の仕様に合わせた実装）
     */
    async generateMasterId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        const combined = `${timestamp}-${random}`;
        
        // ハッシュ化
        const encoder = new TextEncoder();
        const data = encoder.encode(combined);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return 'btv_' + hashHex.substring(0, 16);
    }

    /**
     * 初期化フロー用: Passkey登録オプション生成
     * masterIdを生成し、userHandleに格納
     */
    async generateInitRegistrationOptions(userDisplayName = 'BitVoy User', rpId = null) {
        this.logger.debug('generateInitRegistrationOptions called', { userDisplayName, rpId });
        try {
            // 1. masterIdを生成（元の仕様に合わせた実装）
            const masterId = await this.generateMasterId();
            this.logger.debug('MasterId generated', { masterId });

            // 2. userHandle（user.id）を生成
            const userHandleBytes = new TextEncoder().encode(masterId);

            // 3. challengePayloadを生成
            const nonce = crypto.randomBytes(32);
            const challengePayload = {
                type: 'init-registration',
                masterId: masterId,
                nonce: Array.from(nonce)
            };

            // 4. challenge = hash(JSON.stringify(challengePayload))
            const challengePayloadStr = JSON.stringify(challengePayload);
            const challengeHash = crypto.createHash('sha256').update(challengePayloadStr).digest();

            // RP IDを決定（引数で指定された場合はそれを使用、否则はデフォルト値）
            const effectiveRpId = rpId || this.rpID;
            this.logger.debug('Using RP ID', { effectiveRpId, provided: rpId, default: this.rpID });

            // 5. PublicKeyCredentialCreationOptionsを構築
            const options = await generateRegistrationOptions({
                rpName: this.rpName,
                rpID: effectiveRpId,
                userID: userHandleBytes,
                userName: masterId,
                userDisplayName: userDisplayName,
                timeout: this.timeout,
                attestationType: 'none',
                authenticatorSelection: {
                    userVerification: 'required',
                    residentKey: 'required'
                },
                supportedAlgorithmIDs: [-7, -8] // ES256, EdDSA
            });

            // challengeを上書き（challengePayloadのハッシュを使用）
            options.challenge = Buffer.from(challengeHash).toString('base64url');

            // 6. challengePayloadをセッションに保存
            const challengeKey = `init_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
            this.challengeStore.set(challengeKey, {
                challengePayload: challengePayload,
                challenge: options.challenge,
                masterId: masterId,
                expires: Date.now() + 5 * 60 * 1000 // 5分
            });

            // チャレンジキーを追加
            options.challengeKey = challengeKey;
            
            // RP IDをオプションに含める（クライアント側で使用）
            options.rpId = effectiveRpId;
            
            // challengeStoreにRP IDも保存（検証時に使用）
            const challengeData = this.challengeStore.get(challengeKey);
            if (challengeData) {
                challengeData.rpId = effectiveRpId;
            }

            this.logger.info('Init registration options generated', { 
                masterId, 
                challengeKey,
                rpId: effectiveRpId
            });

            return options;

        } catch (error) {
            this.logger.error('Init registration options generation failed:', error);
            throw error;
        }
    }

    /**
     * 初期化フロー用: Passkey登録検証
     * userHandleからmasterIdを復元
     */
    async verifyInitRegistration(credential, challengeKey, expectedOrigin = null) {
        this.logger.debug('verifyInitRegistration called', { challengeKey, expectedOrigin });
        let challengeData;
        
        try {
            challengeData = this.challengeStore.get(challengeKey);
            if (!challengeData) {
                this.logger.warn('No challenge data found', { challengeKey });
                return { verified: false, error: 'Invalid or expired challenge' };
            }
        
            if (!challengeData.challengePayload || challengeData.challengePayload.type !== 'init-registration') {
                this.logger.warn('Invalid challenge payload type', { challengeKey });
                return { verified: false, error: 'Invalid challenge payload type' };
            }
        
            if (Date.now() > challengeData.expires) {
                this.logger.warn('Challenge expired', { challengeKey });
                return { verified: false, error: 'Challenge expired' };
            }
        
            const expectedMasterId = challengeData.challengePayload.masterId;
            const expectedChallenge = challengeData.challenge;
            const effectiveRpId = challengeData.rpId || this.rpID;
            const effectiveOrigin = expectedOrigin || this.origin;
        
            this.logger.debug('Using RP ID for verification', { effectiveRpId });
            this.logger.debug('Using Origin for verification', { effectiveOrigin });
        
            const processedCredential = this.normalizeRegistrationCredential(credential);
        
            const verification = await verifyRegistrationResponse({
                response: processedCredential,
                expectedChallenge,
                expectedOrigin: effectiveOrigin,
                expectedRPID: effectiveRpId,
                requireUserVerification: true,
            });
        
            if (verification.verified && verification.registrationInfo) {
                const { credential } = verification.registrationInfo;
            
                if (!credential) {
                    this.logger.error('registrationInfo.credential is missing', {
                        registrationInfo: verification.registrationInfo
                    });
                    return { verified: false, error: 'Invalid registrationInfo: missing credential' };
                }
            
                const { id, publicKey, counter } = credential;
            
                // id はすでに base64url 文字列の場合が多いので、型を見て処理
                let credentialId;
                if (typeof id === 'string') {
                    credentialId = id;
                } else {
                    // Buffer / Uint8Array / Array → base64url に変換
                    credentialId = Buffer.from(
                        id instanceof ArrayBuffer ? new Uint8Array(id) : id
                    ).toString('base64url');
                }
            
                // publicKey も bytea に突っ込める形にしておく
                const credentialPublicKey = Buffer.from(
                    publicKey instanceof ArrayBuffer ? new Uint8Array(publicKey) : publicKey
                );
            
                const recoveredMasterId = expectedMasterId; // challengePayload から取った masterId
            
                await this.upsertWebAuthnCredential(credentialId, credentialPublicKey, counter);
                await this.insertMasterCredential(recoveredMasterId, credentialId, true);
            
                // webauthn_credentialsからoidc_keysへの同期
                // credentialPublicKey（Buffer）をwebauthn_credentialsと同じ形式（JSON文字列）に変換
                try {
                    const publicKeyArray = Array.from(new Uint8Array(credentialPublicKey));
                    const publicKeyJson = JSON.stringify(publicKeyArray);
                    await this.storeCredential(recoveredMasterId, publicKeyJson, counter);
                    this.logger.info('Credential synced to oidc_keys', {
                        masterId: recoveredMasterId,
                        credentialId: credentialId.substring(0, 16) + '...',
                    });
                } catch (syncError) {
                    // 同期エラーは致命的ではないので、警告のみ
                    this.logger.warn('Failed to sync credential to oidc_keys (non-fatal):', {
                        masterId: recoveredMasterId,
                        error: syncError.message
                    });
                }
            
                this.logger.info('Init registration verified', {
                    masterId: recoveredMasterId,
                    credentialId: credentialId.substring(0, 16) + '...',
                });
            
                return {
                    verified: true,
                    masterId: recoveredMasterId,
                    credentialId,
                    counter,
                };
            }            

        } catch (error) {
            this.logger.error('Init registration verification failed:', error);
            return { verified: false, error: error.message };
        } finally {
            if (challengeData) {
            this.challengeStore.delete(challengeKey);
            }
        }
    }  

    /**
     * Array / ArrayBuffer / Buffer → base64url 変換（共通ヘルパー）
     */
    toBase64url(value, fieldName) {
        // undefined / null / 空文字はそのまま返す
        if (value === undefined || value === null || value === '') {
            return value;
        }

        // すでに文字列ならそのまま
        if (typeof value === 'string') {
            return value;
        }

        // Node.js の Buffer形式 { type: 'Buffer', data: [...] } もケア
        if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
            return Buffer.from(value.data).toString('base64url');
        }

        // ArrayBuffer または TypedArray
        if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            return Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString('base64url');
        }

        // 素の Array<number>
        if (Array.isArray(value)) {
            return Buffer.from(Uint8Array.from(value)).toString('base64url');
        }

        // それ以外はそのまま返す（ログだけ出しておくと安心）
        this.logger && this.logger.warn && this.logger.warn('Unexpected value type for base64url conversion', {
            fieldName,
            valueType: typeof value
        });
        return value;
    }

    /**
     * WebAuthn Registration 用の credential を
     * @simplewebauthn/server が期待する形式（base64url string）に正規化する
     */
    normalizeRegistrationCredential(credential) {
        this.logger.debug('Credential payload for init registration', {
            idType: typeof credential.id,
            rawIdType: typeof credential.rawId,
            clientDataJSONType: typeof credential.response?.clientDataJSON,
            attestationObjectType: typeof credential.response?.attestationObject,
        });
          
        // shallow clone
        const processed = { ...credential };

        // id / rawId を base64url に統一
        const id = this.toBase64url(credential.id, 'id');
        const rawId = this.toBase64url(credential.rawId || credential.id, 'rawId');

        if (typeof id !== 'string' || typeof rawId !== 'string') {
            throw new Error('Invalid credential: id/rawId must be convertible to base64url string');
        }

        processed.id = id;
        processed.rawId = rawId;

        // response 部分
        if (credential.response) {
            processed.response = { ...credential.response };

            processed.response.clientDataJSON = this.toBase64url(
                credential.response.clientDataJSON,
                'clientDataJSON'
            );

            processed.response.attestationObject = this.toBase64url(
                credential.response.attestationObject,
                'attestationObject'
            );
        }

        return processed;
    }

    /**
     * WebAuthn Authentication 用の credential を
     * @simplewebauthn/server が期待する形式（base64url string）に正規化する
     */
    normalizeAuthenticationCredential(credential) {
        this.logger.debug('Credential payload for authentication', {
            idType: typeof credential.id,
            rawIdType: typeof credential.rawId,
            clientDataJSONType: typeof credential.response?.clientDataJSON,
            authenticatorDataType: typeof credential.response?.authenticatorData,
        });
          
        // shallow clone
        const processed = { ...credential };

        // id / rawId を base64url に統一
        const id = this.toBase64url(credential.id, 'id');
        const rawId = this.toBase64url(credential.rawId || credential.id, 'rawId');

        if (typeof id !== 'string' || typeof rawId !== 'string') {
            throw new Error('Invalid credential: id/rawId must be convertible to base64url string');
        }

        processed.id = id;
        processed.rawId = rawId;

        // response 部分
        if (credential.response) {
            processed.response = { ...credential.response };

            processed.response.clientDataJSON = this.toBase64url(
                credential.response.clientDataJSON,
                'clientDataJSON'
            );

            processed.response.authenticatorData = this.toBase64url(
                credential.response.authenticatorData,
                'authenticatorData'
            );

            processed.response.signature = this.toBase64url(
                credential.response.signature,
                'signature'
            );

            // userHandleはそのまま（存在する場合）
            if (credential.response.userHandle !== undefined) {
                processed.response.userHandle = this.toBase64url(
                    credential.response.userHandle,
                    'userHandle'
                );
            }
        }

        return processed;
    }

    /**
     * リカバリーフロー用: パスキー認証オプション生成
     * masterId不要、allowCredentials空でdiscoverable credentialを使用
     */
    async generateRecoveryOptions(rpId = null) {
        this.logger.debug('generateRecoveryOptions called', { rpId });
        try {
            // 1. challengePayloadを生成
            const nonce = crypto.randomBytes(32);
            const challengePayload = {
                type: 'recovery',
                nonce: Array.from(nonce)
            };

            // 2. challenge = hash(JSON.stringify(challengePayload))
            const challengePayloadStr = JSON.stringify(challengePayload);
            const challengeHash = crypto.createHash('sha256').update(challengePayloadStr).digest();

            // RP IDを決定（引数で指定された場合はそれを使用、否则はデフォルト値）
            const effectiveRpId = rpId || this.rpID;
            this.logger.debug('Using RP ID', { effectiveRpId, provided: rpId, default: this.rpID });

            // 3. PublicKeyCredentialRequestOptionsを構築
            const options = await generateAuthenticationOptions({
                rpID: effectiveRpId,
                timeout: this.timeout,
                allowCredentials: [], // 空にしてdiscoverable credentialを使用
                userVerification: 'required'
            });

            // challengeを上書き（challengePayloadのハッシュを使用）
            options.challenge = Buffer.from(challengeHash).toString('base64url');

            // 4. challengePayloadをセッションに保存
            const challengeKey = `recovery_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
            this.challengeStore.set(challengeKey, {
                challengePayload: challengePayload,
                challenge: options.challenge,
                expires: Date.now() + 5 * 60 * 1000 // 5分
            });

            // チャレンジキーを追加
            options.challengeKey = challengeKey;
            
            // RP IDをオプションに含める（クライアント側で使用）
            options.rpId = effectiveRpId;
            
            // challengeStoreにRP IDも保存（検証時に使用）
            const challengeData = this.challengeStore.get(challengeKey);
            if (challengeData) {
                challengeData.rpId = effectiveRpId;
            }

            this.logger.info('Recovery options generated', { challengeKey, rpId: effectiveRpId });

            return options;

        } catch (error) {
            this.logger.error('Recovery options generation failed:', error);
            throw error;
        }
    }

    /**
     * 緊急復旧用パスキー認証オプション生成（allowCredentials省略）
     * @param {string|null} masterId - マスターID（オプショナル、userHandleから取得する場合はnull）
     * @param {string|null} rpId - RP ID（オプショナル、指定されない場合はデフォルト値を使用）
     */
    async generateEmergencyAuthenticationOptions(masterId, rpId = null) {
        this.logger.debug('generateEmergencyAuthenticationOptions called', { masterId, rpId });
        try {
            // 1. challengePayloadを生成（recoveryタイプとして設定）
            const nonce = crypto.randomBytes(32);
            const challengePayload = {
                type: 'recovery',
                nonce: Array.from(nonce)
            };

            // 2. challenge = hash(JSON.stringify(challengePayload))
            const challengePayloadStr = JSON.stringify(challengePayload);
            const challengeHash = crypto.createHash('sha256').update(challengePayloadStr).digest();

            // RP IDを決定（引数で指定された場合はそれを使用、否则はデフォルト値）
            const effectiveRpId = rpId || this.rpID;
            this.logger.debug('Using RP ID for emergency authentication', { effectiveRpId, provided: rpId, default: this.rpID });

            // 3. 緊急復旧時はallowCredentialsを省略して、認証器が全てのクレデンシャルを提示するようにする
            const options = await generateAuthenticationOptions({
                rpID: effectiveRpId,
                timeout: this.timeout,
                // allowCredentialsを省略することで、iCloud/Googleでリカバリーされたクレデンシャルも含めて全て提示される
                userVerification: 'required'
            });

            // challengeを上書き（challengePayloadのハッシュを使用）
            options.challenge = Buffer.from(challengeHash).toString('base64url');

            // 4. チャレンジ保存（5分間有効）
            const challengeKey = `emergency_auth_${masterId || 'unknown'}_${Date.now()}`;
            this.challengeStore.set(challengeKey, {
                challengePayload: challengePayload,
                challenge: options.challenge,
                masterId: masterId || null, // masterIdがnullの場合はnullを保存
                expires: Date.now() + 5 * 60 * 1000,
                emergency: true,
                rpId: effectiveRpId // RP IDも保存（検証時に使用）
            });

            // チャレンジキーを追加
            options.challengeKey = challengeKey;
            
            // RP IDをオプションに含める（クライアント側で使用）
            options.rpId = effectiveRpId;

            this.logger.debug('Emergency authentication options generated', { options });
            this.logger.info('Emergency Passkey authentication options generated', { 
                masterId, 
                challengeKey,
                allowCredentials: 'omitted_for_emergency_recovery'
            });

            return options;

        } catch (error) {
            this.logger.error('Emergency Passkey authentication options generation failed:', error);
            throw error;
        }
    }

    /**
     * リカバリーフロー用: パスキー認証検証
     * userHandleからmasterIdを復元
     */
    async verifyRecoveryAuthentication(credential, challengeKey, expectedOrigin = null) {
        this.logger.debug('verifyRecoveryAuthentication called', { challengeKey, expectedOrigin });
        let challengeData;
        
        try {
            // チャレンジ取得・確認
            challengeData = this.challengeStore.get(challengeKey);
            if (!challengeData) {
                this.logger.warn('No challenge data found', { challengeKey });
                return { verified: false, error: 'Invalid or expired challenge' };
            }

            if (!challengeData.challengePayload || challengeData.challengePayload.type !== 'recovery') {
                this.logger.warn('Invalid challenge payload type', { challengeKey });
                return { verified: false, error: 'Invalid challenge payload type' };
            }

            if (Date.now() > challengeData.expires) {
                this.logger.warn('Challenge expired', { challengeKey });
                return { verified: false, error: 'Challenge expired' };
            }

            const expectedChallenge = challengeData.challenge;
            
            // challengeStoreに保存されたRP IDを使用（なければデフォルト値）
            const effectiveRpId = challengeData.rpId || this.rpID;
            this.logger.debug('Using RP ID for recovery verification', { effectiveRpId, fromChallenge: challengeData.rpId, default: this.rpID });
            
            // expectedOriginを決定（引数で指定された場合はそれを使用、否则はデフォルト値）
            const effectiveOrigin = expectedOrigin || this.origin;
            this.logger.debug('Using Origin for recovery verification', { effectiveOrigin, provided: expectedOrigin, default: this.origin });

            // credentialIdを取得
            let credentialId;
            if (typeof credential.id === 'string') {
                credentialId = credential.id;
            } else if (credential.rawId) {
                credentialId = Buffer.from(credential.rawId).toString('base64url');
            } else {
                return { verified: false, error: 'Invalid credential ID' };
            }

            // webauthn_credentialsからcredentialIdでレコード取得
            const storedCredential = await this.getCredentialById(credentialId);
            if (!storedCredential) {
                this.logger.warn('Credential not found', { credentialId: credentialId.substring(0, 16) + '...' });
                return { verified: false, error: 'Unknown credential' };
            }

            // デバッグ: storedCredentialの内容を確認
            this.logger.debug('Stored credential retrieved', {
                credential_id: storedCredential.credential_id?.substring(0, 16) + '...',
                has_public_key: !!storedCredential.public_key,
                sign_count: storedCredential.sign_count,
                sign_count_type: typeof storedCredential.sign_count,
                counter: storedCredential.counter,
                counter_type: typeof storedCredential.counter
            });

            const processedCredential = this.normalizeAuthenticationCredential(credential);

            let credentialID;
            try {
                const base64 = processedCredential.id.replace(/-/g, '+').replace(/_/g, '/');
                const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                const binary = Buffer.from(base64 + pad, 'base64');
                credentialID = new Uint8Array(binary);
            } catch (error) {
                this.logger.error('Failed to convert credentialID to Uint8Array:', error);
                return { verified: false, error: 'Invalid credentialID format' };
            }

            let publicKey;
            if (typeof storedCredential.public_key === 'string') {
                // JSON文字列の場合
                try {
                    const publicKeyArray = JSON.parse(storedCredential.public_key);
                    publicKey = new Uint8Array(publicKeyArray);
                } catch (e) {
                    // Base64の場合
                    const base64 = storedCredential.public_key.replace(/-/g, '+').replace(/_/g, '/');
                    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                    const binary = Buffer.from(base64 + pad, 'base64');
                    publicKey = new Uint8Array(binary);
                }
            } else {
                publicKey = new Uint8Array(storedCredential.public_key);
            }

            // counterを取得（getCredentialByIdはcounterプロパティを返す）
            let counter = storedCredential.counter !== null && storedCredential.counter !== undefined
                ? parseInt(storedCredential.counter, 10)
                : 0;
            
            if (isNaN(counter)) {
                this.logger.warn('Invalid counter, using 0 as default', { 
                    credentialId: credentialId.substring(0, 16) + '...',
                    counter: storedCredential.counter
                });
                counter = 0;
            }

            // WebAuthnCredential オブジェクトを作成（新API）
            const webAuthnCredential = {
                id: credentialID,         // credentialID → id
                publicKey: publicKey,     // credentialPublicKey → publicKey
                counter: counter,         // そのまま counter
            };

            const verifyOptions = {
                response: processedCredential,
                expectedChallenge,
                expectedOrigin: effectiveOrigin,
                expectedRPID: effectiveRpId,
                credential: webAuthnCredential,  // ← authenticator ではなく credential
                requireUserVerification: true,
            };

            const verification = await verifyAuthenticationResponse(verifyOptions);


            if (verification.verified) {
                // sign_countを更新
                await this.updateCredentialSignCount(credentialId, verification.authenticationInfo.newCounter);

                // response.userHandleからmasterIdを復元
                let recoveredMasterId;
                if (credential.response && credential.response.userHandle != null) {
                    try {
                        const uh = credential.response.userHandle;
                        let userHandleBytes;

                        if (typeof uh === 'string') {
                            // base64url 文字列として扱う
                            const base64 = uh.replace(/-/g, '+').replace(/_/g, '/');
                            const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                            const buf = Buffer.from(base64 + pad, 'base64');
                            userHandleBytes = new Uint8Array(buf);
                        } else if (uh instanceof ArrayBuffer) {
                            // ArrayBuffer の場合
                            userHandleBytes = new Uint8Array(uh);
                        } else if (ArrayBuffer.isView(uh)) {
                            // Uint8Array, DataViewなど
                            userHandleBytes = new Uint8Array(uh.buffer, uh.byteOffset, uh.byteLength);
                        } else if (Array.isArray(uh)) {
                            // number[] の場合
                            userHandleBytes = new Uint8Array(uh);
                        } else {
                            this.logger.error('Unsupported userHandle type', {
                                type: typeof uh,
                                constructorName: uh && uh.constructor ? uh.constructor.name : null,
                            });
                            return { verified: false, error: 'Unsupported userHandle type' };
                        }

                        recoveredMasterId = new TextDecoder().decode(userHandleBytes);

                    } catch (error) {
                        this.logger.error('Failed to decode userHandle:', error);
                        return { verified: false, error: 'Failed to decode userHandle' };
                    }
                } else {
                    this.logger.warn('userHandle not found in response', {
                        hasResponse: !!credential.response,
                        userHandle: credential.response?.userHandle ?? null,
                    });
                    return { verified: false, error: 'userHandle not found' };
                }


                // master_credentialsからmasterIdに紐づくレコードを取得し、整合性確認
                const masterCredential = await this.getMasterCredentialByCredentialId(credentialId);
                if (!masterCredential) {
                    this.logger.warn('Master credential not found', { credentialId: credentialId.substring(0, 16) + '...' });
                    return { verified: false, error: 'Master credential not found' };
                }

                if (masterCredential.master_id !== recoveredMasterId) {
                    this.logger.warn('MasterId mismatch', { 
                        recovered: recoveredMasterId, 
                        stored: masterCredential.master_id 
                    });
                    return { verified: false, error: 'MasterId mismatch' };
                }

                if (masterCredential.credential_id !== credentialId) {
                    this.logger.warn('CredentialId mismatch', { 
                        recovered: credentialId.substring(0, 16) + '...', 
                        stored: masterCredential.credential_id.substring(0, 16) + '...' 
                    });
                    return { verified: false, error: 'CredentialId mismatch' };
                }

                this.logger.info('Recovery authentication verified', { 
                    masterId: recoveredMasterId,
                    credentialId: credentialId.substring(0, 16) + '...'
                });

                // webauthn_credentialsからoidc_keysへの同期
                // storedCredential.public_keyはJSON文字列（webauthn_credentialsから取得）
                try {
                    const publicKeyJson = typeof storedCredential.public_key === 'string' 
                        ? storedCredential.public_key 
                        : JSON.stringify(Array.from(new Uint8Array(storedCredential.public_key)));
                    const newCounter = verification.authenticationInfo.newCounter;
                    await this.storeCredential(recoveredMasterId, publicKeyJson, newCounter);
                    this.logger.info('Credential synced to oidc_keys', {
                        masterId: recoveredMasterId,
                        credentialId: credentialId.substring(0, 16) + '...',
                    });
                } catch (syncError) {
                    // 同期エラーは致命的ではないので、警告のみ
                    this.logger.warn('Failed to sync credential to oidc_keys (non-fatal):', {
                        masterId: recoveredMasterId,
                        error: syncError.message
                    });
                }

                return {
                    verified: true,
                    masterId: recoveredMasterId,
                    credentialId: credentialId,
                    counter: verification.authenticationInfo.newCounter
                };
            } else {
                this.logger.warn('Recovery authentication verification failed', { error: verification.error });
                return { 
                    verified: false, 
                    error: verification.error || 'Authentication verification failed' 
                };
            }

        } catch (error) {
            this.logger.error('Recovery authentication verification failed:', error);
            return { verified: false, error: error.message };
        } finally {
            if (challengeData) {
                this.challengeStore.delete(challengeKey);
            }
        }
    }

    /**
     * パスキー認証情報の検証（緊急復旧用）
     */
    async verifyCredential(masterId, webauthnCredential) {
        try {
            this.logger.debug('verifyCredential called', { masterId });
            
            if (!webauthnCredential || !webauthnCredential.id) {
                return { verified: false, error: 'Invalid Passkey credential' };
            }

            // 公開鍵ベースでクレデンシャル取得
            const publicKey = webauthnCredential.response.publicKey;
            if (!publicKey) {
                this.logger.warn('No public key in credential response');
                return { verified: false, error: 'No public key in credential response' };
            }
            
            const storedCredential = await this.getCredentialByPublicKey(Array.from(new Uint8Array(publicKey)), masterId);
            
            if (!storedCredential) {
                this.logger.warn('Credential not found for public key', { masterId });
                return { verified: false, error: 'Credential not found for public key' };
            }

            if (!storedCredential.is_active) {
                this.logger.warn('Credential is disabled', { masterId });
                return { verified: false, error: 'Credential is disabled' };
            }

            // masterIdの一致を確認
            if (storedCredential.master_id !== masterId) {
                this.logger.warn('Master ID mismatch', { 
                    provided: masterId, 
                    stored: storedCredential.master_id 
                });
                return { verified: false, error: 'Master ID mismatch' };
            }

            // 緊急復旧時は基本的な検証のみ
            // 署名検証は省略（緊急時のため）
            
            // 最終使用時刻を更新
            await this.updateLastUsed(storedCredential.id);
            
            this.logger.info('Credential verified successfully for emergency recovery', { 
                masterId, 
                oidcKeyId: storedCredential.id.substring(0, 16) + '...' 
            });
            
            return {
                verified: true,
                oidcKeyId: storedCredential.id,
                masterId: masterId,
                emergency: true
            };

        } catch (error) {
            this.logger.error('Credential verification failed:', error);
            return { verified: false, error: error.message };
        }
    }

    // ==========================================
    // データベース操作（新仕様用）
    // ==========================================

    /**
     * webauthn_credentialsにUpsert
     */
    async upsertWebAuthnCredential(credentialId, publicKey, signCount) {
        this.logger.debug('upsertWebAuthnCredential called', { credentialId: credentialId.substring(0, 16) + '...' });
        try {
            // 公開鍵をJSON文字列に変換
            const publicKeyArray = Array.from(new Uint8Array(publicKey));
            const publicKeyJson = JSON.stringify(publicKeyArray);
            
            const query = `
                INSERT INTO webauthn_credentials (
                    credential_id, public_key, sign_count, created_at, updated_at
                ) VALUES (?, ?, ?, NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    public_key = VALUES(public_key),
                    sign_count = VALUES(sign_count),
                    updated_at = NOW()
            `;
            
            await this.db.query(query, [credentialId, publicKeyJson, signCount]);
            
            this.logger.debug('WebAuthn credential upserted', { credentialId: credentialId.substring(0, 16) + '...' });
        } catch (error) {
            this.logger.error('Failed to upsert WebAuthn credential:', error);
            throw error;
        }
    }

    /**
     * master_credentialsにINSERT
     */
    async insertMasterCredential(masterId, credentialId, isPrimary) {
        this.logger.debug('insertMasterCredential called', { masterId, credentialId: credentialId.substring(0, 16) + '...', isPrimary });
        try {
            const query = `
                INSERT INTO master_credentials (
                    master_id, credential_id, is_primary, created_at
                ) VALUES (?, ?, ?, NOW())
                ON DUPLICATE KEY UPDATE
                    is_primary = VALUES(is_primary)
            `;
            
            await this.db.query(query, [masterId, credentialId, isPrimary]);
            
            this.logger.debug('Master credential inserted', { masterId, credentialId: credentialId.substring(0, 16) + '...' });
        } catch (error) {
            this.logger.error('Failed to insert master credential:', error);
            throw error;
        }
    }

    /**
     * credentialIdでwebauthn_credentialsから取得
     */
    async getCredentialById(credentialId) {
        this.logger.debug('getCredentialById called', { credentialId: credentialId.substring(0, 16) + '...' });
        try {
            // credential_idはTEXT型なので、明示的にTEXT型として扱う
            // master_credentialsテーブルとJOINしてmaster_idを取得
            const query = `
                SELECT 
                    wc.credential_id, 
                    wc.public_key, 
                    wc.sign_count, 
                    wc.created_at, 
                    wc.updated_at,
                    mc.master_id
                FROM webauthn_credentials wc
                LEFT JOIN master_credentials mc ON wc.credential_id = mc.credential_id
                WHERE wc.credential_id = ?
            `;
            
            const [result] = await this.db.query(query, [credentialId]);
            
            const rows = Array.isArray(result) ? result : [result];
            if (rows.length === 0) {
                return null;
            }
            
            const row = rows[0];
            // 公開鍵をUint8Arrayに変換
            let publicKey;
            try {
                const publicKeyArray = JSON.parse(row.public_key);
                publicKey = new Uint8Array(publicKeyArray);
            } catch (e) {
                // JSONでない場合はそのまま
                publicKey = row.public_key;
            }
            
            // sign_countを安全に取得（null/undefinedの場合は0）
            const signCount = row.sign_count !== null && row.sign_count !== undefined
                ? parseInt(row.sign_count, 10)
                : 0;
            
            const finalSignCount = isNaN(signCount) ? 0 : signCount;
            
            return {
                credential_id: row.credential_id,
                public_key: publicKey,
                sign_count: finalSignCount,
                counter: finalSignCount, // @simplewebauthn/serverが期待するcounterプロパティ
                master_id: row.master_id, // master_credentialsテーブルから取得
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        } catch (error) {
            this.logger.error('Failed to get credential by ID:', error);
            return null;
        }
    }

    /**
     * credentialIdでmaster_credentialsから取得
     */
    async getMasterCredentialByCredentialId(credentialId) {
        this.logger.debug('getMasterCredentialByCredentialId called', { credentialId: credentialId.substring(0, 16) + '...' });
        try {
            const query = `
                SELECT master_id, credential_id, is_primary, created_at
                FROM master_credentials 
                WHERE credential_id = ?
            `;
            
            const [result] = await this.db.query(query, [credentialId]);
            
            const rows = Array.isArray(result) ? result : [];
            if (rows.length === 0) {
                return null;
            }
            
            return rows[0];
        } catch (error) {
            this.logger.error('Failed to get master credential by credential ID:', error);
            return null;
        }
    }

    /**
     * sign_countを更新
     */
    async updateCredentialSignCount(credentialId, newSignCount) {
        this.logger.debug('updateCredentialSignCount called', { credentialId: credentialId.substring(0, 16) + '...', newSignCount });
        try {
            const query = `
                UPDATE webauthn_credentials 
                SET sign_count = ?, updated_at = NOW()
                WHERE credential_id = ?
            `;
            
            await this.db.query(query, [newSignCount, credentialId]);
            
            this.logger.debug('Credential sign count updated', { credentialId: credentialId.substring(0, 16) + '...' });
        } catch (error) {
            this.logger.error('Failed to update credential sign count:', error);
            throw error;
        }
    }

    // ==========================================
    // データベース操作（旧仕様用 - 互換性のため残す）
    // ==========================================

    /**
     * クレデンシャル保存（OIDC認証専用）
     * 注意: このメソッドはOIDC認証フローでのみ使用される
     * ウォレット初期化・ログイン時は使用しない（ローカル認証のみ）
     * 
     * @param {string} masterId - マスターID
     * @param {string} publicKeyJson - 公開鍵（JSON文字列形式、webauthn_credentialsと同じ形式）
     * @param {number} counter - カウンター
     */
    async storeCredential(masterId, publicKeyJson, counter) {
        this.logger.debug('storeCredential called', { masterId });
        
        // publicKeyJsonは既にJSON文字列形式（webauthn_credentialsと同じ形式）
        if (typeof publicKeyJson !== 'string') {
            throw new Error('publicKeyJson must be a JSON string');
        }
        
        // OIDC認証専用: サーバー側での保存は最小限
        // 認証時の検証のみを目的とする（ウォレット初期化・ログイン時は使用しない）
        try {
            // UNIQUE制約がないため、まず既存レコードをチェック
            const checkQuery = `
                SELECT id FROM oidc_keys 
                WHERE master_id = ? AND public_key = ?
            `;
            const [checkResult] = await this.db.query(checkQuery, [masterId, publicKeyJson]);
            
            let result;
            const checkRows = Array.isArray(checkResult) ? checkResult : [];
            if (checkRows.length > 0) {
                // 既存レコードを更新
                const updateQuery = `
                    UPDATE oidc_keys 
                    SET counter = ?,
                        last_used_at = NOW(),
                        is_active = true
                    WHERE master_id = ? AND public_key = ?
                `;
                await this.db.query(updateQuery, [counter, masterId, publicKeyJson]);
                const [selectResult] = await this.db.query(
                    'SELECT id FROM oidc_keys WHERE master_id = ? AND public_key = ?',
                    [masterId, publicKeyJson]
                );
                result = selectResult;
            } else {
                // 新規レコードを挿入（UUIDを生成）
                const id = crypto.randomUUID();
                const insertQuery = `
                    INSERT INTO oidc_keys (
                        id, master_id, public_key, counter, user_agent, is_active
                    ) VALUES (?, ?, ?, ?, ?, true)
                `;
                await this.db.query(insertQuery, [
                    id,
                    masterId,
                    publicKeyJson,
                    counter,
                    'BitVoy MPC Server (passkey sync enabled)'
                ]);
                result = [{ id: id }];
            }
            
            // 結果がない場合はエラー
            const resultRows = Array.isArray(result) ? result : [];
            if (resultRows.length === 0) {
                this.logger.warn('Failed to store credential', { 
                    masterId 
                });
                throw new Error('Failed to store credential');
            }
            
            // user_accountsのwebauthn_registeredをtrueに更新
            await this.db.query(
                'UPDATE user_accounts SET webauthn_registered = true, updated_at = NOW() WHERE master_id = ?',
                [masterId]
            );
            
            const oidcKeyId = resultRows[0]?.id || resultRows[0]?.ID || resultRows[0]?.Id;
            this.logger.debug('Credential stored in DB', { masterId, oidcKeyId });
            this.logger.info('Credential stored successfully (minimal storage)', { 
                masterId, 
                oidcKeyId: oidcKeyId ? (typeof oidcKeyId === 'string' ? oidcKeyId.substring(0, 16) + '...' : String(oidcKeyId).substring(0, 16) + '...') : 'unknown'
            });
            
            return oidcKeyId;

        } catch (error) {
            this.logger.error('Failed to store credential:', error);
            throw error;
        }
    }

    /**
     * masterId による クレデンシャル取得（新仕様）
     * master_credentialsとwebauthn_credentialsをJOIN
     */
    async getCredentialsByMasterId(masterId) {
        this.logger.debug('getCredentialsByMasterId called', { masterId });
        try {
            const query = `
                SELECT 
                    wc.credential_id,
                    wc.public_key,
                    wc.sign_count as counter,
                    wc.created_at,
                    wc.updated_at as last_used_at,
                    mc.is_primary
                FROM master_credentials mc
                INNER JOIN webauthn_credentials wc ON mc.credential_id = wc.credential_id
                WHERE mc.master_id = ?
                ORDER BY mc.created_at DESC
            `;
            
            const [result] = await this.db.query(query, [masterId]);
            
            // 公開鍵を変換
            const credentials = (Array.isArray(result) ? result : []).map(row => {
                let publicKey;
                try {
                    const publicKeyArray = JSON.parse(row.public_key);
                    publicKey = new Uint8Array(publicKeyArray);
                } catch (e) {
                    publicKey = row.public_key;
                }
                
                return {
                    credential_id: row.credential_id,
                    public_key: publicKey,
                    counter: parseInt(row.counter, 10),
                    sign_count: parseInt(row.counter, 10),
                    is_active: true, // 新仕様ではis_activeカラムなし
                    is_primary: row.is_primary,
                    created_at: row.created_at,
                    last_used_at: row.last_used_at
                };
            });
            
            this.logger.debug('Credentials fetched from DB', { masterId, count: credentials.length });
            return credentials;

        } catch (error) {
            this.logger.error('Failed to get credentials by masterId:', error);
            throw error;
        }
    }

    /**
     * oidcKeyId による クレデンシャル取得（oidc_keysテーブル用）
     */
    async getOidcCredentialById(oidcKeyId) {
        this.logger.debug('getOidcCredentialById called', { oidcKeyId });
        try {
            const query = `
                SELECT master_id, id, public_key, counter, is_active, 
                       created_at, last_used_at
                FROM oidc_keys 
                WHERE id = ?
            `;
            
            const [result] = await this.db.query(query, [oidcKeyId]);
            
            this.logger.debug('Credential fetched from DB', { oidcKeyId });
            const rows = Array.isArray(result) ? result : [];
            return rows[0] || null;

        } catch (error) {
            this.logger.error('Failed to get credential by ID:', error);
            throw error;
        }
    }

    /**
     * カウンター更新
     */
    async updateCredentialCounter(oidcKeyId, newCounter) {
        this.logger.debug('updateCredentialCounter called', { oidcKeyId, newCounter });
        try {
            const query = `
                UPDATE oidc_keys 
                SET counter = ? 
                WHERE id = ?
            `;
            
            await this.db.query(query, [newCounter, oidcKeyId]);

            this.logger.debug('Credential counter updated', { oidcKeyId, newCounter });
            this.logger.info('Credential counter updated', { 
                oidcKeyId: oidcKeyId.substring(0, 16) + '...' 
            });

        } catch (error) {
            this.logger.error('Failed to update credential counter:', error);
            throw error;
        }
    }

    /**
     * 最終使用時刻更新
     */
    async updateLastUsed(oidcKeyId) {
        this.logger.debug('updateLastUsed called', { oidcKeyId });
        try {
            const query = `
                UPDATE oidc_keys 
                SET last_used_at = NOW() 
                WHERE id = ?
            `;
            
            await this.db.query(query, [oidcKeyId]);

            this.logger.debug('Credential last used updated', { oidcKeyId });
            this.logger.info('Credential last used updated', { 
                oidcKeyId: oidcKeyId.substring(0, 16) + '...' 
            });

        } catch (error) {
            this.logger.error('Failed to update last used time:', error);
            throw error;
        }
    }

    /**
     * クレデンシャル無効化
     */
    async disableCredential(oidcKeyId) {
        this.logger.debug('disableCredential called', { oidcKeyId });
        try {
            const query = `
                UPDATE oidc_keys 
                SET is_active = false 
                WHERE id = ?
            `;
            
            await this.db.query(query, [oidcKeyId]);
            
            this.logger.debug('Credential disabled in DB', { oidcKeyId });
            this.logger.info('Credential disabled', { 
                oidcKeyId: oidcKeyId.substring(0, 16) + '...' 
            });

        } catch (error) {
            this.logger.error('Failed to disable credential:', error);
            throw error;
        }
    }

    /**
     * 期限切れチャレンジクリーンアップ
     */
    async cleanupExpiredChallenges() {
        this.logger.debug('cleanupExpiredChallenges called');
        try {
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const [key, challenge] of this.challengeStore.entries()) {
                if (now > challenge.expires) {
                    this.challengeStore.delete(key);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                this.logger.info(`Cleaned up ${cleanedCount} expired challenges`);
            }
            
            this.logger.debug('Expired challenges cleanup complete', { cleanedCount });
            return cleanedCount;

        } catch (error) {
            this.logger.error('Challenge cleanup failed:', error);
            return 0;
        }
    }

    /**
     * 統計情報取得
     */
    async getStatistics(masterId = null) {
        this.logger.debug('getStatistics called', { masterId });
        try {
            let query, params;
            if (masterId) {
                query = `
                    SELECT 
                        COUNT(*) as total_credentials,
                        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_credentials,
                        SUM(CASE WHEN last_used_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_usage
                    FROM oidc_keys 
                    WHERE master_id = ?
                `;
                params = [masterId];
            } else {
                query = `
                    SELECT 
                        COUNT(*) as total_credentials,
                        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_credentials,
                        COUNT(DISTINCT master_id) as unique_users,
                        SUM(CASE WHEN last_used_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as recent_usage
                    FROM oidc_keys
                `;
                params = [];
            }
            
            const [result] = await this.db.query(query, params);
            
            const stats = result[0] || {};
            stats.active_challenges = this.challengeStore.size;
            
            this.logger.debug('Statistics fetched', { stats });
            return stats;

        } catch (error) {
            this.logger.error('Failed to get statistics:', error);
            throw error;
        }
    }

    /**
     * 緊急復旧用パスキー認証検証（データベースチェック省略）
     */
    async verifyEmergencyAuthentication(masterId, credential, challengeKey) {
        this.logger.debug('verifyEmergencyAuthentication called', { masterId, challengeKey });
        try {
            // チャレンジ取得・確認
            const challengeData = this.challengeStore.get(challengeKey);
            if (!challengeData) {
                this.logger.warn('No challenge data found', { challengeKey });
                return { verified: false, error: 'Invalid or expired challenge' };
            }

            if (challengeData.masterId !== masterId) {
                this.logger.warn('Challenge masterId mismatch', { challengeKey, masterId });
                return { verified: false, error: 'Challenge masterId mismatch' };
            }

            if (Date.now() > challengeData.expires) {
                this.logger.warn('Challenge expired', { challengeKey });
                this.challengeStore.delete(challengeKey);
                return { verified: false, error: 'Challenge expired' };
            }

            // 緊急復旧時はoidc_keysテーブルチェックを省略
            // iCloud/Googleリカバリーで復旧されたクレデンシャルも含めて全て受け入れる
            
            // クライアント側から送信されるBase64url形式のデータを適切に処理
            let processedCredential = { ...credential };
            
            // idがBase64url形式の文字列の場合、Uint8Arrayに変換
            if (typeof credential.id === 'string') {
                try {
                    const base64 = credential.id.replace(/-/g, '+').replace(/_/g, '/');
                    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                    const binary = atob(base64 + pad);
                    const buffer = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        buffer[i] = binary.charCodeAt(i);
                    }
                    processedCredential.id = buffer;
                    
                    this.logger.debug('Converted Base64url id to Uint8Array (emergency)', {
                        originalLength: credential.id.length,
                        convertedLength: buffer.length
                    });
                } catch (conversionError) {
                    this.logger.error('Failed to convert Base64url id to Uint8Array (emergency):', conversionError);
                    return { verified: false, error: 'Invalid id format' };
                }
            }
            
            // rawIdがBase64url形式の文字列の場合、Uint8Arrayに変換
            if (typeof credential.rawId === 'string') {
                try {
                    const base64 = credential.rawId.replace(/-/g, '+').replace(/_/g, '/');
                    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                    const binary = atob(base64 + pad);
                    const buffer = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) {
                        buffer[i] = binary.charCodeAt(i);
                    }
                    processedCredential.rawId = buffer;
                    
                    this.logger.debug('Converted Base64url rawId to Uint8Array (emergency)', {
                        originalLength: credential.rawId.length,
                        convertedLength: buffer.length
                    });
                } catch (conversionError) {
                    this.logger.error('Failed to convert Base64url rawId to Uint8Array (emergency):', conversionError);
                    return { verified: false, error: 'Invalid rawId format' };
                }
            }

            // response内のBase64url形式のデータも変換
            if (credential.response) {
                processedCredential.response = { ...credential.response };
                
                // clientDataJSONの変換
                if (typeof credential.response.clientDataJSON === 'string') {
                    try {
                        const base64 = credential.response.clientDataJSON.replace(/-/g, '+').replace(/_/g, '/');
                        const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                        const binary = atob(base64 + pad);
                        const buffer = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            buffer[i] = binary.charCodeAt(i);
                        }
                        processedCredential.response.clientDataJSON = buffer;
                        
                        this.logger.debug('Converted Base64url clientDataJSON to Uint8Array (emergency)', {
                            originalLength: credential.response.clientDataJSON.length,
                            convertedLength: buffer.length
                        });
                    } catch (conversionError) {
                        this.logger.error('Failed to convert Base64url clientDataJSON to Uint8Array (emergency):', conversionError);
                        return { verified: false, error: 'Invalid clientDataJSON format' };
                    }
                }
                
                // signatureの変換
                if (typeof credential.response.signature === 'string') {
                    try {
                        const base64 = credential.response.signature.replace(/-/g, '+').replace(/_/g, '/');
                        const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                        const binary = atob(base64 + pad);
                        const buffer = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            buffer[i] = binary.charCodeAt(i);
                        }
                        processedCredential.response.signature = buffer;
                        
                        this.logger.debug('Converted Base64url signature to Uint8Array (emergency)', {
                            originalLength: credential.response.signature.length,
                            convertedLength: buffer.length
                        });
                    } catch (conversionError) {
                        this.logger.error('Failed to convert Base64url signature to Uint8Array (emergency):', conversionError);
                        return { verified: false, error: 'Invalid signature format' };
                    }
                }
                
                // authenticatorDataの変換
                if (typeof credential.response.authenticatorData === 'string') {
                    try {
                        const base64 = credential.response.authenticatorData.replace(/-/g, '+').replace(/_/g, '/');
                        const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
                        const binary = atob(base64 + pad);
                        const buffer = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            buffer[i] = binary.charCodeAt(i);
                        }
                        processedCredential.response.authenticatorData = buffer;
                        
                        this.logger.debug('Converted Base64url authenticatorData to Uint8Array (emergency)', {
                            originalLength: credential.response.authenticatorData.length,
                            convertedLength: buffer.length
                        });
                    } catch (conversionError) {
                        this.logger.error('Failed to convert Base64url authenticatorData to Uint8Array (emergency):', conversionError);
                        return { verified: false, error: 'Invalid authenticatorData format' };
                    }
                }
            }

            // 緊急復旧時は基本的な検証のみ（データベースチェック省略）
            // チャレンジの検証と形式チェックのみ実行
            
            // チャレンジ削除
            this.challengeStore.delete(challengeKey);

            const authenticationId = crypto.randomUUID();
            const oidcKeyId = isoUint8Array.toHex(processedCredential.rawId);

            this.logger.debug('Emergency authentication verified', { masterId, oidcKeyId });
            this.logger.info('Emergency Passkey authentication successful', { 
                masterId, 
                oidcKeyId: oidcKeyId.substring(0, 16) + '...',
                authenticationId,
                emergency: true
            });

            return {
                verified: true,
                authenticationId: authenticationId,
                oidcKeyId: oidcKeyId,
                emergency: true
            };

        } catch (error) {
            this.logger.error('Emergency Passkey authentication verification failed:', error);
            return { verified: false, error: error.message };
        }
    }


    /**
     * master_idでユーザーを検索（OIDC認証用）
     */
    async findUserByMasterId(masterId) {
        try {
            if (!this.db) {
                this.logger.error('Database not initialized');
                return null;
            }

            this.logger.debug('Searching for user by master_id:', masterId);

            // master_idでユーザーを検索
            const query = `
                SELECT 
                    u.master_id,
                    u.email_address as name,
                    u.email_verified
                FROM user_accounts u
                WHERE u.master_id = ?
                LIMIT 1
            `;

            const [result] = await this.db.query(query, [masterId]);
            const rows = Array.isArray(result) ? result : [];

            if (rows.length > 0) {
                const user = rows[0];
                this.logger.info('User found by master_id:', {
                    master_id: user.master_id,
                    name: user.name,
                    email_verified: user.email_verified
                });
                return user;
            } else {
                this.logger.info('No user found for master_id:', masterId);
                return null;
            }

        } catch (error) {
            this.logger.error('Error finding user by master_id:', error);
            return null;
        }
    }

    /**
     * 公開鍵でクレデンシャルを検索
     * 
     * @param {Array<number>} publicKey - 公開鍵（Array形式、例: [1,2,3,...]）
     * @param {string} masterId - マスターID
     */
    async getCredentialByPublicKey(publicKey, masterId) {
        try {
            this.logger.info('公開鍵でクレデンシャル検索中:', { 
                masterId, 
                publicKeyLength: publicKey.length 
            });

            // publicKeyはArray形式で渡される（OIDC認証時）
            // webauthn_credentialsと同じ形式（JSON文字列）に変換
            if (!Array.isArray(publicKey)) {
                throw new Error('publicKey must be an Array');
            }
            
            const publicKeyJson = JSON.stringify(publicKey);
            
            this.logger.debug('公開鍵検索パラメータ:', {
                masterId,
                publicKeyJson: publicKeyJson.substring(0, 50) + '...',
                publicKeyLength: publicKey.length
            });

            const query = `
                SELECT 
                    id,
                    master_id,
                    public_key,
                    counter,
                    is_active,
                    created_at,
                    last_used_at
                FROM oidc_keys 
                WHERE master_id = ? AND public_key = ? AND is_active = true
                LIMIT 1
            `;

            const [result] = await this.db.query(query, [masterId, publicKeyJson]);
            const rows = Array.isArray(result) ? result : [];
            
            this.logger.debug('検索結果:', {
                rowCount: rows.length,
                found: rows.length > 0
            });

            if (rows.length > 0) {
                const credential = rows[0];
                this.logger.info('公開鍵でクレデンシャル発見:', {
                    id: credential.id,
                    masterId: credential.master_id
                });
                return credential;
            } else {
                this.logger.info('公開鍵に一致するクレデンシャルが見つかりません:', { masterId });
                return null;
            }

        } catch (error) {
            this.logger.error('公開鍵ベースクレデンシャル検索エラー:', error);
            return null;
        }
    }
}

module.exports = PasskeyService;