/**
 * EntryPoint.simulateValidationを使用してUserOperationの詳細なエラー情報を取得
 * 
 * 使用方法:
 * cd app_wallet/nodejs/bitvoy
 * node scripts/simulate-userop-validation.js <userOpHash> [chain] [network]
 * 
 * 例:
 * node scripts/simulate-userop-validation.js 0x981a2d08b966069b40a4b305e269985625396bc441be997473d3c0ec0e1de1ca polygon testnet
 */

const path = require('path');
const { ethers } = require('ethers');

// entrypoint-simulate.jsをインポート
const entryPointSimulate = require('../server/utils/entrypoint-simulate');

// .envファイルを読み込む
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// 引数からUserOpHashまたはUserOperation JSONファイルパスを取得
const userOpHashOrFile = process.argv[2];
const chain = process.argv[3] || 'polygon';
const network = process.argv[4] || 'testnet';

if (!userOpHashOrFile) {
    console.error('❌ Usage: node scripts/simulate-userop-validation.js <userOpHash|userOpJsonFile> [chain] [network]');
    console.error('');
    console.error('   Options:');
    console.error('   1. UserOpHash: 0x981a2d08b966069b40a4b305e269985625396bc441be997473d3c0ec0e1de1ca');
    console.error('   2. UserOperation JSON file: path/to/userop.json');
    console.error('');
    console.error('   Example JSON file format:');
    console.error('   {');
    console.error('     "sender": "0x...",');
    console.error('     "nonce": "0x1",');
    console.error('     "callData": "0x...",');
    console.error('     "paymasterAndData": "0x...",');
    console.error('     "signature": "0x..."');
    console.error('   }');
    process.exit(1);
}

// UserOperation JSONファイルかどうかを判定
const fs = require('fs');
let userOpHash = null;
let userOpFromFile = null;

if (userOpHashOrFile.startsWith('0x') && userOpHashOrFile.length === 66) {
    // UserOpHashとして扱う
    userOpHash = userOpHashOrFile;
} else {
    // ファイルパスとして扱う
    let filePath = userOpHashOrFile;
    if (!path.isAbsolute(filePath)) {
        // 相対パスの場合、現在の作業ディレクトリからの相対パスとして解決
        // スクリプトのディレクトリではなく、実行時のカレントディレクトリから
        filePath = path.resolve(process.cwd(), filePath);
    }
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        userOpFromFile = JSON.parse(fileContent);
        console.log(`📋 Loading UserOperation from file: ${filePath}`);
    } catch (error) {
        console.error(`❌ Failed to read UserOperation file: ${error.message}`);
        console.error(`   File path attempted: ${filePath}`);
        console.error(`   Current working directory: ${process.cwd()}`);
        console.error('   Please provide either a UserOpHash (0x...) or a valid JSON file path');
        console.error('   If using a relative path, it will be resolved from the current working directory');
        process.exit(1);
    }
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
    console.error(`   Please set POLYGON_AMOY_RPC or POLYGON_TESTNET_RPC_URL in .env`);
    process.exit(1);
}

const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

