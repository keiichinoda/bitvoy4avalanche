/**
 * UserOperationの状態確認スクリプト
 * 
 * このスクリプトは、Bundlerに送信されたUserOperationの状態を確認します。
 * 
 * 使用方法:
 * cd app_wallet/solidity/bitvoy-aa
 * npx hardhat run scripts/check-userop-status.js --network polygon_amoy
 * または
 * node scripts/check-userop-status.js <userOpHash> [chain] [network]
 * 
 * 例:
 * node scripts/check-userop-status.js 0x05061846d3e142cf54dbe9b5cccef5b84ff6eab52586cab35556761c161577bc polygon testnet
 */

const { ethers } = require('ethers');
const path = require('path');

// .envファイルを読み込む（複数のパスを試行）
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../../../.env')
];

let envLoaded = false;
for (const envPath of envPaths) {
    try {
        require('dotenv').config({ path: envPath });
        if (process.env.PIMLICO_API_KEY || process.env.POLYGON_TESTNET_RPC_URL || process.env.POLYGON_AMOY_RPC) {
            envLoaded = true;
            break;
        }
    } catch (e) {
        // 次のパスを試行
    }
}

// 最後にデフォルトのdotenv.config()を試行
if (!envLoaded) {
    require('dotenv').config();
}

// コマンドライン引数を取得
const args = process.argv.slice(2);
if (args.length < 1) {
    console.error('Usage: node check-userop-status.js <userOpHash> [chain] [network]');
    console.error('Example: node check-userop-status.js 0x05061846d3e142cf54dbe9b5cccef5b84ff6eab52586cab35556761c161577bc polygon testnet');
    process.exit(1);
}

const [userOpHash, chain = 'polygon', network = 'testnet'] = args;

// chainIdMap
const chainIdMap = {
    'ethereum': { 'mainnet': 1, 'testnet': 5 },
    'polygon': { 'mainnet': 137, 'testnet': 80002 }
};

const chainId = chainIdMap[chain]?.[network];
if (!chainId) {
    console.error(`❌ Invalid chain/network: ${chain}/${network}`);
    process.exit(1);
}

// Bundler RPC URLを取得
// 環境変数名のマッピングを調整
const bundlerRpcUrlEnvKey = `${chain.toUpperCase()}_${network.toUpperCase()}_BUNDLER_RPC_URL`.replace('TESTNET', 'TESTNET');
let bundlerRpcUrl = process.env[bundlerRpcUrlEnvKey] || process.env[`${chain.toUpperCase()}_${network.toUpperCase()}_BUNDLER_RPC_URL`];

// フォールバック: Pimlico API keyから構築
if (!bundlerRpcUrl && process.env.PIMLICO_API_KEY) {
    bundlerRpcUrl = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
}

if (!bundlerRpcUrl) {
    console.error(`❌ Bundler RPC URL not found for ${chain} ${network}`);
    console.error(`   Looking for: ${bundlerRpcUrlEnvKey} or PIMLICO_API_KEY`);
    process.exit(1);
}

// RPC URLを取得（トランザクション確認用）
const rpcUrlEnvKey = `${chain.toUpperCase()}_${network.toUpperCase()}_RPC_URL`.replace('TESTNET', 'TESTNET');
let rpcUrl = process.env[rpcUrlEnvKey] || process.env[`${chain.toUpperCase()}_${network.toUpperCase()}_RPC_URL`];

// フォールバック: チェーン固有のRPC URL
if (!rpcUrl) {
    if (chain === 'polygon' && network === 'testnet') {
        rpcUrl = process.env.POLYGON_AMOY_RPC || process.env.POLYGON_TESTNET_RPC_URL || 'https://rpc-amoy.polygon.technology';
    } else if (chain === 'polygon' && network === 'mainnet') {
        rpcUrl = process.env.POLYGON_RPC || process.env.POLYGON_MAINNET_RPC_URL || 'https://polygon-rpc.com';
    } else if (chain === 'ethereum' && network === 'testnet') {
        rpcUrl = process.env.ETHEREUM_TESTNET_RPC_URL || 'https://goerli.infura.io/v3/YOUR_PROJECT_ID';
    } else if (chain === 'ethereum' && network === 'mainnet') {
        rpcUrl = process.env.ETHEREUM_MAINNET_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID';
    }
}

if (!rpcUrl) {
    console.error(`❌ RPC URL not found for ${chain} ${network}`);
    process.exit(1);
}

