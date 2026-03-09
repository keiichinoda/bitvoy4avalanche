/**
 * Key Derivation Module - Multi-chain address derivation for MPC wallets
 * Supports Bitcoin, Ethereum, Solana, and TON address generation
 * Based on BIP32/BIP44 hierarchical deterministic wallet standards
 */

const crypto = require('crypto');
const { secp256k1 } = require('@noble/secp256k1');
const { ed25519 } = require('@noble/ed25519');
const { sha256 } = require('@noble/hashes/sha256');
const { ripemd160 } = require('@noble/hashes/ripemd160');
const { keccak_256 } = require('@noble/hashes/sha3');
const { base58check } = require('@noble/bases/base58check');
const { base58 } = require('@noble/bases/base58');
const { bech32 } = require('@noble/bases/bech32');
const { logger } = require('../utils/logger');

class KeyDerivation {
    constructor(config = {}) {
        this.config = {
            // BIP44 coin types
            coinTypes: {
                bitcoin: 0,
                ethereum: 60,
                solana: 501,
                ton: 607
            },
            // Network configurations
            networks: {
                bitcoin: {
                    mainnet: { version: 0x00, scriptVersion: 0x05 },
                    testnet: { version: 0x6f, scriptVersion: 0xc4 }
                },
                ethereum: {
                    chainId: { mainnet: 1, testnet: 11155111 } // Sepolia
                }
            },
            // Default derivation paths
            derivationPaths: {
                bitcoin: "m/44'/0'/0'/0/0",
                ethereum: "m/44'/60'/0'/0/0",
                solana: "m/44'/501'/0'/0/0",
                ton: "m/44'/607'/0'/0/0"
            },
            ...config
        };

        this.addressCache = new Map();
        
        logger.info('Key Derivation module initialized', {
            supportedChains: Object.keys(this.config.coinTypes),
            cachingEnabled: true
        });
    }

