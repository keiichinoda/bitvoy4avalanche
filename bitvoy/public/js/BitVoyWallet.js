/**
 * BitVoyWallet.js - MPC-enabled Cryptocurrency Wallet (JWT対応緊急署名改良版)
 * Guardian Node JWT認証対応・通常署名と緊急署名の区別
 */

class BitVoyWallet {
    constructor(mpcInstance, network_env = 'mainnet') {
        this.mpc = mpcInstance;  // MPC処理はBitVoyMPCに委譲
        this.network = network_env;
        this.isTestnet = network_env === "testnet";
        
        // 共通ストレージインスタンス
        this.storage = new BitVoyStorage();
        
        // 新しいMPCアドレス生成器を初期化
        try {
            if (typeof window.MPCAddressGenerator === 'undefined') {
                throw new Error('MPCAddressGenerator not loaded. Please ensure MPCAddressGenerator.js is loaded before BitVoyWallet.js');
            }
            this.addressGenerator = new MPCAddressGenerator(network_env);
            console.log('✅ MPCAddressGenerator initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize MPCAddressGenerator:', error);
            throw new Error(`MPCAddressGenerator initialization failed: ${error.message}`);
        }
        
        // プロキシ経由のエンドポイント設定（ネットワーク対応）
        this.endpoints = this.getNetworkSpecificEndpoints(network_env);

        // Blockchain configurations
        this.bitcoin = window.bitcoin;
        this.cnetwork = this.network === 'mainnet' ? 
            this.bitcoin.networks.bitcoin : 
            this.bitcoin.networks.testnet;
            
        // Bitcoin ECCライブラリの初期化（オプション）
        try {
            this.initializeBitcoinEccLib();
        } catch (error) {
            console.warn('⚠️ Bitcoin ECC library initialization failed, continuing without it:', error.message);
        }
            
        // JWT認証用の設定
        this.serverUrls = {
            bitvoyServer: window.location.origin
        };
        
        // Solana bundleの読み込みチェック
        this.checkSolanaBundle();
    }

    /**
     * Solana bundleの読み込み状況をチェック
     */
    checkSolanaBundle() {
        try {
            console.log("🔍 Checking Solana bundle availability...");
            
            if (window.SolanaWeb3) {
                console.log("✅ SolanaWeb3 (solana-web3.browser.js) available:", Object.keys(window.SolanaWeb3));
            } else {
                console.warn("⚠️ SolanaWeb3 (solana-web3.browser.js) not available");
            }
            
            if (window.SolanaSplToken) {
                console.log("✅ SolanaSplToken available:", Object.keys(window.SolanaSplToken));
            } else {
                console.warn("⚠️ SolanaSplToken not available");
            }
            
            if (window.SolanaWeb3) {
                console.log("✅ solana-web3.browser.js loaded");
            } else {
                console.error("❌ solana-web3.browser.js not loaded");
            }
        } catch (error) {
            console.error("❌ Error checking Solana bundle:", error);
        }
    }

    /**
     * ネットワーク別のエンドポイント設定を取得
     */
    getNetworkSpecificEndpoints(network) {
        // networkをパスパラメータとして含める形式に変更
        const baseEndpoints = {
            bitcoin: '/proxyapi/blockchain/bitcoin',
            ethereum: '/proxyapi/blockchain/ethereum',
            polygon: '/proxyapi/blockchain/polygon',
            avalanche: '/proxyapi/blockchain/avalanche',
            solana: '/proxyapi/blockchain/solana',
            ton: '/proxyapi/blockchain/ton'
        };

        // 各エンドポイントにnetworkをパスパラメータとして追加
        const endpoints = {};
        for (const [key, value] of Object.entries(baseEndpoints)) {
            if (key === 'polygon' || key === 'ethereum' || key === 'bitcoin' || key === 'avalanche' || key === 'solana' || key === 'ton') {
                endpoints[key] = `${value}/${network}`;
            } else {
                // 後方互換性のため、他のチェーンはクエリパラメータ形式を維持
                const separator = value.includes('?') ? '&' : '?';
                endpoints[key] = `${value}${separator}network=${network}`;
            }
        }

        return endpoints;
    }
    
    /**
     * Bitcoin ECCライブラリの初期化
     */
    initializeBitcoinEccLib() {
        try {
            console.log('🔧 Initializing Bitcoin ECC library in BitVoyWallet...');
            
            if (!this.bitcoin) {
                throw new Error('bitcoinjs-lib not available');
            }
            
            // BitVoyTaprootからsecp256k1ライブラリを取得
            const secp256k1Lib = window.BitVoyTaproot?.secp256k1;
            if (!secp256k1Lib) {
                throw new Error('BitVoyTaproot.secp256k1 not available');
            }
            
            console.log('🔧 Creating ECC adapter for bitcoinjs-lib...');
            console.log('🔍 secp256k1Lib available functions:', Object.keys(secp256k1Lib));
            
            // @noble/secp256k1をbitcoinjs-libが期待するTinySecp256k1Interfaceにマッピング
            this.eccAdapter = this.createEccAdapter(secp256k1Lib);
            
            // bitcoinjs-libにECCライブラリを設定
            this.bitcoin.initEccLib(this.eccAdapter);
            console.log('✅ Bitcoin ECC library initialized successfully');
            
        } catch (error) {
            console.error('❌ Bitcoin ECC library initialization failed:', error);
            throw new Error(`Bitcoin ECC library initialization failed: ${error.message}`);
        }
    }
    
    /**
     * @noble/secp256k1をbitcoinjs-libが期待するTinySecp256k1Interfaceにマッピングするアダプター
     * @param {Object} secp256k1Lib - @noble/secp256k1ライブラリ
     * @returns {Object} TinySecp256k1Interface
     */
    createEccAdapter(secp256k1Lib) {
        console.log('🔧 Creating ECC adapter for bitcoinjs-lib...');
        
        // 必要な定数とヘルパー関数
        const CURVE = secp256k1Lib.CURVE;
        const Point = secp256k1Lib.ProjectivePoint;
        const G = Point?.BASE;
        const n = CURVE?.n;
        
        const beBytesToBigint = (u8) => BigInt('0x' + Buffer.from(u8).toString('hex'));
        const bigintTo32 = (x) => {
            const hex = x.toString(16).padStart(64, '0');
            return Uint8Array.from(Buffer.from(hex, 'hex'));
        };
        
        // 0x02/0x03|X の圧縮形式から/への変換
        const pointFromHex = (p) => Point.fromHex(p); // 33/65B を許容
        const pointToRaw = (P, compressed = true) => P.toRawBytes(compressed);
        
        // ---- 必須インターフェースの実装 ----
        const ecc = {
            // 32B: 0 < d < n
            isPrivate(d) {
                if (!d || d.length !== 32 || !n) return false;
                const x = beBytesToBigint(d);
                return x > 0n && x < n;
            },
            
            // 圧縮鍵 33B: 0x02/0x03|X
            isPointCompressed(p) {
                return !!p && p.length === 33 && (p[0] === 0x02 || p[0] === 0x03);
            },
            
            // 圧縮または非圧縮の公開鍵バイト列が有効か
            isPoint(p) {
                try { 
                    pointFromHex(p); 
                    return true; 
                } catch { 
                    return false; 
                }
            },
            
            // 秘密鍵から公開鍵（デフォ圧縮）を生成
            pointFromScalar(d, compressed = true) {
                if (!this.isPrivate(d)) return null;
                const P = G.multiply(beBytesToBigint(d));
                return pointToRaw(P, compressed);
            },
            
            // 公開鍵の圧縮/非圧縮変換
            pointCompress(p, compressed = true) {
                const P = pointFromHex(p);
                return pointToRaw(P, compressed);
            },
            
            // P + t*G  （P=33/65B, t=32B）
            pointAddScalar(p, tweak, compressed = true) {
                const t = beBytesToBigint(tweak);
                if (!n || t === 0n || t >= n) return null;
                const P = pointFromHex(p);
                const R = P.add(G.multiply(t));
                if (R.is0?.()) return null;
                return pointToRaw(R, compressed);
            },
            
            // (a + b) mod n
            privateAdd(a, b) {
                if (!n) throw new Error('curve order unavailable');
                const A = beBytesToBigint(a), B = beBytesToBigint(b);
                const sum = (A + B) % n;
                if (sum === 0n) return null;
                return bigintTo32(sum);
            },
            
            // x-only（32B）かどうか（持ち上げ可能か）
            isXOnlyPoint(xOnly) {
                if (!xOnly || xOnly.length !== 32) return false;
                try {
                    Point.fromHex(Uint8Array.of(0x02, ...xOnly)); // 偶数Y (0x02) で lift
                    return true;
                } catch { 
                    return false; 
                }
            },
            
            // BIP340: xOnlyPointAddTweak(Px, t) -> { parity, xOnlyPubkey } | null
            xOnlyPointAddTweak(xOnly, tweak) {
                if (!xOnly || xOnly.length !== 32 || !tweak || tweak.length !== 32 || !n) return null;
                const t = beBytesToBigint(tweak);
                if (t === 0n || t >= n) return null;
                const P = Point.fromHex(Uint8Array.of(0x02, ...xOnly)); // 偶数Yにリフト
                const Q = P.add(G.multiply(t));
                if (Q.is0?.()) return null;
                const comp = Q.toRawBytes(true); // 0x02/0x03 | X
                const parity = comp[0] === 0x03 ? 1 : 0;
                return { parity, xOnlyPubkey: comp.slice(1) };
            },
            
            // 署名/検証（ECDSA）: 64B (r||s) 必須（DER不可）
            sign(msg32, seckey, lowS = true) {
                // noble は { der:false } で 64B を返す
                return secp256k1Lib.sign(msg32, seckey, { der: false, lowS });
            },
            
            verify(msg32, sig64, pubkey) {
                return secp256k1Lib.verify(sig64, msg32, pubkey);
            },
            
            // Schnorr (BIP340)
            schnorr: {
                sign(msg32, seckey, auxRand) {
                    // auxRand は省略可。渡せるなら 32B の乱数を渡す。
                    return secp256k1Lib.schnorr.sign(msg32, seckey, auxRand);
                },
                verify(sig64, msg32, xOnlyPubkey32) {
                    // x-only 32B 公開鍵を 32B のまま渡す（noble は対応）
                    return secp256k1Lib.schnorr.verify(sig64, msg32, xOnlyPubkey32);
                },
            },
        };
        
        console.log('✅ ECC adapter created successfully');
        return ecc;
    }
    


    // ==========================================
    // MPC統合ウォレット作成（改良版）
    // ==========================================

    /**
     * MPC統合ウォレット作成（統一処理・secp256k1とEd25519両対応）
     */
    async createMPCWallet(walletParams) {
        try {
            console.log("Creating MPC-integrated wallet for:", walletParams.masterid);
            
            // MPCメタデータ取得（曲線別）
            const mpcMetadata = await this.storage.getAllCurveMetadata(walletParams.masterid);
            if (!mpcMetadata) {
                throw new Error('MPC metadata not found. Please initialize MPC wallet first.');
            }

            // コインタイプに応じて適切な公開鍵を選択
            let secp256k1PubKey = null;
            let ed25519MasterSeed = null;

            // コインタイプに応じて適切な公開鍵を選択
            let ecdsaTssPubKey = null;
            
            switch (walletParams.cointype) {
                case "0": // Bitcoin
                    if (!mpcMetadata.secp256k1 || !mpcMetadata.secp256k1.publicKey) {
                        throw new Error('secp256k1 public key not found in MPC metadata');
                    }
                    secp256k1PubKey = mpcMetadata.secp256k1.publicKey;
                    break;
                    
                case "60": // Ethereum
                case "137": // Polygon
                case "43114": // Avalanche
                    if (!mpcMetadata.ecdsa_tss || !mpcMetadata.ecdsa_tss.publicKey) {
                        throw new Error('ecdsa_tss public key not found in MPC metadata');
                    }
                    ecdsaTssPubKey = mpcMetadata.ecdsa_tss.publicKey;
                    break;
                    
                case "501": // Solana
                case "607": // TON
                    if (!mpcMetadata.ed25519 || !mpcMetadata.ed25519.publicKey) {
                        throw new Error('ed25519 public key not found in MPC metadata');
                    }
                    // Ed25519の場合は公開鍵からマスターシードを導出する必要がある
                    // 実際の実装では、MPC初期化時にマスターシードも保存するか、
                    // 公開鍵から適切にシードを復元する必要があります
                    ed25519MasterSeed = mpcMetadata.ed25519.publicKey; // 仮の実装
                    break;
                    
                default:
                    throw new Error(`Unsupported cointype: ${walletParams.cointype}`);
            }

            // 現在のネットワークを取得
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // 新しいアドレス生成器を使用して全アドレスを生成
            const allAddresses = await this.addressGenerator.generateAllAddresses(currentNetwork, secp256k1PubKey, ed25519MasterSeed, ecdsaTssPubKey);
            
            // P2WPKHではTaproot情報は不要（コメントアウト）
            // Taproot tweak情報をメタデータに保存
            // if (allAddresses.bitcoinTaprootInfo && this.mpc) {
            //     try {
            //         const masterId = walletParams.masterid || walletParams.masterId;
            //         if (masterId) {
            //             await this.mpc.storeTaprootTweakInfo(
            //                 masterId,
            //                 allAddresses.bitcoinTaprootInfo.taproot_internal_key,
            //                 allAddresses.bitcoinTaprootInfo.taproot_tweak,
            //                 allAddresses.bitcoinTaprootInfo.taproot_merkle_root
            //             );
            //             console.log("✅ Taproot tweak info stored to metadata");
            //         }
            //     } catch (error) {
            //         console.error("❌ Failed to store Taproot tweak info:", error);
            //         throw error; // フォールバックなし
            //     }
            // }
            
            // 指定されたコインタイプのアドレスを取得
            const addresses = this.getAddressForCoinType(allAddresses, walletParams.cointype, walletParams.productid);

            // 適切な公開鍵を選択
            let publicKey;
            let curve;
            if (walletParams.cointype === "0") {
                publicKey = secp256k1PubKey;
                curve = 'secp256k1';
            } else if (walletParams.cointype === "60" || walletParams.cointype === "137" || walletParams.cointype === "43114") {
                publicKey = ecdsaTssPubKey;
                curve = 'ecdsa_tss';
            } else {
                publicKey = ed25519MasterSeed;
                curve = 'ed25519';
            }

            const wallet = {
                walletid: addresses.primary,
                address: addresses.primary,
                publicKey: publicKey,
                // derivepath: HDWallet廃止により削除
                addressindex: "0",
                productid: walletParams.productid,
                cointype: walletParams.cointype,
                mpcEnabled: true,
                guardianAuthMethod: 'JWT', // Guardian NodeはJWT認証のみ
                allAddresses: allAddresses, // 全アドレス情報を保存
                curve: curve,
                createdAt: Date.now()
            };

            // ウォレット情報をストレージに保存
            await this.storage.storeWalletInfo(walletParams.masterid, walletParams.productid, wallet);

            console.log("MPC-integrated wallet created:", wallet.address);
            return wallet;

        } catch (error) {
            console.error("MPC wallet creation failed:", error);
            throw error;
        }
    }

    /**
     * コインタイプに応じたアドレスを取得
     */
    getAddressForCoinType(allAddresses, cointype, productid) {
        try {
            let blockchainName;
            let primaryAddress = null;
            let alternativeAddresses = {};

            switch (cointype) {
                case "0": // Bitcoin
                    blockchainName = 'bitcoin';
                    // MPCAddressGeneratorの実際の出力形式に対応
                    if (allAddresses.bitcoin) {
                        primaryAddress = allAddresses.bitcoin;
                        alternativeAddresses = {
                            p2pkh: allAddresses.bitcoin,
                            hash_direct: allAddresses.bitcoin,
                            force_compressed: allAddresses.bitcoin
                        };
                    }
                    break;

                case "60": // Ethereum
                    blockchainName = 'ethereum';
                    // MPCAddressGeneratorの実際の出力形式に対応
                    if (allAddresses.ethereum) {
                        primaryAddress = allAddresses.ethereum;
                        alternativeAddresses = {
                            standard_uncompressed: allAddresses.ethereum,
                            direct_use: allAddresses.ethereum,
                            keccak256_hash: allAddresses.ethereum
                        };
                    }
                    break;

                case "137": // Polygon
                    blockchainName = 'polygon';
                    // MPCAddressGeneratorの実際の出力形式に対応
                    if (allAddresses.polygon) {
                        primaryAddress = allAddresses.polygon;
                        alternativeAddresses = {
                            standard_uncompressed: allAddresses.polygon,
                            direct_use: allAddresses.polygon,
                            keccak256_hash: allAddresses.polygon
                        };
                    }
                    break;

                case "501": // Solana
                    blockchainName = 'solana';
                    // MPCAddressGeneratorの実際の出力形式に対応
                    if (allAddresses.solana) {
                        primaryAddress = allAddresses.solana;
                        alternativeAddresses = {
                            standard_processing: allAddresses.solana,
                            byte32_adjustment: allAddresses.solana
                        };
                    }
                    break;

                case "43114": // Avalanche (EVM互換、Ethereumと同じアドレス形式)
                    blockchainName = 'avalanche';
                    if (allAddresses.avalanche) {
                        primaryAddress = allAddresses.avalanche;
                        alternativeAddresses = {
                            standard_uncompressed: allAddresses.avalanche,
                            direct_use: allAddresses.avalanche,
                            keccak256_hash: allAddresses.avalanche
                        };
                    }
                    break;

                case "607": // TON
                    blockchainName = 'ton';
                    // MPCAddressGeneratorの実際の出力形式に対応
                    if (allAddresses.ton) {
                        primaryAddress = allAddresses.ton;
                        alternativeAddresses = {
                            standard_processing: allAddresses.ton,
                            byte32_adjustment: allAddresses.ton
                        };
                    }
                    break;

                default:
                    throw new Error(`Unsupported cointype: ${cointype}`);
            }

            if (!primaryAddress) {
                // エラー情報を詳細に出力
                const errors = allAddresses.errors || [];
                const errorDetails = errors.length > 0 ? ` Errors: ${errors.join(', ')}` : '';
                console.error("🔍 allAddresses structure:", allAddresses);
                console.error("🔍 blockchainName:", blockchainName);
                console.error("🔍 allAddresses[blockchainName]:", allAddresses[blockchainName]);
                throw new Error(`Failed to generate primary address for ${productid}.${errorDetails}`);
            }

            return {
                primary: primaryAddress,
                alternatives: alternativeAddresses,
                blockchain: blockchainName
            };

        } catch (error) {
            console.error("Error getting address for coin type:", error);
            throw error;
        }
    }

    /**
     * MPC公開鍵からブロックチェーンアドレス導出（改良版）
     */
    async deriveAddressesFromMPCPublicKey(publicKey, cointype, productid) {
        try {
            console.log(`🔍 Deriving address for ${productid} (cointype: ${cointype})`);
            
            // 新しいアドレス生成器を使用
            // 現在のネットワークを取得
        const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
        const allAddresses = await this.addressGenerator.generateAllAddresses(currentNetwork, publicKey, null);
            const addresses = this.getAddressForCoinType(allAddresses, cointype, productid);

            console.log(`✅ Address derived for ${productid}:`, addresses.primary);
            return addresses;

        } catch (error) {
            console.error("❌ Address derivation failed:", error);
            throw error;
        }
    }

    /**
     * 緊急復旧用：MPC公開鍵から全アドレスを再生成
     */
    async regenerateAllAddressesFromMPCPublicKey(mpcPublicKey) {
        try {
            console.log("🔍 Regenerating all addresses from MPC public key for emergency recovery...");
            
            // MPCメタデータから両方の公開鍵を取得
            const mpcMetadata = await this.storage.getMetadata(mpcPublicKey);
            if (!mpcMetadata) {
                throw new Error('MPC metadata not found for address regeneration');
            }

            // 両方の公開鍵パッケージから公開鍵を取得
            let secp256k1PublicKey = null;
            let ed25519PublicKey = null;

            // SECP256k1公開鍵の取得
            if (mpcMetadata.secp256k1?.publicKeyPackage?.verifying_key) {
                secp256k1PublicKey = mpcMetadata.secp256k1.publicKeyPackage.verifying_key;
                console.log("✅ SECP256k1 public key extracted from metadata");
            } else if (mpcMetadata.publicKey) {
                // フォールバック: 単一のpublicKeyフィールドから取得
                secp256k1PublicKey = mpcMetadata.publicKey;
                console.log("✅ SECP256k1 public key extracted from fallback publicKey field");
            }

            // ED25519公開鍵の取得
            if (mpcMetadata.ed25519?.publicKeyPackage?.verifying_key) {
                ed25519PublicKey = mpcMetadata.ed25519.publicKeyPackage.verifying_key;
                console.log("✅ ED25519 public key extracted from metadata");
            }

            if (!secp256k1PublicKey && !ed25519PublicKey) {
                throw new Error('No valid public keys found in MPC metadata for address regeneration');
            }

            console.log("📋 SECP256k1 public key:", secp256k1PublicKey?.substring(0, 20) + "...");
            console.log("📋 ED25519 public key:", ed25519PublicKey?.substring(0, 20) + "...");
            
            // 現在のネットワークを取得
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            const allAddresses = await this.addressGenerator.generateAllAddresses(currentNetwork, secp256k1PublicKey, ed25519PublicKey);
            
            console.log("✅ All addresses regenerated successfully");
            return allAddresses;

        } catch (error) {
            console.error("❌ Address regeneration failed:", error);
            throw error;
        }
    }