// ---------- helpers ----------

function toLowerHex(h) {
    return (h || '').toLowerCase();
}

function safeJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function dumpLogHex(log, idx) {
    console.log(`\n   🧾 [EntryPoint log #${idx}] RAW HEX DUMP`);
    console.log(`      address: ${log.address}`);
    if (Array.isArray(log.topics)) {
        log.topics.forEach((t, i) => console.log(`      topic[${i}]: ${t}`));
    } else {
        console.log(`      topics: ${log.topics}`);
    }
    console.log(`      data: ${log.data}`);
    if (log.transactionHash) console.log(`      txHash: ${log.transactionHash}`);
    if (log.blockNumber != null) console.log(`      blockNumber: ${log.blockNumber}`);
    if (log.logIndex != null) console.log(`      logIndex: ${log.logIndex}`);
}

function tryDecodeRevertData(revertDataHex) {
    const revertData = revertDataHex || '0x';
    if (revertData === '0x' || revertData.length < 10) {
        return { ok: false, note: 'empty-or-too-short', selector: null };
    }

    const selector = revertData.slice(0, 10);
    const dataWithoutSelector = '0x' + revertData.slice(10);

    const commonSelectors = {
        // Standard
        '0x08c379a0': 'Error(string)',
        '0x4e487b71': 'Panic(uint256)',
        // EntryPoint FailedOp selector observed in the wild (0.6/0.7 variants)
        '0x220266b6': 'FailedOp(uint256,string)',
        // Some bundlers have returned this as well; treat as FailedOp
        '0xdb44b7f7': 'FailedOp(uint256,string)?'
    };

    const label = commonSelectors[selector] || 'Unknown';
    const out = { ok: true, selector, label, decoded: null, note: null };

    try {
        if (selector === '0x08c379a0') {
            const [reason] = ethers.utils.defaultAbiCoder.decode(['string'], dataWithoutSelector);
            out.decoded = { reason };
        } else if (selector === '0x4e487b71') {
            const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataWithoutSelector);
            out.decoded = { code: code.toString() };
        } else if (selector === '0x220266b6' || selector === '0xdb44b7f7') {
            // FailedOp(uint256 opIndex, string reason)
            if (dataWithoutSelector.length <= 2) {
                out.note = 'selector-only (no payload)';
            } else {
                const [opIndex, reason] = ethers.utils.defaultAbiCoder.decode(['uint256', 'string'], dataWithoutSelector);
                out.decoded = { opIndex: opIndex.toString(), reason };
            }
        } else {
            out.note = 'unknown-selector';
        }
    } catch (e) {
        out.note = `decode-failed: ${e.message}`;
    }

    return out;
}

