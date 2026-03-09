const { ethers } = require("hardhat");

async function main() {
  const paymasterAddress = "0x110B6Fc8243B1258a221C153A9e1cd57fFD0A96a";
  
  // Paymaster ABI（getUserOpHashWithoutPaymaster関数を含む）
  const paymasterABI = [
    "function getUserOpHashWithoutPaymaster((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) public view returns (bytes32)",
    "function getHash(bytes32 userOpHashNoPM, uint48 validUntil, uint48 validAfter) public view returns (bytes32)",
    "function verifyingSigner() public view returns (address)"
  ];
  
  try {
    // コントラクトのコードを確認
    const code = await ethers.provider.getCode(paymasterAddress);
    console.log("Paymaster code length:", code.length);
    console.log("Paymaster has code:", code !== "0x");
    
    if (code === "0x") {
      console.log("❌ Paymaster contract does not exist at this address");
      return;
    }
    
    const paymaster = new ethers.Contract(paymasterAddress, paymasterABI, ethers.provider);
    
    // verifyingSignerを確認
    try {
      const signer = await paymaster.verifyingSigner();
      console.log("✅ verifyingSigner:", signer);
    } catch (error) {
      console.log("❌ verifyingSigner() failed:", error.message);
    }
    
    // getUserOpHashWithoutPaymaster関数が存在するか確認
    const testUserOp = {
      sender: "0x0000000000000000000000000000000000000000",
      nonce: 0,
      initCode: "0x",
      callData: "0x",
      callGasLimit: 0,
      verificationGasLimit: 0,
      preVerificationGas: 0,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
      paymasterAndData: "0x",
      signature: "0x"
    };
    
    try {
      const hash = await paymaster.getUserOpHashWithoutPaymaster(testUserOp);
      console.log("✅ getUserOpHashWithoutPaymaster function exists");
      console.log("   Test hash:", hash);
    } catch (error) {
      console.log("❌ getUserOpHashWithoutPaymaster function does NOT exist or error:");
      console.log("   Error:", error.message);
      console.log("\n⚠️  This means the Paymaster contract needs to be redeployed with the new code.");
      console.log("   The contract at", paymasterAddress, "does not have the getUserOpHashWithoutPaymaster function.");
    }
    
    // getHash関数が存在するか確認
    try {
      const testHash = ethers.utils.keccak256("0x00");
      const sponsorHash = await paymaster.getHash(testHash, 0, 0);
      console.log("✅ getHash function exists");
      console.log("   Test sponsorHash:", sponsorHash);
    } catch (error) {
      console.log("❌ getHash function does NOT exist or error:", error.message);
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch(console.error);

