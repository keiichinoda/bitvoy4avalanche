const { ethers } = require("hardhat");

/**
 * Paymaster に EntryPoint へ預金（deposit）を追加するスクリプト。
 * Paymaster は 1 つで USDC/JPYC 共通のため、この預金 1 回で両トークンの Smart Account のガススポンサーをカバーする。
 *
 * 使用方法:
 *   PAYMASTER_ADDRESS=0x... DEPOSIT_AMOUNT=0.1 \
 *   npx hardhat run scripts/fundPaymaster.js --network polygon_amoy
 *
 * 参照: docs/README-01-DEPOSIT-PAYMASTER.md（stake の追加は別途）
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("💰 Funding Paymaster");
  console.log("Deployer:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.utils.formatEther(balance), "ETH");

  const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
  const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT || "0.1"; // デフォルト0.1 ETH

  if (!PAYMASTER_ADDRESS) {
    throw new Error("Missing PAYMASTER_ADDRESS in env");
  }

  console.log("Paymaster address:", PAYMASTER_ADDRESS);
  console.log("Deposit amount:", DEPOSIT_AMOUNT, "ETH");

  // Paymasterコントラクトを取得
  const paymaster = await ethers.getContractAt(
    "BitVoyVerifyingPaymaster",
    PAYMASTER_ADDRESS
  );

  // EntryPointアドレスを取得
  const entryPointAddress = await paymaster.entryPoint();
  console.log("EntryPoint address:", entryPointAddress);

  // 現在の預金を確認（BasePaymasterのgetDeposit()を使用）
  const currentDeposit = await paymaster.getDeposit();
  console.log("Current deposit:", ethers.utils.formatEther(currentDeposit), "ETH");

  // 預金を追加
  const depositAmount = ethers.utils.parseEther(DEPOSIT_AMOUNT);
  console.log("\n📤 Adding deposit...");
  const tx = await paymaster.deposit({ value: depositAmount });
  console.log("Transaction hash:", tx.hash);
  
  await tx.wait();
  console.log("✅ Deposit added successfully");

  // 更新後の預金を確認
  const newDeposit = await paymaster.getDeposit();
  console.log("New deposit:", ethers.utils.formatEther(newDeposit), "ETH");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

