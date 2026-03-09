// scripts/createSmartAccount.js
// 新しいsaltでSmartAccountインスタンスを作成するスクリプト
//
// Usage:
//   npx hardhat run scripts/createSmartAccount.js --network polygon_amoy
//
// Required Environment Variables:
//   PRIVATE_KEY - Deployer private key
//   FACTORY_ADDRESS - Factory contract address
//   OWNER_EOA - Owner EOA address (derived from MPC public key)
//   USER_SUBJECT - User subject (masterId or user_subject)
//   CHAIN_ID - Chain ID (e.g., 80002 for Polygon Amoy)
//   TOKEN_ADDRESS - ALLOWED_TOKEN for this SA (USDC or JPYC address; same Factory can deploy USDC SA and JPYC SA with different token)
//
// Optional Environment Variables:
//   POLYGON_AMOY_RPC - Polygon Amoy RPC URL
//   POLYGON_RPC - Polygon Mainnet RPC URL
//   SALT_VERSION - Salt version string (default: "IBUO-v1")
//   FORCE_DEPLOY - Force deployment even if SmartAccount exists (default: false)

const { ethers } = require("hardhat");

// Salt計算関数（userSubject, chainId, version, tokenAddress を混ぜる。クライアント・サーバーと一致させる）
function computeSalt(userSubject, chainId, version, tokenAddress) {
  const data = ethers.utils.solidityPack(
    ["string", "uint256", "string", "address"],
    [userSubject, chainId, version || "IBUO-v1", tokenAddress]
  );
  return ethers.utils.keccak256(data);
}

