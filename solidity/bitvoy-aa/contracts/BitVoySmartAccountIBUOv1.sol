// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/*
 BitVoy OIDC Payment × AA
 Intent-bound UserOperation (IBUO v1) — Spec-aligned Smart Account

 Key properties (v1 fixed):
 - ERC-4337 Account (IAccount)
 - Deterministic per-user deployment via CREATE2 (handled by Factory)
 - OWNER_EOA immutable (cannot be swapped later)
 - OP_SIGNER immutable (OP attestation verifier)
 - ALLOWED_TOKEN immutable (token-only policy)
 - Paymaster REQUIRED (sponsored gas only)
 - UserOperation.callData MUST be executeIntent(intentPayload, opAttestation)
 - validateUserOp verifies ONLY SA signature (UserOp.signature)
 - executeIntent verifies intent + OP attestation and executes ERC20.transfer(payee, amount)
 - Signature format (v1 fixed):
     userOp.signature = abi.encodePacked(authType, r, s, v)
     authType == 0x02 (secp256k1 ECDSA produced by MPC)
 - OP attestation:
     opAttestation = abi.encodePacked(r, s, v) (65 bytes), signature over EIP-712 intentHash
*/

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BitVoySmartAccountIBUOv1 is IAccount, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // --------------------
    // Immutable config
    // --------------------
    address public immutable ENTRY_POINT;
    address public immutable OP_SIGNER;
    address public immutable ALLOWED_TOKEN;
    address public immutable OWNER_EOA;

    // --------------------
    // Replay protection
    // --------------------
    mapping(bytes32 => bool) public usedIntents;

    // --------------------
    // EIP-712 (Intent Hash)
    // --------------------
    // name: "BitVoy Intent", version: "1" (fixed)
    bytes32 private constant INTENT_TYPEHASH = keccak256(
        "IntentPayload(address token,uint256 amount,address payee,uint48 valid_after,uint48 valid_until,uint256 intent_nonce,uint256 chain_id,bytes32 rp_client_id_hash,bytes32 order_ref_hash,bytes32 intent_id)"
    );

    // --------------------
    // Errors (cheap revert reasons)
    // --------------------
    error OnlyEntryPoint();
    error PaymasterRequired();
    error InvalidAuthType();
    error InvalidSignature();
    error InvalidUserSigV();   // UserOp 署名の v が 27/28 でない（validateUserOp）
    error InvalidOpSigV();    // OP attestation の v が 27/28 でない（executeIntent）
    error InvalidCallData();
    error TokenNotAllowed();
    error ChainMismatch();
    error TooEarly();
    error Expired();
    error IntentAlreadyUsed();
    error InvalidOpSigLength();
    error InvalidOpSignature();

    constructor(
        address entryPoint_,
        address opSigner_,
        address allowedToken_,
        address ownerEOA_
    ) EIP712("BitVoy Intent", "1") {
        require(entryPoint_ != address(0), "EP=0");
        require(opSigner_ != address(0), "OP=0");
        require(allowedToken_ != address(0), "TOKEN=0");
        require(ownerEOA_ != address(0), "OWNER=0");

        ENTRY_POINT = entryPoint_;
        OP_SIGNER = opSigner_;
        ALLOWED_TOKEN = allowedToken_;
        OWNER_EOA = ownerEOA_;
    }

    // --------------------
    // IAccount
    // --------------------
    
    /**
     * SmartAccount署名対象のハッシュを計算
     * paymasterAndDataとsignatureは常に空（0x）として扱う
     * EntryPoint.getUserOpHashと同じロジックをローカル実装（RPC呼び出しを避ける）
     * 
     * 計算ロジック（ERC-4337 EntryPoint.getUserOpHash準拠）:
     * 1. UserOperationの各フィールドをabi.encodeでpack（paymasterAndDataは空として扱う）
     * 2. packedデータをkeccak256
     * 3. EntryPointアドレスとchainIdを含めて最終的なhashを計算（abi.encode使用）
     * 
     * 重要: 内側も外側もabi.encodeを使用（abi.encodePackedではない）
     */
    function getHashToSign(UserOperation calldata userOp) 
        public 
        view 
        returns (bytes32) 
    {
        // EntryPoint.getUserOpHashと同じロジックでローカル計算
        // 1. UserOperationをpack（paymasterAndDataは常に空として扱う）
        // abi.encode使用（32byte境界、EntryPoint実装と一致）
        bytes32 userOpHash = keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            keccak256(hex"") // paymasterAndDataは常に空
        ));
        
        // 2. Domain separation: EntryPointアドレスとchainIdを含めて最終的なhashを計算
        // abi.encode使用（32byte境界、EntryPoint実装と一致）
        return keccak256(abi.encode(
            userOpHash,
            ENTRY_POINT,   // address public immutable ENTRY_POINT（コンストラクタで固定）
            block.chainid
        ));
    }
    
    /**
     * IAccount.validateUserOp
     *
     * 重要: 署名検証には必ず getHashToSign(userOp) を使い、引数 userOpHash は使わない。
     * - EntryPoint が渡す userOpHash は「最終 UserOp（paymasterAndData 込み）」のハッシュ。
     * - クライアントは paymasterAndData=0x, signature=0x で hashToSign を計算して署名する。
     * - userOpHash で ecrecover すると署名が一致せず、require で落ちて revert データが空（0x00...）になり AA23 の原因になる。
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */,   // 使用禁止: 署名検証に使うと Paymaster 利用時に必ず失敗する。getHashToSign(userOp) のみ使用すること。
        uint256 /* missingAccountFunds */
    ) external view override returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // v1 fixed: Paymaster REQUIRED (sponsored gas only)
        if (userOp.paymasterAndData.length == 0) revert PaymasterRequired();

        // v1 fixed: callData must be executeIntent(...)
        if (userOp.callData.length < 4) revert InvalidCallData();
        bytes4 selector = bytes4(userOp.callData);
        if (selector != this.executeIntent.selector) revert InvalidCallData();

        // v1 fixed signature format: [1 byte authType][32 r][32 s][1 v] => 66 bytes
        bytes calldata sig = userOp.signature;
        if (sig.length != 66) revert InvalidSignature();

        uint8 authType = uint8(sig[0]);
        if (authType != 0x02) revert InvalidAuthType();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(add(sig.offset, 1))
            s := calldataload(add(sig.offset, 33))
            v := byte(0, calldataload(add(sig.offset, 65)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidUserSigV();

        // 署名検証は getHashToSign(userOp) のみ使用。引数 userOpHash は使用しない。
        bytes memory sig65 = abi.encodePacked(r, s, bytes1(v));
        bytes32 hashToSign = getHashToSign(userOp);
        address signer = hashToSign.recover(sig65);

        if (signer != OWNER_EOA) revert InvalidSignature();

        // Success: no time-range validation at UserOp level for v1.
        return _packValidationData(false, 0, 0);
    }

    // --------------------
    // Execution entry
    // --------------------
    function executeIntent(
        IntentPayload calldata intentPayload,
        bytes calldata opAttestation
    ) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // token-only policy (v1 fixed)
        if (intentPayload.token != ALLOWED_TOKEN) revert TokenNotAllowed();

        // chainId binding (v1 fixed)
        if (block.chainid != intentPayload.chain_id) revert ChainMismatch();

        // time window (v1 fixed)
        if (block.timestamp < intentPayload.valid_after) revert TooEarly();
        if (block.timestamp > intentPayload.valid_until) revert Expired();

        // one-time intent
        if (usedIntents[intentPayload.intent_id]) revert IntentAlreadyUsed();

        // IntentHash (EIP-712)
        bytes32 intentHash = _hashIntent(intentPayload);

        // OP attestation must be 65 bytes (r,s,v)
        if (opAttestation.length != 65) revert InvalidOpSigLength();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(add(opAttestation.offset, 0))
            s := calldataload(add(opAttestation.offset, 32))
            v := byte(0, calldataload(add(opAttestation.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidOpSigV();

        bytes memory opSig65 = abi.encodePacked(r, s, bytes1(v));
        address op = intentHash.recover(opSig65);
        if (op != OP_SIGNER) revert InvalidOpSignature();

        // Mark used AFTER all checks but BEFORE external transfer (reentrancy-safe pattern)
        usedIntents[intentPayload.intent_id] = true;

        // Execute ERC20.transfer(payee, amount)
        IERC20(ALLOWED_TOKEN).safeTransfer(intentPayload.payee, intentPayload.amount);
    }

    // --------------------
    // Intent EIP-712 hash
    // --------------------
    function _hashIntent(IntentPayload calldata p) internal view returns (bytes32) {
        // Spec fields only; domain includes chainId + verifyingContract
        bytes32 structHash = keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                p.token,
                p.amount,
                p.payee,
                p.valid_after,
                p.valid_until,
                p.intent_nonce,
                p.chain_id,
                p.rp_client_id_hash,
                p.order_ref_hash,
                p.intent_id
            )
        );
        return _hashTypedDataV4(structHash);
    }

    // --------------------
    // ValidationData packer
    // --------------------
    function _packValidationData(
        bool sigFailed,
        uint48 validUntil,
        uint48 validAfter
    ) internal pure returns (uint256) {
        return uint256(
            (sigFailed ? 1 : 0) |
            (uint256(validUntil) << 160) |
            (uint256(validAfter) << (160 + 48))
        );
    }

    receive() external payable {}

    // --------------------
    // Structs
    // --------------------
    struct IntentPayload {
        address token;
        uint256 amount;
        address payee;
        uint48 valid_after;
        uint48 valid_until;
        uint256 intent_nonce;
        uint256 chain_id;
        bytes32 rp_client_id_hash;
        bytes32 order_ref_hash;
        bytes32 intent_id;
    }
}