async function main() {
    console.log('='.repeat(80));
    console.log('EntryPoint.simulateValidation エラー診断');
    console.log('='.repeat(80));
    if (userOpHash) {
        console.log(`UserOpHash: ${userOpHash}`);
    } else {
        console.log(`UserOperation: Loaded from file`);
    }
    console.log(`Chain: ${chain}`);
    console.log(`Network: ${network}`);
    console.log(`ChainId: ${chainConfig.chainId}`);
    console.log(`RPC: ${chainConfig.rpcUrl}`);
    console.log(`EntryPoint: ${entryPointAddress}`);
    console.log('');

    const provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);

    // BundlerからUserOperationを取得（フォールバック: トランザクションから再構築）
    const bundlerRpcUrl = process.env.PIMLICO_BUNDLER_RPC_URL || 
        `https://api.pimlico.io/v2/${chainConfig.chainId}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
    
    let userOp = null;
    
    // ファイルからUserOperationを読み込んだ場合
    if (userOpFromFile) {
        userOp = userOpFromFile;
        console.log('📋 Step 1: Using UserOperation from file...');
        console.log(`   ✅ UserOperation loaded from file`);
    } else {
        // BundlerからUserOperationを取得
        console.log('📋 Step 1: Getting UserOperation from Bundler...');
        try {
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
            if (userOpResult.result && userOpResult.result.userOperation) {
                userOp = userOpResult.result.userOperation;
                console.log('   ✅ UserOperation found from Bundler');
            } else if (userOpResult.result && userOpResult.result.userOp) {
                // 一部のBundlerはuserOpというフィールド名を使用
                userOp = userOpResult.result.userOp;
                console.log('   ✅ UserOperation found from Bundler (userOp field)');
            } else {
                console.log('   ⚠️  UserOperation not found in Bundler');
                if (userOpResult.error) {
                    console.log(`   Error: ${userOpResult.error.message || JSON.stringify(userOpResult.error)}`);
                }
                console.log('   📋 Trying to get UserOperation from transaction receipt...');
                
                // フォールバック: eth_getUserOperationReceiptから取得
                try {
                    const receiptResponse = await fetch(bundlerRpcUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_getUserOperationReceipt',
                            params: [userOpHash]
                        })
                    });

                    const receiptResult = await receiptResponse.json();
                    if (receiptResult.result && receiptResult.result.userOpHash) {
                        // ReceiptからUserOperationを再構築する必要がある
                        // ただし、ReceiptにはUserOperationの完全なデータが含まれていない場合がある
                        console.log('   ⚠️  Receipt found but UserOperation data is incomplete');
                        console.log('   💡 Please provide UserOperation data manually or set PIMLICO_API_KEY');
                        console.log('');
                        console.log('   Alternative: Use the UserOperation data from server logs');
                        console.log('   The UserOperation was sent with the following data:');
                        console.log('   (Check server logs for the full UserOperation dump)');
                        process.exit(1);
                    } else {
                        console.log('   ❌ Receipt also not found');
                        console.log('   💡 Please check:');
                        console.log('      1. PIMLICO_API_KEY is set correctly in .env');
                        console.log('      2. UserOpHash is correct');
                        console.log('      3. UserOperation was actually sent to Bundler');
                        process.exit(1);
                    }
                } catch (receiptError) {
                    console.log(`   ❌ Error getting receipt: ${receiptError.message}`);
                    console.log('   💡 Please set PIMLICO_API_KEY in .env or provide UserOperation data manually');
                    console.log('');
                    console.log('   Alternative: Create a JSON file with UserOperation data from server logs');
                    console.log('   Example:');
                    console.log('   {');
                    console.log('     "sender": "0xAb5F26B38f6a315c7F73CeAACAbAB71Ad89559A1",');
                    console.log('     "nonce": "0x1",');
                    console.log('     "callData": "0x16a037cf...",');
                    console.log('     "paymasterAndData": "0x110b6fc8243b1258a2...",');
                    console.log('     "signature": "0x02101966b9ddc041187c2d492a8b50d640b29417abf3a68b74d7c74fdc39d350d63cebc7d759b834a2fc08b18150768fe401b9357e7637e1533ba4ff5289e992f71c",');
                    console.log('     "callGasLimit": "0x30000",');
                    console.log('     "verificationGasLimit": "0x50000",');
                    console.log('     "preVerificationGas": "0x20000",');
                    console.log('     "maxFeePerGas": "0xc393e6d4e",');
                    console.log('     "maxPriorityFeePerGas": "0xc393e6d00",');
                    console.log('     "initCode": "0x"');
                    console.log('   }');
                    process.exit(1);
                }
            }
        } catch (fetchError) {
            console.log(`   ❌ Error fetching from Bundler: ${fetchError.message}`);
            console.log('   💡 Please set PIMLICO_API_KEY in .env or provide UserOperation data manually');
            process.exit(1);
        }
    }
    
    if (!userOp) {
        console.error('❌ UserOperation not found');
        process.exit(1);
    }

    try {
        console.log('   ✅ UserOperation found');
        console.log(`   Sender: ${userOp.sender}`);
        console.log(`   Nonce: ${userOp.nonce}`);
        
        // SmartAccountの現在のnonceを確認
        console.log('');
        console.log('📋 Checking SmartAccount current nonce...');
        let currentNonce = null;
        
        // 方法1: EntryPoint.getNonce()を使用（推奨）
        try {
            const entryPointABI = [
                "function getNonce(address sender, uint192 key) external view returns (uint256 nonce)"
            ];
            const entryPoint = new ethers.Contract(entryPointAddress, entryPointABI, provider);
            // key=0は通常のnonce
            currentNonce = await entryPoint.getNonce(userOp.sender, 0);
            console.log(`   ✅ Nonce retrieved from EntryPoint.getNonce()`);
        } catch (entryPointError) {
            // 方法2: SmartAccount.nonce()を直接呼び出し（フォールバック）
            try {
                const smartAccountABI = [
                    "function nonce() external view returns (uint256)"
                ];
                const smartAccount = new ethers.Contract(userOp.sender, smartAccountABI, provider);
                currentNonce = await smartAccount.nonce();
                console.log(`   ✅ Nonce retrieved from SmartAccount.nonce()`);
            } catch (smartAccountError) {
                console.log(`   ⚠️  Could not check nonce from SmartAccount: ${smartAccountError.message}`);
                console.log('   (SmartAccount may not be deployed yet or code is empty)');
            }
        }
        
        if (currentNonce !== null) {
            const userOpNonce = ethers.BigNumber.from(userOp.nonce || "0x0");
            const currentNonceBN = ethers.BigNumber.from(currentNonce);
            
            console.log(`   Current SmartAccount nonce: ${currentNonceBN.toString()} (0x${currentNonceBN.toHexString().substring(2)})`);
            console.log(`   UserOperation nonce: ${userOpNonce.toString()} (${userOp.nonce})`);
            
            if (currentNonceBN.eq(userOpNonce)) {
                console.log('   ✅ Nonce matches');
            } else {
                console.log('   ⚠️  Nonce mismatch!');
                console.log(`   💡 Update UserOperation nonce to: 0x${currentNonceBN.toHexString().substring(2)}`);
                console.log('   This may cause "AA25 invalid account nonce" error');
            }
        } else {
            console.log('   ⚠️  Could not determine current nonce');
            console.log('   💡 The "AA25 invalid account nonce" error suggests the nonce is incorrect');
        }
        console.log('');
        const paymasterAddr = userOp.paymaster || 
            (userOp.paymasterAndData && userOp.paymasterAndData !== '0x' && userOp.paymasterAndData.length >= 42 
                ? userOp.paymasterAndData.substring(0, 42) 
                : 'none');
        console.log(`   Paymaster: ${paymasterAddr}`);
        console.log(`   CallData Length: ${userOp.callData ? (userOp.callData.length - 2) / 2 : 0} bytes`);
        console.log(`   InitCode Length: ${userOp.initCode ? (userOp.initCode.length - 2) / 2 : 0} bytes`);
        console.log(`   Signature Length: ${userOp.signature ? (userOp.signature.length - 2) / 2 : 0} bytes`);
        console.log('');

        // UserOperationを正規化
        const normalizedUserOp = entryPointSimulate.normalizeUserOpForSimulation(userOp);
        console.log('📋 Step 2: Calling EntryPoint.simulateValidation...');
        console.log('   (This will revert with detailed error information)');
        console.log('');

        // simulateValidationを実行
        const result = await entryPointSimulate.simulateValidation(
            normalizedUserOp,
            entryPointAddress,
            provider
        );

        // 結果を表示
        console.log('📋 Step 3: Validation Result...');
        console.log('');
        
        if (result.success) {
            console.log('   ✅ Validation passed (unexpected - simulateValidation should always revert)');
            console.log(`   Message: ${result.message}`);
        } else {
            console.log('   ❌ Validation failed');
            console.log(`   Error Type: ${result.errorType}`);
            console.log(`   Message: ${result.message}`);
            console.log('');

            if (result.errorType === 'FailedOp') {
                console.log('   📋 FailedOp Details:');
                console.log(`   OpIndex: ${result.opIndex || 'N/A'}`);
                console.log(`   Reason: ${result.reason || 'N/A'}`);
                console.log('');

                if (result.errorSelector) {
                    console.log(`   🔍 Error Selector in Reason: ${result.errorSelector}`);
                }

                if (result.customError) {
                    console.log(`   ✅ Identified Custom Error: ${result.customError}`);
                    if (result.details) {
                        console.log(`   Details: ${result.details}`);
                    }
                }

                if (result.possibleCause) {
                    console.log(`   💡 Possible Cause: ${result.possibleCause}`);
                }

                if (result.suggestions && result.suggestions.length > 0) {
                    console.log('   💡 Suggestions:');
                    result.suggestions.forEach((suggestion, idx) => {
                        console.log(`      ${idx + 1}. ${suggestion}`);
                    });
                }
                
                // AA23エラーの場合、OOGかrevertedかを切り分ける
                if (result.reason && result.reason.includes('AA23')) {
                    console.log('');
                    console.log('📋 Step 3.5: Testing if AA23 is OOG (Out of Gas) or revert...');
                    console.log('   Increasing gas limits and retrying...');
                    
                    try {
                        // ガス制限を増やして再試行
                        const increasedUserOp = {
                            ...normalizedUserOp,
                            verificationGasLimit: ethers.BigNumber.from(normalizedUserOp.verificationGasLimit || "0x0").mul(2).toHexString(),
                            callGasLimit: ethers.BigNumber.from(normalizedUserOp.callGasLimit || "0x0").mul(2).toHexString(),
                            preVerificationGas: ethers.BigNumber.from(normalizedUserOp.preVerificationGas || "0x0").mul(2).toHexString()
                        };
                        
                        console.log(`   Original verificationGasLimit: ${normalizedUserOp.verificationGasLimit}`);
                        console.log(`   Increased verificationGasLimit: ${increasedUserOp.verificationGasLimit}`);
                        console.log(`   Original callGasLimit: ${normalizedUserOp.callGasLimit}`);
                        console.log(`   Increased callGasLimit: ${increasedUserOp.callGasLimit}`);
                        console.log('');
                        
                        const retryResult = await entryPointSimulate.simulateValidation(
                            increasedUserOp,
                            entryPointAddress,
                            provider
                        );
                        
                        if (retryResult.success) {
                            console.log('   ✅ Validation passed with increased gas limits');
                            console.log('   💡 Conclusion: AA23 was caused by OOG (Out of Gas)');
                            console.log('   💡 Solution: Increase gas limits in UserOperation');
                        } else if (retryResult.errorType === 'FailedOp' && retryResult.reason && retryResult.reason.includes('AA23')) {
                            console.log('   ❌ Validation still failed with increased gas limits');
                            console.log('   💡 Conclusion: AA23 is NOT OOG, but a revert in validateUserOp');
                            console.log('   💡 Possible causes:');
                            console.log('      - Signature verification failed');
                            console.log('      - OwnerEOA mismatch');
                            console.log('      - Intent validation failed');
                            console.log('      - Other validation logic in validateUserOp');
                        } else {
                            console.log(`   ⚠️  Different error with increased gas: ${retryResult.errorType}`);
                            console.log(`   Message: ${retryResult.message}`);
                        }
                    } catch (retryError) {
                        console.log(`   ⚠️  Error during retry: ${retryError.message}`);
                    }
                    console.log('');
                }
            } else if (result.errorType === 'SignatureValidationFailed') {
                console.log(`   Aggregator: ${result.aggregator || 'N/A'}`);
            } else if (result.errorType === 'ExecutionResult') {
                console.log('   📋 Execution Result:');
                console.log(`   PreOpGas: ${result.executionResult?.preOpGas || 'N/A'}`);
                console.log(`   Paid: ${result.executionResult?.paid || 'N/A'}`);
                console.log(`   ValidAfter: ${result.executionResult?.validAfter || 'N/A'}`);
                console.log(`   ValidUntil: ${result.executionResult?.validUntil || 'N/A'}`);
                console.log(`   TargetSuccess: ${result.executionResult?.targetSuccess || 'N/A'}`);
            } else if (result.errorType === 'SenderAddressResult') {
                console.log(`   Sender: ${result.sender || 'N/A'}`);
            } else {
                console.log(`   Error Selector: ${result.errorSelector || 'N/A'}`);
                console.log(`   Revert Data: ${result.revertData || 'N/A'}`);
            }

            // SmartAccountのvalidateUserOpを直接呼び出し
            if (userOp.sender && result.errorType === 'FailedOp') {
                console.log('');
                console.log('📋 Step 4: Calling SmartAccount.validateUserOp directly...');
                
                // EntryPoint.getUserOpHashを計算
                const entryPointABI = [
                    "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
                ];
                const entryPoint = new ethers.Contract(entryPointAddress, entryPointABI, provider);
                
                try {
                    const computedUserOpHash = await entryPoint.getUserOpHash(normalizedUserOp);
                    console.log(`   Computed UserOpHash: ${computedUserOpHash}`);
                    console.log('');

                    const validateResult = await entryPointSimulate.validateUserOpDirect(
                        userOp.sender,
                        normalizedUserOp,
                        computedUserOpHash,
                        provider
                    );

                    if (validateResult.success) {
                        console.log('   ✅ SmartAccount.validateUserOp passed');
                        console.log(`   ValidationData: ${validateResult.validationData}`);
                    } else {
                        console.log('   ❌ SmartAccount.validateUserOp failed');
                        console.log(`   Error Type: ${validateResult.errorType}`);
                        console.log(`   Custom Error: ${validateResult.customError || 'N/A'}`);
                        console.log(`   Error Selector: ${validateResult.errorSelector || 'N/A'}`);
                        console.log(`   Message: ${validateResult.message}`);
                        if (validateResult.details) {
                            console.log(`   Details: ${validateResult.details}`);
                        }
                    }
                } catch (error) {
                    console.log(`   ⚠️  Error calling validateUserOp: ${error.message}`);
                }
            }
        }

        console.log('');
        console.log('='.repeat(80));
        console.log('✅ Simulation completed');
        console.log('='.repeat(80));
    } catch (error) {
        console.error('❌ Error:', error);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});

