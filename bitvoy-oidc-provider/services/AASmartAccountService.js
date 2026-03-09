const { ethers } = require('ethers');

class AASmartAccountService {
    constructor(dbPool, factoryAddress, factoryABI, provider) {
        this.dbPool = dbPool;
        this.factoryAddress = factoryAddress;
        this.factoryABI = factoryABI;
        this.provider = provider;
    }
    
    /**
     * Smart Accountアドレスを計算（デプロイ前）
     * @param {string} tokenAddress - ALLOWED_TOKEN アドレス（salt に含め、getAddress の第3引数）。省略時は旧式（2引数 getAddress）
     */
    async computeSmartAccountAddress(userSubject, chain, network, ownerEOA, tokenAddress = null) {
        const salt = this.computeSalt(userSubject, chain, network, tokenAddress);
        
        if (!this.factoryAddress || !this.provider) {
            throw new Error('Factory address and provider are required');
        }
        
        const factoryContract = new ethers.Contract(
            this.factoryAddress,
            this.factoryABI,
            this.provider
        );
        
        const saAddress = tokenAddress != null
            ? await factoryContract.getAddress(ownerEOA, salt, tokenAddress)
            : await factoryContract.getAddress(ownerEOA, salt);
        return saAddress;
    }
    
    /**
     * Smart Accountをデプロイ（必要に応じて）
     * @param {string} tokenAddress - ALLOWED_TOKEN アドレス（salt に含め、createAccount の第3引数）。省略時は旧式（2引数 createAccount）
     */
    async deploySmartAccount(userSubject, chain, network, ownerEOA, deployerWallet, tokenAddress = null) {
        const salt = this.computeSalt(userSubject, chain, network, tokenAddress);
        
        const existing = await this.getSmartAccount(userSubject, chain, network);
        if (existing) {
            return existing.smart_account_address;
        }
        
        if (!this.factoryAddress || !deployerWallet) {
            throw new Error('Factory address and deployer wallet are required');
        }
        
        const factoryContract = new ethers.Contract(
            this.factoryAddress,
            this.factoryABI,
            deployerWallet
        );
        
        const tx = tokenAddress != null
            ? await factoryContract.createAccount(ownerEOA, salt, tokenAddress)
            : await factoryContract.createAccount(ownerEOA, salt);
        await tx.wait();
        
        const computedAddress = await this.computeSmartAccountAddress(userSubject, chain, network, ownerEOA, tokenAddress);
        
        // DBに保存
        await this.saveSmartAccount({
            user_subject: userSubject,
            chain,
            network,
            owner_eoa: ownerEOA,
            smart_account_address: computedAddress,
            factory_address: this.factoryAddress,
            entry_point: await this.getEntryPointAddress(chain, network),
            op_signer: await this.getOPSignerAddress(chain, network),
            salt: ethers.utils.hexlify(salt)
        });
        
        return computedAddress;
    }
    
    /**
     * Salt計算（tokenAddress を混ぜる。省略時は旧式 3 引数）
     */
    computeSalt(userSubject, chain, network, tokenAddress = null) {
        const chainId = this.getChainId(chain, network);
        if (tokenAddress != null) {
            const data = ethers.utils.solidityPack(
                ["string", "uint256", "string", "address"],
                [userSubject, chainId, "IBUO-v1", tokenAddress]
            );
            return ethers.utils.keccak256(data);
        }
        const data = ethers.utils.solidityPack(
            ["string", "uint256", "string"],
            [userSubject, chainId, "IBUO-v1"]
        );
        return ethers.utils.keccak256(data);
    }
    
    /**
     * Smart Account取得
     */
    async getSmartAccount(userSubject, chain, network, currency = null) {
        let query = `SELECT * FROM aa_smart_accounts 
                     WHERE user_subject = ? AND chain = ? AND network = ?`;
        const params = [userSubject, chain, network];
        
        if (currency) {
            query += ` AND currency = ?`;
            params.push(currency);
        }
        
        const [rows] = await this.dbPool.execute(query, params);
        return rows[0] || null;
    }
    
    /**
     * Smart Account保存
     */
    async saveSmartAccount(data) {
        await this.dbPool.execute(
            `INSERT INTO aa_smart_accounts 
             (user_subject, chain, network, owner_eoa, smart_account_address, 
              factory_address, entry_point, op_signer, salt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             smart_account_address = VALUES(smart_account_address),
             owner_eoa = VALUES(owner_eoa),
             updated_at = CURRENT_TIMESTAMP(3)`,
            [
                data.user_subject,
                data.chain,
                data.network,
                data.owner_eoa,
                data.smart_account_address,
                data.factory_address,
                data.entry_point,
                data.op_signer,
                data.salt
            ]
        );
    }
    
    getChainId(chain, network) {
        // Chain IDマッピング
        const chainIds = {
            'polygon': { 'mainnet': 137, 'testnet': 80002 }, // Amoy
            'ethereum': { 'mainnet': 1, 'testnet': 5 }, // Goerli
            'avalanche': { 'mainnet': 43114, 'testnet': 43113 }, // Fuji
        };
        return chainIds[chain]?.[network] || 0;
    }
    
    async getEntryPointAddress(chain, network) {
        const envKey = `${chain.toUpperCase()}_${network.toUpperCase()}_ENTRY_POINT_ADDRESS`;
        return process.env[envKey];
    }
    
    async getOPSignerAddress(chain, network) {
        const envKey = `${chain.toUpperCase()}_${network.toUpperCase()}_OP_SIGNER_ADDRESS`;
        return process.env[envKey];
    }
}

module.exports = AASmartAccountService;

