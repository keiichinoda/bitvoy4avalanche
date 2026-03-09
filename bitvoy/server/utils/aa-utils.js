const { ethers } = require('ethers');

/**
 * EIP-712 Intent Hash計算
 */
function computeIntentHash(intentPayload, smartAccountAddress, chainId) {
    // パラメータの検証
    if (!intentPayload) {
        throw new Error('intentPayload is required');
    }
    if (!smartAccountAddress) {
        throw new Error('smartAccountAddress is required');
    }
    if (chainId === undefined || chainId === null) {
        throw new Error('chainId is required');
    }
    
    const domain = {
        name: "BitVoy Intent",
        version: "1",
        chainId: chainId,
        verifyingContract: smartAccountAddress
    };
    
    // コントラクト INTENT_TYPEHASH と完全一致させる: 型名 "IntentPayload", valid_after/valid_until は uint48
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
    
    try {
        const hash = ethers.utils._TypedDataEncoder.hash(domain, types, intentPayload);
        if (!hash) {
            throw new Error('_TypedDataEncoder.hash returned undefined');
        }
        return hash;
    } catch (error) {
        console.error('Error in computeIntentHash:', error, {
            domain,
            intentPayload: JSON.stringify(intentPayload)
        });
        throw error;
    }
}

/**
 * IntentPayloadV1構造体の作成
 */
