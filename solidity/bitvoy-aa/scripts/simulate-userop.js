/**
 * UserOperationをEntryPoint.simulateValidationで検証し、詳細なエラー情報を取得
 * 
 * 使用方法:
 * node scripts/simulate-userop.js <userOpHash> [chain] [network]
 * 
 * 例:
 * node scripts/simulate-userop.js 0x981a2d08b966069b40a4b305e269985625396bc441be997473d3c0ec0e1de1ca polygon testnet
 */

const { ethers } = require('ethers');
const path = require('path');

// .envファイルを読み込む
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    try {
        require('dotenv').config({ path: envPath });
        envLoaded = true;
        break;
    } catch (e) {
        // 次のパスを試す
    }
}

if (!envLoaded) {
    console.warn('⚠️  .env file not found, using environment variables');
}

// 引数からUserOpHashを取得
const userOpHash = process.argv[2];
const chain = process.argv[3] || 'polygon';
const network = process.argv[4] || 'testnet';

if (!userOpHash) {
    console.error('❌ Usage: node scripts/simulate-userop.js <userOpHash> [chain] [network]');
    process.exit(1);
}

// Chain IDマップ
const chainIdMap = {
    'polygon': {
        'mainnet': { chainId: 137, rpcUrl: process.env.POLYGON_RPC || process.env.POLYGON_MAINNET_RPC_URL },
        'testnet': { chainId: 80002, rpcUrl: process.env.POLYGON_AMOY_RPC || process.env.POLYGON_TESTNET_RPC_URL }
    },
    'ethereum': {
        'mainnet': { chainId: 1, rpcUrl: process.env.ETHEREUM_RPC || process.env.ETHEREUM_MAINNET_RPC_URL },
        'testnet': { chainId: 11155111, rpcUrl: process.env.ETHEREUM_SEPOLIA_RPC || process.env.ETHEREUM_TESTNET_RPC_URL }
    }
};

const chainConfig = chainIdMap[chain]?.[network];
if (!chainConfig || !chainConfig.rpcUrl) {
    console.error(`❌ RPC URL not found for ${chain} ${network}`);
    process.exit(1);
}

const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

async function main() {
    console.log('='.repeat(80));
    console.log('UserOperation simulateValidation');
    console.log('='.repeat(80));
    console.log(`UserOpHash: ${userOpHash}`);
    console.log(`Chain: ${chain}`);
    console.log(`Network: ${network}`);
    console.log(`ChainId: ${chainConfig.chainId}`);
    console.log(`RPC: ${chainConfig.rpcUrl}`);
    console.log(`EntryPoint: ${entryPointAddress}`);
    console.log('');

    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);

    // BundlerからUserOperationを取得
    const bundlerRpcUrl = process.env.PIMLICO_BUNDLER_RPC_URL || 
        `https://api.pimlico.io/v2/${chainConfig.chainId}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    
    console.log('📋 Step 1: Getting UserOperation from Bundler...');
    const userOpResponse = await fetch(bundlerRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getUserOperationByHash',
            params: [userOpHash]
        })
    });

    const userOpResult = await userOpResponse.json();
    if (!userOpResult.result) {
        console.error('❌ UserOperation not found in Bundler');
        process.exit(1);
    }

    const userOp = userOpResult.result.userOperation;
    console.log('   ✅ UserOperation found');
    console.log(`   Sender: ${userOp.sender}`);
    console.log(`   Nonce: ${userOp.nonce}`);
    console.log(`   Paymaster: ${userOp.paymaster || 'none'}`);
    console.log('');

    // EntryPoint ABI
    const entryPointABI = [
        "function simulateValidation((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external",
        "error ExecutionResult(uint256 preOpGas, uint256 paid, uint48 validAfter, uint48 validUntil, bool targetSuccess, bytes targetResult)",
        "error FailedOp(uint256 opIndex, string reason)",
        "error SenderAddressResult(address sender)",
        "error SignatureValidationFailed(address aggregator)"
    ];

    const entryPoint = new ethers.Contract(entryPointAddress, entryPointABI, provider);

    console.log('📋 Step 2: Calling EntryPoint.simulateValidation...');
    try {
        await entryPoint.callStatic.simulateValidation(userOp);
        console.log('   ⚠️  simulateValidation did not revert (unexpected)');
    } catch (error) {
        console.log('   ✅ simulateValidation reverted (expected)');
        console.log('');

        // revert dataをデコード
        const revertData = error.data || error.error?.data || error.reason;
        if (!revertData) {
            console.log('   ⚠️  No revert data found');
            console.log('   Error:', error.message);
            return;
        }

        console.log('📋 Step 3: Decoding revert data...');
        console.log(`   Revert data (hex): ${revertData}`);
        console.log('');

        // エラーセレクターを抽出
        const selector = revertData.substring(0, 10);
        console.log(`   Error selector: ${selector}`);

        // FailedOpエラーの場合
        if (selector === '0x220266b6' || selector === '0xdb44b7f7') {
            console.log('   Error type: FailedOp(uint256,string)');
            const dataWithoutSelector = '0x' + revertData.substring(10);
            
            if (dataWithoutSelector === '0x' || dataWithoutSelector.length <= 2) {
                console.log('   ⚠️  No additional data after selector');
                console.log('   This indicates the revert reason is incomplete or truncated');
            } else {
                try {
                    const [opIndex, reason] = ethers.utils.defaultAbiCoder.decode(
                        ['uint256', 'string'],
                        dataWithoutSelector
                    );
                    console.log(`   OpIndex: ${opIndex.toString()}`);
                    console.log(`   Reason: ${reason}`);
                    console.log('');
                    
                    // reasonからエラーセレクターを抽出
                    const selectorMatch = reason.match(/0x[a-fA-F0-9]{8}/);
                    if (selectorMatch) {
                        console.log(`   🔍 Found error selector in reason: ${selectorMatch[0]}`);
                        console.log('   This may be a custom error from SmartAccount or Paymaster');
                    }
                } catch (decodeError) {
                    console.log(`   ⚠️  Failed to decode: ${decodeError.message}`);
                    console.log(`   Raw data: ${dataWithoutSelector}`);
                }
            }
        } else {
            console.log(`   Error type: Unknown (selector: ${selector})`);
        }

        // SmartAccountのカスタムエラーをチェック
        console.log('');
        console.log('📋 Step 4: Checking SmartAccount custom errors...');
        const smartAccountErrors = {
            '0xabde1ea2': 'OnlyEntryPoint()',
            '0x63638b1b': 'TokenNotAllowed()',
            '0x800144e8': 'ChainMismatch()',
            '0xec1e6e7e': 'TooEarly()',
            '0x7570f097': 'Expired()',
            '0xc26f3f3e': 'IntentAlreadyUsed()',
            '0xb9f034c5': 'InvalidOpSigLength()',
            '0x0d3a7b0c': 'InvalidUserSigV()',
            '0x1c74d0d1': 'InvalidOpSigV()',
            '0x7023da05': 'InvalidOpSignature()'
        };

        const foundError = Object.entries(smartAccountErrors).find(
            ([sel]) => revertData.toLowerCase().includes(sel.toLowerCase())
        );

        if (foundError) {
            console.log(`   ✅ Found SmartAccount error: ${foundError[1]} (${foundError[0]})`);
        } else {
            console.log('   ⚠️  No matching SmartAccount error found');
        }
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('✅ Simulation completed');
    console.log('='.repeat(80));
}

main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
});

