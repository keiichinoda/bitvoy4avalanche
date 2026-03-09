// scripts/deployFactory.js
// Usage:
//   npx hardhat run scripts/deployFactory.js --network polygon_amoy
//   npx hardhat run scripts/deployFactory.js --network polygon
//
// Required Environment Variables:
//   PRIVATE_KEY - Deployer private key
//   ENTRY_POINT_ADDRESS - ERC-4337 EntryPoint address (default: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)
//   OP_SIGNER_ADDRESS - OP Signer address
//
// Note: Factory はトークン非依存。createAccount(ownerEOA, salt, allowedToken) で USDC/JPYC 等を指定する。
//
// Optional Environment Variables:
//   POLYGON_AMOY_RPC - Polygon Amoy RPC URL
//   POLYGON_RPC - Polygon Mainnet RPC URL
//   POLYGONSCAN_API_KEY - For contract verification

const { ethers } = require("hardhat");

// ERC-4337 EntryPoint v0.6 standard address
const DEFAULT_ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

function isAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function mustAddress(name, value) {
  if (!isAddress(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  try {
    return ethers.utils.getAddress(value.toLowerCase());
  } catch (e) {
    throw new Error(`Invalid address checksum for ${name}: ${value}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Deploying BitVoyAccountFactory");
  console.log("═══════════════════════════════════════════════════════════");

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account found. Please set PRIVATE_KEY in .env file.");
  }

  const network = await ethers.provider.getNetwork();
  console.log("Deployer address:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceFormatted = ethers.utils.formatEther(balance);
  console.log("Deployer balance:", balanceFormatted, "MATIC/POL");
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Check if balance is sufficient (warn if less than 0.1 POL/MATIC)
  const minBalance = ethers.utils.parseEther("0.1");
  if (balance.lt(minBalance)) {
    console.warn("⚠️  Warning: Deployer balance is low!");
    console.warn(`   Current balance: ${balanceFormatted} POL/MATIC`);
    console.warn(`   Recommended: At least 0.1 POL/MATIC`);
    console.warn("   Deployment may fail if gas cost exceeds balance.\n");
  }

  // Get deployment parameters from environment variables
  const entryPointAddress = mustAddress(
    "ENTRY_POINT_ADDRESS",
    process.env.ENTRY_POINT_ADDRESS || DEFAULT_ENTRY_POINT
  );

  const opSignerAddress = mustAddress(
    "OP_SIGNER_ADDRESS",
    process.env.OP_SIGNER_ADDRESS
  );

  console.log("Deployment Parameters:");
  console.log("  EntryPoint:", entryPointAddress);
  console.log("  OP Signer:", opSignerAddress);
  console.log("  (Factory is token-agnostic; pass allowedToken in createAccount(owner, salt, token))");
  console.log("");

  // Verify EntryPoint is deployed
  const entryPointCode = await ethers.provider.getCode(entryPointAddress);
  if (entryPointCode === "0x") {
    throw new Error(`EntryPoint not deployed at ${entryPointAddress}`);
  }
  console.log("✅ EntryPoint verified at:", entryPointAddress);

  // Verify OP Signer is a valid address (not checking if it's deployed, as it might be an EOA)
  console.log("✅ OP Signer address validated:", opSignerAddress);
  console.log("");

  // Deploy BitVoyAccountFactory (constructor: entryPoint, opSigner only)
  console.log("Deploying BitVoyAccountFactory contract...");
  const Factory = await ethers.getContractFactory("BitVoyAccountFactory");

  // Estimate gas before deployment
  try {
    const deployTx = Factory.getDeployTransaction(
      entryPointAddress,
      opSignerAddress
    );
    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    const feeData = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.BigNumber.from(0);
    const estimatedCost = gasEstimate.mul(gasPrice);
    const estimatedCostFormatted = ethers.utils.formatEther(estimatedCost);
    
    console.log("Gas estimate:", gasEstimate.toString());
    console.log("Estimated cost:", estimatedCostFormatted, "POL/MATIC");
    
    if (balance.lt(estimatedCost)) {
      const shortfall = ethers.utils.formatEther(estimatedCost.sub(balance));
      throw new Error(
        `Insufficient balance! ` +
        `Current: ${balanceFormatted} POL/MATIC, ` +
        `Required: ${estimatedCostFormatted} POL/MATIC, ` +
        `Shortfall: ${shortfall} POL/MATIC`
      );
    }
    console.log("✅ Balance is sufficient for deployment\n");
  } catch (error) {
    if (error.message.includes("Insufficient balance")) {
      throw error;
    }
    console.warn("⚠️  Could not estimate gas, proceeding with deployment...");
    console.warn("   Error:", error.message);
  }
  
  const factory = await Factory.deploy(
    entryPointAddress,
    opSignerAddress
  );
  
  await factory.deployed();
  const factoryAddress = factory.address;

  console.log("✅ BitVoyAccountFactory deployed to:", factoryAddress);

  // Get deployment transaction hash
  const deployTx = factory.deployTransaction;
  if (deployTx) {
    console.log("Deploy transaction hash:", deployTx.hash);
    console.log("Waiting for confirmation...");
    await deployTx.wait();
    console.log("✅ Transaction confirmed");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("Deployment Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Factory Address:", factoryAddress);
  console.log("EntryPoint Address:", entryPointAddress);
  console.log("OP Signer Address:", opSignerAddress);
  console.log("Network:", network.name, "(Chain ID:", network.chainId.toString() + ")");
  console.log("(Use createAccount(ownerEOA, salt, allowedToken) for USDC/JPYC etc.)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Verification command (constructor: entryPoint, opSigner only)
  console.log("🔍 Verification command:");
  console.log(`npx hardhat verify --network ${network.name} ${factoryAddress} "${entryPointAddress}" "${opSignerAddress}"`);
  console.log("");

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    factoryAddress: factoryAddress,
    entryPointAddress: entryPointAddress,
    opSignerAddress: opSignerAddress,
    deployer: deployer.address,
    deployTxHash: deployTx?.hash || "N/A",
    timestamp: new Date().toISOString()
  };

  console.log("📋 Deployment Info (JSON):");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => {
    console.log("\n✅ Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  });

