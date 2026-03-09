// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./BitVoySmartAccountIBUOv2.sol";

/// @title BitVoyAccountFactoryV2
/// @notice Factory for BitVoySmartAccountIBUOv2.
/// Same interface as V1 factory; deploys V2 SA (TSTORE / executeIntentV2).
/// Separate deployment address from V1 factory.
///
/// createAccount(ownerEOA, salt, allowedToken) — salt should include tokenAddress
/// to ensure per-token uniqueness.
contract BitVoyAccountFactoryV2 {
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

    /// @param allowedToken SA's ALLOWED_TOKEN (USDC / JPYC etc.)
    function createAccount(address ownerEOA, bytes32 salt, address allowedToken)
        external
        returns (address sa)
    {
        require(ownerEOA != address(0), "OWNER=0");
        require(allowedToken != address(0), "TOKEN=0");

        address predicted = getAddress(ownerEOA, salt, allowedToken);

        if (_isDeployed(predicted)) {
            return predicted;
        }

        sa = address(
            new BitVoySmartAccountIBUOv2{salt: salt}(
                ENTRY_POINT,
                OP_SIGNER,
                allowedToken,
                ownerEOA
            )
        );

        require(sa == predicted, "CREATE2_MISMATCH");

        emit AccountCreated(sa, ownerEOA, salt, allowedToken);
    }

    /// @notice Predict SA address via CREATE2.
    function getAddress(address ownerEOA, bytes32 salt, address allowedToken)
        public
        view
        returns (address)
    {
        bytes memory initCode = getInitCode(ownerEOA, allowedToken);
        bytes32 initCodeHash = keccak256(initCode);

        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
        );

        return address(uint160(uint256(hash)));
    }

    /// @notice initCode = creationCode || abi.encode(ENTRY_POINT, OP_SIGNER, allowedToken, ownerEOA)
    function getInitCode(address ownerEOA, address allowedToken)
        public
        view
        returns (bytes memory)
    {
        return abi.encodePacked(
            type(BitVoySmartAccountIBUOv2).creationCode,
            abi.encode(ENTRY_POINT, OP_SIGNER, allowedToken, ownerEOA)
        );
    }

    function _isDeployed(address a) internal view returns (bool) {
        return a.code.length > 0;
    }
}