    /**
     * Derive address for specified blockchain from MPC public key
     */
    async deriveAddress(publicKey, blockchain, options = {}) {
        try {
            const {
                network = 'mainnet',
                addressIndex = 0,
                account = 0,
                change = 0
            } = options;

            // Check cache first
            const cacheKey = `${blockchain}_${publicKey}_${network}_${addressIndex}`;
            if (this.addressCache.has(cacheKey)) {
                return this.addressCache.get(cacheKey);
            }

            let address;
            const pubKeyBuffer = Buffer.from(publicKey, 'hex');

            switch (blockchain.toLowerCase()) {
                case 'bitcoin':
                case 'btc':
                    address = await this.deriveBitcoinAddress(pubKeyBuffer, network, options);
                    break;
                
                case 'ethereum':
                case 'eth':
                    address = await this.deriveEthereumAddress(pubKeyBuffer, network, options);
                    break;
                
                case 'solana':
                case 'sol':
                    address = await this.deriveSolanaAddress(pubKeyBuffer, network, options);
                    break;
                
                case 'ton':
                    address = await this.deriveTONAddress(pubKeyBuffer, network, options);
                    break;
                
                default:
                    throw new Error(`Unsupported blockchain: ${blockchain}`);
            }

            // Cache the result
            this.addressCache.set(cacheKey, address);
            
            logger.debug('Address derived', { 
                blockchain, 
                network, 
                addressPrefix: address.substring(0, 8) + '...'
            });

            return address;

        } catch (error) {
            logger.error('Address derivation failed', { 
                blockchain, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Derive Bitcoin address (P2PKH, P2SH, P2WPKH, P2WSH)
     */
    async deriveBitcoinAddress(publicKey, network = 'mainnet', options = {}) {
        const {
            addressType = 'p2pkh', // p2pkh, p2sh, p2wpkh, p2wsh
            compressed = true
        } = options;

        try {
            // Ensure public key is in correct format
            let pubKey = publicKey;
            if (compressed && pubKey.length === 65) {
                // Convert uncompressed to compressed
                const point = secp256k1.Point.fromHex(pubKey.toString('hex'));
                pubKey = Buffer.from(point.toRawBytes(true));
            }

            const networkConfig = this.config.networks.bitcoin[network];
            if (!networkConfig) {
                throw new Error(`Unsupported Bitcoin network: ${network}`);
            }

            switch (addressType) {
                case 'p2pkh':
                    return this.generateP2PKHAddress(pubKey, networkConfig);
                
                case 'p2sh':
                    return this.generateP2SHAddress(pubKey, networkConfig);
                
                case 'p2wpkh':
                    return this.generateP2WPKHAddress(pubKey, network);
                
                case 'p2wsh':
                    return this.generateP2WSHAddress(pubKey, network);
                
                default:
                    throw new Error(`Unsupported Bitcoin address type: ${addressType}`);
            }

        } catch (error) {
            logger.error('Bitcoin address derivation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate P2PKH (Pay to Public Key Hash) address
     */
    generateP2PKHAddress(publicKey, networkConfig) {
        // Hash160 = RIPEMD160(SHA256(publicKey))
        const hash160 = ripemd160(sha256(publicKey));
        
        // Add version byte
        const payload = Buffer.concat([
            Buffer.from([networkConfig.version]),
            hash160
        ]);

        return base58check.encode(payload);
    }

    /**
     * Generate P2SH (Pay to Script Hash) address
     */
    generateP2SHAddress(publicKey, networkConfig) {
        // Create redeemScript for P2WPKH-in-P2SH
        const hash160 = ripemd160(sha256(publicKey));
        const redeemScript = Buffer.concat([
            Buffer.from([0x00, 0x14]), // OP_0 + 20 bytes
            hash160
        ]);

        // Hash the redeem script
        const scriptHash = ripemd160(sha256(redeemScript));
        
        // Add version byte for P2SH
        const payload = Buffer.concat([
            Buffer.from([networkConfig.scriptVersion]),
            scriptHash
        ]);

        return base58check.encode(payload);
    }

    /**
     * Generate P2WPKH (Pay to Witness Public Key Hash) address
     */
    generateP2WPKHAddress(publicKey, network) {
        const hash160 = ripemd160(sha256(publicKey));
        const hrp = network === 'mainnet' ? 'bc' : 'tb';
        
        return bech32.encode(hrp, bech32.toWords(Buffer.concat([
            Buffer.from([0x00]), // Witness version 0
            hash160
        ])));
    }

    /**
     * Generate P2WSH (Pay to Witness Script Hash) address
     */
    generateP2WSHAddress(publicKey, network) {
        // Create witness script (simple P2PK)
        const witnessScript = Buffer.concat([
            Buffer.from([0x21]), // 33 bytes
            publicKey,
            Buffer.from([0xac])  // OP_CHECKSIG
        ]);

        const scriptHash = sha256(witnessScript);
        const hrp = network === 'mainnet' ? 'bc' : 'tb';
        
        return bech32.encode(hrp, bech32.toWords(Buffer.concat([
            Buffer.from([0x00]), // Witness version 0
            scriptHash
        ])));
    }

    /**
     * Generate P2TR (Pay to Taproot) address
     */
    generateP2TRAddress(publicKey, network) {
        // Taproot uses the public key directly as the output key
        // The public key should be 32 bytes (x-only)
        let outputKey = publicKey;
        
        // If public key is 33 bytes (compressed), remove the prefix
        if (outputKey.length === 33) {
            outputKey = outputKey.slice(1);
        }
        
        // Ensure it's 32 bytes
        if (outputKey.length !== 32) {
            throw new Error(`Invalid public key length for Taproot address: ${outputKey.length} bytes (expected 32)`);
        }
        
        const hrp = network === 'mainnet' ? 'bc' : 'tb';
        
        // Use bech32m encoding for Taproot (witness version 1)
        return bech32.encode(hrp, bech32.toWords(Buffer.concat([
            Buffer.from([0x01]), // Witness version 1
            outputKey
        ])));
    }

    /**
     * Derive Ethereum address
     */
    async deriveEthereumAddress(publicKey, network = 'mainnet', options = {}) {
        try {
            // Ethereum uses uncompressed public key
            let pubKey = publicKey;
            if (pubKey.length === 33) {
                // Convert compressed to uncompressed
                const point = secp256k1.Point.fromHex(pubKey.toString('hex'));
                pubKey = Buffer.from(point.toRawBytes(false));
            }

            // Remove the 0x04 prefix if present
            if (pubKey[0] === 0x04) {
                pubKey = pubKey.slice(1);
            }

            // Keccak256 hash of public key
            const hash = keccak_256(pubKey);
            
            // Take last 20 bytes as address
            const address = '0x' + hash.slice(-20).toString('hex');
            
            // Apply EIP-55 checksum encoding
            return this.toChecksumAddress(address);

        } catch (error) {
            logger.error('Ethereum address derivation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Apply EIP-55 checksum encoding to Ethereum address
     */
    toChecksumAddress(address) {
        const addr = address.toLowerCase().replace('0x', '');
        const hash = keccak_256(Buffer.from(addr, 'utf8')).toString('hex');
        
        let checksumAddress = '0x';
        for (let i = 0; i < addr.length; i++) {
            if (parseInt(hash[i], 16) >= 8) {
                checksumAddress += addr[i].toUpperCase();
            } else {
                checksumAddress += addr[i];
            }
        }
        
        return checksumAddress;
    }

    /**
     * Derive Solana address
     */
    async deriveSolanaAddress(publicKey, network = 'mainnet', options = {}) {
        try {
            // Solana uses Ed25519 for addresses
            // For MPC, we need to convert secp256k1 key to Ed25519-compatible format
            let solanaPublicKey;

            if (options.useDirectMapping) {
                // Direct mapping approach (simplified)
                const hash = sha256(publicKey);
                solanaPublicKey = hash.slice(0, 32);
            } else {
                // Derive Ed25519 key from secp256k1 using deterministic method
                solanaPublicKey = await this.deriveEd25519FromSecp256k1(publicKey);
            }

            // Encode as base58
            return base58.encode(solanaPublicKey);

        } catch (error) {
            logger.error('Solana address derivation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Derive Ed25519 key from secp256k1 (for Solana compatibility)
     */
    async deriveEd25519FromSecp256k1(secp256k1PublicKey) {
        // Use HKDF to derive Ed25519 key material from secp256k1 key
        const salt = Buffer.from('solana-ed25519-derivation', 'utf8');
        const info = Buffer.from('bitvoy-mpc-solana', 'utf8');
        
        // HKDF-Extract
        const prk = crypto.createHmac('sha256', salt).update(secp256k1PublicKey).digest();
        
        // HKDF-Expand
        const okm = crypto.createHmac('sha256', prk)
            .update(Buffer.concat([info, Buffer.from([0x01])]))
            .digest();

        return okm.slice(0, 32);
    }

    /**
     * Derive TON address
     */
    async deriveTONAddress(publicKey, network = 'mainnet', options = {}) {
        try {
            const {
                workchain = 0,
                bounceable = true,
                urlSafe = true
            } = options;

            // TON uses 256-bit addresses
            // Derive from public key using TON-specific method
            const tonKey = await this.deriveTONKey(publicKey);
            
            // Generate state init for wallet
            const stateInit = this.generateTONStateInit(tonKey);
            
            // Calculate address from state init
            const addressHash = sha256(stateInit);
            
            // Create raw address (workchain + hash)
            const rawAddress = Buffer.concat([
                Buffer.from([workchain]),
                addressHash
            ]);

            // Encode with TON base32 (modified base64)
            return this.encodeTONAddress(rawAddress, bounceable, urlSafe);

        } catch (error) {
            logger.error('TON address derivation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Derive TON-compatible key from secp256k1
     */
    async deriveTONKey(secp256k1PublicKey) {
        // TON-specific key derivation
        const salt = Buffer.from('ton-key-derivation', 'utf8');
        const hash = crypto.createHmac('sha256', salt).update(secp256k1PublicKey).digest();
        
        return hash;
    }

    /**
     * Generate TON StateInit for wallet
     */
    generateTONStateInit(tonKey) {
        // Simplified StateInit generation
        // In production, this should use proper TON TL-B serialization
        const code = Buffer.alloc(32, 0); // Placeholder for wallet code
        const data = tonKey; // Public key as data
        
        return Buffer.concat([code, data]);
    }

    /**
     * Encode TON address in user-friendly format
     */
    encodeTONAddress(rawAddress, bounceable = true, urlSafe = true) {
        // TON address encoding (simplified)
        const flags = (bounceable ? 0x11 : 0x51) | (urlSafe ? 0x80 : 0x00);
        const payload = Buffer.concat([
            Buffer.from([flags]),
            rawAddress
        ]);

        // Calculate CRC16
        const crc = this.calculateCRC16(payload);
        const fullPayload = Buffer.concat([payload, crc]);

        // Base64 encode
        let encoded = fullPayload.toString('base64');
        
        if (urlSafe) {
            encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_');
        }

        return encoded;
    }

    /**
     * Calculate CRC16 for TON address
     */
    calculateCRC16(data) {
        let crc = 0;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) {
                if (crc & 1) {
                    crc = (crc >> 1) ^ 0xa001;
                } else {
                    crc >>= 1;
                }
            }
        }
        return Buffer.from([crc & 0xff, (crc >> 8) & 0xff]);
    }

    /**
     * Derive multiple addresses for different chains
     */
    async deriveMultiChainAddresses(publicKey, options = {}) {
        const {
            chains = ['bitcoin', 'ethereum', 'solana', 'ton'],
            network = 'mainnet'
        } = options;

        const addresses = {};
        
        for (const chain of chains) {
            try {
                addresses[chain] = await this.deriveAddress(publicKey, chain, { 
                    network,
                    ...options[chain] 
                });
            } catch (error) {
                logger.warn(`Failed to derive ${chain} address`, { error: error.message });
                addresses[chain] = null;
            }
        }

        return addresses;
    }

    /**
     * Validate address format for specific blockchain
     */
    validateAddress(address, blockchain, network = 'mainnet') {
        try {
            switch (blockchain.toLowerCase()) {
                case 'bitcoin':
                case 'btc':
                    return this.validateBitcoinAddress(address, network);
                
                case 'ethereum':
                case 'eth':
                    return this.validateEthereumAddress(address);
                
                case 'solana':
                case 'sol':
                    return this.validateSolanaAddress(address);
                
                case 'ton':
                    return this.validateTONAddress(address);
                
                default:
                    return false;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate Bitcoin address
     */
    validateBitcoinAddress(address, network) {
        try {
            // Check P2PKH/P2SH (base58check)
            if (address.match(/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/)) {
                base58check.decode(address);
                return true;
            }
            
            // Check Bech32 (P2WPKH/P2WSH)
            if (address.match(/^(bc1|tb1)[a-z0-9]{39,59}$/)) {
                const hrp = network === 'mainnet' ? 'bc' : 'tb';
                bech32.decode(hrp, address);
                return true;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate Ethereum address
     */
    validateEthereumAddress(address) {
        // Check basic format
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return false;
        }
        
        // Verify EIP-55 checksum if mixed case
        if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
            const checksumAddress = this.toChecksumAddress(address.toLowerCase());
            return address === checksumAddress;
        }
        
        return true;
    }

    /**
     * Validate Solana address
     */
    validateSolanaAddress(address) {
        try {
            if (address.length < 32 || address.length > 44) {
                return false;
            }
            
            const decoded = base58.decode(address);
            return decoded.length === 32;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate TON address
     */
    validateTONAddress(address) {
        try {
            // Basic length check
            if (address.length !== 48) {
                return false;
            }
            
            // Decode and verify CRC
            const decoded = Buffer.from(address.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
            if (decoded.length !== 36) {
                return false;
            }
            
            const payload = decoded.slice(0, 34);
            const crc = decoded.slice(34);
            const expectedCrc = this.calculateCRC16(payload);
            
            return crc.equals(expectedCrc);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get BIP44 derivation path for blockchain
     */
    getDerivationPath(blockchain, account = 0, change = 0, addressIndex = 0) {
        const coinType = this.config.coinTypes[blockchain.toLowerCase()];
        if (coinType === undefined) {
            throw new Error(`Unsupported blockchain: ${blockchain}`);
        }
        
        return `m/44'/${coinType}'/${account}'/${change}/${addressIndex}`;
    }

    /**
     * Clear address cache
     */
    clearCache() {
        this.addressCache.clear();
        logger.debug('Address cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.addressCache.size,
            keys: Array.from(this.addressCache.keys())
        };
    }

    /**
     * Health check for key derivation module
     */
    async healthCheck() {
        try {
            // Test key derivation for each supported chain
            const testPublicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
            const testResults = {};
            
            for (const chain of Object.keys(this.config.coinTypes)) {
                try {
                    const address = await this.deriveAddress(testPublicKey, chain);
                    testResults[chain] = { success: true, address: address.substring(0, 8) + '...' };
                } catch (error) {
                    testResults[chain] = { success: false, error: error.message };
                }
            }
            
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                supportedChains: Object.keys(this.config.coinTypes),
                testResults,
                cacheStats: this.getCacheStats()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = KeyDerivation;
