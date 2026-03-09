// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * BitVoy Verifying Paymaster (minimal)
 * -----------------------------------
 * - AA v0.6 UserOperation compatible
 * - Accepts UserOp only if paymasterAndData contains a valid OP signature.
 *
 * paymasterAndData 固定フォーマット（拡張時は別バージョンで定義）:
 *   paymasterAndData = paymaster(20) || validUntil(6) || validAfter(6) || signature(65)
 * 総長 97 bytes。詳細は docs/AA-01-PAYMASTER-PAYMASTERANDDATA-FORMAT.md を参照。
 *
 * Layout:
 *   [0..20)   paymaster address (20 bytes)
 *   [20..26)  validUntil  (uint48, big-endian, 6 bytes)
 *   [26..32)  validAfter  (uint48, big-endian, 6 bytes)
 *   [32..97)  signature   (65 bytes) over getHash(userOpHashNoPM, validUntil, validAfter) EIP-191
 */
contract BitVoyVerifyingPaymaster is BasePaymaster {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // OP signer who authorizes sponsorship (your BitVoy OP hot key / HSM key)
    address public verifyingSigner;

    // Optional: restrict sponsored accounts
    mapping(address => bool) public isAllowedSender;
    bool public senderAllowlistEnabled;

    event VerifyingSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event SenderAllowlistEnabled(bool enabled);
    event SenderAllowed(address indexed sender, bool allowed);

    error InvalidPaymasterAndData();
    error InvalidSignature();
    error SenderNotAllowed();

    constructor(IEntryPoint _entryPoint, address _verifyingSigner)
        BasePaymaster(_entryPoint)        // ← 引数は1つ
        Ownable(msg.sender)              // ← OZ v5 対応（deployerをownerに）
    {
        require(_verifyingSigner != address(0), "SIGNER=0");
        verifyingSigner = _verifyingSigner;
    }

    // -----------------------
    // Admin
    // -----------------------

    function setVerifyingSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "SIGNER=0");
        address old = verifyingSigner;
        verifyingSigner = newSigner;
        emit VerifyingSignerUpdated(old, newSigner);
    }

    function setSenderAllowlistEnabled(bool enabled) external onlyOwner {
        senderAllowlistEnabled = enabled;
        emit SenderAllowlistEnabled(enabled);
    }

    function setAllowedSender(address sender, bool allowed) external onlyOwner {
        isAllowedSender[sender] = allowed;
        emit SenderAllowed(sender, allowed);
    }

    // -----------------------
    // Core validation
    // -----------------------

    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */, // EntryPointから渡されるが、paymasterAndDataを含むため使用しない
        uint256 /* maxCost */
    )
        internal
        view
        override
        returns (bytes memory context, uint256 validationData)
    {
        // Optional allowlist gate
        if (senderAllowlistEnabled && !isAllowedSender[userOp.sender]) {
            revert SenderNotAllowed();
        }

        bytes calldata pmd = userOp.paymasterAndData;

        // Must be: 20 + 6 + 6 + 65 = 97 bytes minimum
        if (pmd.length < 97) revert InvalidPaymasterAndData();

        // Ensure this paymaster is actually the one specified
        address paymasterAddr = address(bytes20(pmd[0:20]));
        if (paymasterAddr != address(this)) revert InvalidPaymasterAndData();

        uint48 validUntil = _parseUint48(pmd[20:26]);
        uint48 validAfter = _parseUint48(pmd[26:32]);

        bytes calldata sig = pmd[32:97]; // 65 bytes

        // Paymaster署名対象のハッシュを計算（paymasterAndDataを除外）
        // EntryPointから渡されるuserOpHashはpaymasterAndDataを含むため、
        // paymasterAndData="0x"としてハッシュを再計算する必要がある
        bytes32 userOpHashWithoutPaymaster = getUserOpHashWithoutPaymaster(userOp);
        
        bytes32 h = getHash(userOpHashWithoutPaymaster, validUntil, validAfter);
        address recovered = ECDSA.recover(h.toEthSignedMessageHash(), sig);

        if (recovered != verifyingSigner) revert InvalidSignature();

        // No postOp context needed for minimal version
        context = "";

        // AA validationData: (sigFailed ? 1 : 0) | (validAfter << 160) | (validUntil << (160+48))
        // Use Helpers._packValidationData from @account-abstraction/contracts
        // Signature: _packValidationData(bool sigFailed, uint48 validUntil, uint48 validAfter)
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    function _postOp(
        PostOpMode /* mode */,
        bytes calldata /* context */,
        uint256 /* actualGasCost */
    ) internal override {
        // minimal: nothing
    }

    // -----------------------
    // Hashing
    // -----------------------

    /**
     * Paymaster署名対象のuserOpHashを計算（paymasterAndDataを除外）
     * EntryPoint.getUserOpHashと同じロジックだが、paymasterAndData="0x"として計算
     */
    function getUserOpHashWithoutPaymaster(UserOperation calldata userOp) 
        public 
        view 
        returns (bytes32) 
    {
        // paymasterAndDataを"0x"として再構築
        UserOperation memory userOpWithoutPaymaster = UserOperation({
            sender: userOp.sender,
            nonce: userOp.nonce,
            initCode: userOp.initCode,
            callData: userOp.callData,
            callGasLimit: userOp.callGasLimit,
            verificationGasLimit: userOp.verificationGasLimit,
            preVerificationGas: userOp.preVerificationGas,
            maxFeePerGas: userOp.maxFeePerGas,
            maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
            paymasterAndData: "", // paymasterAndDataを空にする
            signature: "" // signatureも空にする
        });
        
        // EntryPoint.getUserOpHashを呼び出して、paymasterAndDataを除外したハッシュを取得
        return entryPoint.getUserOpHash(userOpWithoutPaymaster);
    }

    /**
     * Paymaster署名対象のハッシュを計算
     * @param userOpHashNoPM - UserOperation Hash（paymasterAndDataを除外、signatureも空）
     * @param validUntil - 有効期限（Unix timestamp）
     * @param validAfter - 有効開始時刻（Unix timestamp）
     * @return sponsorHash - Paymaster署名対象のハッシュ
     */
    function getHash(
        bytes32 userOpHashNoPM,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        // Domain-separated hash: chainId + paymaster + userOpHashNoPM + validity window
        // 注意: userOpHashNoPMはpaymasterAndDataを除外したハッシュ（循環依存を避けるため）
        // 型を明示的にキャストして順序を保証: uint256(chainId), address(paymaster), bytes32(userOpHashNoPM), uint48(validUntil), uint48(validAfter)
        return keccak256(
            abi.encode(
                uint256(block.chainid),
                address(this),
                bytes32(userOpHashNoPM),
                uint48(validUntil),
                uint48(validAfter)
            )
        );
    }

    // -----------------------
    // Utils
    // -----------------------

    function _parseUint48(bytes calldata b) internal pure returns (uint48 v) {
        // b.length must be 6
        if (b.length != 6) revert InvalidPaymasterAndData();
        v =
            (uint48(uint8(b[0])) << 40) |
            (uint48(uint8(b[1])) << 32) |
            (uint48(uint8(b[2])) << 24) |
            (uint48(uint8(b[3])) << 16) |
            (uint48(uint8(b[4])) << 8)  |
            (uint48(uint8(b[5])));
    }
}
