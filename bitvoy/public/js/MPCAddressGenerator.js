/**
 * MPCAddressGenerator.js
 * MPC公開鍵からBitcoin、Ethereum、Solana、TONのアドレスを生成するクラス
 */

class MPCAddressGenerator {
    constructor() {
        // 依存ライブラリの確認
        this.checkBuffer();
        this.checkDependencies();
        
    }
      
    checkBuffer() {
        console.log('🔍 Checking Buffer...');
        if (typeof Buffer === 'undefined' && typeof window.Buffer === 'undefined') {
            throw new Error('Bufferライブラリが読み込まれていません。buffer@6.0.3.jsが必要です。');
        }
        
        if (typeof Buffer === 'undefined') {
            window.Buffer = window.Buffer;
        }
        console.log('✅ Buffer is available');
    }
      
    /**
     * 必要な依存ライブラリが読み込まれているかチェック
     */
    checkDependencies() {
        // デバッグ情報を出力
        console.log('🔍 Checking dependencies...');
        const bitcoinLib = typeof bitcoin !== 'undefined' ? bitcoin
            : (typeof window !== 'undefined' && window.bitcoin ? window.bitcoin
            : (typeof window !== 'undefined' ? window.bitcoinjs : undefined));

        console.log('bitcoin:', typeof bitcoinLib);
        console.log('ethers:', typeof ethers);
        console.log('secp256k1:', typeof secp256k1);
        console.log('solanaWeb3:', typeof solanaWeb3);
        console.log('solana:', typeof solana);
        console.log('TonWeb:', typeof TonWeb);
        console.log('ed25519HdKey:', typeof ed25519HdKey);
        console.log('nacl:', typeof nacl);

        // 利用可能なSolanaライブラリを検索
        let solanaLib = null;
        if (typeof solanaWeb3 !== 'undefined') {
            solanaLib = solanaWeb3;
            console.log('✅ Found solanaWeb3');
        } else if (typeof solana !== 'undefined') {
            solanaLib = solana;
            console.log('✅ Found solana');
        } else {
            // グローバルオブジェクトからSolanaライブラリを検索
            for (const key in window) {
                if (key.toLowerCase().includes('solana') && typeof window[key] === 'object') {
                    console.log(`Found potential Solana library: ${key}`, window[key]);
                    if (window[key].PublicKey) {
                        solanaLib = window[key];
                        console.log(`✅ Using ${key} as Solana library`);
                        break;
                    }
                }
            }
        }

        const requiredLibs = {
            'bitcoin': typeof bitcoinLib !== 'undefined',
            'ethers': typeof ethers !== 'undefined',
            'solanaWeb3': solanaLib !== null,
            'TonWeb': typeof TonWeb !== 'undefined',
            'ed25519HdKey': typeof ed25519HdKey !== 'undefined',
            'nacl': typeof nacl !== 'undefined'
        };

        if (typeof bitcoin === 'undefined' && typeof window !== 'undefined' && bitcoinLib) {
            window.bitcoin = bitcoinLib;
        }

        const missingLibs = Object.entries(requiredLibs)
            .filter(([name, loaded]) => !loaded)
            .map(([name]) => name);

        if (missingLibs.length > 0) {
            throw new Error(`必要なライブラリが読み込まれていません: ${missingLibs.join(', ')}`);
        }

        // 利用可能なライブラリを保存
        this.solanaLib = solanaLib;
        this.bitcoinLib = bitcoinLib;

        console.log('✅ All dependencies loaded successfully');
    }
    
    fromHex(hex) {
        if (typeof hex !== 'string') return null;
        const s = hex.trim().toLowerCase();
        if (!/^[0-9a-f]*$/.test(s) || (s.length % 2) !== 0) return null;
        return new Uint8Array(s.match(/../g).map(b => parseInt(b, 16)));
    }
    
