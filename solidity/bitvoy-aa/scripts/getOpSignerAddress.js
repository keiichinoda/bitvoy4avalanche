// scripts/getOpSignerAddress.js
// Usage:
//   node scripts/getOpSignerAddress.js
//   OP_SIGNER_PRIVATE_KEY=0x... node scripts/getOpSignerAddress.js
//
// This script calculates the OP Signer address from the private key.
// Use this address as OP_SIGNER_ADDRESS when deploying the Factory contract.

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  const privateKey = process.env.OP_SIGNER_PRIVATE_KEY;
  
  if (!privateKey) {
    console.error("❌ Error: OP_SIGNER_PRIVATE_KEY environment variable is not set.");
    console.error("\nUsage:");
    console.error("  OP_SIGNER_PRIVATE_KEY=0x... node scripts/getOpSignerAddress.js");
    console.error("  or set it in .env file");
    process.exit(1);
  }

  try {
    // Create wallet from private key
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;
    
    console.log("═══════════════════════════════════════════════════════════");
    console.log("OP Signer Address Calculator");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("Private Key (first 10 chars):", privateKey.substring(0, 10) + "...");
    console.log("OP Signer Address:", address);
    console.log("═══════════════════════════════════════════════════════════\n");
    
    console.log("📋 Use this address as OP_SIGNER_ADDRESS when deploying:");
    console.log(`   OP_SIGNER_ADDRESS=${address}\n`);
    
  } catch (error) {
    console.error("❌ Error calculating OP Signer address:", error.message);
    if (error.message.includes("invalid private key")) {
      console.error("\nPlease ensure OP_SIGNER_PRIVATE_KEY is a valid hex string starting with 0x");
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

