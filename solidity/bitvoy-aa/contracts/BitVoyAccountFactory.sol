// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "./BitVoySmartAccountIBUOv1.sol";

/// @title BitVoyAccountFactory
/// @notice 同一 Factory で複数トークン（USDC / JPYC 等）ごとの SmartAccount をデプロイする。
/// createAccount(ownerEOA, salt, allowedToken) で token を指定。salt は呼び出し元で tokenAddress を含めて計算する（トークンごとに異なる salt → トークンごとに別 SA アドレス）。
///
/// ## CREATE2 と initCode（運用上の再現性）
/// - SA アドレスは **(factory, salt, initCodeHash)** で一意に決まる（CREATE2 の仕様）。initCode が 1 バイトでも変わればアドレスが変わる。
/// - **initCode の内容**（getInitCode と同一）:
///   - `initCode = creationCode(BitVoySmartAccountIBUOv1) || abi.encode(ENTRY_POINT, OP_SIGNER, allowedToken, ownerEOA)`
/// - トークンごとに SA を分ける場合は **salt に tokenAddress を混ぜる**こと。initCode には allowedToken が含まれるため (ownerEOA, allowedToken) ごとに initCode が変わり、salt と合わせてアドレスが一意になる。
contract BitVoyAccountFactory {
    address public immutable ENTRY_POINT;
    address public immutable OP_SIGNER;

    event AccountCreated(
        address indexed smartAccount,
        address indexed ownerEOA,
        bytes32 indexed salt,
        address allowedToken
    );

    constructor(address entryPoint_, address opSigner_) {
        require(entryPoint_ != address(0), "EP=0");
        require(opSigner_ != address(0), "OP=0");
        ENTRY_POINT = entryPoint_;
        OP_SIGNER = opSigner_;
    }

    /// @param allowedToken SA の ALLOWED_TOKEN（USDC / JPYC 等のアドレス）
    function createAccount(address ownerEOA, bytes32 salt, address allowedToken) external returns (address sa) {
        require(ownerEOA != address(0), "OWNER=0");
        require(allowedToken != address(0), "TOKEN=0");

        address predicted = getAddress(ownerEOA, salt, allowedToken);

        if (_isDeployed(predicted)) {
            return predicted;
        }

        sa = address(
            new BitVoySmartAccountIBUOv1{salt: salt}(
                ENTRY_POINT,
                OP_SIGNER,
                allowedToken,
                ownerEOA
            )
        );

        require(sa == predicted, "CREATE2_MISMATCH");

        emit AccountCreated(sa, ownerEOA, salt, allowedToken);
    }

    /// @notice CREATE2 で計算した SA アドレス。アドレスは (address(this), salt, keccak256(initCode)) で一意。
    function getAddress(address ownerEOA, bytes32 salt, address allowedToken) public view returns (address) {
        bytes memory initCode = getInitCode(ownerEOA, allowedToken);
        bytes32 initCodeHash = keccak256(initCode);

        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
        );

        return address(uint160(uint256(hash)));
    }

    /// @notice initCode = creationCode || abi.encode(ENTRY_POINT, OP_SIGNER, allowedToken, ownerEOA)。この内容が変わると initCodeHash が変わり SA アドレスも変わる。
    function getInitCode(address ownerEOA, address allowedToken) public view returns (bytes memory) {
        return abi.encodePacked(
            type(BitVoySmartAccountIBUOv1).creationCode,
            abi.encode(ENTRY_POINT, OP_SIGNER, allowedToken, ownerEOA)
        );
    }

    function _isDeployed(address a) internal view returns (bool) {
        return a.code.length > 0;
    }
}