    /**
     * ヘルパー関数：Uint8Arrayをhex文字列に変換
     * @param {Uint8Array} bytes - バイト配列
     * @returns {string} hex文字列
     */
    toHex(bytes) {
        return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * secp256k1公開鍵から Taproot (P2TR, bech32m) アドレスを生成
     * @param {string} secp256k1PubKeyHex - 65B(04...) or 33B(02/03...) or 64B(x||y) 公開鍵(hex)
     * @param {'mainnet'|'testnet'} network - デフォルト 'mainnet'
     * @returns {Promise<string>} bc1p../tb1p.. アドレス
     */
    async generateBitcoinTaprootAddress(secp256k1PubKeyHex, network = 'mainnet') {
        try {
            if (!secp256k1PubKeyHex) {
                throw new Error('secp256k1公開鍵が指定されていません');
            }

            // BitVoyTaprootライブラリが利用可能か確認
            if (!window.BitVoyTaproot) {
                throw new Error('BitVoyTaprootライブラリが利用できません');
            }

            const { secp256k1, utils, networks: taprootNetworks } = window.BitVoyTaproot;
            if (!secp256k1 || !utils || !taprootNetworks) {
                throw new Error('BitVoyTaprootの必要なコンポーネントが利用できません');
            }

            let pubKeyHex = secp256k1PubKeyHex.toLowerCase().replace(/^0x/, '');
            if (!/^[0-9a-f]+$/.test(pubKeyHex)) {
                throw new Error('公開鍵がhex形式ではありません');
            }

            let pubKeyBytes = new Uint8Array(Buffer.from(pubKeyHex, 'hex'));

            // x||y (64 bytes) を検出した場合は 0x04 を付与
            if (pubKeyBytes.length === 64) {
                const pubKeyWithPrefix = new Uint8Array(65);
                pubKeyWithPrefix[0] = 0x04;
                pubKeyWithPrefix.set(pubKeyBytes, 1);
                pubKeyBytes = pubKeyWithPrefix;
            }

            // secp256k1のProjectivePointを使用して公開鍵を解析
            let publicPoint;
            try {
                if (pubKeyBytes.length === 33) {
                    // 圧縮形式 (33 bytes)
                    publicPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
                } else if (pubKeyBytes.length === 65) {
                    // 非圧縮形式 (65 bytes)
                    publicPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
                } else {
                    throw new Error(`公開鍵の長さが不正です (${pubKeyBytes.length} bytes)`);
                }
            } catch (error) {
                throw new Error(`公開鍵の解析に失敗しました: ${error.message}`);
            }

            // x-only公開鍵を取得（y座標が偶数の点を使用）
            // 圧縮形式の公開鍵を取得（0x02 = y座標が偶数、0x03 = y座標が奇数）
            const compressedPubKey = publicPoint.toRawBytes(true);
            const prefix = compressedPubKey[0];
            const xOnly = compressedPubKey.slice(1); // x座標（32 bytes）
            
            // y座標が偶数の点を使用（必要に応じてy座標を反転）
            let xOnlyKey;
            if (prefix === 0x02) {
                // y座標が偶数の点
                xOnlyKey = xOnly;
            } else {
                // y座標が奇数の点の場合は、y座標を反転した点を使用
                const negatedPoint = publicPoint.negate();
                xOnlyKey = negatedPoint.toRawBytes(true).slice(1);
            }
            
            // Taproot tweakを計算（key-path専用のため、merkle_rootは32バイトのゼロ値）
            const merkleRoot = new Uint8Array(32); // 32バイトのゼロ値（明示的に設定）
            const tweak = utils.tapTweak ? utils.tapTweak(xOnlyKey, merkleRoot) : null;
            
            if (!tweak) {
                throw new Error('tapTweak calculation failed');
            }
            
            // 出力キーを生成
            let outputKey;
            if (tweak && utils.outputKeyX) {
                outputKey = utils.outputKeyX(xOnlyKey, tweak);
            } else {
                throw new Error('outputKeyX calculation failed');
            }

            // Taprootアドレスを生成
            const hrp = network === 'testnet' ? taprootNetworks.testnet.hrp : taprootNetworks.bitcoin.hrp;
            const taprootAddress = utils.toP2TR(hrp, outputKey);
            
            // tweak情報をhex文字列に変換
            const taprootInternalKeyHex = Array.from(xOnlyKey).map(b => b.toString(16).padStart(2, '0')).join('');
            const taprootTweakHex = Array.from(tweak).map(b => b.toString(16).padStart(2, '0')).join('');
            const taprootMerkleRootHex = Array.from(merkleRoot).map(b => b.toString(16).padStart(2, '0')).join('');
            
            console.log(`✅ Bitcoin Taproot address generated: ${taprootAddress}`);
            
            // アドレスとtweak情報を返す
            return {
                address: taprootAddress,
                taproot_internal_key: taprootInternalKeyHex,
                taproot_tweak: taprootTweakHex,
                taproot_merkle_root: taprootMerkleRootHex
            };
        } catch (error) {
            throw new Error(`Bitcoin Taprootアドレス生成エラー: ${error.message}`);
        }
    }
    
    /**
     * secp256k1公開鍵からP2WPKH (Pay to Witness Public Key Hash) アドレスを生成
     * @param {string} secp256k1PubKeyHex - 65B(04...) or 33B(02/03...) or 64B(x||y) 公開鍵(hex)
     * @param {'mainnet'|'testnet'} network - デフォルト 'mainnet'
     * @returns {Promise<{address: string}>} bc1q../tb1q.. アドレス
     */
    async generateBitcoinP2WPKHAddress(secp256k1PubKeyHex, network = 'mainnet') {
        try {
            if (!secp256k1PubKeyHex) {
                throw new Error('secp256k1公開鍵が指定されていません');
            }

            let pubKeyHex = secp256k1PubKeyHex.toLowerCase().replace(/^0x/, '');
            if (!/^[0-9a-f]+$/.test(pubKeyHex)) {
                throw new Error('公開鍵がhex形式ではありません');
            }

            let pubKeyBytes = Buffer.from(pubKeyHex, 'hex');

            // x||y (64 bytes) を検出した場合は 0x04 を付与
            if (pubKeyBytes.length === 64) {
                pubKeyBytes = Buffer.concat([Buffer.from([0x04]), pubKeyBytes]);
            }

            // 圧縮公開鍵を取得
            let compressedPubKey;
            
            // BitVoyTaprootのsecp256k1を使用して圧縮公開鍵を取得
            if (!window.BitVoyTaproot || !window.BitVoyTaproot.secp256k1) {
                throw new Error('BitVoyTaproot.secp256k1 is required for P2WPKH address generation');
            }

            const { secp256k1 } = window.BitVoyTaproot;
            
            // 公開鍵を圧縮形式に変換
            let publicPoint;
            try {
                if (pubKeyBytes.length === 33) {
                    // 既に圧縮形式
                    publicPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
                } else if (pubKeyBytes.length === 65) {
                    // 非圧縮形式
                    publicPoint = secp256k1.ProjectivePoint.fromHex(pubKeyBytes);
                } else {
                    throw new Error(`公開鍵の長さが不正です (${pubKeyBytes.length} bytes)`);
                }
            } catch (error) {
                throw new Error(`公開鍵の解析に失敗しました: ${error.message}`);
            }

            // 圧縮公開鍵を取得
            compressedPubKey = Buffer.from(publicPoint.toRawBytes(true));

            // SHA256(RIPEMD160(圧縮公開鍵))で20バイトのハッシュを生成
            let hash160;
            
            // bitcoinjs-libが利用可能な場合はそれを使用
            if (window.bitcoinjs || window.bitcoin) {
                const bitcoin = window.bitcoinjs || window.bitcoin;
                if (bitcoin.crypto && bitcoin.crypto.hash160) {
                    hash160 = bitcoin.crypto.hash160(compressedPubKey);
                } else if (bitcoin.address && bitcoin.address.toOutputScript) {
                    // bitcoinjs-lib v6の場合
                    const { sha256 } = window.BitVoyTaproot || {};
                    const { ripemd160 } = window.BitVoyTaproot || {};
                    if (sha256 && ripemd160) {
                        const sha256Hash = sha256(compressedPubKey);
                        hash160 = Buffer.from(ripemd160(sha256Hash));
                    } else {
                        throw new Error('hash160 calculation functions not available');
                    }
                }
            }
            
            // bitcoinjs-libが利用できない場合は、taproot.bundle.jsの関数を使用
            if (!hash160) {
                // taproot.bundle.jsに含まれるhash160関数を使用
                if (window.BitVoyTaproot && typeof window.BitVoyTaproot.hash160 === 'function') {
                    hash160 = Buffer.from(window.BitVoyTaproot.hash160(compressedPubKey));
                } else {
                    // 手動でSHA256とRIPEMD160を計算
                    const { sha256, ripemd160 } = window.BitVoyTaproot || {};
                    if (!sha256 || !ripemd160) {
                        throw new Error('SHA256 and RIPEMD160 functions are required for P2WPKH address generation');
                    }
                    const sha256Hash = sha256(compressedPubKey);
                    hash160 = Buffer.from(ripemd160(sha256Hash));
                }
            }

            // bech32エンコードでP2WPKHアドレスを生成
            const hrp = network === 'testnet' ? 'tb' : 'bc';
            const witnessVersion = 0x00; // P2WPKHはwitness version 0
            
            // bitcoinjs-libが利用可能な場合はそれを使用
            let address;
            if (window.bitcoinjs || window.bitcoin) {
                const bitcoin = window.bitcoinjs || window.bitcoin;
                if (bitcoin.address && bitcoin.address.toBech32) {
                    address = bitcoin.address.toBech32(hash160, witnessVersion, hrp);
                } else if (bitcoin.address && bitcoin.address.encode) {
                    // bitcoinjs-lib v6の場合
                    const words = bitcoin.address.bech32.toWords(Buffer.concat([Buffer.from([witnessVersion]), hash160]));
                    address = bitcoin.address.bech32.encode(hrp, words);
                } else {
                    // フォールバック: taproot.bundle.jsのbech32を使用
                    if (window.BitVoyTaproot && window.BitVoyTaproot.bech32) {
                        const words = window.BitVoyTaproot.bech32.toWords(Buffer.concat([Buffer.from([witnessVersion]), hash160]));
                        address = window.BitVoyTaproot.bech32.encode(hrp, words);
                    } else {
                        throw new Error('bech32 encoding function is required for P2WPKH address generation');
                    }
                }
            } else {
                // taproot.bundle.jsのbech32を使用
                if (window.BitVoyTaproot && window.BitVoyTaproot.bech32) {
                    const words = window.BitVoyTaproot.bech32.toWords(Buffer.concat([Buffer.from([witnessVersion]), hash160]));
                    address = window.BitVoyTaproot.bech32.encode(hrp, words);
                } else {
                    throw new Error('bech32 encoding function is required for P2WPKH address generation');
                }
            }

            console.log(`✅ Bitcoin P2WPKH address generated: ${address}`);
            return { address };
        } catch (error) {
            throw new Error(`Bitcoin P2WPKHアドレス生成エラー: ${error.message}`);
        }
    }
    
    /**
     * [非推奨・削除予定] MPC-HD pathを使用して子公開鍵を派生
     * HDWallet廃止により、このメソッドは使用されなくなりました。
     * マスター公開鍵から直接アドレスを生成する方式に変更されました。
     * @deprecated HDWallet廃止により削除予定
     * @param {string} masterPubKeyHex - マスター公開鍵（hex文字列）
     * @param {string} path - MPC-HD path（例: /ethereum/0/0, /bitcoin/segwit/0/0）
     * @returns {string} 子公開鍵（hex文字列、圧縮形式）
     */
    async deriveChildPublicKeyFromPath(masterPubKeyHex, path) {
        console.warn('[DEPRECATED] deriveChildPublicKeyFromPath is deprecated. HDWallet has been removed. Use master public key directly.');
        // 後方互換性のため、マスター公開鍵をそのまま返す（実際には使用されない）
        const masterPubKey = masterPubKeyHex.startsWith('0x')
            ? masterPubKeyHex.slice(2)
            : masterPubKeyHex;
        // 圧縮形式に変換
        if (typeof window !== 'undefined' && window.BitVoyTaproot && window.BitVoyTaproot.secp256k1) {
            const secp = window.BitVoyTaproot.secp256k1;
            const P = secp.ProjectivePoint.fromHex(masterPubKey);
            const compressed = P.toRawBytes(true);
            return Buffer.from(compressed).toString('hex');
        }
        return masterPubKey;
    }

    /**
     * ecdsa_tss公開鍵からEthereumアドレスを生成
     * @param {string} pubKeyHex - 65バイト非圧縮形式の公開鍵（hex文字列、ecdsa_tss）
     * @returns {string} Ethereumアドレス
     */
    generateEthereumAddress(pubKeyHex) {
        try {
            // 公開鍵をバッファに変換
            const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
            
            // 公開鍵の長さをチェック
            if (pubKeyBuffer.length !== 33 && pubKeyBuffer.length !== 65) {
                throw new Error(`Invalid public key length: ${pubKeyBuffer.length} bytes`);
            }
            
            // ethers.jsが内部でsecp256k1ライブラリを必要とするため、
            // BitVoyTaprootのsecp256k1をethers.jsに提供
            if (window.BitVoyTaproot?.secp256k1 && !window.secp256k1) {
                window.secp256k1 = window.BitVoyTaproot.secp256k1;
            }
            
            // Ethereumアドレスを計算（公開鍵から直接）
            const ethAddress = ethers.utils.computeAddress(pubKeyBuffer);
            
            return ethAddress;
        } catch (error) {
            throw new Error(`Ethereumアドレス生成エラー: ${error.message}`);
        }
    }

    /**
     * ecdsa_tss公開鍵からPolygonアドレスを生成
     * @param {string} pubKeyHex - 65バイト非圧縮形式の公開鍵（hex文字列、ecdsa_tss）
     * @returns {string} Polygonアドレス
     */
    generatePolygonAddress(pubKeyHex) {
        try {
            // 公開鍵をバッファに変換
            const pubKeyBuffer = Buffer.from(pubKeyHex, 'hex');
            
            // 公開鍵の長さをチェック
            if (pubKeyBuffer.length !== 33 && pubKeyBuffer.length !== 65) {
                throw new Error(`Invalid public key length: ${pubKeyBuffer.length} bytes`);
            }
            
            // ethers.jsが内部でsecp256k1ライブラリを必要とするため、
            // BitVoyTaprootのsecp256k1をethers.jsに提供
            if (window.BitVoyTaproot?.secp256k1 && !window.secp256k1) {
                window.secp256k1 = window.BitVoyTaproot.secp256k1;
            }

            // Polygonアドレスを計算（公開鍵から直接）
            const polygonAddress = ethers.utils.computeAddress(pubKeyBuffer);

            return polygonAddress;
        } catch (error) {
            throw new Error(`Polygonアドレス生成エラー: ${error.message}`);
        }
    }

    /**
     * ed25519マスターシードからSolanaアドレスを生成
     * @param {string} ed25519MasterSeedHex - 32バイトマスターシード（hex文字列）
     * @returns {string} Solanaアドレス
     */
    generateSolanaAddress(ed25519MasterSeedHex) {
        try {
            // マスターシードをバッファに変換
            const ed25519Seed = Buffer.from(ed25519MasterSeedHex, 'hex');
            
            // SolanaはEd25519なので、HD派生パスを使用せず、マスターシードから直接キーペアを生成
            // pathを無視してアドレス生成（MPC-HD Walletは使用しない）
            const solanaKeypair = nacl.sign.keyPair.fromSeed(ed25519Seed);
            
            // 保存されたSolanaライブラリを使用してアドレスを生成
            const solanaAddress = new this.solanaLib.PublicKey(solanaKeypair.publicKey).toBase58();
            
            return solanaAddress;
        } catch (error) {
            throw new Error(`Solanaアドレス生成エラー: ${error.message}`);
        }
    }

    /**
     * ed25519マスターシードからTONアドレスを生成
     * @param {string} ed25519MasterSeedHex - 32バイトマスターシード（hex文字列）
     * @returns {string} TONアドレス
     */
    async generateTONAddress(ed25519MasterSeedHex) {
        try {
            // マスターシードをバッファに変換
            const ed25519Seed = Buffer.from(ed25519MasterSeedHex, 'hex');
            
            // TONはEd25519なので、HD派生パスを使用せず、マスターシードから直接キーペアを生成
            // pathを無視してアドレス生成（MPC-HD Walletは使用しない）
            const tonKeypair = nacl.sign.keyPair.fromSeed(ed25519Seed);
            
            // TonWebを使用してウォレットを生成
            const tonweb = new TonWeb();
            const WalletClass = tonweb.wallet.all.v4R2;
            const wallet = new WalletClass(tonweb.provider, {
                publicKey: tonKeypair.publicKey,
                wc: 0
            });
            
            // TONアドレスを取得
            const tonAddress = (await wallet.getAddress()).toString(true, true, true);
            
            return tonAddress;
        } catch (error) {
            throw new Error(`TONアドレス生成エラー: ${error.message}`);
        }
    }

    /**
     * すべてのアドレスを一括生成（secp256k1とEd25519両対応）
     * @param {string} network - ネットワークタイプ ('mainnet', 'testnet')
     * @param {string} secp256k1PubKeyHex - secp256k1公開鍵（hex文字列、Bitcoin用）
     * @param {string} ed25519MasterSeedHex - ed25519マスターシード（hex文字列）
     * @param {string} ecdsaTssPubKeyHex - ecdsa_tss公開鍵（hex文字列、Ethereum/Polygon用、必須）
     * @returns {Promise<Object>} 生成されたアドレスのオブジェクト
     */
    async generateAllAddresses(network = 'mainnet', secp256k1PubKeyHex, ed25519MasterSeedHex, ecdsaTssPubKeyHex = null, options = {}) {
        try {
            const { includeSA = true } = options;
            console.log("🔄 Generating all addresses for both curves...");
            console.log("📋 secp256k1 public key:", secp256k1PubKeyHex?.substring(0, 20) + "...");
            console.log("📋 ed25519 master seed:", ed25519MasterSeedHex?.substring(0, 20) + "...");
            console.log("📋 ecdsa_tss public key:", ecdsaTssPubKeyHex?.substring(0, 20) + "...");
            
            const addresses = {
                bitcoin: null,
                ethereum: null,
                polygon: null,
                avalanche: null,
                solana: null,
                ton: null,
                errors: []
            };

            // secp256k1ベースのアドレス生成（Bitcoinのみ）
            // P2WPKHではTaproot情報は不要（コメントアウト）
            // let bitcoinTaprootInfo = null;
            if (secp256k1PubKeyHex) {
                try {
                    // Bitcoinアドレス生成（tweak情報を含むオブジェクトを返す）
                    // P2TR用（コメントアウト）
                    // const bitcoinResult = await this.generateBitcoinTaprootAddress(secp256k1PubKeyHex, network);
                    
                    // P2WPKH用（新規追加）
                    const bitcoinResult = await this.generateBitcoinP2WPKHAddress(secp256k1PubKeyHex, network);
                    // P2WPKH用の処理（Taproot情報は不要）
                    if (typeof bitcoinResult === 'object' && bitcoinResult.address) {
                        addresses.bitcoin = bitcoinResult.address;
                        // P2WPKHではTaproot情報は不要（コメントアウト）
                        // bitcoinTaprootInfo = {
                        //     taproot_internal_key: bitcoinResult.taproot_internal_key,
                        //     taproot_tweak: bitcoinResult.taproot_tweak,
                        //     taproot_merkle_root: bitcoinResult.taproot_merkle_root
                        // };
                    } else {
                        // 後方互換性: 文字列を返す場合
                        addresses.bitcoin = bitcoinResult;
                    }
                    console.log("✅ Bitcoin address generated");
                } catch (error) {
                    console.error("❌ Bitcoin address generation failed:", error);
                    addresses.errors.push(`bitcoin: ${error.message}`);
                }
            } else {
                addresses.errors.push("secp256k1 public key not provided for Bitcoin");
            }

            // ecdsa_tssベースのアドレス生成（Ethereum/Polygon、必須）
            // HD Walletを廃止し、マスター公開鍵から直接アドレスを生成
            if (ecdsaTssPubKeyHex) {
                try {
                    // マスター公開鍵から直接アドレス生成（HD派生処理を削除）
                    // Ethereumアドレス生成
                    addresses.ethereum = this.generateEthereumAddress(ecdsaTssPubKeyHex);
                    console.log("✅ Ethereum address generated using ecdsa_tss master public key (HD Wallet removed)");
                    
                    // Polygonアドレス生成（Ethereumと同じマスター公開鍵を使用）
                    addresses.polygon = this.generatePolygonAddress(ecdsaTssPubKeyHex);
                    console.log("✅ Polygon address generated using ecdsa_tss master public key (HD Wallet removed, same as Ethereum)");

                    // Avalancheアドレス生成（EVM互換のためEthereumと同じアドレス）
                    addresses.avalanche = this.generateEthereumAddress(ecdsaTssPubKeyHex);
                    console.log("✅ Avalanche address generated using ecdsa_tss master public key (same as Ethereum)");
                } catch (error) {
                    console.error("❌ Ethereum/Polygon address generation failed:", error);
                    addresses.errors.push(`ethereum/polygon: ${error.message}`);
                    throw new Error(`Ethereum/Polygon address generation failed: ${error.message}`);
                }
            } else {
                const errorMsg = "ecdsa_tss public key is required for Ethereum/Polygon address generation";
                addresses.errors.push(errorMsg);
                throw new Error(errorMsg);
            }
            
            // Ed25519ベースのアドレス生成（Solana/TON）
            if (ed25519MasterSeedHex) {
                try {
                    // Solanaアドレス生成
                    addresses.solana = this.generateSolanaAddress(ed25519MasterSeedHex);
                    console.log("✅ Solana address generated");
            
                    // TONアドレス生成（非同期）
                    addresses.ton = await this.generateTONAddress(ed25519MasterSeedHex);
                    console.log("✅ TON address generated");
                } catch (error) {
                    console.error("❌ Ed25519 address generation failed:", error);
                    addresses.errors.push(`ed25519: ${error.message}`);
                }
            } else {
                addresses.errors.push("ed25519 master seed not provided");
            }

            console.log("✅ All address generation completed");
            
            // SAアドレス計算（EVM互換チェーンのみ）
            if (includeSA && ecdsaTssPubKeyHex) {
                try {
                    // OWNER_EOA生成（Ethereumアドレスと同じ）
                    const ownerEOA = this.generateOwnerEOA(ecdsaTssPubKeyHex);
                    addresses.ownerEOA = ownerEOA;
                    
                    // SA設定取得
                    const saConfig = this.getSAConfig();
                    
                    // Ethereum SAアドレス（設定が完全な場合のみ計算）
                    if (saConfig.ethereum && saConfig.ethereum[network]) {
                        const ethereumConfig = saConfig.ethereum[network];
                        const allowedTokens = ethereumConfig.allowedTokens;
                        
                        // USDC用Ethereum SAアドレス
                        if (allowedTokens?.USDC?.factoryAddress && allowedTokens?.USDC?.tokenAddress) {
                            if (ethereumConfig.entryPointAddress && ethereumConfig.opSignerAddress) {
                                try {
                                    addresses.ethereumSA_USDC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'ethereum',
                                        network,
                                        allowedTokens.USDC.factoryAddress,
                                        ethereumConfig.entryPointAddress,
                                        ethereumConfig.opSignerAddress,
                                        allowedTokens.USDC.tokenAddress
                                    );
                                    console.log("✅ Ethereum SA address (USDC) computed:", addresses.ethereumSA_USDC);
                                } catch (error) {
                                    console.warn("⚠️ Ethereum SA address (USDC) computation failed:", error.message);
                                    addresses.errors.push(`ethereumSA_USDC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Ethereum SA address (USDC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        }
                        
                        // JPYC用Ethereum SAアドレス
                        if (allowedTokens?.JPYC?.factoryAddress && allowedTokens?.JPYC?.tokenAddress) {
                            if (ethereumConfig.entryPointAddress && ethereumConfig.opSignerAddress) {
                                try {
                                    addresses.ethereumSA_JPYC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'ethereum',
                                        network,
                                        allowedTokens.JPYC.factoryAddress,
                                        ethereumConfig.entryPointAddress,
                                        ethereumConfig.opSignerAddress,
                                        allowedTokens.JPYC.tokenAddress
                                    );
                                    console.log("✅ Ethereum SA address (JPYC) computed:", addresses.ethereumSA_JPYC);
                                } catch (error) {
                                    console.warn("⚠️ Ethereum SA address (JPYC) computation failed:", error.message);
                                    addresses.errors.push(`ethereumSA_JPYC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Ethereum SA address (JPYC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        }
                    }
                    
                    // Polygon SAアドレス（USDCとJPYCの両方を計算）
                    if (saConfig.polygon && saConfig.polygon[network]) {
                        const polygonConfig = saConfig.polygon[network];
                        const allowedTokens = polygonConfig.allowedTokens;
                        
                        console.log(`[SA] Polygon config for ${network}:`, {
                            hasEntryPoint: !!polygonConfig.entryPointAddress,
                            hasOpSigner: !!polygonConfig.opSignerAddress,
                            hasAllowedTokens: !!allowedTokens,
                            usdcFactory: allowedTokens?.USDC?.factoryAddress,
                            usdcToken: allowedTokens?.USDC?.tokenAddress,
                            jpycFactory: allowedTokens?.JPYC?.factoryAddress,
                            jpycToken: allowedTokens?.JPYC?.tokenAddress
                        });
                        
                        // USDC用SAアドレス
                        if (allowedTokens?.USDC?.factoryAddress && allowedTokens?.USDC?.tokenAddress) {
                            if (polygonConfig.entryPointAddress && polygonConfig.opSignerAddress) {
                                try {
                                    console.log(`[SA] Computing Polygon SA address (USDC) for ${network}...`);
                                    addresses.polygonSA_USDC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'polygon',
                                        network,
                                        allowedTokens.USDC.factoryAddress,
                                        polygonConfig.entryPointAddress,
                                        polygonConfig.opSignerAddress,
                                        allowedTokens.USDC.tokenAddress
                                    );
                                    console.log("✅ Polygon SA address (USDC) computed:", addresses.polygonSA_USDC);
                                } catch (error) {
                                    console.warn("⚠️ Polygon SA address (USDC) computation failed:", error.message);
                                    addresses.errors.push(`polygonSA_USDC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Polygon SA address (USDC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        } else {
                            console.log("ℹ️ Polygon SA address (USDC) computation skipped (factoryAddress or tokenAddress not configured)");
                        }
                        
                        // JPYC用SAアドレス
                        if (allowedTokens?.JPYC?.factoryAddress && allowedTokens?.JPYC?.tokenAddress) {
                            if (polygonConfig.entryPointAddress && polygonConfig.opSignerAddress) {
                                try {
                                    console.log(`[SA] Computing Polygon SA address (JPYC) for ${network}...`);
                                    addresses.polygonSA_JPYC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'polygon',
                                        network,
                                        allowedTokens.JPYC.factoryAddress,
                                        polygonConfig.entryPointAddress,
                                        polygonConfig.opSignerAddress,
                                        allowedTokens.JPYC.tokenAddress
                                    );
                                    console.log("✅ Polygon SA address (JPYC) computed:", addresses.polygonSA_JPYC);
                                } catch (error) {
                                    console.warn("⚠️ Polygon SA address (JPYC) computation failed:", error.message);
                                    addresses.errors.push(`polygonSA_JPYC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Polygon SA address (JPYC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        } else {
                            console.log("ℹ️ Polygon SA address (JPYC) computation skipped (factoryAddress or tokenAddress not configured)");
                        }
                    } else {
                        console.log(`ℹ️ Polygon SA address computation skipped (no config for ${network})`);
                    }

                    // Avalanche SAアドレス（USDCとJPYCの両方を計算）
                    if (saConfig.avalanche && saConfig.avalanche[network]) {
                        const avalancheConfig = saConfig.avalanche[network];
                        const allowedTokens = avalancheConfig.allowedTokens;

                        console.log(`[SA] Avalanche config for ${network}:`, {
                            hasEntryPoint: !!avalancheConfig.entryPointAddress,
                            hasOpSigner: !!avalancheConfig.opSignerAddress,
                            hasAllowedTokens: !!allowedTokens,
                            usdcFactory: allowedTokens?.USDC?.factoryAddress,
                            usdcToken: allowedTokens?.USDC?.tokenAddress,
                            jpycFactory: allowedTokens?.JPYC?.factoryAddress,
                            jpycToken: allowedTokens?.JPYC?.tokenAddress
                        });

                        // USDC用SAアドレス
                        if (allowedTokens?.USDC?.factoryAddress && allowedTokens?.USDC?.tokenAddress) {
                            if (avalancheConfig.entryPointAddress && avalancheConfig.opSignerAddress) {
                                try {
                                    console.log(`[SA] Computing Avalanche SA address (USDC) for ${network}...`);
                                    addresses.avalancheSA_USDC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'avalanche',
                                        network,
                                        allowedTokens.USDC.factoryAddress,
                                        avalancheConfig.entryPointAddress,
                                        avalancheConfig.opSignerAddress,
                                        allowedTokens.USDC.tokenAddress
                                    );
                                    console.log("✅ Avalanche SA address (USDC) computed:", addresses.avalancheSA_USDC);
                                } catch (error) {
                                    console.warn("⚠️ Avalanche SA address (USDC) computation failed:", error.message);
                                    addresses.errors.push(`avalancheSA_USDC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Avalanche SA address (USDC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        } else {
                            console.log("ℹ️ Avalanche SA address (USDC) computation skipped (factoryAddress or tokenAddress not configured)");
                        }

                        // JPYC用SAアドレス
                        if (allowedTokens?.JPYC?.factoryAddress && allowedTokens?.JPYC?.tokenAddress) {
                            if (avalancheConfig.entryPointAddress && avalancheConfig.opSignerAddress) {
                                try {
                                    console.log(`[SA] Computing Avalanche SA address (JPYC) for ${network}...`);
                                    addresses.avalancheSA_JPYC = await this.computeSmartAccountAddress(
                                        ownerEOA,
                                        'avalanche',
                                        network,
                                        allowedTokens.JPYC.factoryAddress,
                                        avalancheConfig.entryPointAddress,
                                        avalancheConfig.opSignerAddress,
                                        allowedTokens.JPYC.tokenAddress
                                    );
                                    console.log("✅ Avalanche SA address (JPYC) computed:", addresses.avalancheSA_JPYC);
                                } catch (error) {
                                    console.warn("⚠️ Avalanche SA address (JPYC) computation failed:", error.message);
                                    addresses.errors.push(`avalancheSA_JPYC: ${error.message}`);
                                }
                            } else {
                                console.log("ℹ️ Avalanche SA address (JPYC) computation skipped (EntryPoint or OP_SIGNER not configured)");
                            }
                        } else {
                            console.log("ℹ️ Avalanche SA address (JPYC) computation skipped (factoryAddress or tokenAddress not configured)");
                        }
                    } else {
                        console.log(`ℹ️ Avalanche SA address computation skipped (no config for ${network})`);
                    }
                } catch (error) {
                    console.warn("⚠️ SA address computation failed:", error.message);
                    addresses.errors.push(`sa: ${error.message}`);
                }
            }
            
            // P2WPKHではTaproot情報は不要（コメントアウト）
            // tweak情報がある場合は返り値に含める
            const result = { ...addresses };
            // if (bitcoinTaprootInfo) {
            //     result.bitcoinTaprootInfo = bitcoinTaprootInfo;
            // }
            return result;
        } catch (error) {
            console.error("❌ Address generation failed:", error);
            throw new Error(`アドレス生成エラー: ${error.message}`);
        }
    }

    /**
     * アドレス生成の検証
     * @param {string} secp256k1PubKeyHex - secp256k1公開鍵（hex文字列）
     * @param {string} ed25519MasterSeedHex - ed25519マスターシード（hex文字列）
     * @returns {Promise<Object>} 検証結果
     */
    async validateAddresses(secp256k1PubKeyHex, ed25519MasterSeedHex, network = 'mainnet', ecdsaTssPubKeyHex = null) {
        try {
            const addresses = await this.generateAllAddresses(network, secp256k1PubKeyHex, ed25519MasterSeedHex, ecdsaTssPubKeyHex);
            
            const validation = {
                bitcoin: {
                    address: addresses.bitcoin,
                    isValid: this.isValidBitcoinAddress(addresses.bitcoin, network),
                    format: 'Native SegWit (Bech32)'
                },
                ethereum: {
                    address: addresses.ethereum,
                    isValid: this.isValidEthereumAddress(addresses.ethereum),
                    format: 'Checksum Address'
                },
                solana: {
                    address: addresses.solana,
                    isValid: this.isValidSolanaAddress(addresses.solana),
                    format: 'Base58'
                },
                ton: {
                    address: addresses.ton,
                    isValid: this.isValidTONAddress(addresses.ton),
                    format: 'User-Friendly'
                }
            };

            return validation;
        } catch (error) {
            throw new Error(`アドレス検証エラー: ${error.message}`);
        }
    }

    /**
     * Bitcoinアドレスの妥当性チェック（Native SegWit対応）
     * @param {string} address - Bitcoinアドレス
     * @param {string} network - ネットワークタイプ ('mainnet' または 'testnet')
     * @returns {boolean} 妥当性
     */
    isValidBitcoinAddress(address, network = 'mainnet') {
        try {
            const bitcoinNetwork = network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
            bitcoin.address.toOutputScript(address, bitcoinNetwork);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Ethereumアドレスの妥当性チェック
     * @param {string} address - Ethereumアドレス
     * @returns {boolean} 妥当性
     */
    isValidEthereumAddress(address) {
        try {
            return ethers.utils.isAddress(address);
        } catch {
            return false;
        }
    }

    /**
     * Solanaアドレスの妥当性チェック
     * @param {string} address - Solanaアドレス
     * @returns {boolean} 妥当性
     */
    isValidSolanaAddress(address) {
        try {
            new this.solanaLib.PublicKey(address);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * TONアドレスの妥当性チェック
     * @param {string} address - TONアドレス
     * @returns {boolean} 妥当性
     */
    isValidTONAddress(address) {
        try {
            // TONアドレスの基本的な形式チェック
            return /^[0-9a-zA-Z_-]{48}$/.test(address);
        } catch {
            return false;
        }
    }

    /**
     * ecdsa_tss公開鍵からOWNER_EOAを生成
     * @param {string} ecdsaTssPubKeyHex - ecdsa_tss公開鍵（hex文字列）
     * @returns {string} OWNER_EOAアドレス
     */
    generateOwnerEOA(ecdsaTssPubKeyHex) {
        // Ethereumアドレス生成と同じロジック
        return this.generateEthereumAddress(ecdsaTssPubKeyHex);
    }

    /**
     * Smart Accountアドレス計算（CREATE2）
     * @param {string} ownerEOA - OWNER_EOAアドレス（Ethereumアドレス形式）
     * @param {string} chain - チェーン名（'ethereum', 'polygon'等）
     * @param {string} network - ネットワーク（'mainnet', 'testnet'）
     * @param {string} factoryAddress - Factoryコントラクトアドレス
     * @param {string} entryPointAddress - EntryPointアドレス
     * @param {string} opSignerAddress - OP署名者アドレス
     * @param {string} allowedTokenAddress - 許可されたトークンアドレス
     * @returns {Promise<string>} Smart Accountアドレス
     */
    async computeSmartAccountAddress(
        ownerEOA,
        chain,
        network,
        factoryAddress,
        entryPointAddress,
        opSignerAddress,
        allowedTokenAddress
    ) {
        try {
            if (!factoryAddress || !entryPointAddress || !opSignerAddress || !allowedTokenAddress) {
                throw new Error('SA configuration is incomplete. Factory, EntryPoint, OP_SIGNER, and ALLOWED_TOKEN addresses are required.');
            }

            // 1. Salt計算（userSubject, chainId, version, allowedToken を混ぜる）
            const userSubject = this.getUserSubject(); // masterIdまたはuser_subject
            const chainId = this.getChainId(chain, network);
            const salt = this.computeSalt(userSubject, chainId, allowedTokenAddress);
            
            // 2. FactoryコントラクトのgetAddressを呼び出し（3引数: ownerEOA, salt, allowedToken）
            if (typeof ethers === 'undefined') {
                throw new Error('ethers.js is required for SA address computation');
            }
            
            const factoryABI = [
                "function getAddress(address ownerEOA, bytes32 salt, address allowedToken) public view returns (address)"
            ];
            
            const provider = this.getProvider(chain, network);
            const factoryContract = new ethers.Contract(factoryAddress, factoryABI, provider);
            
            const saAddress = await factoryContract.getAddress(ownerEOA, salt, allowedTokenAddress);
            
            console.log(`[SA] Smart Account address computed:`, {
                chain,
                network,
                ownerEOA,
                saAddress,
                salt: ethers.utils.hexlify(salt)
            });
            
            return saAddress;
            
        } catch (error) {
            console.error(`[SA] Failed to compute Smart Account address:`, error);
            throw new Error(`Smart Account address computation failed: ${error.message}`);
        }
    }

    /**
     * Salt計算（userSubject, chainId, version, allowedToken を混ぜる）
     * @param {string} userSubject - ユーザー識別子（masterId）
     * @param {number} chainId - チェーンID
     * @param {string} tokenAddress - ALLOWED_TOKEN アドレス（USDC/JPYC 等）
     * @returns {string} Salt（bytes32）
     */
    computeSalt(userSubject, chainId, tokenAddress) {
        const data = ethers.utils.solidityPack(
            ["string", "uint256", "string", "address"],
            [userSubject, chainId, "IBUO-v1", tokenAddress]
        );
        return ethers.utils.keccak256(data);
    }

    /**
     * チェーンID取得
     * @param {string} chain - チェーン名
     * @param {string} network - ネットワーク
     * @returns {number} チェーンID
     */
    getChainId(chain, network) {
        const chainIds = {
            'ethereum': { 'mainnet': 1, 'testnet': 5 }, // Goerli
            'polygon': { 'mainnet': 137, 'testnet': 80002 }, // Amoy
            'avalanche': { 'mainnet': 43114, 'testnet': 43113 }, // Fuji
        };
        
        const chainId = chainIds[chain]?.[network];
        if (!chainId) {
            throw new Error(`Unknown chain/network: ${chain}/${network}`);
        }
        
        return chainId;
    }

    /**
     * Provider取得（サーバーのプロキシエンドポイント経由）
     * @param {string} chain - チェーン名
     * @param {string} network - ネットワーク
     * @returns {ethers.providers.Provider} Provider
     */
    getProvider(chain, network) {
        // サーバーのプロキシエンドポイントを使用
        const proxyUrl = `/proxyapi/blockchain/${chain}`;
        
        // カスタムプロバイダークラスを作成（ethers.jsのProviderを継承）
        class ProxyJsonRpcProvider extends ethers.providers.Provider {
            constructor(proxyUrl, network, chainId) {
                super();
                this.proxyUrl = proxyUrl;
                this.network = network;
                // ネットワーク情報を設定
                this._network = Promise.resolve({
                    chainId: chainId,
                    name: `${chain}-${network}`
                });
            }
            
            /**
             * RPCリクエストをサーバーのプロキシエンドポイントに送信
             * @param {string} method - RPCメソッド名
             * @param {Array} params - RPCパラメータ
             * @returns {Promise<any>} RPCレスポンス
             */
            async send(method, params) {
                const rpcRequest = {
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: method,
                    params: params || []
                };
                
                const response = await fetch(this.proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        ...rpcRequest,
                        network: this.network
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`RPC proxy error: ${response.status} ${errorText}`);
                }
                
                const result = await response.json();
                
                // WalletService.proxyPolygonRequestのレスポンス形式に合わせる
                // { status: 200, data: { jsonrpc: '2.0', id: ..., result: ... } } の形式
                if (result.status && result.data) {
                    if (result.data.jsonrpc) {
                        // JSON-RPCレスポンス形式
                        if (result.data.error) {
                            const error = new Error(result.data.error.message || 'RPC error');
                            error.code = result.data.error.code;
                            throw error;
                        }
                        return result.data.result;
                    }
                    // 直接値の場合
                    return result.data;
                }
                
                // 直接JSON-RPCレスポンスの場合（フォールバック）
                if (result.jsonrpc) {
                    if (result.error) {
                        const error = new Error(result.error.message || 'RPC error');
                        error.code = result.error.code;
                        throw error;
                    }
                    return result.result;
                }
                
                // 予期しない形式の場合
                throw new Error('Unexpected RPC response format');
            }
            
            /**
             * eth_callを実行
             * @param {Object} transaction - トランザクションオブジェクト
             * @param {string} blockTag - ブロックタグ
             * @returns {Promise<string>} 実行結果（hex文字列）
             */
            async call(transaction, blockTag) {
                return this.send('eth_call', [transaction, blockTag || 'latest']);
            }
            
            /**
             * ネットワーク情報を取得
             * @returns {Promise<ethers.providers.Network>} ネットワーク情報
             */
            async getNetwork() {
                return this._network;
            }
        }
        
        // チェーンIDを取得
        const chainId = this.getChainId(chain, network);
        
        return new ProxyJsonRpcProvider(proxyUrl, network, chainId);
    }

    /**
     * ユーザー識別子取得（masterId）
     * @returns {string} masterId
     */
    getUserSubject() {
        // sessionStorageまたはIndexedDBからmasterIdを取得
        // 複数のキーを確認（後方互換性のため）
        const masterId = sessionStorage.getItem('masterId') || 
                         sessionStorage.getItem('mpc.masterid') ||
                         (typeof window !== 'undefined' && window.bitvoyMPC?.masterId) ||
                         (typeof window !== 'undefined' && window.bitvoy?.masterId) ||
                         null;
        
        if (!masterId) {
            throw new Error('masterId not found. Wallet must be initialized first.');
        }
        
        return masterId;
    }

    /**
     * SA設定取得
     * @returns {object} SA設定
     */
    getSAConfig() {
        // BitVoyConfigから取得
        if (typeof window !== 'undefined' && window.BitVoyConfig?.sa) {
            return window.BitVoyConfig.sa;
        }
        
        // 設定が存在しない場合はエラー
        throw new Error('Smart Account configuration not found. Please ensure BitVoyConfig.js is loaded and sa configuration is defined.');
    }

    /**
     * テスト用のアドレス生成（デバッグ用）
     */
    async testAddressGeneration() {
        console.log('🧪 Testing address generation...');
        
        // テスト用の公開鍵（実際の使用時はMPCから取得した値を使用）
        const testSecp256k1PubKeyHex = '04a0434d9e47f3c86235477c7b1ae6ae5d3442d49b1943c2b752a68e2a47e247c7893aba425419bc27a3b6c7e693a24c696f794c2ed877a1593cbee53b037368d7';
        const testEd25519MasterSeedHex = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
        
        try {
            // メインネットとテストネットの両方でテスト
            const bitcoinAddressMainnet = await this.generateBitcoinP2WPKHAddress(testSecp256k1PubKeyHex, 'mainnet');
            console.log('✅ Bitcoin Address (Mainnet - P2WPKH):', bitcoinAddressMainnet.address || bitcoinAddressMainnet);
            
            const bitcoinAddressTestnet = await this.generateBitcoinP2WPKHAddress(testSecp256k1PubKeyHex, 'testnet');
            console.log('✅ Bitcoin Address (Testnet - P2WPKH):', bitcoinAddressTestnet.address || bitcoinAddressTestnet);
            
            const ethereumAddress = this.generateEthereumAddress(testSecp256k1PubKeyHex);
            console.log('✅ Ethereum Address:', ethereumAddress);
            
            const solanaAddress = this.generateSolanaAddress(testEd25519MasterSeedHex);
            console.log('✅ Solana Address:', solanaAddress);
            
            const tonAddress = await this.generateTONAddress(testEd25519MasterSeedHex);
            console.log('✅ TON Address:', tonAddress);
            
            return {
                bitcoin: {
                    mainnet: bitcoinAddressMainnet,
                    testnet: bitcoinAddressTestnet
                },
                ethereum: ethereumAddress,
                solana: solanaAddress,
                ton: tonAddress
            };
        } catch (error) {
            console.error('❌ Test failed:', error.message);
            throw error;
        }
    }
}

// グローバルスコープで利用可能にする
if (typeof window !== 'undefined') {
    window.MPCAddressGenerator = MPCAddressGenerator;
}

// Node.js環境でのエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MPCAddressGenerator;
} 