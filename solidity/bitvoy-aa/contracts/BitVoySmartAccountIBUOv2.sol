// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
 BitVoy OIDC Payment × AA
 Intent-bound UserOperation (IBUO v2) — V2-only Smart Account

 V1 compatibility (executeIntent / 66-byte sig / EIP-712 hash) has been removed.
 Only executeIntentV2 is supported.

 TSTORE armed pattern (fixed-slot):
   validateUserOp:   tstore(ARMED_SLOT, intentHash)   — arms the slot with the hash
   executeIntentV2:  tload(ARMED_SLOT) == intentHash   — verifies and clears
   This pattern is reentrancy-safe (slot cleared before external call).

 intentHash (V2 canonical, computed off-chain):
   keccak256(abi.encodePacked(
     token, payee, amount,
     uint48(validAfter), uint48(validUntil), uint32(nonce),
     uint256(chainId),
     keccak256(bytes(rp_client_id)),
     keccak256(bytes(order_ref)),
     keccak256(bytes(intent_id))
   ))
 The intentHash is passed as bytes32 to executeIntentV2 (4th param, callData offset 100).

 Signature format (131 bytes):
   [0]       authType = 0x02
   [1..32]   user_r
   [33..64]  user_s
   [65]      user_v
   [66..97]  op_r
   [98..129] op_s
   [130]     op_v
*/

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BitVoySmartAccountIBUOv2 is IAccount {
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
    // Transient storage — fixed slot for armed intentHash
    // --------------------
    // keccak256("BitVoy.armedIntentHash.v2") — deterministic, collision-resistant
    uint256 private constant ARMED_SLOT = uint256(keccak256("BitVoy.armedIntentHash.v2"));

    // --------------------
    // Replay protection
    // --------------------
    mapping(bytes32 => bool) public usedIntents;

    // --------------------
    // Errors
    // --------------------
    error OnlyEntryPoint();
    error PaymasterRequired();
    error InvalidAuthType();
    error InvalidSignature();
    error InvalidUserSigV();
    error InvalidOpSigV();
    error InvalidCallData();
    error TokenNotAllowed();
    error TooEarly();
    error Expired();
    error IntentAlreadyUsed();
    error InvalidOpSignature();
    error NotArmed();

    constructor(
        address entryPoint_,
        address opSigner_,
        address allowedToken_,
        address ownerEOA_
    ) {
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
    // IAccount.validateUserOp
    // NOTE: external (not view) — TSTORE has side-effects.
    // --------------------
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 /* missingAccountFunds */
    ) external override returns (uint256 validationData) {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();
        if (userOp.paymasterAndData.length == 0) revert PaymasterRequired();

        if (userOp.callData.length < 4) revert InvalidCallData();
        bytes4 selector = bytes4(userOp.callData);
        if (selector != this.executeIntentV2.selector) revert InvalidCallData();

        return _validateV2(userOp);
    }

    // --------------------
    // V2 validate: 131-byte sig, fixed-slot TSTORE armed
    // --------------------
    function _validateV2(UserOperation calldata userOp)
        internal
        returns (uint256)
    {
        bytes calldata sig = userOp.signature;
        // 131 bytes: 1 authType + 32 r + 32 s + 1 v + 32 op_r + 32 op_s + 1 op_v
        if (sig.length != 131) revert InvalidSignature();

        uint8 authType = uint8(sig[0]);
        if (authType != 0x02) revert InvalidAuthType();

        // --- user signature (bytes [1..65]) ---
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

        bytes memory userSig65 = abi.encodePacked(r, s, bytes1(v));
        bytes32 hashToSign = _getHashToSign(userOp);
        address signer = hashToSign.recover(userSig65);
        if (signer != OWNER_EOA) revert InvalidSignature();

        // --- op signature (bytes [66..130]) ---
        bytes32 op_r;
        bytes32 op_s;
        uint8 op_v;
        assembly {
            op_r := calldataload(add(sig.offset, 66))
            op_s := calldataload(add(sig.offset, 98))
            op_v := byte(0, calldataload(add(sig.offset, 130)))
        }
        if (op_v < 27) op_v += 27;
        if (op_v != 27 && op_v != 28) revert InvalidOpSigV();

        bytes32 ih = _extractIntentHashV2(userOp.callData);
        bytes memory opSig65 = abi.encodePacked(op_r, op_s, bytes1(op_v));
        address op = ih.recover(opSig65);
        if (op != OP_SIGNER) revert InvalidOpSignature();

        // Arm: store intentHash at fixed slot
        uint256 _slot = ARMED_SLOT;
        assembly { tstore(_slot, ih) }

        return _packValidationData(false, 0, 0);
    }

    // --------------------
    // V2 Execution — compact callData (228 bytes), fixed-slot TSTORE
    // --------------------
    function executeIntentV2(
        address token,
        address payee,
        uint256 amount,
        bytes32 intentHash,
        uint48  validAfter,
        uint48  validUntil,
        uint32  /* nonce */   // embedded in intentHash; not used directly in body
    ) external {
        if (msg.sender != ENTRY_POINT) revert OnlyEntryPoint();

        // Armed check: validateUserOp must have stored this intentHash in the same tx
        uint256 _slot = ARMED_SLOT;
        bytes32 armed;
        assembly { armed := tload(_slot) }
        if (armed != intentHash) revert NotArmed();
        // Disarm immediately (prevents reentrancy through same intentHash)
        assembly { tstore(_slot, 0) }

        if (token != ALLOWED_TOKEN) revert TokenNotAllowed();
        if (block.timestamp < validAfter) revert TooEarly();
        if (block.timestamp > validUntil) revert Expired();
        if (usedIntents[intentHash]) revert IntentAlreadyUsed();

        // Mark used BEFORE external call (reentrancy-safe)
        usedIntents[intentHash] = true;

        IERC20(ALLOWED_TOKEN).safeTransfer(payee, amount);
    }

    // --------------------
    // Extract intentHash from V2 callData
    // executeIntentV2(address,address,uint256,bytes32,uint48,uint48,uint32)
    // intentHash is param index 3 → callData offset = 4 + 3*32 = 100
    // --------------------
    function _extractIntentHashV2(bytes calldata cd) internal pure returns (bytes32 h) {
        assembly { h := calldataload(add(cd.offset, 100)) }
    }

    // --------------------
    // UserOp hash for user signature verification
    // Matches SmartAccount.getHashToSign (paymasterAndData treated as empty)
    // --------------------
    function _getHashToSign(UserOperation calldata userOp) internal view returns (bytes32) {
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
            keccak256(hex"") // paymasterAndData always empty for signing
        ));
        return keccak256(abi.encode(userOpHash, ENTRY_POINT, block.chainid));
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
}
