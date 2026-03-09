const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Deploying BitVoyPaymaster");
  console.log("Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance));

  const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS;
  const OP_PAYMASTER_SIGNER_ADDRESS = process.env.OP_PAYMASTER_SIGNER_ADDRESS;

  if (!ENTRY_POINT_ADDRESS || !OP_PAYMASTER_SIGNER_ADDRESS) {
    throw new Error("Missing ENTRY_POINT or OP_PAYMASTER_SIGNER_ADDRESS in env");
  }

  console.log("EntryPoint:", ENTRY_POINT_ADDRESS);
  console.log("OP Paymaster Signer:", OP_PAYMASTER_SIGNER_ADDRESS);

  // Factory
  const Paymaster = await ethers.getContractFactory("BitVoyVerifyingPaymaster");

  // Deploy
  const paymaster = await Paymaster.deploy(
    ENTRY_POINT_ADDRESS,
    OP_PAYMASTER_SIGNER_ADDRESS
  );

  await paymaster.deployed();
  const paymasterAddress = paymaster.address;

  console.log("✅ BitVoyPaymaster deployed");
  console.log("Paymaster address:", paymasterAddress);

  // sanity check
  console.log("Verifying signer:", await paymaster.verifyingSigner());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
