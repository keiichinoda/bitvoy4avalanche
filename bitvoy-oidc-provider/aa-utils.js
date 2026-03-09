const { ethers } = require('ethers');

/**
 * EIP-712 Intent Hash計算
 */
function computeIntentHash(intentPayload, smartAccountAddress, chainId) {
    const domain = {
        name: "BitVoy Intent",
        version: "1",
        chainId: chainId,
        verifyingContract: smartAccountAddress
    };
    
    // コントラクト INTENT_TYPEHASH と完全一致: 型名 "IntentPayload", valid_after/valid_until は uint48
    const types = {
        IntentPayload: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "payee", type: "address" },
            { name: "valid_after", type: "uint48" },
            { name: "valid_until", type: "uint48" },
            { name: "intent_nonce", type: "uint256" },
            { name: "chain_id", type: "uint256" },
            { name: "rp_client_id_hash", type: "bytes32" },
            { name: "order_ref_hash", type: "bytes32" },
            { name: "intent_id", type: "bytes32" }
        ]
    };
    
    return ethers.utils._TypedDataEncoder.hash(domain, types, intentPayload);
}

/**
 * IntentPayloadV1構造体の作成
 */
function createIntentPayloadV1(intent, tokenAddress, chainId) {
    // intent_idをbytes32に変換（全文を格納、最大32バイト）
    let intentIdBytes;
    if (typeof intent.intent_id === 'string') {
        const raw = Buffer.from(intent.intent_id, 'utf8');
        if (raw.length > 32) {
            throw new Error(`intent_id too long for bytes32: ${raw.length} bytes`);
        }
        const intentIdHex = raw.toString('hex').padEnd(64, '0');
        intentIdBytes = '0x' + intentIdHex;
    } else {
        intentIdBytes = ethers.utils.hexZeroPad(intent.intent_id, 32);
    }
    
    return {
        token: tokenAddress,
        amount: intent.amount.toString(),
        payee: intent.payee_address,
        valid_after: Math.floor(new Date(intent.created_at).getTime() / 1000),
        valid_until: Math.floor(new Date(intent.expires_at).getTime() / 1000),
        intent_nonce: ethers.BigNumber.from(intent.nonce || '0').toString(),
        chain_id: chainId,
        rp_client_id_hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(intent.rp_client_id)),
        order_ref_hash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(intent.order_ref)),
        intent_id: intentIdBytes
    };
}

/**
 * OP署名（opAttestation）生成
 */
async function signIntentWithOP(intentHash, opSignerPrivateKey) {
    const wallet = new ethers.Wallet(opSignerPrivateKey);
    // EIP-712 hashに対して直接署名（メッセージハッシュではない）
    const signature = await wallet._signTypedData(
        {
            name: "BitVoy Intent",
            version: "1",
            chainId: 0, // ここでは使用しない（intentHashに既に含まれている）
            verifyingContract: ethers.constants.AddressZero // ここでは使用しない
        },
        {
            IntentPayload: [
                { name: "token", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "payee", type: "address" },
                { name: "valid_after", type: "uint48" },
                { name: "valid_until", type: "uint48" },
                { name: "intent_nonce", type: "uint256" },
                { name: "chain_id", type: "uint256" },
                { name: "rp_client_id_hash", type: "bytes32" },
                { name: "order_ref_hash", type: "bytes32" },
                { name: "intent_id", type: "bytes32" }
            ]
        },
        {} // 空のメッセージ（intentHashは既に計算済み）
    );
    
    // intentHashに対して直接署名する場合（EIP-191）
    const messageHash = ethers.utils.arrayify(intentHash);
    const signature2 = await wallet.signMessage(messageHash);
    return signature2;
}

/**
 * UserOperation構築
 */
function buildUserOperation(
    smartAccountAddress,
    callData,
    nonce,
    paymasterAndData = "0x"
) {
    return {
        sender: smartAccountAddress,
        nonce: nonce.toString(),
        initCode: "0x",
        callData: callData,
        callGasLimit: "0x0", // Will be estimated
        verificationGasLimit: "0x0", // Will be estimated
        preVerificationGas: "0x0", // Will be estimated
        maxFeePerGas: "0x0", // Will be set
        maxPriorityFeePerGas: "0x0", // Will be set
        paymasterAndData: paymasterAndData,
        signature: "0x" // Will be filled after signing
    };
}

/**
 * UserOperation Hash計算（EntryPoint用）
 */
function computeUserOperationHash(userOp, entryPointAddress, chainId) {
    const packed = ethers.utils.solidityPack(
        [
            "address", "uint256", "bytes32", "bytes32",
            "uint256", "uint256", "uint256", "uint256", "uint256",
            "bytes32", "bytes32"
        ],
        [
            userOp.sender,
            userOp.nonce,
            ethers.utils.keccak256(userOp.initCode || "0x"),
            ethers.utils.keccak256(userOp.callData),
            userOp.callGasLimit || "0x0",
            userOp.verificationGasLimit || "0x0",
            userOp.preVerificationGas || "0x0",
            userOp.maxFeePerGas || "0x0",
            userOp.maxPriorityFeePerGas || "0x0",
            ethers.utils.keccak256(userOp.paymasterAndData || "0x"),
            entryPointAddress
        ]
    );
    
    return ethers.utils.keccak256(
        ethers.utils.solidityPack(["bytes32", "uint256"], [ethers.utils.keccak256(packed), chainId])
    );
}

module.exports = {
    computeIntentHash,
    createIntentPayloadV1,
    signIntentWithOP,
    buildUserOperation,
    computeUserOperationHash
};

