/**
 * BitVoyStorage.js - 共通ストレージクラス (JWT管理対応改良版)
 * IndexedDB操作の一元化 + JWT認証情報管理
 */
/**
 * BitVoyStorage.js - 新規実装（credentialId管理）
 * Passkey複数クレデンシャル対応の完全新規実装
 */

class BitVoyStorage {
    constructor() {
        this.dbName = "bitvoy-mpc";
        this.dbVersion = 4; // mypageストア対応版
        this.db = null;
        this.isInitialized = false;
        this.isInitializing = false; // 初期化中フラグを追加
        this.initPromise = null; // 初期化Promiseを保持
        this.stores = {
            main: "main",
            shares: "shares", 
            wallets: "wallets",
            nfts: "nfts",
            credentials: "credentials",
            webauthn: "webauthn", // Passkey専用ストア
            jwt: "jwt",
            mypage: "mypage" // マイページ設定用ストア
        };
    }

    /**
     * データベースを初期化
     */
    async init() {
        // 既に初期化済みの場合は即座に返す
        if (this.isInitialized && this.db) {
            console.log("BitVoyStorage already initialized");
            return this.db;
        }
        
        // 初期化中の場合は既存のPromiseを返す
        if (this.isInitializing && this.initPromise) {
            console.log("BitVoyStorage initialization in progress, waiting...");
            return this.initPromise;
        }
        
        // 初期化開始
        this.isInitializing = true;
        this.initPromise = this.performInitialization();
        
        try {
            const result = await this.initPromise;
            return result;
        } finally {
            this.isInitializing = false;
            this.initPromise = null;
        }
    }