// 既存のSmartAccountを確認（異なるFactoryやsaltで作成された可能性がある）
async function checkExistingSmartAccount(provider, ownerEOA, chain, network) {
  // この関数は、データベースに接続して既存のSmartAccountを確認する場合に使用
  // 現在はオンチェーンのみをチェック
  return null;
}

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
  console.log("Creating SmartAccount Instance with New Salt");
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

  // 環境変数からパラメータを取得
  const factoryAddress = mustAddress(
    "FACTORY_ADDRESS",
    process.env.FACTORY_ADDRESS
  );

  const ownerEOA = mustAddress(
    "OWNER_EOA",
    process.env.OWNER_EOA
  );

  const userSubject = process.env.USER_SUBJECT;
  if (!userSubject) {
    throw new Error("USER_SUBJECT environment variable is required");
  }

  // Chain ID（環境変数から取得、なければネットワークから）
  const chainId = process.env.CHAIN_ID 
    ? parseInt(process.env.CHAIN_ID, 10)
    : network.chainId;

  console.log("Parameters:");
  console.log("  Factory Address:", factoryAddress);
  console.log("  Owner EOA:", ownerEOA);
  console.log("  User Subject:", userSubject);
  console.log("  Chain ID:", chainId);
  console.log("");

  // TOKEN_ADDRESS（この SA の ALLOWED_TOKEN: USDC or JPYC）
  const tokenAddress = mustAddress(
    "TOKEN_ADDRESS",
    process.env.TOKEN_ADDRESS
  );
  console.log("  Token (ALLOWED_TOKEN):", tokenAddress);
  console.log("");

  // Factoryコントラクトを取得（createAccount/getAddress に allowedToken を渡す版）
  const factoryABI = [
    "function createAccount(address ownerEOA, bytes32 salt, address allowedToken) external returns (address sa)",
    "function getAddress(address ownerEOA, bytes32 salt, address allowedToken) public view returns (address)"
  ];

  const factoryContract = new ethers.Contract(factoryAddress, factoryABI, deployer);

  // Salt計算（tokenAddress を混ぜる。同一 user/chain でもトークンごとに異なる salt）
  const saltVersion = process.env.SALT_VERSION || "IBUO-v1";
  const salt = computeSalt(userSubject, chainId, saltVersion, tokenAddress);
  console.log("Computed Salt:", salt);
  console.log("Salt Version:", saltVersion);
  console.log("  (salt includes tokenAddress for per-token SA)");
  console.log("");
  
  // 既存のSmartAccountを確認（異なるsaltで作成された可能性がある）
  console.log("📋 Step 0: Checking for existing SmartAccounts with different salt...");
  console.log("   Note: If you have an existing SmartAccount with a different salt,");
  console.log("   you can create a new one by using a different USER_SUBJECT or SALT_VERSION.");
  console.log("");

  // 1. 予測されるSmartAccountアドレスを取得（token ごとに異なる）
  console.log("📋 Step 1: Computing predicted SmartAccount address...");
  const predictedAddress = await factoryContract.getAddress(ownerEOA, salt, tokenAddress);
  console.log("   Predicted address:", predictedAddress);
  console.log("");

  // 2. SmartAccountが既にデプロイされているかチェック
  console.log("📋 Step 2: Checking if SmartAccount is already deployed...");
  const existingCode = await ethers.provider.getCode(predictedAddress);
  if (existingCode && existingCode !== "0x" && existingCode !== "0x0") {
    console.log("   ✅ SmartAccount already deployed at", predictedAddress);
    console.log("");
    
    // 既存のSmartAccountのOWNER_EOAを確認
    const smartAccountABI = [
      "function OWNER_EOA() external view returns (address)"
    ];
    const existingSmartAccount = new ethers.Contract(predictedAddress, smartAccountABI, ethers.provider);
    const existingOwnerEOA = await existingSmartAccount.OWNER_EOA();
    
    if (existingOwnerEOA.toLowerCase() === ownerEOA.toLowerCase()) {
      console.log("═══════════════════════════════════════════════════════════");
      console.log("SmartAccount Already Exists with Same Owner");
      console.log("═══════════════════════════════════════════════════════════");
      console.log("SmartAccount Address:", predictedAddress);
      console.log("Owner EOA:", ownerEOA);
      console.log("Salt:", salt);
      console.log("");
      console.log("💡 Note: This SmartAccount is already deployed.");
      console.log("   If you want to create a new SmartAccount with a different salt,");
      console.log("   please use a different USER_SUBJECT or modify the salt calculation.");
      console.log("═══════════════════════════════════════════════════════════\n");
      return;
    } else {
      console.log("   ⚠️  Warning: SmartAccount exists but with different OWNER_EOA!");
      console.log("   Existing OWNER_EOA:", existingOwnerEOA);
      console.log("   Expected OWNER_EOA:", ownerEOA);
      console.log("   This should not happen with CREATE2. Proceeding with deployment...");
      console.log("");
    }
  } else {
    console.log("   ⚠️  SmartAccount not deployed yet. Deploying...");
    console.log("");
  }

  // 3. Factory.createAccountを呼び出してデプロイ
  console.log("📋 Step 3: Deploying SmartAccount via Factory.createAccount...");
  try {
    // ガス価格を動的に取得
    console.log("   Fetching current gas prices...");
    const feeData = await ethers.provider.getFeeData();

    if (!feeData.maxFeePerGas || !feeData.maxPriorityFeePerGas) {
      // EIP-1559がサポートされていない場合はgasPriceを使用
      if (feeData.gasPrice) {
        console.log("   Using legacy gas price:", ethers.utils.formatUnits(feeData.gasPrice, "gwei"), "gwei");
        const tx = await factoryContract.createAccount(ownerEOA, salt, tokenAddress, {
          gasPrice: feeData.gasPrice
        });
        console.log("   Transaction hash:", tx.hash);
        console.log("   Waiting for confirmation...");
        const receipt = await tx.wait();
        console.log("   ✅ SmartAccount deployed successfully!");
        console.log("   Block number:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
        console.log("");
        
        // 4. SmartAccountの状態を確認
        console.log("📋 Step 4: Verifying SmartAccount state...");
        const smartAccountABI = [
          "function OWNER_EOA() external view returns (address)",
          "function ENTRY_POINT() external view returns (address)",
          "function OP_SIGNER() external view returns (address)",
          "function ALLOWED_TOKEN() external view returns (address)"
        ];
        const smartAccountContract = new ethers.Contract(predictedAddress, smartAccountABI, ethers.provider);
        
        const deployedOwnerEOA = await smartAccountContract.OWNER_EOA();
        const deployedEntryPoint = await smartAccountContract.ENTRY_POINT();
        const deployedOPSigner = await smartAccountContract.OP_SIGNER();
        const deployedAllowedToken = await smartAccountContract.ALLOWED_TOKEN();
        
        console.log("   OWNER_EOA:", deployedOwnerEOA);
        console.log("   Expected: ", ownerEOA);
        console.log("   Match:", deployedOwnerEOA.toLowerCase() === ownerEOA.toLowerCase() ? "✅" : "❌");
        console.log("   ENTRY_POINT:", deployedEntryPoint);
        console.log("   OP_SIGNER:", deployedOPSigner);
        console.log("   ALLOWED_TOKEN:", deployedAllowedToken);
        console.log("");

        console.log("═══════════════════════════════════════════════════════════");
        console.log("Deployment Summary");
        console.log("═══════════════════════════════════════════════════════════");
        console.log("SmartAccount Address:", predictedAddress);
        console.log("Owner EOA:", ownerEOA);
        console.log("Salt:", salt);
        console.log("User Subject:", userSubject);
        console.log("Chain ID:", chainId);
        console.log("Factory Address:", factoryAddress);
        console.log("═══════════════════════════════════════════════════════════\n");
        return;
      } else {
        throw new Error("Failed to get gas prices from provider");
      }
    }

    // 最小ガス価格（Amoyテストネットの最小値: 25 gwei）
    const MIN_PRIORITY_FEE = ethers.utils.parseUnits("25", "gwei"); // 25 gwei
    const MIN_MAX_FEE = ethers.utils.parseUnits("30", "gwei"); // 30 gwei (base + priority)

    // 取得したガス価格と最小値を比較し、大きい方を使用
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    let maxFeePerGas = feeData.maxFeePerGas;

    if (maxPriorityFeePerGas.lt(MIN_PRIORITY_FEE)) {
      console.log(`   ⚠️  maxPriorityFeePerGas (${ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei")} gwei) is below minimum (25 gwei), using minimum`);
      maxPriorityFeePerGas = MIN_PRIORITY_FEE;
    }

    if (maxFeePerGas.lt(MIN_MAX_FEE)) {
      console.log(`   ⚠️  maxFeePerGas (${ethers.utils.formatUnits(maxFeePerGas, "gwei")} gwei) is below minimum (30 gwei), using minimum`);
      maxFeePerGas = MIN_MAX_FEE;
    }

    // ガス価格を表示
    console.log("   maxFeePerGas:", ethers.utils.formatUnits(maxFeePerGas, "gwei"), "gwei");
    console.log("   maxPriorityFeePerGas:", ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");

    // ガス価格を設定してトランザクションを送信
    const tx = await factoryContract.createAccount(ownerEOA, salt, tokenAddress, {
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas
    });
    console.log("   Transaction hash:", tx.hash);
    console.log("   Waiting for confirmation...");
    const receipt = await tx.wait();
    console.log("   ✅ SmartAccount deployed successfully!");
    console.log("   Block number:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    console.log("");

    // 4. SmartAccountの状態を確認
    console.log("📋 Step 4: Verifying SmartAccount state...");
    const smartAccountABI = [
      "function OWNER_EOA() external view returns (address)",
      "function ENTRY_POINT() external view returns (address)",
      "function OP_SIGNER() external view returns (address)",
      "function ALLOWED_TOKEN() external view returns (address)"
    ];
    const smartAccountContract = new ethers.Contract(predictedAddress, smartAccountABI, ethers.provider);

    const deployedOwnerEOA = await smartAccountContract.OWNER_EOA();
    const deployedEntryPoint = await smartAccountContract.ENTRY_POINT();
    const deployedOPSigner = await smartAccountContract.OP_SIGNER();
    const deployedAllowedToken = await smartAccountContract.ALLOWED_TOKEN();

    console.log("   OWNER_EOA:", deployedOwnerEOA);
    console.log("   Expected: ", ownerEOA);
    console.log("   Match:", deployedOwnerEOA.toLowerCase() === ownerEOA.toLowerCase() ? "✅" : "❌");
    console.log("   ENTRY_POINT:", deployedEntryPoint);
    console.log("   OP_SIGNER:", deployedOPSigner);
    console.log("   ALLOWED_TOKEN:", deployedAllowedToken);
    console.log("");

    if (deployedOwnerEOA.toLowerCase() !== ownerEOA.toLowerCase()) {
      throw new Error("OWNER_EOA mismatch!");
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("Deployment Summary");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("SmartAccount Address:", predictedAddress);
    console.log("Owner EOA:", ownerEOA);
    console.log("Salt:", salt);
    console.log("ALLOWED_TOKEN:", tokenAddress);
    console.log("User Subject:", userSubject);
    console.log("Chain ID:", chainId);
    console.log("Factory Address:", factoryAddress);
    console.log("═══════════════════════════════════════════════════════════\n");

    console.log("📋 Next Steps:");
    console.log("   1. Update database with new SmartAccount address");
    console.log("   2. Update factory_address in aa_smart_accounts table");
    console.log("   3. Test UserOperation with new SmartAccount");
    console.log("");

  } catch (error) {
    console.error("   ❌ Deployment failed:", error.message);
    if (error.data) {
      console.error("   Revert data:", error.data);
    }
    if (error.body) {
      try {
        const errorBody = JSON.parse(error.body);
        if (errorBody.error) {
          console.error("   RPC Error:", errorBody.error.message || errorBody.error);
        }
      } catch (e) {
        // JSON parse failed, ignore
      }
    }
    throw error;
  }
}

main()
  .then(() => {
    console.log("✅ SmartAccount creation completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ SmartAccount creation failed:");
    console.error(error);
    if (error.message) {
      console.error("Error message:", error.message);
    }
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  });