async function dumpEntryPointLogsAndReason({ provider, txHash, entryPointAddress, userOpHash }) {
    const txReceipt = await provider.getTransactionReceipt(txHash);
    if (!txReceipt) {
        console.log(`   ⚠️  Transaction receipt not found yet for tx: ${txHash}`);
        return;
    }

    console.log(`\n📌 EntryPoint logs (full hex dump) from tx receipt:`);
    console.log(`   TxHash: ${txHash}`);
    console.log(`   EntryPoint: ${entryPointAddress}`);

    const entryPointAbi = [
        // v0.6/v0.7 compatible names (some clients use either)
        'event UserOperationReverted(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)',
        'event UserOperationRevertReason(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)',
        'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
    ];
    const epIface = new ethers.utils.Interface(entryPointAbi);
    const wantedUserOpTopic = ethers.utils.hexZeroPad(userOpHash, 32).toLowerCase();

    const epLogs = (txReceipt.logs || []).filter(l => toLowerHex(l.address) === toLowerHex(entryPointAddress));
    if (epLogs.length === 0) {
        console.log(`   ⚠️  No EntryPoint logs found in tx receipt (logs=${(txReceipt.logs || []).length}).`);
        return;
    }

    console.log(`   Found ${epLogs.length} EntryPoint log(s) in tx receipt.`);

    // Dump raw logs first (hex)
    epLogs.forEach((log, i) => dumpLogHex(log, i));

    // Try to locate the log(s) for this userOpHash and decode revert reason
    const matching = epLogs.filter(l => Array.isArray(l.topics) && l.topics[1] && l.topics[1].toLowerCase() === wantedUserOpTopic);
    console.log(`\n   Matching logs for UserOpHash topic[1] == ${wantedUserOpTopic}: ${matching.length}`);

    for (const [i, log] of matching.entries()) {
        console.log(`\n   🔎 Decoding matching log #${i} (topic0=${log.topics?.[0] || 'N/A'})`);
        try {
            const parsed = epIface.parseLog(log);
            console.log(`      Parsed as: ${parsed.name}`);
            if (parsed.name === 'UserOperationEvent') {
                console.log(`      success: ${parsed.args.success}`);
                console.log(`      paymaster: ${parsed.args.paymaster}`);
                console.log(`      actualGasCost: ${ethers.utils.formatEther(parsed.args.actualGasCost)} ETH`);
                console.log(`      actualGasUsed: ${parsed.args.actualGasUsed.toString()}`);
            }
            if (parsed.args && parsed.args.revertReason) {
                const rr = parsed.args.revertReason;
                console.log(`      revertReason(hex): ${rr}`);
                console.log(`      revertReason(bytes): ${(rr.length - 2) / 2}`);
                const decoded = tryDecodeRevertData(rr);
                console.log(`      selector: ${decoded.selector || 'N/A'}`);
                console.log(`      type: ${decoded.label || 'N/A'}`);
                if (decoded.decoded) {
                    console.log(`      decoded: ${safeJson(decoded.decoded)}`);
                } else if (decoded.note) {
                    console.log(`      note: ${decoded.note}`);
                }
            }
        } catch (e) {
            console.log(`      ⚠️  parseLog failed: ${e.message}`);
            // Manual decode fallback for revertReason events:
            // data layout: nonce (32) | offset (32) | bytes payload
            if (log.data && log.data !== '0x' && log.data.length >= 2 + 64 * 2) {
                const data = log.data;
                const nonceHex = '0x' + data.slice(2, 66);
                const offsetHex = '0x' + data.slice(66, 130);
                const nonce = ethers.BigNumber.from(nonceHex).toString();
                const offset = ethers.BigNumber.from(offsetHex).toNumber();
                console.log(`      manual nonce: ${nonce}`);
                console.log(`      manual offset: ${offset}`);
                const start = 2 + offset * 2;
                const revertReason = '0x' + data.slice(start);
                console.log(`      manual revertReason(hex): ${revertReason}`);
                const decoded = tryDecodeRevertData(revertReason);
                console.log(`      selector: ${decoded.selector || 'N/A'}`);
                console.log(`      type: ${decoded.label || 'N/A'}`);
                if (decoded.decoded) {
                    console.log(`      decoded: ${safeJson(decoded.decoded)}`);
                } else if (decoded.note) {
                    console.log(`      note: ${decoded.note}`);
                }
            }
        }
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('UserOperation状態確認');
    console.log('='.repeat(80));
    console.log(`UserOpHash: ${userOpHash}`);
    console.log(`Chain: ${chain}`);
    console.log(`Network: ${network}`);
    console.log(`ChainId: ${chainId}`);
    console.log(`Bundler RPC: ${bundlerRpcUrl}`);
    console.log('');

    // 1. eth_getUserOperationReceiptでReceiptを取得
    console.log('📋 Step 1: Checking UserOperation Receipt from Bundler...');
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
        
        if (receiptResult.error) {
            console.log(`   ⚠️  Receipt not found yet: ${receiptResult.error.message}`);
            console.log('   Status: Pending (UserOperation is still being processed by Bundler)');
        } else if (receiptResult.result) {
            const receipt = receiptResult.result;
            console.log(`   ✅ Receipt found!`);
            
            // Receiptの構造を確認（receipt.receiptまたはreceipt直下の可能性）
            const txHash = receipt.receipt?.transactionHash || receipt.transactionHash;
            const blockNumber = receipt.blockNumber || receipt.receipt?.blockNumber;
            const blockHash = receipt.blockHash || receipt.receipt?.blockHash;
            const success = receipt.success !== undefined ? receipt.success : (receipt.receipt?.status === 1);
            const actualGasCost = receipt.actualGasCost || receipt.receipt?.gasUsed || '0';
            const actualGasUsed = receipt.actualGasUsed || receipt.receipt?.gasUsed || '0';
            
            console.log(`   Block Number: ${blockNumber || 'N/A'}`);
            console.log(`   Block Hash: ${blockHash || 'N/A'}`);
            console.log(`   Transaction Hash: ${txHash || 'N/A'}`);
            console.log(`   Success: ${success}`);
            
            // ethers v5の正しい使用方法
            try {
                const gasCostFormatted = actualGasCost ? ethers.utils.formatEther(actualGasCost) : '0';
                console.log(`   Actual Gas Cost: ${gasCostFormatted} ETH`);
            } catch (e) {
                console.log(`   Actual Gas Cost: ${actualGasCost} wei`);
            }
            console.log(`   Actual Gas Used: ${actualGasUsed}`);
            
            // 失敗している場合、エラー情報を表示
            if (success === false) {
                console.log(`   ⚠️  UserOperation failed!`);
                
                // EntryPointのイベントをデコード
                // receipt.receipt.logs または receipt.logs の両方を確認
                const logs = receipt.receipt?.logs || receipt.logs || [];
                if (logs.length > 0) {
                    const entryPointAddress = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
                    // EntryPoint v0.6では、イベント名が異なる可能性がある
                    // UserOperationRevertReason または UserOperationReverted
                    const entryPointABI = [
                        "event UserOperationReverted(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)",
                        "event UserOperationRevertReason(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)",
                        "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)"
                    ];
                    
                    const entryPointInterface = new ethers.utils.Interface(entryPointABI);
                    
                    let foundReverted = false;
                    let foundEvent = false;
                    
                    for (const log of logs) {
                        if (log.address && log.address.toLowerCase() === entryPointAddress.toLowerCase()) {
                            try {
                                const parsedLog = entryPointInterface.parseLog(log);
                                
                                if (parsedLog.name === 'UserOperationReverted' || parsedLog.name === 'UserOperationRevertReason') {
                                    foundReverted = true;
                                    console.log(`   🔴 ${parsedLog.name} Event:`);
                                    console.log(`      UserOpHash: ${parsedLog.args.userOpHash}`);
                                    console.log(`      Sender: ${parsedLog.args.sender}`);
                                    console.log(`      Nonce: ${parsedLog.args.nonce?.toString() || 'N/A'}`);
                                    
                                    // revertReasonをデコード
                                    const revertReason = parsedLog.args.revertReason;
                                    if (revertReason && revertReason !== '0x' && revertReason.length > 2) {
                                        // revertReasonはbytes型なので、そのまま使用
                                        // エラーセレクター（最初の4バイト）を確認
                                        const errorSelector = revertReason.length >= 10 ? revertReason.substring(0, 10) : 'N/A';
                                        console.log(`      Revert Reason (hex): ${revertReason.substring(0, 200)}${revertReason.length > 200 ? '...' : ''}`);
                                        console.log(`      Revert Reason Length: ${(revertReason.length - 2) / 2} bytes`);
                                        console.log(`      Error Selector: ${errorSelector}`);
                                        
                                        // よくあるエラーセレクターをチェック
                                        const commonErrors = {
                                            '0xdb44b7f7': 'FailedOp(uint256,string)',
                                            '0x220266b6': 'FailedOp(uint256,string)',
                                            '0x08c379a0': 'Error(string)',
                                            '0x4e487b71': 'Panic(uint256)'
                                        };
                                        
                                        if (commonErrors[errorSelector]) {
                                            console.log(`      Error Type: ${commonErrors[errorSelector]}`);
                                            
                                            // FailedOpの場合、reasonをデコード
                                            // revertReasonはbytes型で、その中にFailedOp(uint256,string)のエンコードされたデータが含まれている
                                            if (errorSelector === '0xdb44b7f7' || errorSelector === '0x220266b6') {
                                                try {
                                                    // revertReasonからエラーセレクターを除いた部分をデコード
                                                    const dataWithoutSelector = revertReason.substring(10);
                                                    if (dataWithoutSelector.length > 0) {
                                                        const abiCoder = ethers.utils.defaultAbiCoder;
                                                        const decoded = abiCoder.decode(['uint256', 'string'], '0x' + dataWithoutSelector);
                                                        console.log(`      Op Index: ${decoded[0].toString()}`);
                                                        console.log(`      Reason: ${decoded[1]}`);
                                                    } else {
                                                        console.log(`      ⚠️  No additional data after error selector`);
                                                        console.log(`      This may indicate the revert reason is incomplete or truncated`);
                                                    }
                                                } catch (e) {
                                                    console.log(`      Failed to decode reason: ${e.message}`);
                                                    console.log(`      Raw revertReason: ${revertReason}`);
                                                }
                                            }
                                        } else {
                                            console.log(`      Unknown error selector: ${errorSelector}`);
                                        }
                                    } else {
                                        console.log(`      Revert Reason: Empty or no data`);
                                    }
                                } else if (parsedLog.name === 'UserOperationEvent') {
                                    foundEvent = true;
                                    console.log(`   📋 UserOperationEvent:`);
                                    console.log(`      UserOpHash: ${parsedLog.args.userOpHash}`);
                                    console.log(`      Sender: ${parsedLog.args.sender}`);
                                    console.log(`      Paymaster: ${parsedLog.args.paymaster}`);
                                    console.log(`      Nonce: ${parsedLog.args.nonce?.toString() || 'N/A'}`);
                                    console.log(`      Success: ${parsedLog.args.success}`);
                                    console.log(`      Actual Gas Cost: ${ethers.utils.formatEther(parsedLog.args.actualGasCost || '0')} ETH`);
                                    console.log(`      Actual Gas Used: ${parsedLog.args.actualGasUsed?.toString() || '0'}`);
                                }
                            } catch (parseError) {
                                // パースできないログはデバッグ情報を表示
                                if (log.topics && log.topics[0]) {
                                    const topic0 = log.topics[0];
                                    // UserOperationRevertedのイベントシグネチャ: 0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201
                                    if (topic0 === '0x1c4fada7374c0a9ee8841fc38afe82932dc0f8e69012e927f061a8bae611a201') {
                                        console.log(`   🔴 UserOperationReverted Event (manual decode):`);
                                        console.log(`      Topic 0: ${topic0}`);
                                        console.log(`      Topic 1 (userOpHash): ${log.topics[1] || 'N/A'}`);
                                        console.log(`      Topic 2 (sender): ${log.topics[2] ? ethers.utils.getAddress('0x' + log.topics[2].substring(26)) : 'N/A'}`);
                                        
                                        // Dataを手動でデコード
                                        if (log.data && log.data !== '0x') {
                                            const data = log.data;
                                            console.log(`      Data (hex): ${data.substring(0, 200)}${data.length > 200 ? '...' : ''}`);
                                            
                                            // Dataの構造: [nonce (32 bytes)][offset (32 bytes)][revertReason (bytes)]
                                            // nonceを取得
                                            const nonceHex = data.substring(2, 66);
                                            const nonce = parseInt(nonceHex, 16);
                                            console.log(`      Nonce: ${nonce}`);
                                            
                                            // offsetを取得
                                            const offsetHex = data.substring(66, 130);
                                            const offset = parseInt(offsetHex, 16);
                                            console.log(`      Offset: ${offset}`);
                                            
                                            // revertReasonを取得（offset以降）
                                            const revertReasonStart = 2 + (offset * 2);
                                            const revertReason = '0x' + data.substring(revertReasonStart);
                                            
                                            if (revertReason.length > 2) {
                                                const errorSelector = revertReason.substring(0, 10);
                                                console.log(`      Revert Reason (hex): ${revertReason.substring(0, 100)}${revertReason.length > 100 ? '...' : ''}`);
                                                console.log(`      Error Selector: ${errorSelector}`);
                                                
                                                // FailedOpの場合、reasonをデコード
                                                if (errorSelector === '0xdb44b7f7' || errorSelector === '0x220266b6') {
                                                    try {
                                                        const dataWithoutSelector = revertReason.substring(10);
                                                        if (dataWithoutSelector.length > 0) {
                                                            const abiCoder = ethers.utils.defaultAbiCoder;
                                                            const decoded = abiCoder.decode(['uint256', 'string'], '0x' + dataWithoutSelector);
                                                            console.log(`      Op Index: ${decoded[0].toString()}`);
                                                            console.log(`      Reason: ${decoded[1]}`);
                                                        }
                                                    } catch (e) {
                                                        console.log(`      Failed to decode reason: ${e.message}`);
                                                    }
                                                }
                                            }
                                        }
                                        
                                        console.log(`      Parse Error: ${parseError.message}`);
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!foundReverted && !foundEvent) {
                        console.log(`   ⚠️  No EntryPoint events found in logs (${logs.length} total logs)`);
                    }
                } else {
                    console.log(`   ⚠️  No logs found in receipt`);
                }
            }

            // ✅ ここが本題: tx receipt から EntryPoint 発行ログを「丸ごと」hexでダンプし、reasonを復元
            if (txHash) {
                try {
                    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
                    const entryPointAddress = (receipt.entryPoint || receipt.receipt?.entryPoint || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789');
                    await dumpEntryPointLogsAndReason({
                        provider,
                        txHash,
                        entryPointAddress,
                        userOpHash
                    });
                } catch (e) {
                    console.log(`\n   ⚠️  Failed to dump EntryPoint logs from tx receipt: ${e.message}`);
                }
            }
            
            // トランザクションの詳細を取得
            if (txHash) {
                console.log('');
                console.log('📋 Step 2: Checking Transaction Details...');
                const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
                try {
                    const txReceipt = await provider.getTransactionReceipt(txHash);
                    
                    if (txReceipt) {
                        console.log(`   ✅ Transaction confirmed`);
                        console.log(`   Block Number: ${txReceipt.blockNumber}`);
                        console.log(`   Status: ${txReceipt.status === 1 ? 'Success ✅' : 'Failed ❌'}`);
                        console.log(`   Gas Used: ${txReceipt.gasUsed.toString()}`);
                        console.log(`   Confirmations: ${txReceipt.confirmations || 0}`);
                        
                        // 現在のブロック番号を取得してconfirmationsを計算
                        const currentBlock = await provider.getBlockNumber();
                        const confirmations = currentBlock - txReceipt.blockNumber + 1;
                        console.log(`   Current Block: ${currentBlock}`);
                        console.log(`   Confirmations: ${confirmations}`);
                        
                        // 失敗している場合、revert reasonを確認
                        if (txReceipt.status === 0) {
                            console.log(`   ⚠️  Transaction reverted`);
                            // ログからエラー情報を確認
                            if (txReceipt.logs && txReceipt.logs.length > 0) {
                                console.log(`   Logs count: ${txReceipt.logs.length}`);
                            }
                        }
                    } else {
                        console.log(`   ⚠️  Transaction receipt not found yet`);
                    }
                } catch (txError) {
                    console.error(`   ❌ Error getting transaction receipt:`, txError.message);
                }
            }
        } else {
            console.log(`   ⚠️  Receipt not found yet`);
            console.log('   Status: Pending (UserOperation is still being processed by Bundler)');
        }
    } catch (error) {
        console.error(`   ❌ Error checking receipt:`, error.message);
    }
    console.log('');

    // 2. eth_getUserOperationByHashでUserOperationの詳細を取得
    console.log('📋 Step 3: Getting UserOperation details from Bundler...');
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
        
        if (userOpResult.error) {
            console.log(`   ⚠️  UserOperation not found: ${userOpResult.error.message}`);
        } else if (userOpResult.result) {
            const userOp = userOpResult.result;
            console.log(`   ✅ UserOperation found`);
            console.log(`   EntryPoint: ${userOp.entryPoint || 'N/A'}`);
            console.log(`   Sender: ${userOp.sender || userOp.userOperation?.sender || 'N/A'}`);
            console.log(`   Nonce: ${userOp.nonce || userOp.userOperation?.nonce || 'N/A'}`);
            console.log(`   Paymaster: ${userOp.paymaster || userOp.userOperation?.paymasterAndData?.substring(0, 42) || 'None'}`);
            console.log(`   Transaction Hash: ${userOp.transactionHash || 'Pending'}`);
            console.log(`   Block Number: ${userOp.blockNumber ? (typeof userOp.blockNumber === 'string' ? parseInt(userOp.blockNumber, 16) : userOp.blockNumber) : 'Pending'}`);
            console.log(`   Block Hash: ${userOp.blockHash || 'Pending'}`);
            
            // UserOperationの詳細を表示
            if (userOp.userOperation) {
                console.log(`   UserOperation details:`);
                console.log(`     - Call Data Length: ${userOp.userOperation.callData?.length || 0}`);
                console.log(`     - Init Code Length: ${userOp.userOperation.initCode?.length || 0}`);
                console.log(`     - Signature Length: ${userOp.userOperation.signature?.length || 0}`);
            }
        } else {
            console.log(`   ⚠️  UserOperation not found yet`);
        }
    } catch (error) {
        console.error(`   ❌ Error getting UserOperation details:`, error.message);
    }
    console.log('');

    console.log('='.repeat(80));
    console.log('✅ Status check completed');
    console.log('');
    console.log('💡 Tips:');
    console.log('   - If receipt is not found, the UserOperation is still pending');
    console.log('   - Wait a few seconds and run this script again');
    console.log('   - Once receipt is found, the transaction is confirmed');
    console.log('='.repeat(80));
}

main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});