    /**
     * 実際の初期化処理
     */
    async performInitialization() {
        try {
            console.log("🚀 Initializing BitVoyStorage with credentialId support...");
            this.db = await this.createDatabaseWithStores();
            this.isInitialized = true;
            console.log("✅ BitVoyStorage with credentialId support initialized successfully");
            return this.db;
        } catch (error) {
            console.error("❌ BitVoyStorage initialization failed:", error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * すべてのストアを含むデータベースを作成
     */
    createDatabaseWithStores() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log("🔄 Creating object stores during database initialization...");
                
                // 基本ストアの作成
                if (!db.objectStoreNames.contains(this.stores.main)) {
                    db.createObjectStore(this.stores.main);
                    console.log("✅ Created main store");
                }
                
                if (!db.objectStoreNames.contains(this.stores.shares)) {
                    db.createObjectStore(this.stores.shares);
                    console.log("✅ Created shares store");
                }
                
                if (!db.objectStoreNames.contains(this.stores.wallets)) {
                    const walletsStore = db.createObjectStore(this.stores.wallets);
                    walletsStore.createIndex('masterId', 'masterId', { unique: false });
                    console.log("✅ Created wallets store with masterId index");
                }
                
                if (!db.objectStoreNames.contains(this.stores.nfts)) {
                    db.createObjectStore(this.stores.nfts);
                    console.log("✅ Created nfts store");
                }
                
                if (!db.objectStoreNames.contains(this.stores.credentials)) {
                    db.createObjectStore(this.stores.credentials);
                    console.log("✅ Created credentials store");
                }
                
                if (!db.objectStoreNames.contains(this.stores.jwt)) {
                    db.createObjectStore(this.stores.jwt);
                    console.log("✅ Created jwt store");
                }
                
                // Passkey専用ストア作成
                if (!db.objectStoreNames.contains(this.stores.webauthn)) {
                    const webauthnStore = db.createObjectStore(this.stores.webauthn, { 
                        keyPath: 'credentialId' // credentialIdを主キーに
                    });
                    
                    // masterIdでの検索用インデックス
                    webauthnStore.createIndex('masterId', 'masterId', { unique: false });
                    webauthnStore.createIndex('createdAt', 'createdAt', { unique: false });
                    webauthnStore.createIndex('lastUsed', 'lastUsed', { unique: false });
                    
                    console.log("✅ Created Passkey store with credentialId as primary key");
                }
                
                // マイページ設定用ストア作成
                if (!db.objectStoreNames.contains(this.stores.mypage)) {
                    const mypageStore = db.createObjectStore(this.stores.mypage, { 
                        keyPath: 'key' // keyを主キーに
                    });
                    
                    console.log("✅ Created mypage store");
                }
                
                console.log("✅ All object stores created successfully");
            };
        });
    }

    // ==========================================
    // Passkey credentialId管理メソッド（新規実装）
    // ==========================================

    // バッファ→base64変換ユーティリティ
    static bufferToBase64(buffer) {
        if (!buffer) return null;
        if (typeof buffer === 'string') return buffer;
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    /**
     * Passkeyクレデンシャル保存（最小限 - パスキー同期前提）
     */
    async storePasskeyCredential(credentialId, credentialData) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for Passkey credential storage...");
            await this.init();
        }
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readwrite");
            const store = transaction.objectStore(this.stores.webauthn);
            
            // 暗号化キー導出に必要な最小限の情報のみ保存
            const credentialRecord = {
                credentialId: credentialId, // 主キー
                masterId: credentialData.masterId,
                // 暗号化キー導出に必要な情報のみ
                rawId: credentialData.rawId,
                publicKey: credentialData.publicKey,
                // 最小限のメタデータ
                deviceInfo: credentialData.deviceInfo || null,
                createdAt: Date.now(),
                lastUsed: Date.now(),
                isActive: true,
                // パスキー同期フラグ
                passkeySyncEnabled: true,
                metadata: {
                    rpId: credentialData.metadata?.rpId || window.location.hostname,
                    rpName: credentialData.metadata?.rpName || "BitVoy Wallet",
                    storageType: "minimal",
                    syncMethod: "passkey"
                }
            };
            
            await store.put(credentialRecord);
            await transaction.done; // コミット完了を待つ
            console.log(`✅ Passkey credential stored (minimal): ${credentialId.substring(0, 16)}...`);
            console.log("ℹ️ Full credential data managed by passkey sync (iCloud/Google)");
            return credentialRecord;
        } catch (error) {
            console.error("❌ Failed to store Passkey credential:", error);
            throw error;
        }
    }

    /**
     * credentialIdでクレデンシャル取得
     */
    async getPasskeyCredentialById(credentialId) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for Passkey credential retrieval...");
            await this.init();
        }
        
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readonly");
            const store = transaction.objectStore(this.stores.webauthn);
            
            const result = await store.get(credentialId);
            
            if (result && result.isActive) {
                // 最終使用時刻を更新
                await this.updateCredentialLastUsed(credentialId);
                console.log(`✅ Passkey credential retrieved: ${credentialId.substring(0, 16)}...`);
                return result;
            }
            
            return null;
            
        } catch (error) {
            console.error("❌ Failed to get Passkey credential:", error);
            throw error;
        }
    }

    /**
     * masterIdで全クレデンシャル取得
     */
    async getPasskeyCredentialsByMasterId(masterId) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for Passkey credentials retrieval...");
            await this.init();
        }
        
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readonly");
            const store = transaction.objectStore(this.stores.webauthn);
            const index = store.index('masterId');
            
            const credentials = [];
            const cursor = await index.openCursor(IDBKeyRange.only(masterId));
            
            return new Promise((resolve, reject) => {
                const results = [];
                
                cursor.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.isActive) {
                            results.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        console.log(`✅ Found ${results.length} credentials for masterId: ${masterId}`);
                        resolve(results.sort((a, b) => b.lastUsed - a.lastUsed)); // 最新使用順
                    }
                };
                
                cursor.onerror = () => reject(cursor.error);
            });
            
        } catch (error) {
            console.error("❌ Failed to get credentials by masterId:", error);
            throw error;
        }
    }

    /**
     * 🆕 廃止: getPasskeyCredential(masterId) は使用不可
     * 代わりに getPasskeyCredentialsByMasterId(masterId) を使用
     */

    /**
     * クレデンシャル最終使用時刻更新
     */
    async updateCredentialLastUsed(credentialId) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for credential update...");
            await this.init();
        }
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readwrite");
            const store = transaction.objectStore(this.stores.webauthn);
            const credential = await store.get(credentialId);
            if (credential) {
                credential.lastUsed = Date.now();
                // DataCloneError回避: credentialが純粋なオブジェクトであることを保証
                const safeCredential = JSON.parse(JSON.stringify(credential));
                // 主キー（credentialId）が消えていれば必ずセット
                safeCredential.credentialId = credentialId;
                await store.put(safeCredential);
                await transaction.done; // コミット完了を待つ
            }
        } catch (error) {
            console.error("❌ Failed to update credential last used:", error);
        }
    }

    /**
     * クレデンシャル無効化
     */
    async deactivatePasskeyCredential(credentialId) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for credential deactivation...");
            await this.init();
        }
        
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readwrite");
            const store = transaction.objectStore(this.stores.webauthn);
            
            const credential = await store.get(credentialId);
            if (credential) {
                credential.isActive = false;
                credential.deactivatedAt = Date.now();
                await store.put(credential);
                await transaction.done; // コミット完了を待つ
                console.log(`✅ Passkey credential deactivated: ${credentialId.substring(0, 16)}...`);
            }
            
        } catch (error) {
            console.error("❌ Failed to deactivate credential:", error);
            throw error;
        }
    }

    // ==========================================
    // 🆕 データ移行機能
    // ==========================================

    /**
     * 既存のmasterIdベースデータをcredentialIdベースに移行（一回限り）
     */
    async migrateExistingPasskeyData() {
        try {
            const transaction = this.db.transaction([this.stores.credentials, this.stores.webauthn], "readwrite");
            const credentialsStore = transaction.objectStore(this.stores.credentials);
            const webauthnStore = transaction.objectStore(this.stores.webauthn);
            
            const cursor = credentialsStore.openCursor();
            let migratedCount = 0;
            
            cursor.onsuccess = async (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const key = cursor.key;
                    const value = cursor.value;
                    
                    // webauthn_${masterId} 形式のキーを検出
                    if (typeof key === 'string' && key.startsWith('webauthn_')) {
                        const masterId = key.replace('webauthn_', '');
                        
                        // 新しい形式に移行
                        if (value.credentialId) {
                            const newCredential = {
                                credentialId: value.credentialId,
                                masterId: masterId,
                                rawId: value.rawId || value.credentialId,
                                publicKey: value.publicKey,
                                response: value.response || {},
                                userAgent: value.userAgent || 'Migrated from legacy storage',
                                createdAt: value.createdAt || Date.now(),
                                lastUsed: value.lastUsed || value.createdAt || Date.now(),
                                isActive: true,
                                metadata: { migrated: true, originalKey: key }
                            };
                            
                            // 新しいストアに保存
                            await webauthnStore.put(newCredential);
                            // 古いデータを削除
                            await credentialsStore.delete(key);
                            migratedCount++;
                            
                            console.log(`🔄 Migrated and removed legacy credential: ${key} -> credentialId: ${value.credentialId.substring(0, 16)}...`);
                        }
                    }
                    
                    cursor.continue();
                } else {
                    try {
                        await transaction.done; // コミット完了を待つ
                        if (migratedCount > 0) {
                            console.log(`✅ Migration completed: ${migratedCount} credentials migrated and legacy data removed`);
                        }
                    } catch (error) {
                        console.error("❌ Migration transaction commit error:", error);
                    }
                }
            };
            
        } catch (error) {
            console.warn("⚠️ Data migration failed (this is OK for new installations):", error);
        }
    }

    // ==========================================
    // 🆕 管理・ユーティリティメソッド
    // ==========================================

    /**
     * Passkeyクレデンシャル統計情報取得
     */
    async getPasskeyStatistics(masterId) {
        try {
            const credentials = await this.getPasskeyCredentialsByMasterId(masterId);
            
            return {
                totalCredentials: credentials.length,
                activeCredentials: credentials.filter(c => c.isActive).length,
                oldestCredential: credentials.length > 0 ? Math.min(...credentials.map(c => c.createdAt)) : null,
                newestCredential: credentials.length > 0 ? Math.max(...credentials.map(c => c.createdAt)) : null,
                lastUsed: credentials.length > 0 ? Math.max(...credentials.map(c => c.lastUsed)) : null,
                devices: [...new Set(credentials.map(c => c.userAgent))].length
            };
        } catch (error) {
            console.error("Failed to get Passkey statistics:", error);
            return {};
        }
    }

    /**
     * 古いクレデンシャルのクリーンアップ
     */
    async cleanupOldCredentials(masterId, maxCredentials = 5) {
        try {
            const credentials = await this.getPasskeyCredentialsByMasterId(masterId);
            
            if (credentials.length > maxCredentials) {
                // 最も古い使用日時のクレデンシャルを無効化
                const sorted = credentials.sort((a, b) => a.lastUsed - b.lastUsed);
                const toDeactivate = sorted.slice(0, credentials.length - maxCredentials);
                
                for (const credential of toDeactivate) {
                    await this.deactivatePasskeyCredential(credential.credentialId);
                }
                
                console.log(`✅ Cleaned up ${toDeactivate.length} old credentials for masterId: ${masterId}`);
                return toDeactivate.length;
            }
            
            return 0;
        } catch (error) {
            console.error("❌ Failed to cleanup old credentials:", error);
            throw error;
        }
    }

    /**
     * データベース接続が有効かチェック
     */
    _isDatabaseConnectionValid() {
        if (!this.db) {
            return false;
        }
        try {
            // データベース接続が閉じられているかチェック
            // objectStoreNamesにアクセスして接続状態を確認
            const _ = this.db.objectStoreNames;
            return true;
        } catch (error) {
            // 接続が閉じられている場合
            console.warn("⚠️ Database connection is closed, will reinitialize");
            this.db = null;
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * データを保存
     */
    async put(storeName, key, data) {
        // データベース接続の有効性をチェック
        if (!this.isInitialized || !this.db || !this._isDatabaseConnectionValid()) {
            console.log("🔄 Auto-initializing BitVoyStorage for put operation...");
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            try {
            const transaction = this.db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            const request = store.put(data, key);
                
            request.onsuccess = async () => {
                try {
                    await transaction.done; // コミット完了を待つ
                    resolve(request.result);
                } catch (error) {
                    reject(error);
                }
            };
            request.onerror = () => {
                console.error(`❌ IndexedDB put error in store '${storeName}':`, request.error);
                    
                    // データベース接続が閉じられているエラーの場合、リトライ
                    if (request.error && request.error.name === 'InvalidStateError' && 
                        request.error.message.includes('database connection is closing')) {
                        console.log("🔄 Database connection closed during operation, retrying...");
                        // 接続をリセットして再試行
                        this.db = null;
                        this.isInitialized = false;
                        this.put(storeName, key, data).then(resolve).catch(reject);
                        return;
                    }
                    
                reject(request.error);
            };
            } catch (error) {
                // トランザクション作成時のエラー（接続が閉じられている場合など）
                if (error.name === 'InvalidStateError' && 
                    error.message.includes('database connection is closing')) {
                    console.log("🔄 Database connection closed, reinitializing and retrying...");
                    this.db = null;
                    this.isInitialized = false;
                    // 再初期化してリトライ
                    this.put(storeName, key, data).then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            }
        });
    }

    /**
     * データを取得
     */
    async get(storeName, key) {
        // データベース接続の有効性をチェック
        if (!this.isInitialized || !this.db || !this._isDatabaseConnectionValid()) {
            console.log("🔄 Auto-initializing BitVoyStorage for get operation...");
            await this.init();
        }
        return new Promise((resolve, reject) => {
            try {
            const transaction = this.db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => {
                resolve(request.result);
            };
                request.onerror = () => {
                    // データベース接続が閉じられているエラーの場合、リトライ
                    if (request.error && request.error.name === 'InvalidStateError' && 
                        request.error.message.includes('database connection is closing')) {
                        console.log("🔄 Database connection closed during operation, retrying...");
                        this.db = null;
                        this.isInitialized = false;
                        this.get(storeName, key).then(resolve).catch(reject);
                        return;
                    }
                    reject(request.error);
                };
            } catch (error) {
                // トランザクション作成時のエラー（接続が閉じられている場合など）
                if (error.name === 'InvalidStateError' && 
                    error.message.includes('database connection is closing')) {
                    console.log("🔄 Database connection closed, reinitializing and retrying...");
                    this.db = null;
                    this.isInitialized = false;
                    this.get(storeName, key).then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            }
        });
    }

    /**
     * データを削除
     */
    async delete(storeName, key) {
        // データベース接続の有効性をチェック
        if (!this.isInitialized || !this.db || !this._isDatabaseConnectionValid()) {
            console.log("🔄 Auto-initializing BitVoyStorage for delete operation...");
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            try {
            const transaction = this.db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            
            const request = store.delete(key);
            
            request.onsuccess = async () => {
                try {
                    await transaction.done; // コミット完了を待つ
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
                request.onerror = () => {
                    // データベース接続が閉じられているエラーの場合、リトライ
                    if (request.error && request.error.name === 'InvalidStateError' && 
                        request.error.message.includes('database connection is closing')) {
                        console.log("🔄 Database connection closed during operation, retrying...");
                        this.db = null;
                        this.isInitialized = false;
                        this.delete(storeName, key).then(resolve).catch(reject);
                        return;
                    }
                    reject(request.error);
                };
            } catch (error) {
                // トランザクション作成時のエラー（接続が閉じられている場合など）
                if (error.name === 'InvalidStateError' && 
                    error.message.includes('database connection is closing')) {
                    console.log("🔄 Database connection closed, reinitializing and retrying...");
                    this.db = null;
                    this.isInitialized = false;
                    this.delete(storeName, key).then(resolve).catch(reject);
                } else {
                    reject(error);
                }
            }
        });
    }

    /**
     * 複数のデータを取得
     */
    async getAll(storeName, indexName = null, value = null) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for getAll operation...");
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], "readonly");
            const store = transaction.objectStore(storeName);
            
            let request;
            if (indexName && value) {
                const index = store.index(indexName);
                request = index.getAll(value);
            } else {
                request = store.getAll();
            }
            
            request.onsuccess = () => {
                const results = request.result.map(item => ({
                    id: item.id,
                    data: item.data,
                    timestamp: item.timestamp
                }));
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * データの存在確認
     */
    async exists(storeName, key) {
        try {
            const data = await this.get(storeName, key);
            return data !== null;
        } catch (error) {
            console.error("Error checking existence:", error);
            return false;
        }
    }

    /**
     * ストア全体をクリア
     */
    async clear(storeName) {
        if (!this.isInitialized || !this.db) {
            console.log("🔄 Auto-initializing BitVoyStorage for clear operation...");
            await this.init();
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], "readwrite");
            const store = transaction.objectStore(storeName);
            
            const request = store.clear();
            
            request.onsuccess = async () => {
                try {
                    await transaction.done; // コミット完了を待つ
                    resolve();
                } catch (error) {
                    reject(error);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * データベース全体をクリア
     */
    async clearAll() {
        if (!this.db) return;
        
        try {
            const storeNames = Object.values(this.stores);
            await Promise.all(storeNames.map(store => this.clear(store)));
            console.log("All storage cleared");
        } catch (error) {
            console.error("Failed to clear all storage:", error);
            throw error;
        }
    }

    /**
     * データベースを閉じる
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    /**
     * ストレージ使用量統計
     */
    async getStorageStats() {
        try {
            const stats = {};
            const storeNames = Object.values(this.stores);
            
            for (const storeName of storeNames) {
                const items = await this.getAll(storeName);
                stats[storeName] = {
                    count: items.length,
                    size: JSON.stringify(items).length,
                    lastModified: items.length > 0 ? 
                        Math.max(...items.map(item => item.timestamp)) : null
                };
            }
            
            return stats;
        } catch (error) {
            console.error("Failed to get storage stats:", error);
            return {};
        }
    }

    // ==========================================
    // 便利メソッド - 特定データ型用のヘルパー
    // ==========================================

    /**
     * 暗号化シェア保存（曲線別対応・完全分離・エポック管理対応）
     */
    async storeEncryptedShare(masterId, encryptedShare, curve, epochInfo = null) {
        if (!curve) {
            throw new Error('Curve parameter is required for encrypted share storage');
        }
        
        const key = `share_${masterId}_${curve}`;
        
        const shareData = {
            ...encryptedShare,
            masterId: masterId,
            curve: curve,
            createdAt: Date.now()
        };
        
        // エポック情報が提供されている場合は追加
        if (epochInfo) {
            shareData.epoch_counter = epochInfo.epochCounter;
            shareData.pubkey_fingerprint = epochInfo.pubkeyFingerprint;
        }
        
        // 保存直前のフルログ（安全にJSON化）
        try {
            const preview = (() => {
                try { return JSON.stringify(shareData); } catch (_) { return String(shareData); }
            })();
            console.log('[Storage][storeEncryptedShare] PUT key:', key);
            console.log('[Storage][storeEncryptedShare] PUT data (full):', preview);
        } catch (_) {}

        return await this.put(this.stores.shares, key, shareData);
    }

    /**
     * 暗号化シェア取得（曲線別対応・完全分離）
     */
    async getEncryptedShare(masterId, curve) {
        if (!curve) {
            throw new Error('Curve parameter is required for encrypted share retrieval');
        }
        
        const key = `share_${masterId}_${curve}`;
        
        return await this.get(this.stores.shares, key);
    }

    /**
     * 全曲線の暗号化シェア取得
     */
    async getAllCurveEncryptedShares(masterId) {
        try {
            const secpShare = await this.getEncryptedShare(masterId, 'secp256k1');
            const edShare = await this.getEncryptedShare(masterId, 'ed25519');
            
            return {
                secp256k1: secpShare,
                ed25519: edShare
            };
        } catch (error) {
            console.error("Failed to get all curve encrypted shares:", error);
            return {
                secp256k1: null,
                ed25519: null
            };
        }
    }

    /**
     * 暗号化シェア削除（曲線別対応・完全分離）
     */
    async deleteEncryptedShare(masterId, curve) {
        if (!curve) {
            throw new Error('Curve parameter is required for encrypted share deletion');
        }
        
        const key = `share_${masterId}_${curve}`;
        
        return await this.delete(this.stores.shares, key);
    }

    /**
     * クレデンシャルID保存
     */
    async storeCredentialId(masterId, credentialId, publicKey = null, counter = 0) {
        const key = `credential_${masterId}`;
        const data = Array.from(new Uint8Array(credentialId));
        const credentialData = {
            credentialId: data,
            masterId: masterId,
            createdAt: Date.now()
        };
        
        // publicKeyが提供された場合は保存
        if (publicKey) {
            credentialData.publicKey = publicKey;
            credentialData.counter = counter;
        }
        
        return await this.put(this.stores.credentials, key, credentialData);
    }

    /**
     * クレデンシャルID取得
     */
    async getCredentialId(masterId) {
        const key = `credential_${masterId}`;
        const result = await this.get(this.stores.credentials, key);
        return result ? new Uint8Array(result.credentialId) : null;
    }

    /**
     * 保存されたクレデンシャル取得（OIDC認証用）
     */
    async getStoredCredential(masterId) {
        console.log('🔍 getStoredCredential called:', { masterId });
        
        // webauthnストアから取得を試行
        try {
            const transaction = this.db.transaction([this.stores.webauthn], "readonly");
            const store = transaction.objectStore(this.stores.webauthn);
            const request = store.getAll();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const credentials = request.result;
                    console.log('🔍 webauthn store contents:', credentials);
                    
                    // masterIdに一致するクレデンシャルを検索
                    const credential = credentials.find(c => c.masterId === masterId);
                    console.log('🔍 getStoredCredential result:', credential);
                    
                    if (credential && credential.publicKey) {
                        console.log('🔍 getStoredCredential success:', {
                            credentialId: credential.credentialId,
                            publicKeyLength: credential.publicKey ? credential.publicKey.length : 0,
                            counter: credential.counter || 0
                        });
                        resolve({
                            credentialId: credential.credentialId,
                            publicKey: credential.publicKey,
                            counter: credential.counter || 0
                        });
                    } else {
                        console.log('🔍 getStoredCredential failed: no result or no publicKey');
                        resolve(null);
                    }
                };
                
                request.onerror = () => {
                    console.error('🔍 getStoredCredential error:', request.error);
                    resolve(null);
                };
            });
        } catch (error) {
            console.error('🔍 getStoredCredential error:', error);
            return null;
        }
    }

    /**
     * ウォレット情報保存
     * ネイティブコインのみ保存（トークンは保存しない）
     */
    async storeWalletInfo(masterId, productId, walletData) {
        // ネイティブコインかどうかを判定
        // productsオブジェクトからtokentypeを確認（tokentypeが空文字列の場合はネイティブコイン）
        const isNativeCoin = this.isNativeCoin(productId);
        
        if (!isNativeCoin) {
            console.log(`⚠️ Skipping IndexedDB save for token ${productId} (only native coins are stored)`);
            return; // トークンの場合は保存しない
        }
        
        const key = `wallet_${masterId}_${productId}`;
        return await this.put(this.stores.wallets, key, {
            masterId,
            productId,
            ...walletData
        });
    }
    
    /**
     * ネイティブコインかどうかを判定
     */
    isNativeCoin(productId) {
        if (!productId || typeof productId !== 'string') {
            return false;
        }
        
        // productsオブジェクトが利用可能な場合、tokentypeを確認
        if (typeof window !== 'undefined' && window.CoinsLibs && window.CoinsLibs.products) {
            const product = window.CoinsLibs.products[productId];
            if (product) {
                // tokentypeが空文字列の場合はネイティブコイン
                return !product.tokentype || product.tokentype === '';
            }
        }
        
        // フォールバック: サポートされているネイティブコインのリスト
        const nativeCoins = ['BTC', 'ETH', 'POL', 'SOL', 'TON', 'BNB', 'AVAX', 'TRX', 'ETH_ARB', 'ETH_BASE', 'ETH_OPT'];
        return nativeCoins.includes(productId);
    }

    /**
     * ウォレット情報取得
     */
    async getWalletInfo(masterId, productId) {
        const key = `wallet_${masterId}_${productId}`;
        return await this.get(this.stores.wallets, key);
    }

    /**
     * すべてのウォレット情報取得
     */
    async getAllWallets(masterId) {
        return await this.getAll(this.stores.wallets, "masterId", masterId);
    }

    /**
     * メタデータ保存（曲線別対応・完全分離）
     */
    async storeMetadata(masterId, metadata, curve) {
        if (!curve) {
            throw new Error('Curve parameter is required for metadata storage');
        }
        
        const key = `metadata_${masterId}_${curve}`;
        
        const dataToStore = {
            ...metadata,
            masterId: masterId,
            curve: curve,
            updatedAt: Date.now()
        };

        // publicKeyPackage を常にオブジェクトへ正規化
        try {
            if (dataToStore.publicKeyPackage && typeof dataToStore.publicKeyPackage === 'string') {
                try { dataToStore.publicKeyPackage = JSON.parse(dataToStore.publicKeyPackage); } catch (_) {}
            }
        } catch (_) {}
        
        // identifier 自動補正は廃止（保存済みの値を尊重）
        
        // 保存直前のフルログ（安全にJSON化）
        try {
            const preview = (() => {
                try { return JSON.stringify(dataToStore); } catch (_) { return String(dataToStore); }
            })();
            console.log('[Storage][storeMetadata] PUT key:', key);
            console.log('[Storage][storeMetadata] PUT data (full):', preview);
        } catch (_) {}

        return await this.put(this.stores.main, key, dataToStore);
    }

    /**
     * メタデータ取得（曲線別対応・完全分離）
     */
    async getMetadata(masterId, curve) {
        if (!curve) {
            throw new Error('Curve parameter is required for metadata retrieval');
        }
        
        const key = `metadata_${masterId}_${curve}`;
        
        return await this.get(this.stores.main, key);
    }

    /**
     * 全曲線のメタデータ取得
     */
    async getAllCurveMetadata(masterId) {
        try {
            const secpMetadata = await this.getMetadata(masterId, 'secp256k1');
            const edMetadata = await this.getMetadata(masterId, 'ed25519');
            const ecdsaMetadata = await this.getMetadata(masterId, 'ecdsa_tss');
            
            return {
                secp256k1: secpMetadata,
                ed25519: edMetadata,
                ecdsa_tss: ecdsaMetadata
            };
        } catch (error) {
            console.error("Failed to get all curve metadata:", error);
            return {
                secp256k1: null,
                ed25519: null,
                ecdsa_tss: null
            };
        }
    }

    /**
     * すべてのメタデータキーを取得
     */
    async getAllMetadataKeys() {
        try {
            const transaction = this.db.transaction([this.stores.main], "readonly");
            const store = transaction.objectStore(this.stores.main);
            const request = store.getAllKeys();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const allKeys = request.result;
                    const metadataKeys = allKeys.filter(key => key.startsWith('metadata_'));
                    console.log("📋 Found metadata keys:", metadataKeys);
                    resolve(metadataKeys);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error("❌ Failed to get all metadata keys:", error);
            return [];
        }
    }

    /**
     * メタデータ削除（曲線別対応）
     */
    async deleteMetadata(masterId, curve) {
        if (!curve) {
            throw new Error('Curve parameter is required for metadata deletion');
        }
        
        const key = `metadata_${masterId}_${curve}`;
        return await this.delete(this.stores.main, key);
    }

    // ==========================================
    // 🆕 JWT管理メソッド
    // ==========================================

    /**
     * JWT情報保存
     */
    async storeJWT(masterId, action, jwtData) {
        const key = `jwt_${masterId}_${action}_${Date.now()}`;
        const jwtInfo = {
            masterId: masterId,
            action: action,
            jwt: jwtData.jwt,
            expiryTime: jwtData.expiryTime,
            issuedAt: Date.now(),
            isValid: true,
            serverIssuer: jwtData.issuer || 'bitvoy-share1',
            ...jwtData
        };
        
        return await this.put(this.stores.jwt, key, jwtInfo);
    }

    /**
     * 有効なJWT取得
     */
    async getValidJWT(masterId, action) {
        try {
            const allJWTs = await this.getAll(this.stores.jwt, "masterId", masterId);
            const currentTime = Date.now();
            
            // 該当するアクションで有効期限内のJWTを検索
            const validJWTs = allJWTs.filter(item => {
                const jwt = item.data;
                return jwt.action === action && 
                       jwt.isValid && 
                       jwt.expiryTime > currentTime;
            });
            
            // 最も新しいJWTを返す
            if (validJWTs.length > 0) {
                validJWTs.sort((a, b) => b.data.issuedAt - a.data.issuedAt);
                return validJWTs[0].data;
            }
            
            return null;
        } catch (error) {
            console.error("Failed to get valid JWT:", error);
            return null;
        }
    }

    /**
     * JWT無効化
     */
    async invalidateJWT(masterId, action = null) {
        try {
            const allJWTs = await this.getAll(this.stores.jwt, "masterId", masterId);
            
            for (const item of allJWTs) {
                const jwt = item.data;
                if (!action || jwt.action === action) {
                    jwt.isValid = false;
                    jwt.invalidatedAt = Date.now();
                    await this.put(this.stores.jwt, item.id, jwt);
                }
            }
            
            console.log(`JWT invalidated for ${masterId}${action ? ` (action: ${action})` : ''}`);
        } catch (error) {
            console.error("Failed to invalidate JWT:", error);
        }
    }

    /**
     * 期限切れJWTクリーンアップ
     */
    async cleanupExpiredJWTs() {
        try {
            const allJWTs = await this.getAll(this.stores.jwt);
            const currentTime = Date.now();
            let cleanedCount = 0;
            
            for (const item of allJWTs) {
                const jwt = item.data;
                // 有効期限から24時間経過したJWTを削除
                if (jwt.expiryTime < currentTime - 24 * 60 * 60 * 1000) {
                    await this.delete(this.stores.jwt, item.id);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} expired JWTs`);
            }
            
            return cleanedCount;
        } catch (error) {
            console.error("Failed to cleanup expired JWTs:", error);
            return 0;
        }
    }

    /**
     * JWT統計取得
     */
    async getJWTStats(masterId) {
        try {
            const allJWTs = await this.getAll(this.stores.jwt, "masterId", masterId);
            const currentTime = Date.now();
            
            const stats = {
                total: allJWTs.length,
                valid: 0,
                expired: 0,
                invalidated: 0,
                byAction: {}
            };
            
            allJWTs.forEach(item => {
                const jwt = item.data;
                
                if (!jwt.isValid) {
                    stats.invalidated++;
                } else if (jwt.expiryTime < currentTime) {
                    stats.expired++;
                } else {
                    stats.valid++;
                }
                
                if (!stats.byAction[jwt.action]) {
                    stats.byAction[jwt.action] = 0;
                }
                stats.byAction[jwt.action]++;
            });
            
            return stats;
        } catch (error) {
            console.error("Failed to get JWT stats:", error);
            return {
                total: 0,
                valid: 0,
                expired: 0,
                invalidated: 0,
                byAction: {}
            };
        }
    }

    /**
     * JWTセッション情報保存
     */
    async storeJWTSession(masterId, sessionData) {
        const key = `jwt_session_${masterId}`;
        return await this.put(this.stores.jwt, key, {
            masterId: masterId,
            sessionType: 'jwt_session',
            ...sessionData,
            createdAt: Date.now()
        });
    }

    /**
     * JWTセッション情報取得
     */
    async getJWTSession(masterId) {
        const key = `jwt_session_${masterId}`;
        return await this.get(this.stores.jwt, key);
    }

    /**
     * Guardian Node認証履歴保存
     */
    async storeGuardianAuthHistory(masterId, authData) {
        const key = `guardian_auth_${masterId}_${Date.now()}`;
        return await this.put(this.stores.jwt, key, {
            masterId: masterId,
            authType: 'guardian_auth',
            timestamp: Date.now(),
            ...authData
        });
    }

    /**
     * Guardian Node認証履歴取得
     */
    async getGuardianAuthHistory(masterId, limit = 10) {
        try {
            const allAuth = await this.getAll(this.stores.jwt, "masterId", masterId);
            const authHistory = allAuth
                .filter(item => item.data.sessionType === 'guardian_auth')
                .sort((a, b) => b.data.createdAt - a.data.createdAt)
                .slice(0, limit);
            
            return authHistory.map(item => item.data);
        } catch (error) {
            console.error("Failed to get Guardian auth history:", error);
            return [];
        }
    }

    // ==========================================
    // 🆕 Master ID管理メソッド
    // ==========================================

    /**
     * Master ID保存（IndexedDB）
     */
    async storeMasterId(masterId) {
        const key = 'bitvoy.masterid';
        return await this.put(this.stores.main, key, {
            masterId: masterId,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    }

    /**
     * Master ID取得（IndexedDB）
     */
    async getMasterId() {
        try {
            const key = 'bitvoy.masterid';
            const data = await this.get(this.stores.main, key);
            return data ? data.masterId : null;
        } catch (error) {
            console.log("Failed to get masterId from IndexedDB:", error);
            return null;
        }
    }

    /**
     * Master ID更新（IndexedDB）
     */
    async updateMasterId(masterId) {
        const key = 'bitvoy.masterid';
        const existingData = await this.get(this.stores.main, key);
        
        return await this.put(this.stores.main, key, {
            masterId: masterId,
            createdAt: existingData ? existingData.createdAt : Date.now(),
            updatedAt: Date.now()
        });
    }

    /**
     * Master ID削除（IndexedDB）
     */
    async deleteMasterId() {
        const key = 'bitvoy.masterid';
        return await this.delete(this.stores.main, key);
    }

    /**
     * Master ID存在確認（IndexedDB）
     */
    async hasMasterId() {
        try {
            const masterId = await this.getMasterId();
            return masterId !== null;
        } catch (error) {
            console.log("Failed to check masterId existence:", error);
            return false;
        }
    }

    // ==========================================
    // 🆕 定期メンテナンス
    // ==========================================

    /**
     * 定期メンテナンス実行
     */
    async performMaintenance() {
        try {
            console.log("Starting storage maintenance...");
            
            // 期限切れJWTクリーンアップ
            const cleanedJWTs = await this.cleanupExpiredJWTs();
            
            // ストレージ統計取得
            const stats = await this.getStorageStats();
            
            console.log("Storage maintenance completed:", {
                cleanedJWTs: cleanedJWTs,
                storageStats: stats
            });
            
            return {
                success: true,
                cleanedJWTs: cleanedJWTs,
                stats: stats
            };
        } catch (error) {
            console.error("Storage maintenance failed:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 自動メンテナンス開始
     */
    startAutoMaintenance(intervalMinutes = 60) {
        // 既存のインターバルをクリア
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
        }
        
        // 新しいインターバル設定
        this.maintenanceInterval = setInterval(async () => {
            await this.performMaintenance();
        }, intervalMinutes * 60 * 1000);
        
        console.log(`Auto maintenance started (interval: ${intervalMinutes} minutes)`);
    }

    /**
     * 自動メンテナンス停止
     */
    stopAutoMaintenance() {
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
            this.maintenanceInterval = null;
            console.log("Auto maintenance stopped");
        }
    }

    // ==========================================
    // Smart Accountアドレス管理メソッド
    // ==========================================

    /**
     * Smart Accountアドレス保存
     * @param {string} masterId - マスターID
     * @param {object} saData - SAデータ
     */
    async storeSmartAccountAddresses(masterId, saData) {
        try {
            const key = `sa_addresses_${masterId}`;
            
            // 既存のメタデータを取得
            const existingData = await this.get(this.stores.main, key);
            const mergedData = existingData ? { ...existingData, ...saData } : saData;
            
            await this.put(this.stores.main, key, mergedData);
            console.log(`[Storage] Smart Account addresses stored for ${masterId}`);
        } catch (error) {
            console.error(`[Storage] Failed to store SA addresses:`, error);
            throw error;
        }
    }

    /**
     * Smart Accountアドレス取得
     * @param {string} masterId - マスターID
     * @returns {Promise<object|null>} SAデータ
     */
    async getSmartAccountAddresses(masterId) {
        try {
            const key = `sa_addresses_${masterId}`;
            const data = await this.get(this.stores.main, key);
            return data || null;
        } catch (error) {
            console.error(`[Storage] Failed to get SA addresses:`, error);
            return null;
        }
    }

}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BitVoyStorage;
} else if (typeof window !== 'undefined') {
    window.BitVoyStorage = BitVoyStorage;
}