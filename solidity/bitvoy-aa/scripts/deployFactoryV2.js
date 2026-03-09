// scripts/deployFactoryV2.js
// Usage:
//   npx hardhat run scripts/deployFactoryV2.js --network polygon_amoy
//   npx hardhat run scripts/deployFactoryV2.js --network polygon
//
// Required Environment Variables:
//   PRIVATE_KEY         - Deployer private key
//   OP_SIGNER_ADDRESS   - OP Signer address
//
// Optional Environment Variables:
//   ENTRY_POINT_ADDRESS - ERC-4337 EntryPoint (default: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)
//   POLYGON_AMOY_RPC    - Polygon Amoy RPC URL
//   POLYGON_RPC         - Polygon Mainnet RPC URL
//   POLYGONSCAN_API_KEY - For contract verification
//
// Deploys BitVoyAccountFactoryV2 which produces BitVoySmartAccountIBUOv2 (TSTORE / executeIntentV2).
// Separate deployment address from V1 factory — V1 SAs are unaffected.

const { ethers } = require("hardhat");

const DEFAULT_ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

function mustAddress(name, value) {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return ethers.utils.getAddress(value.toLowerCase());
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Deploying BitVoyAccountFactoryV2 (IBUOv2 / TSTORE)");
  console.log("═══════════════════════════════════════════════════════════");

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer. Set PRIVATE_KEY in .env.");

  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceStr = ethers.utils.formatEther(balance);
  const nativeCurrency = [43113, 43114].includes(network.chainId) ? "AVAX" : "POL/MATIC";

  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", balanceStr, nativeCurrency);
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (balance.lt(ethers.utils.parseEther("0.1"))) {
    console.warn(`⚠️  Warning: balance low (< 0.1 ${nativeCurrency}). Deployment may fail.\n`);
  }

  const entryPoint = mustAddress("ENTRY_POINT_ADDRESS", process.env.ENTRY_POINT_ADDRESS || DEFAULT_ENTRY_POINT);
  const opSigner  = mustAddress("OP_SIGNER_ADDRESS",   process.env.OP_SIGNER_ADDRESS);

  console.log("Deployment Parameters:");
  console.log("  EntryPoint:", entryPoint);
  console.log("  OP Signer: ", opSigner);
  console.log("  (token-agnostic — pass allowedToken in createAccount(owner, salt, token))\n");

  const epCode = await ethers.provider.getCode(entryPoint);
  if (epCode === "0x") throw new Error(`EntryPoint not deployed at ${entryPoint}`);
  console.log("✅ EntryPoint verified:", entryPoint);
  console.log("✅ OP Signer validated:", opSigner, "\n");

  const Factory = await ethers.getContractFactory("BitVoyAccountFactoryV2");

  try {
    const deployTx = Factory.getDeployTransaction(entryPoint, opSigner);
    const gasEst   = await ethers.provider.estimateGas(deployTx);
    const feeData  = await ethers.provider.getFeeData();
    const gasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.BigNumber.from(0);
    const estCost  = gasEst.mul(gasPrice);
    console.log("Gas estimate:", gasEst.toString());
    console.log("Estimated cost:", ethers.utils.formatEther(estCost), nativeCurrency);
    if (balance.lt(estCost)) {
      throw new Error(`Insufficient balance! Have ${balanceStr}, need ${ethers.utils.formatEther(estCost)} ${nativeCurrency}`);
    }
    console.log("✅ Balance sufficient\n");
  } catch (err) {
    if (err.message.startsWith("Insufficient")) throw err;
    console.warn("⚠️  Gas estimation failed, proceeding:", err.message);
  }

  console.log("Deploying BitVoyAccountFactoryV2...");
  const factory = await Factory.deploy(entryPoint, opSigner);
  await factory.deployed();

  const deployTx = factory.deployTransaction;
  console.log("✅ BitVoyAccountFactoryV2 deployed to:", factory.address);
  console.log("Deploy tx hash:", deployTx.hash);
  console.log("Waiting for confirmation...");
  await deployTx.wait();
  console.log("✅ Transaction confirmed\n");

  console.log("═══════════════════════════════════════════════════════════");
  console.log("Deployment Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Factory V2 Address:", factory.address);
  console.log("EntryPoint Address:", entryPoint);
  console.log("OP Signer Address: ", opSigner);
  console.log("Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("🔍 Verification command:");
  console.log(`npx hardhat verify --network ${network.name} ${factory.address} "${entryPoint}" "${opSigner}"\n`);

  const info = {
    network: network.name,
    chainId: network.chainId.toString(),
    factoryV2Address: factory.address,
    entryPointAddress: entryPoint,
    opSignerAddress: opSigner,
    deployer: deployer.address,
    deployTxHash: deployTx.hash,
    timestamp: new Date().toISOString()
  };
  console.log("📋 Deployment Info (JSON):");
  console.log(JSON.stringify(info, null, 2));
}

main()
  .then(() => { console.log("\n✅ Deployment completed successfully!"); process.exit(0); })
  .catch((err) => { console.error("\n❌ Deployment failed:", err.message); process.exit(1); });