    /**
     * 緊急復旧用：特定のブロックチェーンアドレスを再生成
     */
    async regenerateAddressesForBlockchain(mpcPublicKey, blockchain) {
        try {
            console.log(`🔍 Regenerating ${blockchain} addresses for emergency recovery...`);
            
            // MPCメタデータから適切な公開鍵を取得
            const mpcMetadata = await this.storage.getMetadata(mpcPublicKey);
            if (!mpcMetadata) {
                throw new Error('MPC metadata not found for blockchain address regeneration');
            }

            let targetPublicKey = null;

            // ブロックチェーンに応じて適切な公開鍵を選択
            if (blockchain === 'BTC' || blockchain === 'ETH') {
                // SECP256k1ベースのブロックチェーン
                if (mpcMetadata.secp256k1?.publicKeyPackage?.verifying_key) {
                    targetPublicKey = mpcMetadata.secp256k1.publicKeyPackage.verifying_key;
                } else if (mpcMetadata.publicKey) {
                    targetPublicKey = mpcMetadata.publicKey;
                }
            } else if (blockchain === 'SOL' || blockchain === 'TON') {
                // ED25519ベースのブロックチェーン
                if (mpcMetadata.ed25519?.publicKeyPackage?.verifying_key) {
                    targetPublicKey = mpcMetadata.ed25519.publicKeyPackage.verifying_key;
                }
            }

            if (!targetPublicKey) {
                throw new Error(`No valid public key found for ${blockchain} address regeneration`);
            }

            console.log(`📋 Using ${blockchain} public key:`, targetPublicKey.substring(0, 20) + "...");
            
            // 既存のregenerateAddresses関数を使用（単一公開鍵対応）
            const addresses = await this.addressGenerator.regenerateAddresses(targetPublicKey, blockchain);
            
            console.log(`✅ ${blockchain} addresses regenerated successfully`);
            return addresses;

        } catch (error) {
            console.error(`❌ ${blockchain} address regeneration failed:`, error);
            throw error;
        }
    }

    /**
     * 緊急復旧用：元のMPC公開鍵を復元
     */
    async restoreMPCPublicKeyFromAddresses(addresses) {
        try {
            console.log("🔍 Restoring MPC public key from addresses for emergency recovery...");
            
            const restoredPublicKey = await this.addressGenerator.restoreMPCPublicKey(addresses);
            
            console.log("✅ MPC public key restored successfully");
            return restoredPublicKey;

        } catch (error) {
            console.error("❌ MPC public key restoration failed:", error);
            throw error;
        }
    }

    /**
     * ウォレット作成時の全アドレス生成（新機能）
     */
    async createWalletWithAllAddresses(walletParams) {
        try {
            console.log("Creating wallet with all addresses for:", walletParams.masterid);
            
            // MPCメタデータ取得
            const mpcMetadata = await this.storage.getMetadata(walletParams.masterid);
            if (!mpcMetadata) {
                throw new Error('MPC metadata not found. Please initialize MPC wallet first.');
            }

            // 両方の公開鍵パッケージから公開鍵を取得
            let secp256k1PublicKey = null;
            let ed25519PublicKey = null;

            // SECP256k1公開鍵の取得
            if (mpcMetadata.secp256k1?.publicKeyPackage?.verifying_key) {
                secp256k1PublicKey = mpcMetadata.secp256k1.publicKeyPackage.verifying_key;
                console.log("✅ SECP256k1 public key extracted from metadata");
            } else if (mpcMetadata.publicKey) {
                // フォールバック: 単一のpublicKeyフィールドから取得
                secp256k1PublicKey = mpcMetadata.publicKey;
                console.log("✅ SECP256k1 public key extracted from fallback publicKey field");
            }

            // ED25519公開鍵の取得
            if (mpcMetadata.ed25519?.publicKeyPackage?.verifying_key) {
                ed25519PublicKey = mpcMetadata.ed25519.publicKeyPackage.verifying_key;
                console.log("✅ ED25519 public key extracted from metadata");
            }

            if (!secp256k1PublicKey && !ed25519PublicKey) {
                throw new Error('No valid public keys found in MPC metadata for wallet creation');
            }

            console.log("📋 SECP256k1 public key:", secp256k1PublicKey?.substring(0, 20) + "...");
            console.log("📋 ED25519 public key:", ed25519PublicKey?.substring(0, 20) + "...");

            // 現在のネットワークを取得
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // 全アドレスを生成
            const allAddresses = await this.addressGenerator.generateAllAddresses(currentNetwork, secp256k1PublicKey, ed25519PublicKey);
            
            // 各ブロックチェーンのウォレットを作成
            const wallets = {};
            const supportedCoins = [
                { productId: 'BTC', coinType: '0', name: 'Bitcoin' },
                { productId: 'ETH', coinType: '60', name: 'Ethereum' },
                { productId: 'POL', coinType: '137', name: 'Polygon' },
                { productId: 'SOL', coinType: '501', name: 'Solana' },
                { productId: 'TON', coinType: '607', name: 'TON' }
            ];

            for (const coin of supportedCoins) {
                try {
                    const addresses = this.getAddressForCoinType(allAddresses, coin.coinType, coin.productId);
                    
                    const wallet = {
                        walletid: addresses.primary,
                        address: addresses.primary,
                        publicKey: mpcMetadata.publicKey,
                        // derivepath: HDWallet廃止により削除
                        addressindex: "0",
                        productid: coin.productId,
                        cointype: coin.coinType,
                        mpcEnabled: true,
                        guardianAuthMethod: 'JWT',
                        allAddresses: allAddresses,
                        alternatives: addresses.alternatives,
                        createdAt: Date.now()
                    };

                    wallets[coin.productId] = wallet;
                    
                    // ストレージに保存
                    await this.storage.storeWalletInfo(walletParams.masterid, coin.productId, wallet);
                    
                    console.log(`✅ ${coin.name} wallet created:`, wallet.address);

                } catch (error) {
                    console.error(`❌ Failed to create ${coin.name} wallet:`, error);
                    // エラーが発生しても他のウォレットの作成を続行
                }
            }

            console.log("✅ All wallets created successfully");
            return wallets;

        } catch (error) {
            console.error("❌ Wallet creation with all addresses failed:", error);
            throw error;
        }
    }

    /**
     * Jettonウォレットアドレス取得
     */
    async getJettonWalletAddress(ownerAddress, jettonMasterAddress) {
        try {
            const { TonWeb } = window;
            const tonweb = new TonWeb();
            
            // Jettonマスターコントラクトとウォレット所有者のアドレスを作成
            const masterAddress = new TonWeb.utils.Address(jettonMasterAddress);
            const ownerTonAddress = new TonWeb.utils.Address(ownerAddress);

            // Jettonウォレットアドレスを計算
            const JettonWalletClass = TonWeb.token.jetton.JettonWallet;
            const jettonWallet = new JettonWalletClass(tonweb.provider, {
                jettonMasterAddress: masterAddress,
                walletAddress: ownerTonAddress,
            });

            // アドレスを取得
            const jettonWalletAddress = await jettonWallet.getAddress();
            const base64Address = jettonWalletAddress.toString(true, true, true);
            
            console.log("Jetton Wallet Address:", base64Address);
            return base64Address;

        } catch (error) {
            console.error("Error getting Jetton wallet address:", error);
            throw error;
        }
    }