function createIntentPayloadV1(intent, tokenAddress, chainId) {
    // intent_idをbytes32に変換（全文を格納、最大32バイト）
    // intent_idは通常文字列（ULID等）。32バイト未満は右詰めゼロパディング
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
    
    // intent_nonceは数値カウンタとして扱う
    // intent.intent_nonceが存在する場合はそれを使用（Intent発行時に設定済み）
    // 存在しない場合は、Smart Accountから取得する必要がある
    let intentNonceValue = 0;
    if (intent.intent_nonce !== undefined && intent.intent_nonce !== null) {
        // Intent発行時に設定されたintent_nonceカウンタを使用
        intentNonceValue = parseInt(intent.intent_nonce) || 0;
    } else {
        // フォールバック: intent.nonce（ハッシュ値）から数値に変換（暫定対応）
        // 将来的には、このケースはエラーにするべき
        console.warn('⚠️ intent.intent_nonce not found, using fallback conversion from intent.nonce');
        if (intent.nonce && typeof intent.nonce === 'string') {
            const nonceHex = intent.nonce.replace(/^0x/, '').substring(0, 16).padEnd(16, '0');
            intentNonceValue = parseInt(nonceHex, 16);
        }
    }
    
    return {
        token: tokenAddress,
        amount: intent.amount.toString(),
        payee: intent.payee_address,
        valid_after: Math.floor(new Date(intent.created_at).getTime() / 1000),
        valid_until: Math.floor(new Date(intent.expires_at).getTime() / 1000),
        intent_nonce: intentNonceValue.toString(), // 数値として扱う
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
    if (!intentHash) {
        throw new Error('intentHash is required');
    }
    
    // intentHashがhex文字列でない場合は変換
    let hashBytes;
    if (typeof intentHash === 'string') {
        // hex文字列の場合
        if (!intentHash.startsWith('0x')) {
            intentHash = '0x' + intentHash;
        }
        hashBytes = ethers.utils.arrayify(intentHash);
    } else {
        hashBytes = intentHash;
    }
    
    // intentHash は EIP-712 ダイジェスト（\x19\x01... を含む）。
    // コントラクトは ECDSA.recover(intentHash, sig) = 生の ecrecover を使うため、
    // EIP-191 プレフィックスを付加する signMessage は使えない。
    // SigningKey.signDigest で生の署名を行う。
    const signingKey = new ethers.utils.SigningKey(opSignerPrivateKey);
    const sigDigest = signingKey.signDigest(hashBytes);
    const signature = ethers.utils.joinSignature(sigDigest);
    return signature;
}

/**
 * UserOperation構築
 */
function buildUserOperation(
    smartAccountAddress,
    callData,
    nonce,
    paymasterAndData = "0x",
    initCode = "0x"
) {
    // nonceをhex形式に変換（Bundler RPCはhex形式を要求）
    let nonceHex;
    if (typeof nonce === 'string') {
        if (nonce.startsWith('0x')) {
            nonceHex = nonce;
        } else {
            // 数値文字列をhex形式に変換
            const num = BigInt(nonce);
            nonceHex = '0x' + num.toString(16);
        }
    } else {
        // 数値をhex形式に変換
        const num = BigInt(nonce);
        nonceHex = '0x' + num.toString(16);
    }

    return {
        sender: smartAccountAddress,
        nonce: nonceHex,
        initCode: initCode || "0x",
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
 * ERC-4337準拠: EntryPointアドレスはaddress型として扱う
 * 重要: abi.encodeを使用（abi.encodePackedではない、EntryPoint実装と一致）
 * 
 * 注意: EntryPoint互換性の確認が必要
 * - 実際に使用しているEntryPoint実装がabi.encodeかabi.encodePackedかを確認
 * - 同一userOpでEntryPoint.getUserOpHashとこの関数の結果が一致することをテストで確認
 */
function computeUserOperationHash(userOp, entryPointAddress, chainId) {
    // UserOperationの各フィールドをabi.encodeでpack
    // 注意: solidityPack（abi.encodePacked相当）ではなく、defaultAbiCoder.encode()（abi.encode相当）を使用
    // ethers v5では defaultAbiCoder は関数ではなくオブジェクトなので、直接使用
    const abiCoder = ethers.utils.defaultAbiCoder;
    const packed = abiCoder.encode(
        [
            "address", "uint256", "bytes32", "bytes32",
            "uint256", "uint256", "uint256", "uint256", "uint256",
            "bytes32"
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
            ethers.utils.keccak256(userOp.paymasterAndData || "0x")
        ]
    );
    
    // EntryPointアドレスとchainIdを含めて最終的なhashを計算
    // abi.encodeを使用（abi.encodePackedではない）
    const userOpHash = ethers.utils.keccak256(packed);
    const final = abiCoder.encode(
        ["bytes32", "address", "uint256"],
        [userOpHash, entryPointAddress, chainId]
    );
    
    return ethers.utils.keccak256(final);
}

/**
 * SmartAccount署名対象のハッシュを計算
 * paymasterAndDataとsignatureは常に空（0x）として扱う
 * EntryPoint.getUserOpHashと同じロジックだが、paymasterAndDataとsignatureを空として計算
 * 重要: abi.encodeを使用（abi.encodePackedではない、EntryPoint実装と一致）
 */
function getHashToSign(userOp, entryPointAddress, chainId) {
    // paymasterAndDataとsignatureを空として再構築
    const userOpForHash = {
        sender: userOp.sender,
        nonce: userOp.nonce,
        initCode: userOp.initCode || "0x",
        callData: userOp.callData || "0x",
        callGasLimit: userOp.callGasLimit || "0x0",
        verificationGasLimit: userOp.verificationGasLimit || "0x0",
        preVerificationGas: userOp.preVerificationGas || "0x0",
        maxFeePerGas: userOp.maxFeePerGas || "0x0",
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas || "0x0",
        paymasterAndData: "0x", // 常に空
        signature: "0x" // 常に空
    };
    
    // EntryPoint.getUserOpHashと同じロジックで計算（abi.encode使用）
    return computeUserOperationHash(userOpForHash, entryPointAddress, chainId);
}

/**
 * V2 Intent Hash (compact, non-EIP-712)
 *
 * Matches the on-chain canonicalization expected by BitVoySmartAccountIBUOv2:
 *   keccak256(abi.encodePacked(
 *     token, payee, amount,
 *     uint48(validAfter), uint48(validUntil), uint32(nonce),
 *     uint256(chainId),
 *     keccak256(bytes(rpClientId)),
 *     keccak256(bytes(orderRef)),
 *     keccak256(bytes(intentId))
 *   ))
 *
 * @param {string} token        - ERC20 token address
 * @param {string} payee        - Recipient address
 * @param {string|BigInt} amount - Token amount (raw units)
 * @param {number} validAfter   - Unix timestamp
 * @param {number} validUntil   - Unix timestamp
 * @param {number} nonce        - Intent nonce (uint32)
 * @param {number} chainId      - EVM chain ID
 * @param {string} rpClientId   - Relying-party client ID string
 * @param {string} orderRef     - Order reference string
 * @param {string} intentId     - Intent ID string
 * @returns {string} 0x-prefixed bytes32 hash
 */
function computeIntentHashV2(token, payee, amount, validAfter, validUntil, nonce, chainId, rpClientId, orderRef, intentId) {
    return ethers.utils.keccak256(ethers.utils.solidityPack(
        ['address', 'address', 'uint256', 'uint48', 'uint48', 'uint32', 'uint256', 'bytes32', 'bytes32', 'bytes32'],
        [
            token,
            payee,
            amount,
            validAfter,
            validUntil,
            nonce,
            chainId,
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(rpClientId)),
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(orderRef)),
            ethers.utils.keccak256(ethers.utils.toUtf8Bytes(intentId))
        ]
    ));
}

module.exports = {
    computeIntentHash,
    computeIntentHashV2,
    createIntentPayloadV1,
    signIntentWithOP,
    buildUserOperation,
    computeUserOperationHash,
    getHashToSign
};