    /**
     * Jettonトランザクションセル作成
     */
    async createJettonTransactionCell(params) {
        try {
            const { from, to, amount, seqno, jettonMasterAddress, jettonWalletAddress } = params;
            const { beginCell, Address } = window.TonWeb.utils;
            
            // 送金額を適切な単位に変換（Jettonの場合は通常9桁の小数点）
            const jettonAmount = Math.floor(amount * 1e9);
            
            // Jetton転送メッセージボディを作成
            const transferBody = beginCell()
                .storeUint(0xf8a7ea5, 32) // transfer op
                .storeUint(0, 64) // query_id
                .storeCoins(jettonAmount) // amount
                .storeAddress(new Address(to)) // destination
                .storeAddress(new Address(from)) // response_destination
                .storeCoins(0.05 * 1e9) // forward_ton_amount (0.05 TON)
                .storeUint(0, 1) // forward_payload in this slice
                .endCell();
            
            // メッセージを作成
            const message = beginCell()
                .storeUint(0x18, 6) // 送信モード
                .storeAddress(new Address(jettonWalletAddress)) // Jettonウォレットアドレス
                .storeCoins(0.1 * 1e9) // 手数料用のTON（0.1 TON）
                .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1) // デフォルト値
                .storeRef(transferBody) // Jetton転送メッセージボディ
                .endCell();
            
            // トランザクションを作成
            const transaction = beginCell()
                .storeUint(0, 32) // 署名
                .storeUint(seqno, 32) // seqno
                .storeUint(0, 8) // 送信モード
                .storeRef(message) // メッセージ
                .endCell();
            
            return transaction;
        } catch (error) {
            console.error("Jetton transaction cell creation failed:", error);
            throw error;
        }
    }

    // ==========================================
    // 署名フォーマット変換（既存を維持）
    // ==========================================

    /**
     * P2WPKHアドレスかどうかを判定
     * @param {string} address - Bitcoinアドレス
     * @returns {boolean} P2WPKHアドレスの場合true
     */
    isP2WPKHAddress(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        const lower = address.toLowerCase();
        return lower.startsWith('bc1q') || lower.startsWith('tb1q');
    }

    /**
     * Taprootアドレスかどうかを判定
     * @param {string} address - Bitcoinアドレス
     * @returns {boolean} Taprootアドレスの場合true
     */
    isTaprootAddress(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        const lower = address.toLowerCase();
        return lower.startsWith('bc1p') || lower.startsWith('tb1p');
    }

    mpcSignatureToBitcoinDER(mpcSig, hashType = 0x01) {
        const r = Buffer.from(mpcSig.r, 'hex');
        const s = Buffer.from(mpcSig.s, 'hex');
        
        const rDer = r[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), r]) : r;
        const sDer = s[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), s]) : s;
        
        const der = Buffer.concat([
            Buffer.from([0x30]),
            Buffer.from([4 + rDer.length + sDer.length]),
            Buffer.from([0x02]),
            Buffer.from([rDer.length]),
            rDer,
            Buffer.from([0x02]),
            Buffer.from([sDer.length]),
            sDer,
            Buffer.from([hashType])
        ]);

        return der;
    }

    mpcSignatureToEthereum(mpcSig, chainId, messageHash = null, publicKey = null, expectedFromAddress = null, recidOverride = null) {
        // rとsから0xプレフィックスを削除してから正規化
        const rClean = mpcSig.r.replace(/^0x/, '');
        const sClean = mpcSig.s.replace(/^0x/, '');
        const r = '0x' + rClean.padStart(64, '0');
        const s = '0x' + sClean.padStart(64, '0');
        
        // ecdsa_tssの署名には既にvが含まれている可能性がある
        let v;
        if (mpcSig.v !== undefined) {
            // vが既に計算されている場合はそれを使用
            v = mpcSig.v;
        } else {
            // recidを計算
            let recid = recidOverride !== null ? recidOverride : mpcSig.recid;
            
            // recidOverrideが指定されている場合はそれを使用（buildSignedEthereumTransaction内で試行する場合）
            if (recidOverride !== null) {
                // recidOverrideを使用（そのまま）
                console.log(`🔧 Using recidOverride: ${recidOverride}`);
            }
            // expectedFromAddressが提供されている場合、それに一致するrecidを選択（後方互換性のため残す）
            else if ((recid === undefined || recid === null) && messageHash && expectedFromAddress) {
                try {
                    const { ethers } = window;
                    
                    // メッセージハッシュを正規化
                    const msgHash = messageHash.startsWith('0x') ? messageHash : '0x' + messageHash;
                    
                    // recidを0と1で試して、expectedFromAddressと一致する方を選択
                    let recoveredAddress0 = null, recoveredAddress1 = null;
                    if (!ethers.utils || !ethers.utils.recoverAddress) {
                        throw new Error('ethers.utils.recoverAddress is not available');
                    }
                    const sig0 = { r, s, recoveryParam: 0 };
                    const sig1 = { r, s, recoveryParam: 1 };
                    recoveredAddress0 = ethers.utils.recoverAddress(msgHash, sig0);
                    recoveredAddress1 = ethers.utils.recoverAddress(msgHash, sig1);
                    
                    const expectedAddrLower = expectedFromAddress.toLowerCase();
                    if (recoveredAddress0 && recoveredAddress0.toLowerCase() === expectedAddrLower) {
                        recid = 0;
                        console.log("🔧 Calculated recid: 0 (from expectedFromAddress)");
                    } else if (recoveredAddress1 && recoveredAddress1.toLowerCase() === expectedAddrLower) {
                        recid = 1;
                        console.log("🔧 Calculated recid: 1 (from expectedFromAddress)");
                    } else {
                        console.warn("⚠️ Could not determine recid from expectedFromAddress, using default 0");
                        recid = 0;
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to calculate recid from expectedFromAddress:", e);
                    recid = 0;
                }
            }
            // recidが未設定の場合、メッセージハッシュと公開鍵から計算
            else if ((recid === undefined || recid === null) && messageHash && publicKey) {
                try {
                    const { ethers } = window;
                    
                    // メッセージハッシュを正規化
                    const msgHash = messageHash.startsWith('0x') ? messageHash : '0x' + messageHash;
                    
                    // recidを0と1で試して、公開鍵から復元されたアドレスと一致する方を選択
                    let recoveredAddress0 = null, recoveredAddress1 = null;
                    if (!ethers.utils || !ethers.utils.recoverAddress) {
                        throw new Error('ethers.utils.recoverAddress is not available');
                    }
                    const sig0 = { r, s, recoveryParam: 0 };
                    const sig1 = { r, s, recoveryParam: 1 };
                    recoveredAddress0 = ethers.utils.recoverAddress(msgHash, sig0);
                    recoveredAddress1 = ethers.utils.recoverAddress(msgHash, sig1);
                    
                    // 公開鍵からアドレスを計算
                    let expectedAddress = null;
                    if (publicKey.startsWith('0x')) {
                        expectedAddress = ethers.utils.computeAddress(publicKey);
                    } else {
                        expectedAddress = ethers.utils.computeAddress('0x' + publicKey);
                    }
                    
                    const expectedAddrLower = expectedAddress.toLowerCase();
                    if (recoveredAddress0 && recoveredAddress0.toLowerCase() === expectedAddrLower) {
                        recid = 0;
                        console.log("🔧 Calculated recid: 0 (from publicKey)");
                    } else if (recoveredAddress1 && recoveredAddress1.toLowerCase() === expectedAddrLower) {
                        recid = 1;
                        console.log("🔧 Calculated recid: 1 (from publicKey)");
                    } else {
                        console.warn("⚠️ Could not determine recid from publicKey, using default 0");
                        recid = 0;
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to calculate recid from publicKey:", e);
                    recid = 0;
                }
            } else if (recid === undefined || recid === null) {
                // recidが未設定で、メッセージハッシュや公開鍵もない場合、デフォルトで0を使用
                recid = 0;
                console.warn("⚠️ recid not provided and messageHash/publicKey/expectedFromAddress not available, using default 0");
            }
            
            // recidからvを計算（EIP-155形式）
            v = chainId * 2 + 35 + recid;
        }
        
        return { r, s, v };
    }

    mpcSignatureToPolygon(mpcSig, chainId, messageHash = null, publicKey = null, expectedFromAddress = null, recidOverride = null) {
        // rとsから0xプレフィックスを削除してから正規化
        const rClean = mpcSig.r.replace(/^0x/, '');
        const sClean = mpcSig.s.replace(/^0x/, '');
        const r = '0x' + rClean.padStart(64, '0');
        const s = '0x' + sClean.padStart(64, '0');
        
        // ecdsa_tssの署名には既にvが含まれている可能性がある
        let v;
        if (mpcSig.v !== undefined) {
            // vが既に計算されている場合はそれを使用
            v = mpcSig.v;
        } else {
            // recidを計算
            let recid = recidOverride !== null ? recidOverride : mpcSig.recid;
            
            // recidOverrideが指定されている場合はそれを使用（buildSignedPolygonTransaction内で試行する場合）
            if (recidOverride !== null) {
                // recidOverrideを使用（そのまま）
                console.log(`🔧 Using recidOverride: ${recidOverride}`);
            }
            
            // expectedFromAddressが提供されている場合、それに一致するrecidを選択
            if ((recid === undefined || recid === null) && messageHash && expectedFromAddress) {
                try {
                    const { ethers } = window;
                    
                    // メッセージハッシュを正規化
                    const msgHash = messageHash.startsWith('0x') ? messageHash : '0x' + messageHash;
                    
                    // recidを0と1で試して、expectedFromAddressと一致する方を選択
                    let recoveredAddress0 = null, recoveredAddress1 = null;
                    if (!ethers.utils || !ethers.utils.recoverAddress) {
                        throw new Error('ethers.utils.recoverAddress is not available');
                    }
                    const sig0 = { r, s, recoveryParam: 0 };
                    const sig1 = { r, s, recoveryParam: 1 };
                    recoveredAddress0 = ethers.utils.recoverAddress(msgHash, sig0);
                    recoveredAddress1 = ethers.utils.recoverAddress(msgHash, sig1);
                    
                    const expectedAddrLower = expectedFromAddress.toLowerCase();
                    if (recoveredAddress0 && recoveredAddress0.toLowerCase() === expectedAddrLower) {
                        recid = 0;
                        console.log("🔧 Calculated recid: 0 (from expectedFromAddress)");
                    } else if (recoveredAddress1 && recoveredAddress1.toLowerCase() === expectedAddrLower) {
                        recid = 1;
                        console.log("🔧 Calculated recid: 1 (from expectedFromAddress)");
                    } else {
                        console.warn("⚠️ Could not determine recid from expectedFromAddress, using default 0");
                        recid = 0;
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to calculate recid from expectedFromAddress:", e);
                    recid = 0;
                }
            }
            // recidが未設定の場合、メッセージハッシュと公開鍵から計算
            else if ((recid === undefined || recid === null) && messageHash && publicKey) {
                try {
                    const { ethers } = window;
                    
                    // メッセージハッシュを正規化
                    const msgHash = messageHash.startsWith('0x') ? messageHash : '0x' + messageHash;
                    
                    // recidを0と1で試して、公開鍵から復元されたアドレスと一致する方を選択
                    let recoveredAddress0 = null, recoveredAddress1 = null;
                    if (!ethers.utils || !ethers.utils.recoverAddress) {
                        throw new Error('ethers.utils.recoverAddress is not available');
                    }
                    const sig0 = { r, s, recoveryParam: 0 };
                    const sig1 = { r, s, recoveryParam: 1 };
                    recoveredAddress0 = ethers.utils.recoverAddress(msgHash, sig0);
                    recoveredAddress1 = ethers.utils.recoverAddress(msgHash, sig1);
                    
                    // 公開鍵からアドレスを計算
                    let expectedAddress = null;
                    if (publicKey.startsWith('0x')) {
                        expectedAddress = ethers.utils.computeAddress(publicKey);
                    } else {
                        expectedAddress = ethers.utils.computeAddress('0x' + publicKey);
                    }
                    
                    const expectedAddrLower = expectedAddress.toLowerCase();
                    if (recoveredAddress0 && recoveredAddress0.toLowerCase() === expectedAddrLower) {
                        recid = 0;
                        console.log("🔧 Calculated recid: 0 (from publicKey)");
                    } else if (recoveredAddress1 && recoveredAddress1.toLowerCase() === expectedAddrLower) {
                        recid = 1;
                        console.log("🔧 Calculated recid: 1 (from publicKey)");
                    } else {
                        console.warn("⚠️ Could not determine recid from publicKey, using default 0");
                        recid = 0;
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to calculate recid from publicKey:", e);
                    recid = 0;
                }
            } else if (recid === undefined || recid === null) {
                // recidが未設定で、メッセージハッシュや公開鍵もない場合、デフォルトで0を使用
                recid = 0;
                console.warn("⚠️ recid not provided and messageHash/publicKey/expectedFromAddress not available, using default 0");
            }
            
            // recidからvを計算（EIP-155形式）
            v = chainId * 2 + 35 + recid;
        }
        
        return { r, s, v };
    }

    mpcSignatureToSolana(mpcSig) {
        return Buffer.concat([
            Buffer.from(mpcSig.r, 'hex'),
            Buffer.from(mpcSig.s, 'hex')
        ]);
    }

    mpcSignatureToTONBOC(mpcSig, txCell) {
        const signature = Buffer.concat([
            Buffer.from(mpcSig.r, 'hex'),
            Buffer.from(mpcSig.s, 'hex')
        ]);

        const { beginCell } = window.TonWeb.utils;
        const signedCell = beginCell()
            .storeBuffer(signature)
            .storeRef(txCell)
            .endCell();

        return signedCell.toBoc().toString('base64');
    }

    // ==========================================
    // ブロックチェーン操作（既存を維持）
    // ==========================================


    async getBTCUTXOs(address) {
        try {
            const utxos = await this.proxyRequest(this.endpoints.bitcoin, `/address/${address}/utxo`);
            
            for (let utxo of utxos) {
                const hex = await this.proxyRequest(this.endpoints.bitcoin, `/tx/${utxo.txid}/hex`);
                utxo.hex = hex;
            }
            
            console.log(`BTC UTXOs for ${address}: ${utxos.length} UTXOs (network: ${this.network})`);
            return utxos;
        } catch (error) {
            console.error("Error fetching UTXOs:", error);
            throw error;
        }
    }

    /**
     * ネットワーク対応のBitcoin UTXO取得
     */
    async getBitcoinUTXOsForNetwork(address, networkType) {
        try {
            const endpoints = this.getNetworkSpecificEndpoints(networkType);
            const utxos = await this.proxyRequest(endpoints.bitcoin, `/address/${address}/utxo`);
            
            for (let utxo of utxos) {
                const hex = await this.proxyRequest(endpoints.bitcoin, `/tx/${utxo.txid}/hex`);
                utxo.hex = hex;
            }
            
            console.log(`BTC UTXOs for ${address}: ${utxos.length} UTXOs (network: ${networkType})`);
            return utxos;
        } catch (error) {
            console.error(`Error fetching BTC UTXOs for network ${networkType}:`, error);
            throw error;
        }
    }

    estimateBTCFee(inputs, outputs, feeRate) {
        const txSize = inputs * 148 + outputs * 34 + 10;
        return Math.ceil(txSize * feeRate);
    }

    async broadcastBTCTransaction(transaction) {
        try {
            const hex = transaction.toHex();
            const result = await this.proxyRequest(this.endpoints.bitcoin, `/tx`, {
                method: 'POST',
                contentType: 'text/plain',
                body: hex
            });
            
            return result;
        } catch (error) {
            console.error("Broadcasting failed:", error);
            throw error;
        }
    }

    // ==========================================
    // ユーティリティ関数（既存を維持）
    // ==========================================

    /**
     * MPC ウォレット情報取得（統合版）
     */
    async getMPCWalletInfo(masterId, productId) {
        try {
            // まずセッションストレージから取得（通常のケース、高速）
            // ネットワーク情報を含むキー形式を使用（wallet.0.<network>.<productId>）
            const network = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            const normalizedNetwork = network === 'testnet' ? 'testnet' : 'mainnet';
            
            // ネットワーク情報を含むキーで試す
            let prefix = `wallet.0.${normalizedNetwork}.${productId}`;
            let address = sessionStorage.getItem(`${prefix}.address`);
            let publicKey = sessionStorage.getItem(`${prefix}.publicKey`);
            // let derivepath = sessionStorage.getItem(`${prefix}.derivepath`); // HDWallet廃止により削除
            let addressindex = sessionStorage.getItem(`${prefix}.addressindex`);
            
            // セッションストレージに必要な情報があれば返す
            if (address && publicKey) {
                return {
                    masterId,
                    productId,
                    address,
                    publicKey,
                    // derivepath: HDWallet廃止により削除
                    addressindex: addressindex || "0"
                };
            }

            // セッションストレージになければIndexedDBから取得（永続化されたデータ）
            const walletInfo = await this.storage.getWalletInfo(masterId, productId);
            if (walletInfo) {
                return walletInfo;
            }
            
            // どちらにも見つからない場合はエラー
            throw new Error(`No wallet info found for ${productId} (tried sessionStorage wallet.0.${normalizedNetwork}.${productId} and IndexedDB)`);

        } catch (error) {
            console.error(`Failed to get MPC wallet info for ${productId}:`, error);
            throw error;
        }
    }

    hexToBuffer(hex) {
        if (!hex || typeof hex !== 'string') {
            throw new Error(`Invalid hex string: ${hex}`);
        }
        
        console.log(`🔍 hexToBuffer input:`, hex);
        console.log(`🔍 hexToBuffer input length:`, hex.length);
        
        // 0xプレフィックスを削除
        const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
        console.log(`🔍 Cleaned hex:`, cleanHex);
        console.log(`🔍 Cleaned hex length:`, cleanHex.length);
        
        // 16進数文字列の長さが偶数の場合のみ処理
        if (cleanHex.length % 2 !== 0) {
            throw new Error(`Invalid hex string length: ${cleanHex.length} (must be even)`);
        }
        
        // 16進数文字の妥当性をチェック
        if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
            throw new Error(`Invalid hex characters in string: ${cleanHex}`);
        }
        
        const buffer = Buffer.from(cleanHex, 'hex');
        console.log(`🔍 Created buffer length:`, buffer.length);
        console.log(`🔍 Buffer first byte: 0x${buffer[0]?.toString(16)}`);
        console.log(`🔍 Buffer last byte: 0x${buffer[buffer.length - 1]?.toString(16)}`);
        
        return buffer;
    }

    decompressPublicKey(compressed) {
        try {
            console.log(`🔍 Decompressing public key, input length: ${compressed.length}`);
            
            // 圧縮公開鍵の形式を確認（33バイト、最初のバイトが0x02または0x03）
            if (compressed.length !== 33) {
                throw new Error(`Invalid compressed public key length: ${compressed.length} (expected 33 bytes)`);
            }
            
            const prefix = compressed[0];
            if (prefix !== 0x02 && prefix !== 0x03) {
                throw new Error(`Invalid compressed public key prefix: 0x${prefix.toString(16)} (expected 0x02 or 0x03)`);
            }
            
            // 簡略版の公開鍵展開（実際の実装では楕円曲線計算が必要）
            // ここでは、圧縮公開鍵をそのまま返す（テスト用）
            console.log(`⚠️ Using simplified decompression (returning compressed key as-is)`);
            console.log(`🔍 Compressed key prefix: 0x${prefix.toString(16)}`);
            
            // 実際の実装では、secp256k1の楕円曲線計算を使用して公開鍵を展開する必要があります
            // 現在は簡略版として、圧縮公開鍵をそのまま返します
            
            return compressed;
            
        } catch (error) {
            console.error(`❌ Public key decompression failed:`, error);
            throw error;
        }
    }

    publicKeyToSolanaAddress(pubKeyBuffer) {
        const { PublicKey } = window.SolanaWeb3;
        return new PublicKey(pubKeyBuffer).toBase58();
    }

    async publicKeyToTONAddress(pubKeyBuffer) {
        const { TonWeb } = window;
        const keyPair = {
            publicKey: pubKeyBuffer,
            secretKey: null
        };
        
        const WalletClass = TonWeb.wallet.all['v4R2'];
        const wallet = new WalletClass(null, { publicKey: keyPair.publicKey });
        const address = await wallet.getAddress();
        
        return address.toString(true, true, true);
    }

    // TON関連のプレースホルダー実装
    async createTONTransactionCell(params) {
        try {
            const { from, to, amount, seqno } = params;
            const { beginCell, Address } = window.TonWeb.utils;
            
            // 送金額をnanotonsに変換
            const nanotons = Math.floor(amount * 1e9);
            
            // メッセージボディを作成
            const messageBody = beginCell()
                .storeUint(0, 32) // op (0 = simple transfer)
                .storeStringTail('') // comment (空文字列)
                .endCell();
            
            // メッセージを作成
            const message = beginCell()
                .storeUint(0x18, 6) // 送信モード
                .storeAddress(new Address(to)) // 送信先アドレス
                .storeCoins(nanotons) // 送金額
                .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1) // デフォルト値
                .storeRef(messageBody) // メッセージボディ
                .endCell();
            
            // トランザクションを作成
            const transaction = beginCell()
                .storeUint(0, 32) // 署名
                .storeUint(seqno, 32) // seqno
                .storeUint(0, 8) // 送信モード
                .storeRef(message) // メッセージ
                .endCell();
            
            return transaction;
        } catch (error) {
            console.error("TON transaction cell creation failed:", error);
            throw error;
        }
    }

    /**
     * TON署名付きトランザクション送信
     */

    // ==========================================
    // JWT認証とプロキシリクエスト（新機能）
    // ==========================================

    /**
     * JWTトークンを取得
     */
    async obtainJWT(masterId, operation = 'blockchain_access') {
        try {
            console.log(`🔐 Requesting JWT for ${operation}...`);
            
            const response = await fetch(`${this.serverUrls.bitvoyServer}/mpcapi/jwt/obtain`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    masterId: masterId,
                    operation: operation,
                    context: {
                        blockchain: 'all',
                        network: this.network
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`JWT acquisition failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.success || !data.jwt) {
                throw new Error('Invalid JWT response');
            }

            console.log(`✅ JWT obtained successfully for ${operation}`);
            return data.jwt;

        } catch (error) {
            console.error(`❌ JWT acquisition failed:`, error);
            throw error;
        }
    }

    /**
     * プロキシ経由でブロックチェーンAPIにアクセス
     */
    async proxyRequest(endpoint, path, options = {}) {
        try {
            // 現在のmasterIdを取得（セッションストレージから）
            const masterId = sessionStorage.getItem('mpc.masterid');
            if (!masterId) {
                throw new Error('No masterId found in session storage');
            }

            // JWTトークンを取得
            const jwt = await this.obtainJWT(masterId, 'blockchain_access');

            // リクエストオプションを準備
            const requestOptions = {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': options.contentType || 'application/json',
                    'Authorization': `Bearer ${jwt}`,
                    ...options.headers
                },
                ...options
            };

            // ボディがある場合は追加
            if (options.body) {
                requestOptions.body = typeof options.body === 'string' ? 
                    options.body : JSON.stringify(options.body);
            }

            // 現在のネットワークを取得（sessionStorageから優先、なければthis.network）
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || this.network;
            const currentEndpoints = this.getNetworkSpecificEndpoints(currentNetwork);
            
            // エンドポイントを現在のネットワークに合わせて調整
            // endpointが既にネットワーク別（polygon-amoyなど）の場合はそのまま使用
            // そうでない場合は、現在のネットワークに基づいて適切なエンドポイントに置き換え
            let actualEndpoint = endpoint;
            
            // エンドポイントパスからブロックチェーンを判定
            if (endpoint.includes('/polygon')) {
                actualEndpoint = endpoint.includes('-amoy') ? endpoint : currentEndpoints.polygon;
            } else if (endpoint.includes('/avalanche')) {
                actualEndpoint = currentEndpoints.avalanche || endpoint;
            } else if (endpoint.includes('/ethereum')) {
                actualEndpoint = endpoint.includes('-sepolia') ? endpoint : currentEndpoints.ethereum;
            } else if (endpoint.includes('/bitcoin')) {
                actualEndpoint = endpoint.includes('-testnet') ? endpoint : currentEndpoints.bitcoin;
            } else if (endpoint.includes('/solana')) {
                actualEndpoint = endpoint.includes('-testnet') ? endpoint : currentEndpoints.solana;
            } else if (endpoint.includes('/ton')) {
                actualEndpoint = endpoint.includes('-testnet') ? endpoint : currentEndpoints.ton;
            }
            
            // エンドポイントからnetworkパラメータを抽出（既に含まれている場合）
            let endpointUrl = actualEndpoint;
            let networkParam = '';
            const networkMatch = endpointUrl.match(/[?&]network=([^&]+)/);
            if (networkMatch) {
                networkParam = networkMatch[1];
                // エンドポイントからnetworkパラメータをすべて削除（複数ある場合も対応）
                endpointUrl = endpointUrl.replace(/[?&]network=[^&]+/g, '');
                endpointUrl = endpointUrl.replace(/\?$/, ''); // 末尾の?を削除
                endpointUrl = endpointUrl.replace(/&$/, ''); // 末尾の&を削除
            }
            
            // パスにnetworkパラメータを追加（パスまたはエンドポイントに既にnetworkパラメータが含まれている場合は追加しない）
            let fullPath = path;
            if (networkParam) {
                // パスに既にnetworkパラメータが含まれているかチェック
                const pathHasNetwork = path.match(/[?&]network=/);
                // エンドポイントURLに既にnetworkパラメータが含まれているかチェック（削除漏れ防止）
                const endpointHasNetwork = endpointUrl.match(/[?&]network=/);
                if (!pathHasNetwork && !endpointHasNetwork) {
                    // パスにもエンドポイントにもnetworkパラメータがない場合のみ追加
                    const pathSeparator = path.includes('?') ? '&' : '?';
                    fullPath = `${path}${pathSeparator}network=${networkParam}`;
                }
            }
            
            const url = `${endpointUrl}${fullPath}`;
            const response = await fetch(url, requestOptions);

            // レスポンスの形式を判定してボディを読み取る
            const contentType = response.headers.get('content-type');
            let responseData;
            if (contentType && contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                responseData = await response.text();
            }

            // エラーチェック（サーバーがsuccess: falseを返す場合も含む）
            if (!response.ok || (typeof responseData === 'object' && responseData.success === false)) {
                // エラーレスポンスのボディからエラーメッセージを抽出
                let errorMessage = `Proxy request failed: ${response.status} ${response.statusText}`;
                
                if (typeof responseData === 'object' && responseData !== null) {
                    // サーバーからのエラーメッセージを抽出
                    if (responseData.error) {
                        errorMessage = responseData.error;
                    } else if (responseData.message) {
                        errorMessage = responseData.message;
                    }
                } else if (typeof responseData === 'string') {
                    errorMessage = responseData;
                }
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.response = response;
                error.responseData = responseData;
                throw error;
            }

            return responseData;

        } catch (error) {
            console.error(`❌ Proxy request failed:`, error);
            throw error;
        }
    }

    // ==========================================
    // トランザクション構築メソッド
    // ==========================================

    /**
     * Bitcoinトランザクション構築
     */
    async buildBitcoinTransaction(fromAddress, toAddress, amount, feeLevel) {
        try {
            console.log("Building Bitcoin transaction:", { fromAddress, toAddress, amount, feeLevel });
            
            // 1. UTXO取得
            const utxos = await this.getBitcoinUTXOs(fromAddress);
            console.log("UTXOs:", utxos);
            
            // 2. 手数料計算
            const feeRate = await this.getBitcoinFeeRate(feeLevel);
            console.log("Fee rate:", feeRate);
            
            // 3. トランザクション構築
            const transaction = await this.buildBitcoinRawTransaction(fromAddress, utxos, toAddress, amount, feeRate);
            console.log("Raw transaction:", transaction);
            
            return {
                unsignedTx: transaction.hex,
                messageHash: transaction.messageHash,
                fee: transaction.fee,
                utxos: utxos
            };
            
        } catch (error) {
            console.error("Bitcoin transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Ethereumトランザクション構築
     */
    async buildEthereumTransaction(fromAddress, toAddress, amount, feeLevel, productId = null, idempotencyKey = null) {
        try {
            console.log("Building Ethereum transaction:", { fromAddress, toAddress, amount, feeLevel, productId, idempotencyKey });
            
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // 1. ガス価格取得（資金チェックに必要）
            const gasPrice = await this.getEthereumGasPrice(feeLevel);
            console.log("Gas price:", gasPrice);
            
            // 2. ガス制限推定（資金チェックに必要）
            const gasLimit = await this.estimateEthereumGas(fromAddress, toAddress, amount);
            console.log("Gas limit:", gasLimit);
            
            // 3. 必要な資金額を計算（value + gasPrice * gasLimit）
            const valueWei = ethers.utils.parseEther(amount.toString());
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const maxFeeWei = gasPriceWei.mul(gasLimit);
            const requiredFundsWei = valueWei.add(maxFeeWei);
            
            console.log(`💰 Required funds calculation: value=${valueWei.toString()} Wei + gas=${maxFeeWei.toString()} Wei = ${requiredFundsWei.toString()} Wei`);
            
            // 4. 残高を取得してチェック
            const balanceResponse = await this.proxyRequest(
                this.endpoints.ethereum,
                `/address/${fromAddress}`
            );
            
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const balanceHex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result || balanceResponse.data;
                balanceWei = BigInt(balanceHex);
            }
            
            console.log(`💰 Current balance: ${balanceWei.toString()} Wei`);
            
            // 5. 資金不足チェック
            if (balanceWei < BigInt(requiredFundsWei.toString())) {
                const balanceEth = Number(balanceWei) / 1e18;
                const requiredEth = Number(requiredFundsWei) / 1e18;
                throw new Error(`Insufficient funds: required ${requiredEth} ETH (${requiredFundsWei.toString()} Wei), but balance is ${balanceEth} ETH (${balanceWei.toString()} Wei). Nonce reservation skipped.`);
            }
            
            console.log(`✅ Funds check passed: ${balanceWei.toString()} Wei >= ${requiredFundsWei.toString()} Wei`);
            
            // 6. ノンス取得（資金チェック通過後）
            const nonce = await this.getEthereumNonce(fromAddress, idempotencyKey, requiredFundsWei.toString());
            console.log("Nonce:", nonce);
            
            // 7. トランザクション構築
            const transaction = await this.buildEthereumRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId);
            console.log("Raw transaction:", transaction);
            
            return {
                unsignedTx: transaction.tx, // トランザクションオブジェクトを返す
                messageHash: transaction.messageHash,
                gasPrice: gasPrice,
                gasLimit: gasLimit
            };
            
        } catch (error) {
            console.error("Ethereum transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Ethereum ERC20トークン送金トランザクション構築
     */
    async buildEthereumERC20Transaction(fromAddress, toAddress, contractAddress, amount, decimals, feeLevel, productId = null, idempotencyKey = null) {
        try {
            console.log("Building Ethereum ERC20 transaction:", { fromAddress, toAddress, contractAddress, amount, decimals, feeLevel, productId, idempotencyKey });
            
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // 1. ガス価格取得（資金チェックに必要）
            let gasPrice = await this.getEthereumGasPrice(feeLevel);
            console.log("Initial gas price:", gasPrice);
            
            // 2. replacement transaction対策: ガス価格を10%増やす
            gasPrice = Math.ceil(gasPrice * 1.1); // 10%増
            console.log("Adjusted gas price (10% increase for replacement protection):", gasPrice);
            
            // 3. ERC20 transfer関数の呼び出しデータを生成（ガス推定に必要）
            // transfer(address to, uint256 amount)
            const transferInterface = new ethers.utils.Interface([
                'function transfer(address to, uint256 amount) returns (bool)'
            ]);
            
            // 送金額をトークンの最小単位に変換（decimals考慮）
            const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);
            
            // transfer関数の呼び出しデータを生成
            const transferData = transferInterface.encodeFunctionData('transfer', [toAddress, amountWei]);
            
            console.log("ERC20 transfer data:", transferData);
            
            // 4. ガス制限推定（ERC20トークン送金用、資金チェックに必要）
            const gasLimit = await this.estimateEthereumERC20Gas(fromAddress, contractAddress, transferData);
            console.log("Gas limit:", gasLimit);
            
            // 5. トークン残高をチェック
            const tokenBalanceResponse = await this.proxyRequest(
                this.endpoints.ethereum,
                `?network=${sessionStorage.getItem('mpc.current_network') || 'mainnet'}`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method: 'eth_call',
                        params: [{
                            to: contractAddress,
                            data: '0x70a08231' + fromAddress.slice(2).padStart(64, '0') // balanceOf(address)
                        }, 'latest']
                    })
                }
            );
            
            let tokenBalanceWei = BigInt(0);
            if (tokenBalanceResponse && tokenBalanceResponse.data) {
                const tokenBalanceHex = typeof tokenBalanceResponse.data === 'string' 
                    ? tokenBalanceResponse.data 
                    : tokenBalanceResponse.data.result || tokenBalanceResponse.data;
                if (tokenBalanceHex && tokenBalanceHex !== '0x') {
                    tokenBalanceWei = BigInt(tokenBalanceHex);
                }
            }
            
            console.log(`💰 Token balance: ${tokenBalanceWei.toString()} (raw), required: ${amountWei.toString()}`);
            
            // 6. トークン残高不足チェック
            if (tokenBalanceWei < BigInt(amountWei.toString())) {
                const tokenBalance = Number(tokenBalanceWei) / (10 ** decimals);
                const requiredAmount = Number(amountWei) / (10 ** decimals);
                throw new Error(`Insufficient token balance: required ${requiredAmount}, but balance is ${tokenBalance}. Nonce reservation skipped.`);
            }
            
            console.log(`✅ Token balance check passed: ${tokenBalanceWei.toString()} >= ${amountWei.toString()}`);
            
            // 7. ネイティブガス残高をチェック（ガス代のみ）
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const maxFeeWei = gasPriceWei.mul(gasLimit);
            const requiredGasWei = maxFeeWei;
            
            console.log(`💰 Required gas funds: ${requiredGasWei.toString()} Wei`);
            
            const balanceResponse = await this.proxyRequest(
                this.endpoints.ethereum,
                `/address/${fromAddress}`
            );
            
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const balanceHex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result || balanceResponse.data;
                balanceWei = BigInt(balanceHex);
            }
            
            console.log(`💰 Current ETH balance: ${balanceWei.toString()} Wei`);
            
            // 8. ネイティブガス残高不足チェック
            if (balanceWei < BigInt(requiredGasWei.toString())) {
                const balanceEth = Number(balanceWei) / 1e18;
                const requiredEth = Number(requiredGasWei) / 1e18;
                throw new Error(`Insufficient ETH for gas: required ${requiredEth} ETH (${requiredGasWei.toString()} Wei), but balance is ${balanceEth} ETH (${balanceWei.toString()} Wei). Nonce reservation skipped.`);
            }
            
            console.log(`✅ Gas funds check passed: ${balanceWei.toString()} Wei >= ${requiredGasWei.toString()} Wei`);
            
            // 9. ノンス取得（資金チェック通過後）
            const nonce = await this.getEthereumNonce(fromAddress, idempotencyKey, requiredGasWei.toString());
            console.log("🔍 Nonce obtained for ERC20 transfer:", nonce, `(type: ${typeof nonce})`);
            
            // nonceが数値でない、または0未満の場合はエラー
            if (typeof nonce !== 'number' || isNaN(nonce) || nonce < 0) {
                throw new Error(`Invalid nonce value: ${nonce} (type: ${typeof nonce})`);
            }
            
            // 10. トランザクション構築
            // ネットワーク判定: network設定のみで判定
            let currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // network設定で判定
            if (this.isTestnet) {
                currentNetwork = 'testnet';
                console.log(`🔷 Using BitVoyWallet network setting: ${this.network}`);
            }
            
            let chainId;
            if (currentNetwork === 'testnet') {
                chainId = 11155111; // Sepolia
                console.log('🔷 Using Ethereum Sepolia testnet (chainId: 11155111)');
            } else {
                chainId = 1; // Ethereum Mainnet
                console.log('🔷 Using Ethereum Mainnet (chainId: 1)');
            }
            
            const gasLimitBN = ethers.BigNumber.from(gasLimit);
            
            console.log(`🔍 Building ERC20 transaction with nonce: ${nonce} (type: ${typeof nonce})`);
            
            // トランザクションオブジェクトを構築（toはコントラクトアドレス、dataはtransfer関数の呼び出しデータ）
            const tx = {
                to: contractAddress,
                value: ethers.BigNumber.from(0), // ERC20トークン送金なのでvalueは0
                nonce: nonce,
                gasPrice: gasPriceWei,
                gasLimit: gasLimitBN,
                chainId: chainId,
                data: transferData // ERC20 transfer関数の呼び出しデータ
            };
            
            console.log(`🔍 Transaction object before serialization:`, {
                nonce: tx.nonce,
                nonceType: typeof tx.nonce,
                to: tx.to,
                chainId: tx.chainId
            });
            
            // トランザクションをシリアライズ（署名なし）
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash = ethers.utils.keccak256(serializedTx);
            
            console.log('🔧 Built Ethereum ERC20 transaction:', {
                to: contractAddress,
                amount: amount,
                decimals: decimals,
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                chainId: chainId,
                messageHash: messageHash
            });
            
            return {
                unsignedTx: tx, // トランザクションオブジェクト
                messageHash: messageHash,
                gasPrice: gasPrice,
                gasLimit: gasLimit
            };
            
        } catch (error) {
            console.error("Ethereum ERC20 transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Ethereum ERC20トークン送金のガス制限推定
     */
    async estimateEthereumERC20Gas(fromAddress, contractAddress, data) {
        try {
            // ネットワーク判定: BitVoyWalletの初期化時のネットワーク設定を優先
            // sessionStorageも確認して、より確実に判定
            let currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            if (this.isTestnet) {
                currentNetwork = 'testnet';
            }
            
            // this.endpoints.ethereumには既にnetworkが含まれている（例: /proxyapi/blockchain/ethereum/mainnet）
            const proxyBase = this.endpoints.ethereum;
            
            console.log(`⛽ Estimating gas for Ethereum ERC20 transfer:`, {
                from: fromAddress,
                to: contractAddress,
                proxyBase: proxyBase,
                walletNetwork: this.network,
                isTestnet: this.isTestnet
            });
            
            // proxyBaseには既にnetworkが含まれているため、直接/estimateGasを追加
            // 例: /proxyapi/blockchain/ethereum/mainnet/estimateGas
            const response = await fetch(`${proxyBase}/estimateGas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: fromAddress,
                    to: contractAddress,
                    data: data
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Gas estimation failed: HTTP ${response.status}`, errorText);
                throw new Error(`Gas estimation failed: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.success && result.gasLimit) {
                const gasLimit = parseInt(result.gasLimit, 10);
                console.log(`✅ Gas estimation successful: ${gasLimit}`);
                return gasLimit;
            }
            
            console.warn('⚠️ Gas estimation response missing gasLimit, using default');
            // フォールバック: ERC20トークン送金の標準ガス制限
            return 65000;
            
        } catch (error) {
            console.error("Failed to estimate Ethereum ERC20 gas:", error);
            // フォールバック: ERC20トークン送金の標準ガス制限
            return 65000;
        }
    }

    /**
     * Polygonトランザクション構築
     */
    async buildPolygonTransaction(fromAddress, toAddress, amount, feeLevel, productId = null, idempotencyKey = null) {
        try {
            console.log("Building Polygon transaction:", { fromAddress, toAddress, amount, feeLevel, productId, idempotencyKey });
            
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // 1. ガス価格取得（資金チェックに必要）
            let gasPrice = await this.getPolygonGasPrice(feeLevel);
            console.log("Initial gas price:", gasPrice);
            
            // 2. replacement transaction対策: ガス価格を10%増やす（既存のpendingトランザクションよりも高いガス価格を保証）
            // これにより、"replacement transaction underpriced"エラーを防ぐ
            gasPrice = Math.ceil(gasPrice * 1.1); // 10%増
            console.log("Adjusted gas price (10% increase for replacement protection):", gasPrice);
            
            // 3. ガス制限推定（資金チェックに必要）
            const gasLimit = await this.estimatePolygonGas(fromAddress, toAddress, amount);
            console.log("Gas limit:", gasLimit);
            
            // 4. 必要な資金額を計算（value + gasPrice * gasLimit）
            const valueWei = ethers.utils.parseEther(amount.toString());
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const maxFeeWei = gasPriceWei.mul(gasLimit);
            const requiredFundsWei = valueWei.add(maxFeeWei);
            
            console.log(`💰 Required funds calculation: value=${valueWei.toString()} Wei + gas=${maxFeeWei.toString()} Wei = ${requiredFundsWei.toString()} Wei`);
            
            // 5. 残高を取得してチェック
            const balanceResponse = await this.proxyRequest(
                this.endpoints.polygon,
                `/address/${fromAddress}`
            );
            
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const balanceHex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result || balanceResponse.data;
                balanceWei = BigInt(balanceHex);
            }
            
            console.log(`💰 Current balance: ${balanceWei.toString()} Wei`);
            
            // 6. 資金不足チェック
            if (balanceWei < BigInt(requiredFundsWei.toString())) {
                const balancePol = Number(balanceWei) / 1e18;
                const requiredPol = Number(requiredFundsWei) / 1e18;
                throw new Error(`Insufficient funds: required ${requiredPol} POL (${requiredFundsWei.toString()} Wei), but balance is ${balancePol} POL (${balanceWei.toString()} Wei). Nonce reservation skipped.`);
            }
            
            console.log(`✅ Funds check passed: ${balanceWei.toString()} Wei >= ${requiredFundsWei.toString()} Wei`);
            
            // 7. ノンス取得（資金チェック通過後）
            const nonce = await this.getPolygonNonce(fromAddress, idempotencyKey, requiredFundsWei.toString());
            console.log("Nonce:", nonce);
            
            // 8. トランザクション構築
            const transaction = await this.buildPolygonRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId);
            console.log("Raw transaction:", transaction);
            
            return {
                unsignedTx: transaction.tx, // トランザクションオブジェクトを返す
                messageHash: transaction.messageHash,
                gasPrice: gasPrice,
                gasLimit: gasLimit
            };
            
        } catch (error) {
            console.error("Polygon transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Polygon ERC20トークン送金トランザクション構築
     * @param {string} fromAddress - 送信元アドレス
     * @param {string} toAddress - 送信先アドレス
     * @param {string} contractAddress - ERC20トークンのコントラクトアドレス
     * @param {string|number} amount - 送金額
     * @param {number} decimals - トークンの小数点以下の桁数
     * @param {string} feeLevel - ガス価格レベル ('fastest', 'half', 'hour')
     * @param {string} [productId] - オプション: productId（JPYC_POLなど）。指定すると、productIdから直接ネットワークを判定
     */
    async buildPolygonERC20Transaction(fromAddress, toAddress, contractAddress, amount, decimals, feeLevel, productId = null, idempotencyKey = null) {
        try {
            console.log("Building Polygon ERC20 transaction:", { fromAddress, toAddress, contractAddress, amount, decimals, feeLevel, productId, idempotencyKey });
            
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // 1. ガス価格取得（資金チェックに必要）
            let gasPrice = await this.getPolygonGasPrice(feeLevel);
            console.log("Initial gas price:", gasPrice);
            
            // 2. replacement transaction対策: ガス価格を10%増やす
            gasPrice = Math.ceil(gasPrice * 1.1); // 10%増
            console.log("Adjusted gas price (10% increase for replacement protection):", gasPrice);
            
            // 3. ERC20 transfer関数の呼び出しデータを生成（ガス推定に必要）
            // transfer(address to, uint256 amount)
            const transferInterface = new ethers.utils.Interface([
                'function transfer(address to, uint256 amount) returns (bool)'
            ]);
            
            // 送金額をトークンの最小単位に変換（decimals考慮）
            const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);
            
            // transfer関数の呼び出しデータを生成
            const transferData = transferInterface.encodeFunctionData('transfer', [toAddress, amountWei]);
            
            console.log("ERC20 transfer data:", transferData);
            
            // 4. ガス制限推定（ERC20トークン送金用、資金チェックに必要）
            const gasLimit = await this.estimatePolygonERC20Gas(fromAddress, contractAddress, transferData);
            console.log("Gas limit:", gasLimit);
            
            // 5. トークン残高をチェック
            // this.endpoints.polygonには既にnetworkパラメータが含まれているため、追加のnetworkパラメータは不要
            const tokenBalanceResponse = await this.proxyRequest(
                this.endpoints.polygon,
                '',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: Date.now(),
                        method: 'eth_call',
                        params: [{
                            to: contractAddress,
                            data: '0x70a08231' + fromAddress.slice(2).padStart(64, '0') // balanceOf(address)
                        }, 'latest']
                    })
                }
            );
            
            let tokenBalanceWei = BigInt(0);
            if (tokenBalanceResponse && tokenBalanceResponse.data) {
                const tokenBalanceHex = typeof tokenBalanceResponse.data === 'string' 
                    ? tokenBalanceResponse.data 
                    : tokenBalanceResponse.data.result || tokenBalanceResponse.data;
                if (tokenBalanceHex && tokenBalanceHex !== '0x') {
                    tokenBalanceWei = BigInt(tokenBalanceHex);
                }
            }
            
            console.log(`💰 Token balance: ${tokenBalanceWei.toString()} (raw), required: ${amountWei.toString()}`);
            
            // 6. トークン残高不足チェック
            if (tokenBalanceWei < BigInt(amountWei.toString())) {
                const tokenBalance = Number(tokenBalanceWei) / (10 ** decimals);
                const requiredAmount = Number(amountWei) / (10 ** decimals);
                throw new Error(`Insufficient token balance: required ${requiredAmount}, but balance is ${tokenBalance}. Nonce reservation skipped.`);
            }
            
            console.log(`✅ Token balance check passed: ${tokenBalanceWei.toString()} >= ${amountWei.toString()}`);
            
            // 7. ネイティブガス残高をチェック（ガス代のみ）
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const maxFeeWei = gasPriceWei.mul(gasLimit);
            const requiredGasWei = maxFeeWei;
            
            console.log(`💰 Required gas funds: ${requiredGasWei.toString()} Wei`);
            
            const balanceResponse = await this.proxyRequest(
                this.endpoints.polygon,
                `/address/${fromAddress}`
            );
            
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const balanceHex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result || balanceResponse.data;
                balanceWei = BigInt(balanceHex);
            }
            
            console.log(`💰 Current POL balance: ${balanceWei.toString()} Wei`);
            
            // 8. ネイティブガス残高不足チェック
            if (balanceWei < BigInt(requiredGasWei.toString())) {
                const balancePol = Number(balanceWei) / 1e18;
                const requiredPol = Number(requiredGasWei) / 1e18;
                throw new Error(`Insufficient POL for gas: required ${requiredPol} POL (${requiredGasWei.toString()} Wei), but balance is ${balancePol} POL (${balanceWei.toString()} Wei). Nonce reservation skipped.`);
            }
            
            console.log(`✅ Gas funds check passed: ${balanceWei.toString()} Wei >= ${requiredGasWei.toString()} Wei`);
            
            // 9. ノンス取得（資金チェック通過後）
            const nonce = await this.getPolygonNonce(fromAddress, idempotencyKey, requiredGasWei.toString());
            console.log("🔍 Nonce obtained for ERC20 transfer:", nonce, `(type: ${typeof nonce})`);
            
            // nonceが数値でない、または0未満の場合はエラー
            if (typeof nonce !== 'number' || isNaN(nonce) || nonce < 0) {
                throw new Error(`Invalid nonce value: ${nonce} (type: ${typeof nonce})`);
            }
            
            // 10. トランザクション構築
            // ネットワーク判定: network設定のみで判定
            let currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // network設定で判定
            if (this.isTestnet) {
                currentNetwork = 'testnet';
                console.log(`🔷 Using BitVoyWallet network setting: ${this.network}`);
            }
            
            let chainId;
            if (currentNetwork === 'testnet') {
                chainId = 80002; // Polygon Amoy
                console.log('🔷 Using Polygon Amoy testnet (chainId: 80002)');
            } else {
                chainId = 137; // Polygon Mainnet
                console.log('🔷 Using Polygon Mainnet (chainId: 137)');
            }
            
            const gasLimitBN = ethers.BigNumber.from(gasLimit);
            
            console.log(`🔍 Building ERC20 transaction with nonce: ${nonce} (type: ${typeof nonce})`);
            
            // トランザクションオブジェクトを構築（toはコントラクトアドレス、dataはtransfer関数の呼び出しデータ）
            const tx = {
                to: contractAddress,
                value: ethers.BigNumber.from(0), // ERC20トークン送金なのでvalueは0
                nonce: nonce,
                gasPrice: gasPriceWei,
                gasLimit: gasLimitBN,
                chainId: chainId,
                data: transferData // ERC20 transfer関数の呼び出しデータ
            };
            
            console.log(`🔍 Transaction object before serialization:`, {
                nonce: tx.nonce,
                nonceType: typeof tx.nonce,
                to: tx.to,
                chainId: tx.chainId
            });
            
            // トランザクションをシリアライズ（署名なし）
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash = ethers.utils.keccak256(serializedTx);
            
            console.log('🔧 Built Polygon ERC20 transaction:', {
                to: contractAddress,
                amount: amount,
                decimals: decimals,
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                chainId: chainId,
                messageHash: messageHash
            });
            
            return {
                unsignedTx: tx, // トランザクションオブジェクト
                messageHash: messageHash,
                gasPrice: gasPrice,
                gasLimit: gasLimit
            };
            
        } catch (error) {
            console.error("Polygon ERC20 transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Polygon ERC20トークン送金のガス制限推定
     */
    async estimatePolygonERC20Gas(fromAddress, contractAddress, data) {
        try {
            // this.endpoints.polygonには既にnetworkが含まれている（例: /proxyapi/blockchain/polygon/mainnet）
            const proxyBase = this.endpoints.polygon;
            
            console.log(`⛽ Estimating gas for Polygon ERC20 transfer:`, {
                from: fromAddress,
                to: contractAddress,
                proxyBase: proxyBase,
                walletNetwork: this.network,
                isTestnet: this.isTestnet
            });
            
            // proxyBaseには既にnetworkが含まれているため、直接/estimateGasを追加
            // 例: /proxyapi/blockchain/polygon/mainnet/estimateGas
            const response = await fetch(`${proxyBase}/estimateGas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: fromAddress,
                    to: contractAddress,
                    data: data
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Gas estimation failed: HTTP ${response.status}`, errorText);
                throw new Error(`Gas estimation failed: ${response.status}`);
            }
            
            const result = await response.json();
            if (result.success && result.gasLimit) {
                const gasLimit = parseInt(result.gasLimit, 10);
                console.log(`✅ Gas estimation successful: ${gasLimit}`);
                return gasLimit;
            }
            
            console.warn('⚠️ Gas estimation response missing gasLimit, using default');
            // フォールバック: ERC20トークン送金の標準ガス制限
            return 65000;
            
        } catch (error) {
            console.warn("⚠️ Gas estimation failed, using default:", error);
            // フォールバック: ERC20トークン送金の標準ガス制限
            return 65000;
        }
    }

    /**
     * Avalanche ガス価格取得
     */
    async getAvalancheGasPrice(feeLevel) {
        try {
            const response = await this.proxyRequest(this.endpoints.avalanche, '/gasprice');
            const gasPrice = response.data || {};
            switch (feeLevel) {
                case 'fastest': return gasPrice.fast || 25;
                case 'half': return gasPrice.standard || 20;
                case 'hour': return gasPrice.slow || 15;
                default: return gasPrice.standard || 20;
            }
        } catch (error) {
            console.error("Failed to get Avalanche gas price:", error);
            return 20;
        }
    }

    /**
     * Avalanche nonce 取得
     */
    async getAvalancheNonce(address, idempotencyKey = null, requiredFundsWei = null) {
        try {
            let path = `/address/${address}/nonce`;
            const params = [];
            if (idempotencyKey) params.push(`idempotencyKey=${encodeURIComponent(idempotencyKey)}`);
            if (requiredFundsWei != null) params.push(`requiredFundsWei=${encodeURIComponent(String(requiredFundsWei))}`);
            if (params.length > 0) path += `?${params.join('&')}`;
            const response = await this.proxyRequest(this.endpoints.avalanche, path);
            let nonce = response.data != null ? response.data : 0;
            if (typeof nonce !== 'number' || isNaN(nonce)) nonce = 0;
            return nonce;
        } catch (error) {
            console.error("Failed to get Avalanche nonce:", error);
            throw error;
        }
    }

    /**
     * Avalanche ERC20 ガス制限推定
     */
    async estimateAvalancheERC20Gas(fromAddress, contractAddress, data) {
        try {
            const response = await fetch(`${this.endpoints.avalanche}/estimateGas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: fromAddress, to: contractAddress, data: data })
            });
            const result = await response.json();
            if (result.success && (result.data != null || result.gasLimit != null)) {
                const gasLimit = result.data != null ? result.data : parseInt(result.gasLimit, 10);
                return typeof gasLimit === 'number' ? gasLimit : 65000;
            }
            return 65000;
        } catch (error) {
            console.warn("Avalanche ERC20 gas estimation failed, using default:", error);
            return 65000;
        }
    }

    /**
     * Avalanche ネイティブ送金のガス制限推定
     */
    async estimateAvalancheGas(fromAddress, toAddress, amount) {
        try {
            if (!window.ethers) return 21000;
            const { ethers } = window;
            const valueWei = ethers.utils.parseEther(amount.toString());
            const valueHex = ethers.BigNumber.from(valueWei).toHexString();
            const response = await this.proxyRequest(
                this.endpoints.avalanche,
                '/estimateGas',
                {
                    method: 'POST',
                    body: {
                        from: fromAddress,
                        to: toAddress,
                        value: valueHex
                    }
                }
            );
            return (response.data != null ? response.data : 21000);
        } catch (error) {
            console.warn("Avalanche gas estimation failed, using default:", error);
            return 21000;
        }
    }

    /**
     * Avalanche ネイティブ送金用生トランザクション構築
     */
    async buildAvalancheRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId = null) {
        try {
            if (!window.ethers) throw new Error('ethers.js is not loaded.');
            const { ethers } = window;
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            const chainId = currentNetwork === 'testnet' ? 43113 : 43114;
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const valueWei = ethers.utils.parseEther(amount.toString());
            const tx = {
                to: toAddress,
                value: valueWei,
                nonce,
                gasPrice: gasPriceWei,
                gasLimit: ethers.BigNumber.from(gasLimit),
                chainId,
                data: '0x'
            };
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash = ethers.utils.keccak256(serializedTx);
            return { tx, hex: serializedTx, messageHash };
        } catch (error) {
            console.error("Failed to build Avalanche raw transaction:", error);
            throw error;
        }
    }

    /**
     * Avalanche ネイティブ送金トランザクション構築（AVAX）
     */
    async buildAvalancheTransaction(fromAddress, toAddress, amount, feeLevel, productId = null, idempotencyKey = null) {
        try {
            if (!window.ethers) throw new Error('ethers.js is not loaded.');
            const { ethers } = window;
            let gasPrice = await this.getAvalancheGasPrice(feeLevel);
            gasPrice = Math.ceil(gasPrice * 1.1);
            const gasLimit = await this.estimateAvalancheGas(fromAddress, toAddress, amount);
            const valueWei = ethers.utils.parseEther(amount.toString());
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const requiredFundsWei = valueWei.add(gasPriceWei.mul(gasLimit));
            const balanceResponse = await this.proxyRequest(this.endpoints.avalanche, `/address/${fromAddress}`);
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const hex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result;
                if (hex) balanceWei = BigInt(hex);
            }
            if (balanceWei < BigInt(requiredFundsWei.toString())) {
                throw new Error(`Insufficient AVAX: required ${requiredFundsWei.toString()} Wei (送金額+ガス), balance ${balanceWei.toString()} Wei`);
            }
            const nonce = await this.getAvalancheNonce(fromAddress, idempotencyKey, requiredFundsWei.toString());
            if (typeof nonce !== 'number' || isNaN(nonce) || nonce < 0) throw new Error(`Invalid nonce: ${nonce}`);
            const transaction = await this.buildAvalancheRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId);
            return {
                unsignedTx: transaction.tx,
                messageHash: transaction.messageHash,
                gasPrice,
                gasLimit
            };
        } catch (error) {
            console.error("Avalanche native transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Avalanche ERC20 トークン送金トランザクション構築
     */
    async buildAvalancheERC20Transaction(fromAddress, toAddress, contractAddress, amount, decimals, feeLevel, productId = null, idempotencyKey = null) {
        try {
            if (!window.ethers) throw new Error('ethers.js is not loaded.');
            const { ethers } = window;
            let gasPrice = await this.getAvalancheGasPrice(feeLevel);
            gasPrice = Math.ceil(gasPrice * 1.1);
            const transferInterface = new ethers.utils.Interface(['function transfer(address to, uint256 amount) returns (bool)']);
            const amountWei = ethers.utils.parseUnits(amount.toString(), decimals);
            const transferData = transferInterface.encodeFunctionData('transfer', [toAddress, amountWei]);
            const gasLimit = await this.estimateAvalancheERC20Gas(fromAddress, contractAddress, transferData);
            const tokenBalanceResponse = await this.proxyRequest(this.endpoints.avalanche, '', {
                method: 'POST',
                body: JSON.stringify({
                    jsonrpc: '2.0', id: Date.now(), method: 'eth_call',
                    params: [{ to: contractAddress, data: '0x70a08231' + fromAddress.slice(2).padStart(64, '0') }, 'latest']
                })
            });
            let tokenBalanceWei = BigInt(0);
            if (tokenBalanceResponse && tokenBalanceResponse.data) {
                const hex = typeof tokenBalanceResponse.data === 'string' ? tokenBalanceResponse.data : tokenBalanceResponse.data.result;
                if (hex && hex !== '0x') tokenBalanceWei = BigInt(hex);
            }
            if (tokenBalanceWei < BigInt(amountWei.toString())) {
                throw new Error(`Insufficient token balance. Required ${amountWei.toString()}, balance ${tokenBalanceWei.toString()}`);
            }
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            const requiredGasWei = gasPriceWei.mul(gasLimit);
            const balanceResponse = await this.proxyRequest(this.endpoints.avalanche, `/address/${fromAddress}`);
            let balanceWei = BigInt(0);
            if (balanceResponse && balanceResponse.data) {
                const hex = typeof balanceResponse.data === 'string' ? balanceResponse.data : balanceResponse.data.result;
                if (hex) balanceWei = BigInt(hex);
            }
            if (balanceWei < BigInt(requiredGasWei.toString())) {
                throw new Error(`Insufficient AVAX for gas. Required ${requiredGasWei.toString()} Wei`);
            }
            const nonce = await this.getAvalancheNonce(fromAddress, idempotencyKey, requiredGasWei.toString());
            if (typeof nonce !== 'number' || isNaN(nonce) || nonce < 0) throw new Error(`Invalid nonce: ${nonce}`);
            const currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            const chainId = currentNetwork === 'testnet' ? 43113 : 43114;
            const tx = {
                to: contractAddress,
                value: ethers.BigNumber.from(0),
                nonce,
                gasPrice: gasPriceWei,
                gasLimit: ethers.BigNumber.from(gasLimit),
                chainId,
                data: transferData
            };
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash = ethers.utils.keccak256(serializedTx);
            return { unsignedTx: tx, messageHash, gasPrice, gasLimit };
        } catch (error) {
            console.error("Avalanche ERC20 transaction build failed:", error);
            throw error;
        }
    }

    /**
     * Avalanche 署名付きトランザクション構築（EVM 形式は Polygon と同一）
     */
    async buildSignedAvalancheTransaction(unsignedTx, signature, expectedFromAddress = null) {
        return this.buildSignedPolygonTransaction(unsignedTx, signature, expectedFromAddress);
    }

    /**
     * Avalanche トランザクションをブロードキャスト
     */
    async broadcastAvalancheTransaction(signedTx, idempotencyKey = null) {
        try {
            if (typeof signedTx === 'string' && signedTx.includes('_signed_with_')) {
                throw new Error('Invalid transaction format.');
            }
            if (typeof signedTx !== 'string' || !signedTx.startsWith('0x')) {
                throw new Error('Invalid transaction format: signedTx must be a hex string starting with 0x');
            }
            const body = { hex: signedTx };
            if (idempotencyKey) body.idempotencyKey = idempotencyKey;
            const response = await this.proxyRequest(this.endpoints.avalanche, '/tx', { method: 'POST', body });
            if (!response || !response.data) throw new Error('Broadcast failed: no tx hash');
            return response.data;
        } catch (error) {
            console.error("Avalanche broadcast failed:", error);
            throw error;
        }
    }

    /**
     * Solanaトランザクション構築
     */
    async buildSolanaTransaction(fromAddress, toAddress, amount) {
        try {
            console.log("Building Solana transaction:", { fromAddress, toAddress, amount });
            
            // 1. 最新ブロックハッシュ取得
            const blockhash = await this.getSolanaBlockhash();
            console.log("Blockhash:", blockhash);
            
            // 2. トランザクション構築
            const transaction = await this.buildSolanaRawTransaction(fromAddress, toAddress, amount, blockhash);
            console.log("Raw transaction:", transaction);
            
            return {
                unsignedTx: transaction.hex,
                messageHash: transaction.messageHash
            };
            
        } catch (error) {
            console.error("Solana transaction build failed:", error);
            throw error;
        }
    }

    /**
     * TONトランザクション構築
     */
    async buildTONTransaction(fromAddress, toAddress, amount) {
        try {
            console.log("Building TON transaction:", { fromAddress, toAddress, amount });
            
            // 1. seqno取得
            const seqno = await this.getTONSeqno(fromAddress);
            console.log("Seqno:", seqno);
            
            // 2. トランザクション構築
            const transaction = await this.buildTONRawTransaction(fromAddress, toAddress, amount, seqno);
            console.log("Raw transaction:", transaction);
            
            return {
                unsignedTx: transaction.hex,
                messageHash: transaction.messageHash
            };
            
        } catch (error) {
            console.error("TON transaction build failed:", error);
            throw error;
        }
    }

    // ==========================================
    // 署名付きトランザクション構築メソッド
    // ==========================================

    /**
     * 署名付きBitcoinトランザクション構築
     */
    async buildSignedBitcoinTransaction(unsignedTx, signature, fromAddress = null) {
        try {
            console.log("Building signed Bitcoin transaction", { fromAddress });
            
            // アドレスタイプを判定
            let isP2WPKH = false;
            let isTaproot = false;
            
            if (fromAddress) {
                isP2WPKH = this.isP2WPKHAddress(fromAddress);
                isTaproot = this.isTaprootAddress(fromAddress);
            } else {
                // fromAddressが指定されていない場合は、unsignedTxから判定を試みる
                const bitcoin = window.bitcoinjs || window.bitcoin;
                if (bitcoin) {
                    try {
                        const tx = bitcoin.Transaction.fromHex(unsignedTx);
                        // 入力のscriptPubKeyから判定（簡易版）
                        // 実際の実装では、UTXOのscriptPubKeyを確認する必要がある
                        console.warn("⚠️ fromAddress not provided, cannot determine address type. Assuming P2WPKH.");
                        isP2WPKH = true;
                    } catch (e) {
                        console.warn("⚠️ Could not parse transaction to determine address type. Assuming P2WPKH.");
                        isP2WPKH = true;
                    }
                }
            }
            
            console.log("Address type for signing:", { isP2WPKH, isTaproot, fromAddress });
            
            // 署名をトランザクションに追加
            let signedTx;
            if (isTaproot) {
                // P2TR用（コメントアウト）
                // signedTx = await this.addBitcoinSignature(unsignedTx, signature);
                throw new Error('P2TR (Taproot) is currently disabled. Please use P2WPKH address.');
            } else if (isP2WPKH) {
                // P2WPKH用: 公開鍵を取得
                // getMPCWalletInfo()から公開鍵を取得する必要がある
                // 一時的に、signatureオブジェクトから公開鍵を取得するか、別途渡す必要がある
                // ここでは、coins.jsから渡されることを想定
                const publicKeyHex = signature.publicKey || null;
                if (!publicKeyHex) {
                    throw new Error('Public key is required for P2WPKH signature. Please provide signature.publicKey.');
                }
                signedTx = await this.addBitcoinP2WPKHSignature(unsignedTx, signature, publicKeyHex);
            } else {
                // 非SegWitアドレスの場合（従来の方法）
                signedTx = await this.addBitcoinSignature(unsignedTx, signature);
            }
            
            console.log("Signed transaction:", signedTx);
            
            return signedTx;
            
        } catch (error) {
            console.error("Signed Bitcoin transaction build failed:", error);
            throw error;
        }
    }

    /**
     * 署名付きEthereumトランザクション構築
     */
    async buildSignedEthereumTransaction(unsignedTx, signature, expectedFromAddress = null) {
        try {
            console.log("Building signed Ethereum transaction");
            console.log("unsignedTx type:", typeof unsignedTx, "unsignedTx:", unsignedTx);
            console.log("signature type:", typeof signature, "signature:", signature);
            if (expectedFromAddress) {
                console.log("expectedFromAddress:", expectedFromAddress);
            }
            
            const { ethers } = window;
            
            // signatureが文字列の場合、rとsに分割を試みる（ecdsa_tssの場合）
            let normalizedSignature = signature;
            if (typeof signature === 'string') {
                // 128文字（64バイト）のhex文字列の場合、r（64文字）とs（64文字）に分割
                const cleanSig = signature.replace(/^0x/, '');
                if (cleanSig.length === 128) {
                    normalizedSignature = {
                        r: cleanSig.substring(0, 64),
                        s: cleanSig.substring(64, 128)
                    };
                    console.log("🔧 Converted hex string signature to {r, s} format");
                } else {
                    throw new Error(`Invalid signature string length: expected 128 hex chars (64 bytes), got ${cleanSig.length}`);
                }
            } else if (typeof signature === 'object' && signature !== null) {
                // オブジェクトの場合はそのまま使用（recidが含まれている場合はmpcSignatureToEthereumで使用される）
                normalizedSignature = signature;
            }
            
            // signatureがMPC署名オブジェクト（r, s, recovery）の場合
            // unsignedTxがトランザクションオブジェクトの場合
            if (typeof unsignedTx === 'object' && unsignedTx !== null && normalizedSignature && typeof normalizedSignature === 'object' && normalizedSignature.r && normalizedSignature.s) {
                // chainIdを取得（unsignedTxから）
                const chainId = unsignedTx.chainId;
                
                // メッセージハッシュを計算（recid計算用）
                const serializedTx = ethers.utils.serializeTransaction(unsignedTx);
                const messageHash = ethers.utils.keccak256(serializedTx);
                
                // メタデータから公開鍵を取得（recid計算用、expectedFromAddressが提供されていない場合のみ）
                let publicKey = null;
                if (!expectedFromAddress) {
                    try {
                        if (this.mpc && this.mpc.storage) {
                            const masterId = sessionStorage.getItem('mpc.master_id') || await this.mpc.storage.getMasterId();
                            if (masterId) {
                                const metadata = await this.mpc.storage.getMetadata(masterId, 'ecdsa_tss');
                                if (metadata && metadata.publicKey) {
                                    publicKey = metadata.publicKey;
                                    console.log("✅ Retrieved publicKey from metadata for recid calculation");
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("⚠️ Failed to retrieve publicKey from metadata:", e);
                    }
                }
                
                // expectedFromAddressが提供されている場合、recid=0,1,2,3を試して一致するものを選ぶ
                let signedTx = null;
                let selectedRecid = null;
                
                if (expectedFromAddress) {
                    console.log(`🔍 Trying recid=0,1,2,3 to find matching from address: ${expectedFromAddress}`);
                    const expectedAddrLower = expectedFromAddress.toLowerCase();
                    
                    // recid=0,1,2,3を試す
                    for (let recid = 0; recid <= 3; recid++) {
                        try {
                            const testSig = this.mpcSignatureToEthereum(normalizedSignature, chainId, messageHash, publicKey, null, recid);
                            const testSignedTx = ethers.utils.serializeTransaction(unsignedTx, testSig);
                            const decoded = ethers.utils.parseTransaction(testSignedTx);
                            
                            if (decoded.from && decoded.from.toLowerCase() === expectedAddrLower) {
                                signedTx = testSignedTx;
                                selectedRecid = recid;
                                console.log(`✅ Found matching recid: ${recid}, from address: ${decoded.from}`);
                                break;
                            }
                        } catch (e) {
                            console.warn(`⚠️ Failed to test recid=${recid}:`, e);
                            continue;
                        }
                    }
                    
                    if (!signedTx) {
                        throw new Error(`Could not find matching recid for expectedFromAddress: ${expectedFromAddress}`);
                    }
                } else {
                    // expectedFromAddressが提供されていない場合、従来の方法を使用
                    const ethSig = this.mpcSignatureToEthereum(normalizedSignature, chainId, messageHash, publicKey, expectedFromAddress);
                    signedTx = ethers.utils.serializeTransaction(unsignedTx, ethSig);
                }
                
                console.log("Signed transaction:", signedTx);
                if (selectedRecid !== null) {
                    console.log(`🔧 Selected recid: ${selectedRecid}`);
                }
                
                // デバッグ: 署名済みトランザクションをデコードして確認
                try {
                    const decoded = ethers.utils.parseTransaction(signedTx); // ethers v5
                    
                    console.log("═══════════════════════════════════════════════════════════");
                    console.log("🔍 Decoded Ethereum Signed Transaction");
                    console.log("═══════════════════════════════════════════════════════════");
                    console.log("📋 Decoded From Address:", decoded.from || 'N/A');
                    console.log("📋 Decoded To Address:", decoded.to || 'N/A');
                    console.log("📋 Decoded Value:", decoded.value ? ethers.utils.formatEther(decoded.value) + ' ETH' : '0 ETH');
                    console.log("📋 Decoded Nonce:", decoded.nonce ? decoded.nonce.toString() : 'N/A');
                    console.log("📋 Decoded GasPrice:", decoded.gasPrice ? ethers.utils.formatUnits(decoded.gasPrice, 'gwei') + ' Gwei' : 'N/A');
                    console.log("📋 Decoded GasLimit:", decoded.gasLimit ? decoded.gasLimit.toString() : 'N/A');
                    console.log("📋 Decoded ChainId:", decoded.chainId || 'N/A');
                    console.log("═══════════════════════════════════════════════════════════");
                    
                    // fromアドレスの検証
                    if (decoded.from) {
                        console.log("✅ Decoded from address:", decoded.from);
                        // expectedFromAddressが提供されている場合、一致を確認
                        if (expectedFromAddress) {
                            const expectedLower = expectedFromAddress.toLowerCase();
                            const decodedLower = decoded.from.toLowerCase();
                            if (expectedLower === decodedLower) {
                                console.log("✅ Decoded from address matches expectedFromAddress");
                            } else {
                                console.warn("⚠️ Decoded from address does not match expectedFromAddress:", {
                                    expected: expectedFromAddress,
                                    decoded: decoded.from
                                });
                            }
                        }
                    } else {
                        console.warn("⚠️ Decoded from address is missing");
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to decode signed Ethereum tx:", e);
                    // デコードに失敗しても処理は続行
                }
            
                return signedTx;
            } else {
                // 後方互換性のため、既にhex文字列の場合はそのまま返す
                if (typeof unsignedTx === 'string' && unsignedTx.startsWith('0x')) {
                    return unsignedTx;
                }

                console.error("Invalid parameters:", {
                    unsignedTxType: typeof unsignedTx,
                    unsignedTxIsObject: typeof unsignedTx === 'object' && unsignedTx !== null,
                    signatureType: typeof normalizedSignature,
                    signatureIsObject: typeof normalizedSignature === 'object' && normalizedSignature !== null,
                    hasR: normalizedSignature && normalizedSignature.r,
                    hasS: normalizedSignature && normalizedSignature.s
                });
                throw new Error('Invalid parameters: unsignedTx must be a transaction object and signature must be an MPC signature object');
            }
            
        } catch (error) {
            console.error("Signed Ethereum transaction build failed:", error);
            throw error;
        }
    }
    
    /**
     * 署名付きPolygonトランザクション構築
     * @param {object} unsignedTx - 未署名トランザクション
     * @param {object|string} signature - 署名
     */
    async buildSignedPolygonTransaction(unsignedTx, signature, expectedFromAddress = null) {
        try {
            console.log("Building signed Polygon transaction");
            console.log("unsignedTx type:", typeof unsignedTx, "unsignedTx:", unsignedTx);
            console.log("signature type:", typeof signature, "signature:", signature);
            if (expectedFromAddress) {
                console.log("expectedFromAddress:", expectedFromAddress);
            }
            
            const { ethers } = window;
            
            // signatureが文字列の場合、rとsに分割を試みる（ecdsa_tssの場合）
            let normalizedSignature = signature;
            if (typeof signature === 'string') {
                // 128文字（64バイト）のhex文字列の場合、r（64文字）とs（64文字）に分割
                const cleanSig = signature.replace(/^0x/, '');
                if (cleanSig.length === 128) {
                    normalizedSignature = {
                        r: cleanSig.substring(0, 64),
                        s: cleanSig.substring(64, 128)
                    };
                    console.log("🔧 Converted hex string signature to {r, s} format");
                } else {
                    throw new Error(`Invalid signature string length: expected 128 hex chars (64 bytes), got ${cleanSig.length}`);
                }
            }
            
            // signatureがMPC署名オブジェクト（r, s, recovery）の場合
            // unsignedTxがトランザクションオブジェクトの場合
            if (typeof unsignedTx === 'object' && unsignedTx !== null && normalizedSignature && typeof normalizedSignature === 'object' && normalizedSignature.r && normalizedSignature.s) {
                // chainIdを取得（unsignedTxから）
                const chainId = unsignedTx.chainId;
                
                // メッセージハッシュを計算（recid計算用）
                const serializedTx = ethers.utils.serializeTransaction(unsignedTx);
                const messageHash = ethers.utils.keccak256(serializedTx);
                
                // メタデータから公開鍵を取得（recid計算用、expectedFromAddressが提供されていない場合のみ）
                let publicKey = null;
                if (!expectedFromAddress) {
                    try {
                        if (this.mpc && this.mpc.storage) {
                            const masterId = sessionStorage.getItem('mpc.master_id') || await this.mpc.storage.getMasterId();
                            if (masterId) {
                                const metadata = await this.mpc.storage.getMetadata(masterId, 'ecdsa_tss');
                                if (metadata && metadata.publicKey) {
                                    publicKey = metadata.publicKey;
                                    console.log("✅ Retrieved publicKey from metadata for recid calculation");
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("⚠️ Failed to retrieve publicKey from metadata:", e);
                    }
                }
                
                // expectedFromAddressが提供されている場合、recid=0,1,2,3を試して一致するものを選ぶ
                let signedTx = null;
                let selectedRecid = null;
                
                if (expectedFromAddress) {
                    console.log(`🔍 Trying recid=0,1,2,3 to find matching from address: ${expectedFromAddress}`);
                    const expectedAddrLower = expectedFromAddress.toLowerCase();
                    
                    // recid=0,1,2,3を試す
                    for (let recid = 0; recid <= 3; recid++) {
                        try {
                            const testSig = this.mpcSignatureToPolygon(normalizedSignature, chainId, messageHash, publicKey, null, recid);
                            const testSignedTx = ethers.utils.serializeTransaction(unsignedTx, testSig);
                            const decoded = ethers.utils.parseTransaction(testSignedTx);
                            
                            if (decoded.from && decoded.from.toLowerCase() === expectedAddrLower) {
                                signedTx = testSignedTx;
                                selectedRecid = recid;
                                console.log(`✅ Found matching recid: ${recid}, from address: ${decoded.from}`);
                                break;
                            }
                        } catch (e) {
                            console.warn(`⚠️ Failed to test recid=${recid}:`, e);
                            continue;
                        }
                    }
                    
                    if (!signedTx) {
                        throw new Error(`Could not find matching recid for expectedFromAddress: ${expectedFromAddress}`);
                    }
                } else {
                    // expectedFromAddressが提供されていない場合、従来の方法を使用
                    const polSig = this.mpcSignatureToPolygon(normalizedSignature, chainId, messageHash, publicKey, expectedFromAddress);
                    signedTx = ethers.utils.serializeTransaction(unsignedTx, polSig);
                }
                
                console.log("Signed transaction:", signedTx);
                if (selectedRecid !== null) {
                    console.log(`🔧 Selected recid: ${selectedRecid}`);
                }

                // デバッグ: 署名済みトランザクションをデコードして確認
                try {
                    const decoded = ethers.utils.parseTransaction(signedTx); // ethers v5
                    
                    // unsignedTxからfromアドレスを取得（トランザクションオブジェクトにはfromがないため）
                    // 署名から復元されたfromアドレスを表示
                    console.log("═══════════════════════════════════════════════════════════");
                    console.log("🔍 Decoded Polygon Signed Transaction");
                    console.log("═══════════════════════════════════════════════════════════");
                    console.log("📋 Decoded From Address:", decoded.from || 'N/A');
                    console.log("📋 Decoded To Address:", decoded.to || 'N/A');
                    console.log("📋 Decoded Value:", decoded.value ? ethers.utils.formatEther(decoded.value) + ' POL' : '0 POL');
                    console.log("📋 Decoded Nonce:", decoded.nonce ? decoded.nonce.toString() : 'N/A');
                    console.log("📋 Decoded GasPrice:", decoded.gasPrice ? ethers.utils.formatUnits(decoded.gasPrice, 'gwei') + ' Gwei' : 'N/A');
                    console.log("📋 Decoded GasLimit:", decoded.gasLimit ? decoded.gasLimit.toString() : 'N/A');
                    console.log("📋 Decoded ChainId:", decoded.chainId || 'N/A');
                    console.log("📋 Decoded Data:", decoded.data || '0x');
                    console.log("═══════════════════════════════════════════════════════════");
                    
                    if (decoded.from) {
                        console.log("✅ Decoded from address:", decoded.from);
                        // expectedFromAddressが提供されている場合、一致を確認
                        if (expectedFromAddress) {
                            const expectedLower = expectedFromAddress.toLowerCase();
                            const decodedLower = decoded.from.toLowerCase();
                            if (expectedLower === decodedLower) {
                                console.log("✅ Decoded from address matches expectedFromAddress");
                            } else {
                                console.warn("⚠️ Decoded from address does not match expectedFromAddress:", {
                                    expected: expectedFromAddress,
                                    decoded: decoded.from
                                });
                            }
                        }
                    } else {
                        console.warn("⚠️ Decoded from address is missing");
                    }
                } catch (e) {
                    console.warn("⚠️ Failed to decode signed Polygon tx:", e);
                    // デコードに失敗しても処理は続行
                }
            
                return signedTx;
            } else {
                // 後方互換性のため、既にhex文字列の場合はそのまま返す
                if (typeof unsignedTx === 'string' && unsignedTx.startsWith('0x')) {
                    return unsignedTx;
                }

                console.error("Invalid parameters:", {
                    unsignedTxType: typeof unsignedTx,
                    unsignedTxIsObject: typeof unsignedTx === 'object' && unsignedTx !== null,
                    signatureType: typeof normalizedSignature,
                    signatureIsObject: typeof normalizedSignature === 'object' && normalizedSignature !== null,
                    hasR: normalizedSignature && normalizedSignature.r,
                    hasS: normalizedSignature && normalizedSignature.s
                });
                throw new Error('Invalid parameters: unsignedTx must be a transaction object and signature must be an MPC signature object');
            }
            
        } catch (error) {
            console.error("Signed Polygon transaction build failed:", error);
            throw error;
        }
    }

    /**
     * 署名付きSolanaトランザクション構築
     */
    async buildSignedSolanaTransaction(unsignedTx, signature) {
        try {
            console.log("Building signed Solana transaction");
            
            // 署名をトランザクションに追加
            const signedTx = await this.addSolanaSignature(unsignedTx, signature);
            console.log("Signed transaction:", signedTx);
            
            return signedTx;
            
        } catch (error) {
            console.error("Signed Solana transaction build failed:", error);
            throw error;
        }
    }

    /**
     * 署名付きTONトランザクション構築
     */
    async buildSignedTONTransaction(unsignedTx, signature) {
        try {
            console.log("Building signed TON transaction");
            
            // 署名をトランザクションに追加
            const signedTx = await this.addTONSignature(unsignedTx, signature);
            console.log("Signed transaction:", signedTx);
            
            return signedTx;
            
        } catch (error) {
            console.error("Signed TON transaction build failed:", error);
            throw error;
        }
    }

    // ==========================================
    // ブロードキャストメソッド
    // ==========================================

    /**
     * Bitcoinトランザクションをブロードキャスト
     */
    async broadcastBitcoinTransaction(signedTx) {
        try {
            console.log("Broadcasting Bitcoin transaction");
            
            const response = await this.proxyRequest(
                this.endpoints.bitcoin,
                '/tx',
                {
                    method: 'POST',
                    body: { hex: signedTx }
                }
            );
            
            console.log("Broadcast response:", response);
            return response.txid || response.hash;
            
        } catch (error) {
            console.error("Bitcoin broadcast failed:", error);
            throw error;
        }
    }

    /**
     * Ethereumトランザクションをブロードキャスト
     */
    async broadcastEthereumTransaction(signedTx, idempotencyKey = null) {
        try {
            console.log("Broadcasting Ethereum transaction", idempotencyKey ? `(idempotencyKey: ${idempotencyKey})` : '');
            
            // _signed_with_形式が検出された場合はエラー
            // この形式は実際の署名済みトランザクションhexではないため、ブロードキャストできない
            if (typeof signedTx === 'string' && signedTx.includes('_signed_with_')) {
                throw new Error('Invalid transaction format: _signed_with_ format is not a valid signed transaction. Use signETHTransactionWithMPC to get a properly signed transaction.');
            }
            
            // signedTxが正しいhex文字列であることを確認
            if (typeof signedTx !== 'string' || !signedTx.startsWith('0x')) {
                throw new Error('Invalid transaction format: signedTx must be a hex string starting with 0x');
            }
            
            const body = { hex: signedTx };
            if (idempotencyKey) {
                body.idempotencyKey = idempotencyKey;
            }
            
            const response = await this.proxyRequest(
                this.endpoints.ethereum,
                '/tx',
                {
                    method: 'POST',
                    body: body // JSONオブジェクトとして送信
                }
            );
            
            console.log("Broadcast response:", response);
            return response.data || response.txid || response.hash;
            
        } catch (error) {
            console.error("Ethereum broadcast failed:", error);
            throw error;
        }
    }

    /**
     * Polygonトランザクションをブロードキャスト
     */
    async broadcastPolygonTransaction(signedTx, idempotencyKey = null) {
        try {
            console.log("Broadcasting Polygon transaction", idempotencyKey ? `(idempotencyKey: ${idempotencyKey})` : '');
            
            // _signed_with_形式が検出された場合はエラー
            // この形式は実際の署名済みトランザクションhexではないため、ブロードキャストできない
            if (typeof signedTx === 'string' && signedTx.includes('_signed_with_')) {
                throw new Error('Invalid transaction format: _signed_with_ format is not a valid signed transaction. Use signETHTransactionWithMPC to get a properly signed transaction.');
            }
            
            // signedTxが正しいhex文字列であることを確認
            if (typeof signedTx !== 'string' || !signedTx.startsWith('0x')) {
                throw new Error('Invalid transaction format: signedTx must be a hex string starting with 0x');
            }
            
            const body = { hex: signedTx };
            if (idempotencyKey) {
                body.idempotencyKey = idempotencyKey;
            }
            
            const response = await this.proxyRequest(
                this.endpoints.polygon,
                '/tx',
                {
                    method: 'POST',
                    body: body // JSONオブジェクトとして送信
                }
            );
            
            console.log("Broadcast response:", response);
            return response.data || response.txid || response.hash;
            
        } catch (error) {
            console.error("Polygon broadcast failed:", error);
            
            // nonceエラーの場合、詳細な情報をログに出力
            if (error.message && error.message.includes('nonce')) {
                console.error("🔍 Nonce error details:", {
                    error: error.message,
                    signedTx: signedTx ? signedTx.substring(0, 100) + '...' : 'N/A'
                });
                
                // トランザクションをデコードしてnonceを確認
                try {
                    const { ethers } = window;
                    const decoded = ethers.utils.parseTransaction(signedTx);
                    // nonceを数値に変換（ethers.js v5/v6対応）
                    const nonceNumber = decoded.nonce?.toNumber ? decoded.nonce.toNumber() : Number(decoded.nonce || 0);
                    
                    console.error("🔍 Transaction details:", {
                        from: decoded.from || 'N/A',
                        to: decoded.to || 'N/A',
                        nonce: decoded.nonce ? decoded.nonce.toString() : 'N/A',
                        nonceNumber: nonceNumber !== null ? nonceNumber : 'N/A',
                        chainId: decoded.chainId || 'N/A'
                    });
                    
                    // 現在のnonceを取得して比較
                    if (decoded.from) {
                        const currentNonce = await this.getPolygonNonce(decoded.from);
                        console.error("🔍 Current nonce on blockchain:", currentNonce);
                        console.error("🔍 Transaction nonce:", nonceNumber !== null ? nonceNumber : 'N/A');
                        console.error("🔍 Difference:", currentNonce - (nonceNumber !== null ? nonceNumber : 0));
                    }
                } catch (decodeError) {
                    console.error("🔍 Failed to decode transaction:", decodeError);
                }
            }
            
            // エラーメッセージをそのまま伝播（サーバーからの詳細なエラーメッセージを含む）
            throw error;
        }
    }
    
    /**
     * Polygonトランザクションの状況を確認
     */
    async checkPolygonTransactionStatus(txHash) {
        try {
            console.log(`🔍 Checking Polygon transaction status: ${txHash}`);
            
            const response = await this.proxyRequest(
                this.endpoints.polygon,
                `/tx/${txHash}`,
                {
                    method: 'GET'
                }
            );
            
            console.log("📋 Transaction info:", JSON.stringify(response, null, 2));
            
            // トランザクション情報から状況を判定
            if (response && response.data) {
                const tx = response.data;
                if (tx.blockNumber) {
                    console.log(`✅ Transaction confirmed in block: ${tx.blockNumber}`);
                } else {
                    console.log("⏳ Transaction is pending (not yet included in a block)");
                }
            }
            
            return response;
            
        } catch (error) {
            console.error("❌ Failed to check transaction status:", error);
            throw error;
        }
    }

    /**
     * Solanaトランザクションをブロードキャスト
     */
    async broadcastSolanaTransaction(signedTx) {
        try {
            console.log("Broadcasting Solana transaction");
            
            const response = await this.proxyRequest(
                this.endpoints.solana,
                '/broadcast',
                {
                    method: 'POST',
                    body: { hex: signedTx }
                }
            );
            
            console.log("Broadcast response:", response);
            return response.txid || response.hash;
            
        } catch (error) {
            console.error("Solana broadcast failed:", error);
            throw error;
        }
    }

    /**
     * TONトランザクションをブロードキャスト
     */
    async broadcastTONTransaction(signedTx) {
        try {
            console.log("Broadcasting TON transaction");
            
            const response = await this.proxyRequest(
                this.endpoints.ton,
                '/broadcast',
                {
                    method: 'POST',
                    body: { hex: signedTx }
                }
            );
            
            console.log("Broadcast response:", response);
            return response.txid || response.hash;
            
        } catch (error) {
            console.error("TON broadcast failed:", error);
            throw error;
        }
    }

    // ==========================================
    // ヘルパーメソッド（基本的な実装）
    // ==========================================

    /**
     * Bitcoin UTXO取得
     */
    async getBitcoinUTXOs(address) {
        try {
            console.log(`Getting Bitcoin UTXOs for address: ${address} on network: ${this.network}`);
            const response = await this.proxyRequest(
                this.endpoints.bitcoin,
                `/address/${address}/utxo`
            );
            let utxos = response.data || [];
            
            // 配列でない場合は配列に変換
            if (!Array.isArray(utxos)) {
                console.warn('UTXOs response is not an array, converting:', utxos);
                if (typeof utxos === 'number') {
                    // 数値の場合は、ダミーのUTXOを作成
                    const dummyUtxo = {
                        txid: 'dummy_txid_for_balance',
                        vout: 0,
                        value: utxos, // satoshi
                        scriptPubKey: 'dummy_script_pub_key'
                    };
                    utxos = [dummyUtxo];
                } else {
                    utxos = [];
                }
            }
            
            console.log(`Found ${utxos.length} UTXOs:`, utxos);
            
            // デバッグ用: 最初のUTXOの構造をログ出力
            if (utxos.length > 0) {
                console.log('First UTXO structure:', Object.keys(utxos[0]));
                console.log('First UTXO full data:', utxos[0]);
            }
            
            return utxos;
        } catch (error) {
            console.error("Failed to get Bitcoin UTXOs:", error);
            throw error;
        }
    }

    /**
     * Bitcoin手数料率取得
     */
    async getBitcoinFeeRate(feeLevel) {
        try {
            console.log(`Getting Bitcoin fee rate for network: ${this.network}, level: ${feeLevel}`);
            const response = await this.proxyRequest(
                this.endpoints.bitcoin,
                '/fees'
            );
            
            const fees = response.data || {};
            console.log("Fee response:", fees);
            
            const feeRate = (() => {
                switch (feeLevel) {
                    case 'fastest': return fees.fastest_fee || 10;
                    case 'half': return fees.half_fee || 5;
                    case 'hour': return fees.hour_fee || 1;
                    default: return fees.half_fee || 5;
                }
            })();
            
            console.log(`Selected fee rate: ${feeRate} sat/vB`);
            return feeRate;
        } catch (error) {
            console.error("Failed to get Bitcoin fee rate:", error);
            return 5;
        }
    }

    /**
     * Bitcoin生トランザクション構築
     */
    async buildBitcoinRawTransaction(fromAddress, utxos, toAddress, amount, feeRate) {
        try {
            console.log("Building Bitcoin raw transaction:", {
                utxos: utxos.length,
                toAddress,
                amount,
                feeRate
            });
            
            // UTXOの値を数値に変換して合計を計算
            const totalInput = utxos.reduce((sum, utxo) => {
                const value = parseInt(utxo.value) || 0;
                console.log(`UTXO value: ${utxo.value} -> ${value} satoshi`);
                return sum + value;
            }, 0);
            
            const amountSatoshi = Math.floor(parseFloat(amount) * 100000000);
            
            // より現実的なトランザクションサイズを推定
            // Taproot入力1個 + Taproot出力2個（送金先 + おつり） = 約58 + 43 + 43 = 144 bytes
            const estimatedTxSize = 144;
            
            // テストネットの場合は手数料を調整
            let adjustedFeeRate = feeRate;
            if (this.network === 'testnet') {
                // テストネットでは手数料を大幅に下げる
                adjustedFeeRate = 2; // 2 sat/vB
                console.log(`Testnet detected, adjusting fee rate from ${feeRate} to ${adjustedFeeRate} sat/vB`);
            }
            
            const fee = adjustedFeeRate * estimatedTxSize;
            
            const change = totalInput - amountSatoshi - fee;
            
            console.log("Transaction calculation:", {
                totalInput: totalInput + ' satoshi (' + (totalInput / 100000000) + ' BTC)',
                amountSatoshi: amountSatoshi + ' satoshi (' + (amountSatoshi / 100000000) + ' BTC)',
                fee: fee + ' satoshi (' + (fee / 100000000) + ' BTC)',
                change: change + ' satoshi (' + (change / 100000000) + ' BTC)',
                feeRate: feeRate + ' sat/vB',
                txSize: estimatedTxSize + ' bytes'
            });
            
            if (change < 0) {
                console.error("Insufficient funds:", {
                    totalInput: totalInput / 100000000 + ' BTC',
                    required: (amountSatoshi + fee) / 100000000 + ' BTC',
                    shortfall: Math.abs(change) / 100000000 + ' BTC'
                });
                throw new Error(`Insufficient funds. Available: ${totalInput / 100000000} BTC, Required: ${(amountSatoshi + fee) / 100000000} BTC`);
            }
            
            // 実際のBitcoinトランザクション構築（bitcoinjs-lib使用）
            const bitcoin = window.bitcoinjs || window.bitcoin;
            
            if (!bitcoin) {
                console.error("bitcoinjs-lib not found. Available globals:", Object.keys(window).filter(k => k.includes('bitcoin')));
                console.error("All window properties:", Object.keys(window));
                throw new Error("bitcoinjs-lib is not loaded. Please check the script tag.");
            }
            
            // ECCライブラリの確認（初期化済みかチェック）
            if (!this.eccAdapter) {
                console.error("ECC adapter not available - Bitcoin ECC library not initialized");
                throw new Error("Bitcoin ECC library not initialized");
            }
            
            console.log("bitcoinjs-lib loaded successfully:", {
                networks: bitcoin.networks,
                TransactionBuilder: !!bitcoin.TransactionBuilder,
                Transaction: !!bitcoin.Transaction,
                availableKeys: Object.keys(bitcoin)
            });
            
            // ネットワーク設定
            const network = this.network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
            
            // アドレスタイプを判定
            const isTaprootAddress = this.isTaprootAddress(fromAddress);
            const isP2WPKHAddress = this.isP2WPKHAddress(fromAddress);
            
            console.log("Address type detection:", {
                fromAddress: fromAddress,
                isTaproot: isTaprootAddress,
                isP2WPKH: isP2WPKHAddress
            });
            
            // TransactionBuilderが利用できない場合は、手動でトランザクションを構築
            if (!bitcoin.TransactionBuilder) {
                console.log("TransactionBuilder not available, using manual transaction construction");
                
                // 手動でトランザクションを構築
                const tx = new bitcoin.Transaction();
                
                // 入力の追加
                utxos.forEach((utxo, index) => {
                    // txidをBufferに変換（リトルエンディアンで反転）
                    const txidBuffer = Buffer.from(utxo.txid, 'hex').reverse();
                    tx.addInput(txidBuffer, utxo.vout);
                });
                
                // 出力の追加
                // Taprootアドレスをスクリプトに変換
                const toAddressScript = bitcoin.address.toOutputScript(toAddress, network);
                tx.addOutput(toAddressScript, amountSatoshi);
                
                if (change > 546) { // dust limit以上の場合のみおつりを追加
                    const fromAddressScript = bitcoin.address.toOutputScript(fromAddress, network);
                    tx.addOutput(fromAddressScript, change);
                }
                
                // 署名用のメッセージハッシュを生成
                let messageHash;
                if (isTaprootAddress) {
                    // P2TR用（コメントアウト）
                    // Taprootアドレスの場合はhashForWitnessV1を使用（必須）
                    // if (typeof tx.hashForWitnessV1 !== 'function') {
                    //     throw new Error('hashForWitnessV1 is not available. Please ensure bitcoinjs-lib supports Taproot.');
                    // }
                    // 
                    // console.log("Using hashForWitnessV1 for Taproot address");
                    // 
                    // const prevOutScripts = utxos.map((utxo, index) => {
                    //     console.log(`Generating scriptPubKey from fromAddress for Taproot UTXO at index ${index}`);
                    //     return bitcoin.address.toOutputScript(fromAddress, network);
                    // });
                    // 
                    // const prevOutValues = utxos.map(utxo => {
                    //     return parseInt(utxo.value) || 0;
                    // });
                    // 
                    // const sighashType = bitcoin.Transaction.SIGHASH_DEFAULT !== undefined 
                    //     ? bitcoin.Transaction.SIGHASH_DEFAULT 
                    //     : 0x00;
                    // 
                    // const msg32 = tx.hashForWitnessV1(
                    //     0, // inputIndex
                    //     prevOutScripts,
                    //     prevOutValues,
                    //     sighashType
                    // );
                    // 
                    // messageHash = msg32.toString('hex');
                    throw new Error('P2TR (Taproot) is currently disabled. Please use P2WPKH address.');
                } else if (isP2WPKHAddress) {
                    // P2WPKH用のメッセージハッシュ生成
                    console.log("Using hashForWitnessV0 for P2WPKH address");
                    
                    // prevOutScriptsとprevOutValuesを準備
                    const prevOutScripts = utxos.map((utxo, index) => {
                        console.log(`Generating scriptPubKey from fromAddress for P2WPKH UTXO at index ${index}`);
                        return bitcoin.address.toOutputScript(fromAddress, network);
                    });
                    
                    const prevOutValues = utxos.map(utxo => {
                        return parseInt(utxo.value) || 0;
                    });
                    
                    // P2WPKHではSIGHASH_ALLを使用
                    const sighashType = bitcoin.Transaction.SIGHASH_ALL !== undefined 
                        ? bitcoin.Transaction.SIGHASH_ALL 
                        : 0x01;
                    
                    // hashForWitnessV0を使用（P2WPKH用）
                    if (typeof tx.hashForWitnessV0 !== 'function') {
                        throw new Error('hashForWitnessV0 is not available. Please ensure bitcoinjs-lib supports SegWit.');
                    }
                    
                    // P2WPKHの場合、scriptPubKeyはP2PKH形式に変換する必要がある（BIP143）
                    // P2WPKHのscriptPubKey: 0x0014<20-byte-hash>
                    // P2PKH形式のscriptPubKey: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
                    const p2wpkhScript = prevOutScripts[0];
                    const witnessProgram = p2wpkhScript.slice(2); // 0x00をスキップして witness program (20 bytes) を取得
                    
                    // P2PKH形式のscriptPubKeyを生成
                    let p2pkhScript;
                    if (bitcoin.script && bitcoin.script.compile && bitcoin.opcodes) {
                        // bitcoinjs-libのscript.compileが利用可能な場合
                        p2pkhScript = bitcoin.script.compile([
                            bitcoin.opcodes.OP_DUP,
                            bitcoin.opcodes.OP_HASH160,
                            witnessProgram,
                            bitcoin.opcodes.OP_EQUALVERIFY,
                            bitcoin.opcodes.OP_CHECKSIG
                        ]);
                    } else {
                        // 手動でP2PKH形式のscriptPubKeyを生成
                        p2pkhScript = Buffer.concat([
                            Buffer.from([0x76]), // OP_DUP
                            Buffer.from([0xa9]), // OP_HASH160
                            Buffer.from([0x14]), // 20 bytes
                            witnessProgram,
                            Buffer.from([0x88]), // OP_EQUALVERIFY
                            Buffer.from([0xac])  // OP_CHECKSIG
                        ]);
                    }
                    
                    // 最初の入力（inputIndex = 0）のメッセージハッシュを生成
                    const msg32 = tx.hashForWitnessV0(
                        0, // inputIndex
                        p2pkhScript,
                        prevOutValues[0],
                        sighashType
                    );
                    
                    // msg32はBufferなので、hex文字列に変換
                    messageHash = msg32.toString('hex');
                    
                    console.log("hashForWitnessV0 result (P2WPKH):", {
                        inputIndex: 0,
                        p2pkhScriptLength: p2pkhScript.length,
                        prevOutValue: prevOutValues[0],
                        sighashType: sighashType,
                        messageHash: messageHash,
                        messageHashLength: messageHash.length
                    });
                } else {
                    // 非SegWitアドレスの場合は従来の方法を使用
                    console.log("Using getId() for non-SegWit address");
                    messageHash = tx.getId();
                }
                
                // デバッグ情報
                console.log("Message hash generated:", {
                    isTaproot: isTaprootAddress,
                    isP2WPKH: isP2WPKHAddress,
                    messageHash: messageHash,
                    messageHashLength: messageHash ? messageHash.length : 0
                });
                
                // 未署名トランザクションのhex文字列を取得
                const unsignedTxHex = tx.toHex();
                
                console.log("Transaction built successfully:", {
                    hex: unsignedTxHex,
                    messageHash: messageHash,
                    fee: fee,
                    utxos: utxos.length,
                    inputs: utxos.length,
                    outputs: change > 546 ? 2 : 1,
                    isTaproot: isTaprootAddress,
                    isP2WPKH: isP2WPKHAddress
                });
                
                return {
                    hex: unsignedTxHex,
                    messageHash: messageHash,
                    fee: fee
                };
            }
            
            // TransactionBuilderが利用可能な場合
            const txb = new bitcoin.TransactionBuilder(network);
            
            // 入力の追加
            utxos.forEach((utxo, index) => {
                txb.addInput(utxo.txid, utxo.vout);
            });
            
            // 出力の追加
            txb.addOutput(toAddress, amountSatoshi);
            if (change > 546) { // dust limit以上の場合のみおつりを追加
                txb.addOutput(fromAddress, change);
            }
            
            // 署名用のメッセージハッシュを生成
            let messageHash;
            if (isTaprootAddress) {
                // P2TR用（コメントアウト）
                // const incompleteTx = txb.buildIncomplete();
                // 
                // if (typeof incompleteTx.hashForWitnessV1 !== 'function') {
                //     throw new Error('hashForWitnessV1 is not available. Please ensure bitcoinjs-lib supports Taproot.');
                // }
                // 
                // console.log("Using hashForWitnessV1 for Taproot address (TransactionBuilder)");
                // 
                // const prevOutScripts = utxos.map((utxo, index) => {
                //     console.log(`Generating scriptPubKey from fromAddress for Taproot UTXO at index ${index}`);
                //     return bitcoin.address.toOutputScript(fromAddress, network);
                // });
                // 
                // const prevOutValues = utxos.map(utxo => {
                //     return parseInt(utxo.value) || 0;
                // });
                // 
                // const sighashType = bitcoin.Transaction.SIGHASH_DEFAULT !== undefined 
                //     ? bitcoin.Transaction.SIGHASH_DEFAULT 
                //     : 0x00;
                // 
                // const msg32 = incompleteTx.hashForWitnessV1(
                //     0, // inputIndex
                //     prevOutScripts,
                //     prevOutValues,
                //     sighashType
                // );
                // 
                // messageHash = msg32.toString('hex');
                throw new Error('P2TR (Taproot) is currently disabled. Please use P2WPKH address.');
            } else if (isP2WPKHAddress) {
                // P2WPKH用のメッセージハッシュ生成（TransactionBuilder）
                console.log("Using hashForWitnessV0 for P2WPKH address (TransactionBuilder)");
                
                const incompleteTx = txb.buildIncomplete();
                
                if (typeof incompleteTx.hashForWitnessV0 !== 'function') {
                    throw new Error('hashForWitnessV0 is not available. Please ensure bitcoinjs-lib supports SegWit.');
                }
                
                // prevOutScriptsとprevOutValuesを準備
                const prevOutScripts = utxos.map((utxo, index) => {
                    console.log(`Generating scriptPubKey from fromAddress for P2WPKH UTXO at index ${index}`);
                    return bitcoin.address.toOutputScript(fromAddress, network);
                });
                
                const prevOutValues = utxos.map(utxo => {
                    return parseInt(utxo.value) || 0;
                });
                
                // P2WPKHではSIGHASH_ALLを使用
                const sighashType = bitcoin.Transaction.SIGHASH_ALL !== undefined 
                    ? bitcoin.Transaction.SIGHASH_ALL 
                    : 0x01;
                
                // P2WPKHの場合、scriptPubKeyはP2PKH形式に変換する必要がある（BIP143）
                // P2WPKHのscriptPubKey: 0x0014<20-byte-hash>
                // P2PKH形式のscriptPubKey: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
                const p2wpkhScript = prevOutScripts[0];
                const witnessProgram = p2wpkhScript.slice(2); // 0x00をスキップして witness program (20 bytes) を取得
                
                // P2PKH形式のscriptPubKeyを生成
                let p2pkhScript;
                if (bitcoin.script && bitcoin.script.compile && bitcoin.opcodes) {
                    // bitcoinjs-libのscript.compileが利用可能な場合
                    p2pkhScript = bitcoin.script.compile([
                        bitcoin.opcodes.OP_DUP,
                        bitcoin.opcodes.OP_HASH160,
                        witnessProgram,
                        bitcoin.opcodes.OP_EQUALVERIFY,
                        bitcoin.opcodes.OP_CHECKSIG
                    ]);
                } else {
                    // 手動でP2PKH形式のscriptPubKeyを生成
                    p2pkhScript = Buffer.concat([
                        Buffer.from([0x76]), // OP_DUP
                        Buffer.from([0xa9]), // OP_HASH160
                        Buffer.from([0x14]), // 20 bytes
                        witnessProgram,
                        Buffer.from([0x88]), // OP_EQUALVERIFY
                        Buffer.from([0xac])  // OP_CHECKSIG
                    ]);
                }
                
                // 最初の入力（inputIndex = 0）のメッセージハッシュを生成
                const msg32 = incompleteTx.hashForWitnessV0(
                    0, // inputIndex
                    p2pkhScript,
                    prevOutValues[0],
                    sighashType
                );
                
                // msg32はBufferなので、hex文字列に変換
                messageHash = msg32.toString('hex');
                
                console.log("hashForWitnessV0 result (P2WPKH, TransactionBuilder):", {
                    inputIndex: 0,
                    p2pkhScriptLength: p2pkhScript.length,
                    prevOutValue: prevOutValues[0],
                    sighashType: sighashType,
                    messageHash: messageHash,
                    messageHashLength: messageHash.length
                });
            } else {
                // 非SegWitアドレスの場合は従来の方法を使用
                console.log("Using getId() for non-SegWit address (TransactionBuilder)");
                messageHash = txb.buildIncomplete().getId();
            }
            
            // デバッグ情報
            console.log("Message hash generated:", {
                isTaproot: isTaprootAddress,
                isP2WPKH: isP2WPKHAddress,
                messageHash: messageHash,
                messageHashLength: messageHash ? messageHash.length : 0
            });
            
            // 未署名トランザクションのhex文字列を取得
            const unsignedTxHex = txb.buildIncomplete().toHex();
            
            console.log("Transaction built successfully:", {
                hex: unsignedTxHex,
                messageHash: messageHash,
                fee: fee,
                utxos: utxos.length,
                inputs: utxos.length,
                outputs: change > 546 ? 2 : 1,
                isTaproot: isTaprootAddress,
                isP2WPKH: isP2WPKHAddress
            });
            
            return {
                hex: unsignedTxHex,
                messageHash: messageHash,
                fee: fee
            };
            
        } catch (error) {
            console.error("Failed to build Bitcoin raw transaction:", error);
            throw error;
        }
    }

    /**
     * Ethereumノンス取得
     * @param {string} address - アドレス
     * @param {string} idempotencyKey - 冪等キー（オプション）
     */
    async getEthereumNonce(address, idempotencyKey = null, requiredFundsWei = null) {
        try {
            let path = `/address/${address}/nonce`;
            const params = [];
            if (idempotencyKey) {
                params.push(`idempotencyKey=${encodeURIComponent(idempotencyKey)}`);
            }
            if (requiredFundsWei !== null && requiredFundsWei !== undefined) {
                // BigIntを文字列に変換（サーバー側でBigIntに変換するため）
                const fundsStr = typeof requiredFundsWei === 'bigint' ? requiredFundsWei.toString() : String(requiredFundsWei);
                params.push(`requiredFundsWei=${encodeURIComponent(fundsStr)}`);
            }
            if (params.length > 0) {
                path += `?${params.join('&')}`;
            }
            
            const response = await this.proxyRequest(
                this.endpoints.ethereum,
                path
            );
            
            // サーバー側で既に数値に変換されているため、そのまま使用
            let nonce = response.data || 0;
            
            // 数値でない場合は0を返す（念のため）
            if (typeof nonce !== 'number' || isNaN(nonce)) {
                console.warn('⚠️ Invalid nonce value, using 0:', response.data);
                nonce = 0;
            }
            
            console.log(`📋 Ethereum nonce for ${address}: ${nonce}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey})` : ''}${requiredFundsWei !== null ? ` (requiredFundsWei: ${requiredFundsWei})` : ''}`);
            return nonce;
        } catch (error) {
            console.error("Failed to get Ethereum nonce:", error);
            throw error;
        }
    }

    /**
     * Polygonノンス取得
     * 毎回サーバーから取得（pendingトランザクションも考慮される）
     * @param {string} address - アドレス
     * @param {string} idempotencyKey - 冪等キー（オプション）
     * @param {BigInt|string|null} requiredFundsWei - 必要な資金額（Wei単位、オプション）。指定された場合、サーバー側で資金チェックが行われる
     */
    async getPolygonNonce(address, idempotencyKey = null, requiredFundsWei = null) {
        try {
            let path = `/address/${address}/nonce`;
            const params = [];
            if (idempotencyKey) {
                params.push(`idempotencyKey=${encodeURIComponent(idempotencyKey)}`);
            }
            if (requiredFundsWei !== null && requiredFundsWei !== undefined) {
                // BigIntを文字列に変換（サーバー側でBigIntに変換するため）
                const fundsStr = typeof requiredFundsWei === 'bigint' ? requiredFundsWei.toString() : String(requiredFundsWei);
                params.push(`requiredFundsWei=${encodeURIComponent(fundsStr)}`);
            }
            if (params.length > 0) {
                path += `?${params.join('&')}`;
            }
            
            const response = await this.proxyRequest(
                this.endpoints.polygon,
                path
            );
            
            // サーバー側で既に数値に変換されているため、そのまま使用
            let nonce = response.data || 0;
            
            // 数値でない場合は0を返す（念のため）
            if (typeof nonce !== 'number' || isNaN(nonce)) {
                console.warn('⚠️ Invalid nonce value, using 0:', response.data);
                nonce = 0;
            }
            
            console.log(`📋 Polygon nonce for ${address}: ${nonce}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey})` : ''}${requiredFundsWei !== null ? ` (requiredFundsWei: ${requiredFundsWei})` : ''}`);
            return nonce;
        } catch (error) {
            console.error("Failed to get Polygon nonce:", error);
            throw error;
        }
    }

    /**
     * Ethereumガス価格取得
     */
    async getEthereumGasPrice(feeLevel) {
        try {
            const response = await this.proxyRequest(
                this.endpoints.ethereum,
                '/gasprice'
            );
            
            const gasPrice = response.data || {};
            switch (feeLevel) {
                case 'fastest': return gasPrice.fast || 20;
                case 'half': return gasPrice.standard || 15;
                case 'hour': return gasPrice.slow || 10;
                default: return gasPrice.standard || 15;
            }
        } catch (error) {
            console.error("Failed to get Ethereum gas price:", error);
            return 15; // デフォルト値
        }
    }

    /**
     * Ethereumガス制限推定
     */
    async estimateEthereumGas(fromAddress, toAddress, amount) {
        try {
            const response = await this.proxyRequest(
                this.endpoints.ethereum,
                '/estimateGas',
                {
                    method: 'POST',
                    body: {
                        from: fromAddress,
                        to: toAddress,
                        value: amount
                    }
                }
            );
            return response.data || 21000;
        } catch (error) {
            console.error("Failed to estimate Ethereum gas:", error);
            return 21000; // デフォルト値
        }
    }

    /**
     * Polygonガス価格取得
     */
    async getPolygonGasPrice(feeLevel) {
        try {
            const response = await this.proxyRequest(
                this.endpoints.polygon,
                '/gasprice'
            );
            
            const gasPrice = response.data || {};
            switch (feeLevel) {
                case 'fastest': return gasPrice.fast || 20;
                case 'half': return gasPrice.standard || 15;
                case 'hour': return gasPrice.slow || 10;
                default: return gasPrice.standard || 15;
            }
        } catch (error) {
            console.error("Failed to get Polygon gas price:", error);
            return 15; // デフォルト値
        }
    }

    /**
     * Polygonガス制限推定
     */
    async estimatePolygonGas(fromAddress, toAddress, amount) {
        try {
            const response = await this.proxyRequest(
                this.endpoints.polygon,
                '/estimateGas',
                {
                    method: 'POST',
                    body: {
                        from: fromAddress,
                        to: toAddress,
                        value: amount
                    }
                }
            );
            return response.data || 21000;
        } catch (error) {
            console.error("Failed to estimate Polygon gas:", error);
            return 21000; // デフォルト値
        }
    }

    /**
     * Ethereum生トランザクション構築
     */
    async buildEthereumRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId = null) {
        try {
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // ネットワークに応じてchainIdを設定
            // network設定のみで判定
            let currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // network設定で判定
            if (this.isTestnet) {
                currentNetwork = 'testnet';
                console.log(`🔷 Using BitVoyWallet network setting: ${this.network}`);
            }
            
            let chainId;
            if (currentNetwork === 'testnet') {
                chainId = 11155111; // Sepolia
                console.log('🔷 Using Ethereum Sepolia testnet (chainId: 11155111)');
            } else {
                chainId = 1; // Mainnet
                console.log('🔷 Using Ethereum Mainnet (chainId: 1)');
            }
            
            // ガス価格をGweiからWeiに変換
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            
            const gasLimitBN = ethers.BigNumber.from(gasLimit);

            // 送金額をETHからWeiに変換
            const valueWei = ethers.utils.parseEther(amount.toString());
            
            // トランザクションオブジェクトを構築
            const tx = {
                to: toAddress,
                value: valueWei,
                nonce: nonce,
                gasPrice: gasPriceWei,
                gasLimit: gasLimitBN,
                chainId: chainId,
                data: '0x' // 通常の送金なのでdataは空
            };
            
            // トランザクションをシリアライズ（署名なし）
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash  = ethers.utils.keccak256(serializedTx);
            
            console.log('🔧 Built Ethereum transaction:', {
                to: toAddress,
                value: amount,
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                chainId: chainId,
                messageHash: messageHash
            });
            
            return {
                tx: tx, // トランザクションオブジェクト
                hex: serializedTx,
                messageHash: messageHash
            };
            
        } catch (error) {
            console.error("Failed to build Ethereum raw transaction:", error);
            throw error;
        }
    }

    /**
     * Polygon生トランザクション構築
     */
    async buildPolygonRawTransaction(nonce, toAddress, amount, gasPrice, gasLimit, productId = null) {
        try {
            if (!window.ethers) {
                throw new Error('ethers.js is not loaded. Please ensure ethers.js is loaded before using this function.');
            }
            
            const { ethers } = window;
            
            // ネットワークに応じてchainIdを設定
            // network設定のみで判定
            let currentNetwork = sessionStorage.getItem('mpc.current_network') || 'mainnet';
            
            // network設定で判定
            if (this.isTestnet) {
                currentNetwork = 'testnet';
                console.log(`🔷 Using BitVoyWallet network setting: ${this.network}`);
            }
            
            let chainId;
            if (currentNetwork === 'testnet') {
                chainId = 80002; // Polygon Amoy
                console.log('🔷 Using Polygon Amoy testnet (chainId: 80002)');
            } else {
                chainId = 137; // Polygon Mainnet
                console.log('🔷 Using Polygon Mainnet (chainId: 137)');
            }
            
            // ガス価格をGweiからWeiに変換
            const gasPriceWei = ethers.utils.parseUnits(gasPrice.toString(), 'gwei');
            
            const gasLimitBN = ethers.BigNumber.from(gasLimit);
            
            // 送金額をPOLからWeiに変換
            const valueWei = ethers.utils.parseEther(amount.toString());
            
            // トランザクションオブジェクトを構築
            const tx = {
                to: toAddress,
                value: valueWei,
                nonce: nonce,
                gasPrice: gasPriceWei,
                gasLimit: gasLimitBN,
                chainId: chainId,
                data: '0x' // 通常の送金なのでdataは空
            };
            
            // トランザクションをシリアライズ（署名なし）
            const serializedTx = ethers.utils.serializeTransaction(tx);
            const messageHash = ethers.utils.keccak256(serializedTx);
            
            console.log('🔧 Built Polygon transaction:', {
                to: toAddress,
                value: amount,
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: gasLimit,
                chainId: chainId,
                messageHash: messageHash
            });
            
            return {
                tx: tx, // トランザクションオブジェクト
                hex: serializedTx,
                messageHash: messageHash
            };
            
        } catch (error) {
            console.error("Failed to build Polygon raw transaction:", error);
            throw error;
        }
    }

    /**
     * Solanaブロックハッシュ取得
     */
    async getSolanaBlockhash() {
        try {
            const response = await this.proxyRequest(
                this.endpoints.solana,
                '/blockhash'
            );
            
            console.log("Solana blockhash response:", response);
            
            if (response && response.data && response.data.result && response.data.result.value && response.data.result.value.blockhash) {
                // 直接ブロックハッシュ値を返す
                return response.data.result.value.blockhash;
            } else {
                console.error("Invalid blockhash response structure:", response);
                throw new Error('Invalid blockhash response format');
            }
        } catch (error) {
            console.error("Failed to get Solana blockhash:", error);
            throw error;
        }
    }

    /**
     * Solana生トランザクション構築（solana-web3.browser.js使用）
     */
    async buildSolanaRawTransaction(fromAddress, toAddress, amount, blockhash) {
        try {
            console.log("Building Solana raw transaction (using solana-web3.browser.js):", {
                fromAddress,
                toAddress,
                amount,
                blockhash
            });

            // solana-web3.browser.jsのAPIが利用可能かチェック
            if (!window.SolanaWeb3) {
                throw new Error('solana-web3.browser.js not loaded. Please ensure solana-web3.browser.js is loaded.');
            }

            console.log("Available SolanaWeb3 APIs:", Object.keys(window.SolanaWeb3));

            // solana-web3.browser.jsのAPIを取得
            const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = window.SolanaWeb3;
            
            // 各APIが正しく取得できているかチェック
            if (!Transaction) {
                console.error("Transaction not found in SolanaWeb3:", window.SolanaWeb3);
                throw new Error('Transaction API not available in SolanaWeb3');
            }
            if (!PublicKey) {
                console.error("PublicKey not found in SolanaWeb3:", window.SolanaWeb3);
                throw new Error('PublicKey API not available in SolanaWeb3');
            }
            if (!SystemProgram) {
                console.error("SystemProgram not found in SolanaWeb3:", window.SolanaWeb3);
                throw new Error('SystemProgram API not available in SolanaWeb3');
            }

            // ブロックハッシュの処理（getSolanaBlockhashから直接文字列が返される）
            let blockhashValue;
            if (typeof blockhash === 'string') {
                blockhashValue = blockhash;
            } else {
                console.error("Unexpected blockhash type:", typeof blockhash, blockhash);
                throw new Error('Invalid blockhash format - expected string');
            }

            console.log("Processed blockhash:", blockhashValue);

            // PublicKeyオブジェクトを作成
            const fromPubkey = new PublicKey(fromAddress);
            const toPubkey = new PublicKey(toAddress);

            // 金額をlamportsに変換
            const amountLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

            // トランザクションを作成
            const transaction = new Transaction();
            
            // System ProgramのTransfer命令を追加
            const transferInstruction = SystemProgram.transfer({
                fromPubkey: fromPubkey,
                toPubkey: toPubkey,
                lamports: amountLamports
            });

            transaction.add(transferInstruction);
            transaction.recentBlockhash = blockhashValue;
            transaction.feePayer = fromPubkey;

            // トランザクションメッセージを取得
            const message = transaction.compileMessage();
            
            // メッセージハッシュを生成（署名用）
            const messageHash = await this.generateSolanaMessageHashFromMessage(message);
            console.log("Solana message hash generated:", messageHash);

            // トランザクションをシリアライズ
            const transactionHex = transaction.serializeMessage().toString('hex');
            console.log("Solana transaction serialized:", transactionHex.substring(0, 100) + '...');

            console.log("Solana transaction built (production):", {
                messageHash: messageHash,
                transactionHex: transactionHex.substring(0, 100) + '...',
                blockhash: blockhashValue,
                amountLamports: amountLamports
            });

            return {
                hex: transactionHex,
                messageHash: messageHash
            };
            
        } catch (error) {
            console.error("Failed to build Solana raw transaction:", error);
            throw error;
        }
    }

    /**
     * Solana転送命令データを作成
     */
    createTransferInstructionData(amount) {
        try {
            // System ProgramのTransfer命令（2）のデータを作成
            const amountLamports = Math.floor(parseFloat(amount) * 1000000000); // SOL to lamports
            
            // 命令ID: 2 (Transfer)
            const instructionId = 2;
            
            // 8バイトのリトルエンディアンでamountをエンコード
            const amountBuffer = new ArrayBuffer(8);
            const view = new DataView(amountBuffer);
            view.setBigUint64(0, BigInt(amountLamports), true); // true = little endian
            
            // 命令ID + amountを結合
            const data = new Uint8Array(9);
            data[0] = instructionId;
            data.set(new Uint8Array(amountBuffer), 1);
            
            return Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (error) {
            console.error("Failed to create transfer instruction data:", error);
            throw error;
        }
    }

    /**
     * Solanaメッセージを構築
     */
    buildSolanaMessage(transactionData) {
        try {
            // まずアカウントキーを構築
            const accountKeys = [
                transactionData.feePayer,
                ...transactionData.instructions[0].keys.map(key => key.pubkey)
            ];
            
            // 簡易的なSolanaメッセージ構造を構築
            const message = {
                header: {
                    numRequiredSignatures: 1,
                    numReadonlySignedAccounts: 0,
                    numReadonlyUnsignedAccounts: 1
                },
                accountKeys: accountKeys,
                recentBlockhash: transactionData.recentBlockhash,
                instructions: transactionData.instructions.map(instruction => ({
                    programIdIndex: this.findAccountIndex(instruction.programId, accountKeys),
                    accounts: instruction.keys.map(key => this.findAccountIndex(key.pubkey, accountKeys)),
                    data: instruction.data
                }))
            };
            
            return message;
        } catch (error) {
            console.error("Failed to build Solana message:", error);
            throw error;
        }
    }

    /**
     * アカウントキーのインデックスを検索
     */
    findAccountIndex(pubkey, accountKeys) {
        const index = accountKeys.indexOf(pubkey);
        if (index === -1) {
            throw new Error(`Account key not found: ${pubkey}`);
        }
        return index;
    }

    /**
     * Solanaメッセージハッシュを生成（本番運用向け）
     */
    async generateSolanaMessageHashFromMessage(message) {
        try {
            // @solana/web3.jsのMessageオブジェクトからハッシュを生成
            const messageBytes = message.serialize();
            
            // SHA-256ハッシュを生成
            const hashBuffer = await crypto.subtle.digest('SHA-256', messageBytes);
            const messageHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            
            return messageHash;
        } catch (error) {
            console.error("Failed to generate Solana message hash from message:", error);
            throw error;
        }
    }

    /**
     * Solanaメッセージハッシュを生成（旧実装）
     */
    async generateSolanaMessageHash(message) {
        try {
            // メッセージをシリアライズしてハッシュを生成
            const serializedMessage = this.serializeSolanaMessage(message);
            const messageBytes = new Uint8Array(serializedMessage.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            // SHA-256ハッシュを生成
            const hashBuffer = await crypto.subtle.digest('SHA-256', messageBytes);
            const messageHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
            
            return messageHash;
        } catch (error) {
            console.error("Failed to generate Solana message hash:", error);
            throw error;
        }
    }

    /**
     * Solanaメッセージをシリアライズ
     */
    serializeSolanaMessage(message) {
        try {
            // 簡易的なシリアライゼーション（実際の実装ではより厳密）
            const parts = [
                // ヘッダー
                message.header.numRequiredSignatures.toString(16).padStart(2, '0'),
                message.header.numReadonlySignedAccounts.toString(16).padStart(2, '0'),
                message.header.numReadonlyUnsignedAccounts.toString(16).padStart(2, '0'),
                
                // アカウントキー数
                message.accountKeys.length.toString(16).padStart(2, '0'),
                
                // アカウントキー（各キーは32バイト = 64文字のhex）
                ...message.accountKeys.map(key => key.padEnd(64, '0')),
                
                // 最近のブロックハッシュ（32バイト = 64文字のhex）
                message.recentBlockhash.padEnd(64, '0'),
                
                // 命令数
                message.instructions.length.toString(16).padStart(2, '0'),
                
                // 命令
                ...message.instructions.map(instruction => 
                    instruction.programIdIndex.toString(16).padStart(2, '0') +
                    instruction.accounts.length.toString(16).padStart(2, '0') +
                    instruction.accounts.map(acc => acc.toString(16).padStart(2, '0')).join('') +
                    instruction.data.length.toString(16).padStart(4, '0') +
                    instruction.data
                )
            ];
            
            return parts.join('');
        } catch (error) {
            console.error("Failed to serialize Solana message:", error);
            throw error;
        }
    }

    /**
     * Solanaトランザクションをシリアライズ
     */
    serializeSolanaTransaction(transactionData) {
        try {
            // 簡易的なトランザクションシリアライゼーション
            const transactionHex = this.serializeSolanaMessage(this.buildSolanaMessage(transactionData));
            return transactionHex;
        } catch (error) {
            console.error("Failed to serialize Solana transaction:", error);
            throw error;
        }
    }

    /**
     * SPL-Token転送トランザクションを構築
     */
    async buildSPLTokenTransferTransaction(fromAddress, toAddress, mintAddress, amount, decimals = 9) {
        try {
            console.log("Building SPL-Token transfer transaction:", {
                fromAddress,
                toAddress,
                mintAddress,
                amount,
                decimals
            });

            // solana-web3.browser.jsのAPIが利用可能かチェック
            if (!window.SolanaWeb3) {
                throw new Error('solana-web3.browser.js not loaded. Please ensure solana-web3.browser.js is loaded.');
            }

            // APIの取得とチェック
            const { Connection, PublicKey, Transaction, LAMPORTS_PER_SOL } = window.SolanaWeb3;
            
            // SPL-Token関連のAPIは現在利用できないため、エラーを投げる
            throw new Error('SPL-Token transfer is not supported with current solana-web3.browser.js setup');

            // 最新のブロックハッシュを取得（直接文字列が返される）
            const blockhashValue = await this.getSolanaBlockhash();

            // PublicKeyオブジェクトを作成
            const fromPubkey = new PublicKey(fromAddress);
            const toPubkey = new PublicKey(toAddress);
            const mintPubkey = new PublicKey(mintAddress);

            // トランザクションを作成
            const transaction = new Transaction();
            
            // 送信者のAssociated Token Accountを取得または作成
            const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
                this.getSolanaConnection(),
                fromPubkey,
                mintPubkey,
                fromPubkey
            );

            // 受信者のAssociated Token Accountを取得または作成
            const toTokenAccount = await getOrCreateAssociatedTokenAccount(
                this.getSolanaConnection(),
                fromPubkey,
                mintPubkey,
                toPubkey
            );

            // 転送命令を追加
            const transferInstruction = createTransferInstruction(
                fromTokenAccount.address,
                toTokenAccount.address,
                fromPubkey,
                amount * Math.pow(10, decimals)
            );

            transaction.add(transferInstruction);
            transaction.recentBlockhash = blockhashValue;
            transaction.feePayer = fromPubkey;

            // トランザクションメッセージを取得
            const message = transaction.compileMessage();
            
            // メッセージハッシュを生成（署名用）
            const messageHash = await this.generateSolanaMessageHashFromMessage(message);

            // トランザクションをシリアライズ
            const transactionHex = transaction.serializeMessage().toString('hex');

            console.log("SPL-Token transfer transaction built:", {
                messageHash: messageHash,
                transactionHex: transactionHex.substring(0, 100) + '...',
                blockhash: blockhashValue,
                fromTokenAccount: fromTokenAccount.address.toString(),
                toTokenAccount: toTokenAccount.address.toString()
            });

            return {
                hex: transactionHex,
                messageHash: messageHash
            };
            
        } catch (error) {
            console.error("Failed to build SPL-Token transfer transaction:", error);
            throw error;
        }
    }

    /**
     * Solana接続を取得
     */
    getSolanaConnection() {
        try {
            if (!window.SolanaWeb3) {
                throw new Error('solana-web3.browser.js not loaded');
            }

            const { Connection, clusterApiUrl } = window.SolanaWeb3;
            
            // ネットワークに応じてエンドポイントを選択
            let endpoint;
            if (this.network === 'testnet') {
                endpoint = clusterApiUrl('testnet');
            } else if (this.network === 'devnet') {
                endpoint = clusterApiUrl('devnet');
            } else {
                endpoint = clusterApiUrl('mainnet-beta');
            }

            return new Connection(endpoint, 'confirmed');
        } catch (error) {
            console.error("Failed to get Solana connection:", error);
            throw error;
        }
    }

    /**
     * 署名付きSolanaトランザクションをシリアライズ
     */
    serializeSignedSolanaTransaction(signedTransaction) {
        try {
            // 署名付きトランザクションの構造
            const parts = [
                // 署名数
                signedTransaction.signatures.length.toString(16).padStart(2, '0'),
                
                // 署名（各署名は64バイト）
                ...signedTransaction.signatures.map(sig => sig.padEnd(128, '0')),
                
                // メッセージ
                signedTransaction.message
            ];
            
            return parts.join('');
        } catch (error) {
            console.error("Failed to serialize signed Solana transaction:", error);
            throw error;
        }
    }

    /**
     * TON seqno取得
     */
    async getTONSeqno(address) {
        try {
            const response = await this.proxyRequest(
                this.endpoints.ton,
                `/address/${address}/seqno`
            );
            return response.data || 0;
        } catch (error) {
            console.error("Failed to get TON seqno:", error);
            return 0;
        }
    }

    /**
     * TON生トランザクション構築
     */
    async buildTONRawTransaction(fromAddress, toAddress, amount, seqno) {
        try {
            // 簡単な実装（実際の実装ではTonWeb.jsを使用）
            const dummyTx = {
                hex: 'dummy_ton_transaction_hex',
                messageHash: 'dummy_ton_message_hash_for_mpc_signing'
            };
            
            return {
                hex: dummyTx.hex,
                messageHash: dummyTx.messageHash
            };
            
        } catch (error) {
            console.error("Failed to build TON raw transaction:", error);
            throw error;
        }
    }

    // ==========================================
    // 署名追加メソッド（基本的な実装）
    // ==========================================

    /**
     * P2WPKH署名追加（ECDSA署名をDER形式で追加）
     */
    async addBitcoinP2WPKHSignature(unsignedTx, signature, publicKeyHex) {
        try {
            console.log("Adding P2WPKH signature to transaction", { rawSignature: signature, publicKeyHex: publicKeyHex?.substring(0, 20) + '...' });
            
            const bitcoin = window.bitcoinjs || window.bitcoin;
            if (!bitcoin) {
                throw new Error("bitcoinjs-lib is not loaded");
            }

            // 1) signature を正規化（DER形式）: まず {r,s,recid} オブジェクト優先
            let signatureBuffer;
            let sigObj = null;
            
            // 署名オブジェクトとして渡される場合（推奨パス）
            if (typeof signature === 'object' && signature !== null) {
                // coins.js からの { signature: { r, s, recid }, publicKey } 形式
                if (signature.signature && typeof signature.signature === 'object' && signature.signature.r && signature.signature.s) {
                    sigObj = signature.signature;
                }
                // 直接 { r, s, recid } が渡される場合
                else if (signature.r && signature.s) {
                    sigObj = signature;
                }
            }
            
            if (sigObj) {
                // { r, s } からDER + hashTypeを生成
                console.log("🔍 Using MPC ECDSA signature object {r,s} for DER conversion");
                const derSig = this.mpcSignatureToBitcoinDER(sigObj, 0x01); // SIGHASH_ALL
                signatureBuffer = derSig;
                console.log("🔍 Converted {r,s} to DER, length(bytes):", derSig.length);
            } else {
                // フォールバック: 文字列hexとして扱う
                let sigHex = String(signature).trim();
                
                // JSON 由来のダブルクォートを除去（"022f..." → 022f...）
                if (sigHex.startsWith('"') && sigHex.endsWith('"')) {
                    sigHex = sigHex.slice(1, -1);
                }
                
                // 0x プレフィックスを除去
                if (sigHex.startsWith('0x') || sigHex.startsWith('0X')) {
                    sigHex = sigHex.slice(2);
                }
                
                // 余計な文字（改行など）を除去
                sigHex = sigHex.replace(/[^0-9a-fA-F]/g, '');
                
                // 128文字なら r||s 形式として扱う
                if (sigHex.length === 128) {
                    console.log("🔍 Detected 128-char signature, treating as r||s hex format");
                    const rHex = sigHex.slice(0, 64);
                    const sHex = sigHex.slice(64, 128);
                    
                    const mpcSig = { r: rHex, s: sHex };
                    const derSig = this.mpcSignatureToBitcoinDER(mpcSig, 0x01); // SIGHASH_ALL
                    signatureBuffer = derSig;
                    console.log("🔍 Converted r||s hex to DER, length(bytes):", derSig.length);
                } else {
                    // 128文字以外は、既にDER形式のhexとみなす（通常70〜72バイト=140〜144文字）
                    if (!sigHex || sigHex.length < 140) {
                        console.error("Signature hex is too short or empty:", sigHex);
                        throw new Error(`Invalid signature format. Expected DER (140+ chars) or r||s (128 chars), got ${sigHex.length} chars`);
                    }
                    
                    console.log("🔍 Assuming DER format, length(chars):", sigHex.length);
                    signatureBuffer = Buffer.from(sigHex, 'hex');
                }
            }
            
            // 2) 公開鍵を取得
            if (!publicKeyHex) {
                throw new Error('Public key is required for P2WPKH signature');
            }
            
            let pubKeyHex = publicKeyHex.toLowerCase().replace(/^0x/, '');
            let pubKeyBytes = Buffer.from(pubKeyHex, 'hex');
            
            // x||y (64 bytes) を検出した場合は 0x04 を付与
            if (pubKeyBytes.length === 64) {
                pubKeyBytes = Buffer.concat([Buffer.from([0x04]), pubKeyBytes]);
            }
            
            // 圧縮公開鍵を取得
            if (pubKeyBytes.length === 65) {
                // BitVoyTaprootのsecp256k1を使用して圧縮
                if (window.BitVoyTaproot && window.BitVoyTaproot.secp256k1) {
                    const { secp256k1 } = window.BitVoyTaproot;
                    const publicPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
                    pubKeyBytes = Buffer.from(publicPoint.toRawBytes(true));
                }
            }
            
            // 3) TX に署名を追加（P2WPKHはwitnessに[signature, pubkey]を追加）
            const tx = bitcoin.Transaction.fromHex(unsignedTx);
            tx.setWitness(0, [signatureBuffer, pubKeyBytes]);  // P2WPKH: [signature, pubkey]
            
            const signedTxHex = tx.toHex();
    
            // 4) witness の確認ログ
            const debugTx = bitcoin.Transaction.fromHex(signedTxHex);
            const wit0 = debugTx.ins[0].witness || [];
            console.log("🔍 Witness debug (P2WPKH):", {
                inputs: debugTx.ins.length,
                witCountInput0: wit0.length,
                wit0SigLen: wit0[0] ? wit0[0].length : 0,
                wit0PubkeyLen: wit0[1] ? wit0[1].length : 0,
                wit0SigHexPreview: wit0[0] ? wit0[0].toString('hex').slice(0, 16) + '...' : null,
                wit0PubkeyHexPreview: wit0[1] ? wit0[1].toString('hex').slice(0, 16) + '...' : null,
            });
    
            console.log("P2WPKH signature added successfully:", {
                originalTx: unsignedTx.substring(0, 50) + '...',
                signedTx: signedTxHex.substring(0, 50) + '...',
                sigByteLen: signatureBuffer.length,
            });
            
            return signedTxHex;
        } catch (error) {
            console.error("Failed to add P2WPKH signature:", error);
            throw error;
        }
    }

    /**
     * Bitcoin署名追加（Taproot用、コメントアウト）
     */
    async addBitcoinSignature(unsignedTx, signature) {
        try {
            console.log("Adding Bitcoin signature to transaction", { rawSignature: signature });
            
            const bitcoin = window.bitcoinjs || window.bitcoin;
            if (!bitcoin) {
                throw new Error("bitcoinjs-lib is not loaded");
            }
    
            // 1) signature を正規化
            let sigHex = signature;
    
            // オブジェクトで来てる場合（{ signature: "0x..." } など）もケア
            if (typeof sigHex === 'object' && sigHex !== null) {
                if (sigHex.signature) sigHex = sigHex.signature;
                else if (sigHex.sig) sigHex = sigHex.sig;
                else {
                    console.warn("⚠️ Signature object has no .signature or .sig field:", sigHex);
                    sigHex = String(sigHex);
                }
            }
    
            sigHex = String(sigHex).trim();
    
            // JSON 由来のダブルクォートを除去
            if (sigHex.startsWith('"') && sigHex.endsWith('"')) {
                sigHex = sigHex.slice(1, -1);
            }
    
            // 0x プレフィックスを除去
            if (sigHex.startsWith('0x') || sigHex.startsWith('0X')) {
                sigHex = sigHex.slice(2);
            }
                
            // 余計な文字（改行など）を除去
            sigHex = sigHex.replace(/[^0-9a-fA-F]/g, '');
            
            // 128文字(64バイト)より長い場合は、末尾を切り捨てて 64バイトに揃える
            if (sigHex.length > 128) {
                console.warn(
                `⚠️ Schnorr sig is longer than 64 bytes (len=${sigHex.length}), trimming to 64 bytes for Taproot key-path`
                );
                sigHex = sigHex.slice(0, 128);
            }

            // 空・短すぎチェック
            if (!sigHex || sigHex.length < 128) {
                console.error("Signature hex is too short or empty:", sigHex);
                throw new Error(`Invalid Schnorr signature hex length: ${sigHex.length}`);
            }
            console.log("🔍 Final Schnorr sig hex len:", sigHex.length, "last byte:", sigHex.slice(-2));

            const signatureBuffer = Buffer.from(sigHex, 'hex');
            
            // バイト長チェック（Schnorrは64 or 64+1）
            if (signatureBuffer.length !== 64 && signatureBuffer.length !== 65) {
                console.error("Unexpected Schnorr signature byte length:", signatureBuffer.length, {
                    sigHexLength: sigHex.length,
                });
                throw new Error(`Invalid Schnorr signature byte length: ${signatureBuffer.length}`);
            }
    
            console.log("✅ Normalized Schnorr signature:", {
                sigHexPreview: sigHex.slice(0, 16) + '...',
                hexLen: sigHex.length,
                byteLen: signatureBuffer.length,
            });
    
            // 2) TX に署名を追加
            const tx = bitcoin.Transaction.fromHex(unsignedTx);
            tx.setWitness(0, [signatureBuffer]);  // Taproot key-path
            
            const signedTxHex = tx.toHex();
    
            // 3) witness の確認ログ（重要）
            const debugTx = bitcoin.Transaction.fromHex(signedTxHex);
            const wit0 = debugTx.ins[0].witness || [];
            console.log("🔍 Witness debug:", {
                inputs: debugTx.ins.length,
                witCountInput0: wit0.length,
                wit0Len: wit0[0] ? wit0[0].length : 0,
                wit0HexPreview: wit0[0] ? wit0[0].toString('hex').slice(0, 16) + '...' : null,
            });
    
            console.log("Bitcoin signature added successfully:", {
                originalTx: unsignedTx.substring(0, 50) + '...',
                signedTx: signedTxHex.substring(0, 50) + '...',
                sigHexLen: sigHex.length,
                sigByteLen: signatureBuffer.length,
            });
            
            return signedTxHex;
        } catch (error) {
            console.error("Failed to add Bitcoin signature:", error);
            throw error;
        }
    }

    /**
     * Ethereum署名追加
     */
    async addEthereumSignature(unsignedTx, signature) {
        try {
            // 簡単な実装（実際の実装ではethers.jsを使用）
            return unsignedTx + '_signed_with_' + signature;
        } catch (error) {
            console.error("Failed to add Ethereum signature:", error);
            throw error;
        }
    }

    /**
     * Solana署名追加（solana-web3.browser.js使用）
     */
    async addSolanaSignature(unsignedTx, signature) {
        try {
            console.log("Adding Solana signature to transaction (using solana-web3.browser.js)");
            
            // solana-web3.browser.jsのAPIが利用可能かチェック
            if (!window.SolanaWeb3) {
                throw new Error('solana-web3.browser.js not loaded. Please ensure solana-web3.browser.js is loaded.');
            }

            const { Transaction, Message } = window.SolanaWeb3;
            
            // 署名をhex文字列からUint8Arrayに変換
            let signatureBytes;
            if (typeof signature === 'string') {
                // 署名文字列から0xプレフィックスを削除（存在する場合）
                const sigHex = signature.replace(/^0x/, '').replace(/^"/, '').replace(/"$/, '');
                signatureBytes = new Uint8Array(sigHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            } else {
                throw new Error('Invalid signature format');
            }
            
            // 未署名トランザクション（メッセージ）を復元
            const unsignedTxBytes = new Uint8Array(unsignedTx.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            // Messageオブジェクトを復元（serializeMessage()でシリアライズされたメッセージから）
            const message = Message.from(unsignedTxBytes);
            
            // Messageからトランザクションを構築（populateメソッドを使用）
            const transaction = Transaction.populate(message);
            
            // 署名を追加
            transaction.addSignature(transaction.feePayer, signatureBytes);
            
            // 署名付きトランザクションをシリアライズ
            const signedTxHex = transaction.serialize().toString('hex');
            
            console.log("Solana signature added successfully (production):", {
                originalTx: unsignedTx.substring(0, 100) + '...',
                signedTx: signedTxHex.substring(0, 100) + '...',
                signatureLength: signatureBytes.length
            });
            
            return signedTxHex;
            
        } catch (error) {
            console.error("Failed to add Solana signature:", error);
            throw error;
        }
    }

    /**
     * TON署名追加
     */
    async addTONSignature(unsignedTx, signature) {
        try {
            // 簡単な実装（実際の実装ではTonWeb.jsを使用）
            return unsignedTx + '_signed_with_' + signature;
        } catch (error) {
            console.error("Failed to add TON signature:", error);
            throw error;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BitVoyWallet;
} else if (typeof window !== 'undefined') {
    window.BitVoyWallet = BitVoyWallet;
}