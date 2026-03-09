/**
 * EntryPoint.simulateValidation を使用したUserOperation検証エラーの診断
 * 
 * EntryPoint v0.6の仕様では、simulateValidationは必ずrevertで結果を返します。
 * revert dataをデコードすることで、どのentity（account/paymaster/aggregator）が
 * 失敗したか、具体的なrevert reasonを取得できます。
 */

const { ethers } = require("ethers");

/**
 * EntryPoint.simulateValidationをeth_callで実行し、revert dataをデコード
 * 
 * @param {Object} userOp - UserOperationオブジェクト
 * @param {string} entryPointAddress - EntryPointアドレス
 * @param {ethers.providers.JsonRpcProvider} provider - RPCプロバイダー
 * @returns {Object} 検証結果またはエラー情報
 */
async function simulateValidation(userOp, entryPointAddress, provider) {
    // EntryPoint ABI（simulateValidationとエラー定義）
    const entryPointABI = [
        "function simulateValidation((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external",
        // エラー定義
        "error ExecutionResult(uint256 preOpGas, uint256 paid, uint48 validAfter, uint48 validUntil, bool targetSuccess, bytes targetResult)",
        "error FailedOp(uint256 opIndex, string reason)",
        "error SenderAddressResult(address sender)",
        "error SignatureValidationFailed(address aggregator)"
    ];
    
    const entryPoint = new ethers.Contract(entryPointAddress, entryPointABI, provider);
    
    try {
        // simulateValidationをeth_callで実行
        // 注意: EntryPoint v0.6の仕様では、simulateValidationは必ずrevertで結果を返す
        // callStaticを使用してeth_callとして実行
        await entryPoint.callStatic.simulateValidation(userOp);
        
        // 通常はここに到達しない（必ずrevertする）
        return {
            success: true,
            message: "Validation passed (unexpected - simulateValidation should always revert)"
        };
    } catch (error) {
        // デバッグ: エラーオブジェクトの全体をログ出力
        console.log('[DEBUG] simulateValidation error:', {
            message: error.message,
            data: error.data,
            error: error.error,
            reason: error.reason,
            code: error.code,
            transaction: error.transaction
        });
        
        // revert dataをデコード
        const decoded = decodeRevertData(error, entryPoint);
        
        // FailedOpエラーの場合、reasonから詳細な情報を抽出
        if (decoded.errorType === "FailedOp" && decoded.reason) {
            // reasonがカスタムエラーの場合、セレクターを抽出
            const reason = decoded.reason;
            
            // SmartAccountコントラクトのカスタムエラーをチェック
            // エラーセレクターから直接判定（より確実）
            const customErrorSelectors = {
                "0x82b42900": "OnlyEntryPoint",
                "0x4e6f6e6c": "OnlyEntryPoint", // 別のエンコーディングの可能性
                // 他のエラーセレクターも追加可能
            };
            
            // reasonからエラーセレクターを抽出
            const selectorMatch = reason.match(/0x[a-fA-F0-9]{8}/);
            if (selectorMatch && customErrorSelectors[selectorMatch[0]]) {
                decoded.customError = customErrorSelectors[selectorMatch[0]];
                decoded.message = `SmartAccount reverted with ${decoded.customError}`;
            } else {
                // 文字列マッチング（フォールバック）
                const customErrors = {
                    "OnlyEntryPoint()": "OnlyEntryPoint",
                    "PaymasterRequired()": "PaymasterRequired",
                    "InvalidAuthType()": "InvalidAuthType",
                    "InvalidSignature()": "InvalidSignature",
                    "InvalidUserSigV()": "InvalidUserSigV",
                    "InvalidOpSigV()": "InvalidOpSigV",
                    "InvalidCallData()": "InvalidCallData",
                    "TokenNotAllowed()": "TokenNotAllowed",
                    "ChainMismatch()": "ChainMismatch",
                    "TooEarly()": "TooEarly",
                    "Expired()": "Expired",
                    "IntentAlreadyUsed()": "IntentAlreadyUsed",
                    "InvalidOpSigLength()": "InvalidOpSigLength",
                    "InvalidOpSignature()": "InvalidOpSignature"
                };
                
                for (const [errorSig, errorName] of Object.entries(customErrors)) {
                    if (reason.includes(errorSig) || reason.includes(errorName)) {
                        decoded.customError = errorName;
                        decoded.message = `SmartAccount reverted with ${errorName}`;
                        break;
                    }
                }
            }
            
            // reasonが"AA23 reverted (or OOG)"のような一般的なメッセージの場合、
            // 実際のrevert dataがerrorオブジェクトの別の場所にある可能性がある
            if (!decoded.customError && reason.includes("AA23")) {
                decoded.possibleCause = "SmartAccount validation failed (AA23)";
                decoded.suggestions = [
                    "Check if signature format matches SmartAccount expectations",
                    "Verify userOpHash calculation matches EntryPoint.getUserOpHash",
                    "Check if SmartAccount is deployed correctly",
                    "Verify ownerEOA matches the signer address"
                ];
            }
        }
        
        return decoded;
    }
}

/**
 * revert dataをデコードしてエラー情報を抽出
 * 
 * @param {Error} error - ethers.jsのエラーオブジェクト
 * @param {ethers.Contract} entryPoint - EntryPointコントラクトインスタンス
 * @returns {Object} デコードされたエラー情報
 */
function decodeRevertData(error, entryPoint) {
    const result = {
        success: false,
        errorType: "unknown",
        message: error.message,
        rawError: error
    };
    
    // revert dataを取得
    let revertData = null;
    
    // ethers.js v5の場合
    if (error.data) {
        revertData = error.data;
    } else if (error.error && error.error.data) {
        revertData = error.error.data;
    } else if (error.transaction) {
        // transactionオブジェクトからrevert dataを取得
        if (error.transaction.data) {
            revertData = error.transaction.data;
        }
    }
    
    // error.messageやerror.reasonからrevert dataを抽出（最後の手段）
    if (!revertData) {
        const errorString = JSON.stringify(error);
        const match = errorString.match(/0x[a-fA-F0-9]{10,}/);
        if (match) {
            revertData = match[0];
        }
    }
    
    if (!revertData) {
        result.errorType = "no_revert_data";
        result.message = "No revert data found in error";
        return result;
    }
    
    // エラーセレクターを取得（最初の4バイト）
    const errorSelector = revertData.substring(0, 10); // 0x + 4 bytes
    
    try {
        // 各エラータイプを試行
        const errorTypes = [
            {
                name: "FailedOp",
                selector: entryPoint.interface.getSighash("FailedOp"),
                decode: (data) => {
                    try {
                        return entryPoint.interface.decodeErrorResult("FailedOp", data);
                    } catch (e) {
                        return null;
                    }
                }
            },
            {
                name: "SignatureValidationFailed",
                selector: entryPoint.interface.getSighash("SignatureValidationFailed"),
                decode: (data) => {
                    try {
                        return entryPoint.interface.decodeErrorResult("SignatureValidationFailed", data);
                    } catch (e) {
                        return null;
                    }
                }
            },
            {
                name: "ExecutionResult",
                selector: entryPoint.interface.getSighash("ExecutionResult"),
                decode: (data) => {
                    try {
                        return entryPoint.interface.decodeErrorResult("ExecutionResult", data);
                    } catch (e) {
                        return null;
                    }
                }
            },
            {
                name: "SenderAddressResult",
                selector: entryPoint.interface.getSighash("SenderAddressResult"),
                decode: (data) => {
                    try {
                        return entryPoint.interface.decodeErrorResult("SenderAddressResult", data);
                    } catch (e) {
                        return null;
                    }
                }
            }
        ];
        
        // エラーセレクターに一致するエラータイプを探す
        for (const errorType of errorTypes) {
            if (errorSelector.toLowerCase() === errorType.selector.toLowerCase()) {
                const decoded = errorType.decode(revertData);
                if (decoded) {
                    result.errorType = errorType.name;
                    result.decoded = decoded;
                    
                    // FailedOpの場合、reasonを抽出
                    if (errorType.name === "FailedOp") {
                        result.opIndex = decoded.opIndex?.toString();
                        result.reason = decoded.reason;
                        result.message = `FailedOp at index ${result.opIndex}: ${result.reason}`;
                        
                        // reasonから実際のエラーセレクターを抽出（カスタムエラーの可能性）
                        // reasonが"AA23 reverted (or OOG)"のような場合、実際のrevert dataが含まれている可能性がある
                        // エラーセレクター（4バイト）を探す
                        const selectorMatch = result.reason.match(/0x[a-fA-F0-9]{8}/);
                        if (selectorMatch) {
                            result.errorSelector = selectorMatch[0];
                            result.message += ` (error selector: ${result.errorSelector})`;
                        }
                        
                        // reasonが一般的なメッセージの場合、rawErrorからより詳細な情報を取得
                        if (result.reason.includes("AA23") || result.reason.includes("reverted")) {
                            result.possibleCause = "SmartAccount validation failed (AA23)";
                            result.suggestions = [
                                "Check if signature format matches SmartAccount expectations (0x02 || r || s || v, 66 bytes)",
                                "Verify userOpHash calculation matches EntryPoint.getUserOpHash",
                                "Check if SmartAccount is deployed correctly",
                                "Verify ownerEOA matches the signer address",
                                "Check if signature recovery matches OWNER_EOA"
                            ];
                        }
                    } else if (errorType.name === "SignatureValidationFailed") {
                        result.aggregator = decoded.aggregator;
                        result.message = `SignatureValidationFailed: aggregator=${result.aggregator}`;
                    } else if (errorType.name === "ExecutionResult") {
                        result.executionResult = {
                            preOpGas: decoded.preOpGas?.toString(),
                            paid: decoded.paid?.toString(),
                            validAfter: decoded.validAfter?.toString(),
                            validUntil: decoded.validUntil?.toString(),
                            targetSuccess: decoded.targetSuccess,
                            targetResult: decoded.targetResult
                        };
                        result.message = `ExecutionResult: preOpGas=${result.executionResult.preOpGas}, paid=${result.executionResult.paid}`;
                    } else if (errorType.name === "SenderAddressResult") {
                        result.sender = decoded.sender;
                        result.message = `SenderAddressResult: sender=${result.sender}`;
                    }
                    
                    return result;
                }
            }
        }
        
        // エラーセレクターが一致しない場合、生データを返す
        result.errorType = "unknown_error";
        result.errorSelector = errorSelector;
        result.revertData = revertData;
        result.message = `Unknown error selector: ${errorSelector}`;
        
    } catch (decodeError) {
        result.errorType = "decode_error";
        result.decodeError = decodeError.message;
        result.revertData = revertData;
        result.message = `Failed to decode revert data: ${decodeError.message}`;
    }
    
    return result;
}

/**
 * debug_traceCall で EntryPoint.simulateValidation の実行をトレースする。
 * AA23 などの revert がどのコントラクト・どの呼び出しで発生したかを特定するために使用。
 *
 * @param {Object} userOp - normalizeUserOpForSimulation 済みの UserOperation
 * @param {string} entryPointAddress - EntryPoint アドレス
 * @param {ethers.providers.JsonRpcProvider} provider - RPC プロバイダー（debug_traceCall 対応ノード）
 * @returns {Promise<{ success: boolean, trace?: object, error?: string }>}
 */
async function traceSimulateValidation(userOp, entryPointAddress, provider) {
    const entryPointABI = [
        "function simulateValidation((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external"
    ];
    const iface = new ethers.utils.Interface(entryPointABI);
    const data = iface.encodeFunctionData("simulateValidation", [userOp]);
    const tx = {
        to: entryPointAddress,
        data,
        gas: "0x500000"
    };
    try {
        const trace = await provider.send("debug_traceCall", [tx, "latest", { tracer: "callTracer" }]);
        return { success: true, trace };
    } catch (e) {
        return { success: false, error: e.message || String(e), trace: null };
    }
}

/**
 * callTracer の結果から、最初に revert した呼び出し（子を優先）を返す。
 * @param {Object} node - callTracer のノード (from, to, input, output, error, calls)
 * @returns {{ to: string, selector: string, reason?: string, output: string } | null}
 */
function findRevertedCall(node) {
    if (!node) return null;
    const calls = node.calls;
    if (Array.isArray(calls)) {
        for (const c of calls) {
            const found = findRevertedCall(c);
            if (found) return found;
        }
    }
    if (node.error === "execution reverted") {
        const to = (node.to || "").toString().toLowerCase();
        const input = (node.input || "0x").toString();
        const selector = input.length >= 10 ? "0x" + input.slice(2, 10) : "";
        let reason;
        const out = (node.output || "").toString();
        if (out.startsWith("0x08c379a0") && out.length >= 138) {
            try {
                const len = parseInt(out.slice(74, 138), 16);
                if (len > 0 && out.length >= 138 + len * 2) {
                    reason = ethers.utils.toUtf8String("0x" + out.slice(138, 138 + len * 2));
                }
            } catch (_) {}
        }
        return { to, selector, reason, output: out, input: (node.input || "0x").toString() };
    }
    return null;
}

/**
 * callTracer を再帰走査し、to === targetAddress かつ output が存在する（revert データ）ノードを返す。
 * @param {Object} node - callTracer のノード
 * @param {string} targetAddress - 宛先アドレス（小文字）
 * @returns {{ to: string, selector: string, reason?: string, output: string } | null}
 */
function collectCallsToWithOutput(node, targetAddress) {
    if (!node) return null;
    const calls = node.calls;
    if (Array.isArray(calls)) {
        for (const c of calls) {
            const found = collectCallsToWithOutput(c, targetAddress);
            if (found) return found;
        }
    }
    const to = (node.to || "").toString().toLowerCase();
    if (to !== targetAddress) return null;
    const outputStr = (node.output || "").toString();
    if (outputStr.length < 10) return null;
    const input = (node.input || "0x").toString();
    const selector = input.length >= 10 ? "0x" + input.slice(2, 10) : "";
    let reason;
    if (outputStr.startsWith("0x08c379a0") && outputStr.length >= 138) {
        try {
            const len = parseInt(outputStr.slice(74, 138), 16);
            if (len > 0 && outputStr.length >= 138 + len * 2) {
                reason = ethers.utils.toUtf8String("0x" + outputStr.slice(138, 138 + len * 2));
            }
        } catch (_) {}
    }
    return { to, selector, reason, output: outputStr, input };
}

/**
 * callTracer のノードを再帰走査し、error === "execution reverted" のノードをすべて集める。
 * @param {Object} node - callTracer のノード
 * @returns {Array<{ to: string, selector: string, reason?: string, output: string }>}
 */
function collectRevertedCalls(node) {
    const out = [];
    if (!node) return out;
    const calls = node.calls;
    if (Array.isArray(calls)) {
        for (const c of calls) {
            out.push(...collectRevertedCalls(c));
        }
    }
    if (node.error === "execution reverted") {
        const to = (node.to || "").toString().toLowerCase();
        const input = (node.input || "0x").toString();
        const selector = input.length >= 10 ? "0x" + input.slice(2, 10) : "";
        let reason;
        const outputStr = (node.output || "").toString();
        if (outputStr.startsWith("0x08c379a0") && outputStr.length >= 138) {
            try {
                const len = parseInt(outputStr.slice(74, 138), 16);
                if (len > 0 && outputStr.length >= 138 + len * 2) {
                    reason = ethers.utils.toUtf8String("0x" + outputStr.slice(138, 138 + len * 2));
                }
            } catch (_) {}
        }
        out.push({ to, selector, reason, output: outputStr, input });
    }
    return out;
}

/**
 * callTracer の結果から、revert した呼び出しをすべて集め、SmartAccount 宛てを優先して返す。
 * @param {Object} node - callTracer のノード
 * @param {string} [smartAccountAddress] - SmartAccount アドレス（小文字）
 * @returns {{ to: string, selector: string, reason?: string, output: string } | null}
 */
function findRevertedCallPreferSmartAccount(node, smartAccountAddress) {
    const list = collectRevertedCalls(node);
    if (smartAccountAddress) {
        const sa = smartAccountAddress.toLowerCase();
        const toSA = list.find((r) => r.to === sa);
        if (toSA) return toSA;
        const saWithOutput = collectCallsToWithOutput(node, sa);
        if (saWithOutput) return saWithOutput;
    }
    if (list.length > 0) return list[0];
    return null;
}

/**
 * UserOperationをEntryPoint.simulateValidation用の形式に変換
 *
 * @param {Object} userOp - UserOperationオブジェクト
 * @returns {Object} EntryPoint.simulateValidation用の形式
 */
function normalizeUserOpForSimulation(userOp) {
    return {
        sender: userOp.sender,
        nonce: userOp.nonce,
        initCode: userOp.initCode || "0x",
        callData: userOp.callData || "0x",
        callGasLimit: userOp.callGasLimit || "0x0",
        verificationGasLimit: userOp.verificationGasLimit || "0x0",
        preVerificationGas: userOp.preVerificationGas || "0x0",
        maxFeePerGas: userOp.maxFeePerGas || "0x0",
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas || "0x0",
        paymasterAndData: userOp.paymasterAndData || "0x",
        signature: userOp.signature || "0x"
    };
}

/**
 * SmartAccountのvalidateUserOpを直接呼び出して、実際のrevert reasonを取得
 * 
 * @param {string} smartAccountAddress - SmartAccountアドレス
 * @param {Object} userOp - UserOperationオブジェクト
 * @param {string} userOpHash - EntryPoint.getUserOpHashの結果
 * @param {ethers.providers.JsonRpcProvider} provider - RPCプロバイダー
 * @returns {Object} 検証結果またはエラー情報
 */
async function validateUserOpDirect(smartAccountAddress, userOp, userOpHash, provider) {
    // SmartAccount ABI（validateUserOpとカスタムエラー定義）
    const smartAccountABI = [
        "function validateUserOp((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)",
        // カスタムエラー定義
        "error OnlyEntryPoint()",
        "error PaymasterRequired()",
        "error InvalidAuthType()",
        "error InvalidSignature()",
        "error InvalidUserSigV()",
        "error InvalidOpSigV()",
        "error InvalidCallData()",
        "error TokenNotAllowed()",
        "error ChainMismatch()",
        "error TooEarly()",
        "error Expired()",
        "error IntentAlreadyUsed()",
        "error InvalidOpSigLength()",
        "error InvalidOpSignature()"
    ];
    
    const smartAccount = new ethers.Contract(smartAccountAddress, smartAccountABI, provider);
    
    try {
        // validateUserOpをeth_callで実行
        const result = await smartAccount.callStatic.validateUserOp(userOp, userOpHash, 0);
        return {
            success: true,
            validationData: result.toString(),
            message: "Validation passed"
        };
    } catch (error) {
        // revert dataをデコード
        const decoded = decodeSmartAccountError(error, smartAccount);
        return decoded;
    }
}

/**
 * SmartAccountのrevert dataをデコードしてエラー情報を抽出
 * 
 * @param {Error} error - ethers.jsのエラーオブジェクト
 * @param {ethers.Contract} smartAccount - SmartAccountコントラクトインスタンス
 * @returns {Object} デコードされたエラー情報
 */
function decodeSmartAccountError(error, smartAccount) {
    const result = {
        success: false,
        errorType: "unknown",
        message: error.message,
        rawError: error
    };
    
    // revert dataを取得
    let revertData = null;
    
    if (error.data) {
        revertData = error.data;
    } else if (error.error && error.error.data) {
        revertData = error.error.data;
    } else if (error.reason) {
        const match = error.reason.match(/0x[a-fA-F0-9]{10,}/);
        if (match) {
            revertData = match[0];
        }
    }
    
    if (!revertData) {
        result.errorType = "no_revert_data";
        result.message = "No revert data found in error";
        return result;
    }
    
    // エラーセレクターを取得（最初の4バイト）
    const errorSelector = revertData.substring(0, 10); // 0x + 4 bytes
    
    // SmartAccountのカスタムエラーを試行
    const customErrors = [
        "OnlyEntryPoint",
        "PaymasterRequired",
        "InvalidAuthType",
        "InvalidSignature",
        "InvalidUserSigV",
        "InvalidOpSigV",
        "InvalidCallData",
        "TokenNotAllowed",
        "ChainMismatch",
        "TooEarly",
        "Expired",
        "IntentAlreadyUsed",
        "InvalidOpSigLength",
        "InvalidOpSignature"
    ];
    
    for (const errorName of customErrors) {
        try {
            const selector = smartAccount.interface.getSighash(errorName + "()");
            if (errorSelector.toLowerCase() === selector.toLowerCase()) {
                result.errorType = "custom_error";
                result.customError = errorName;
                result.errorSelector = errorSelector;
                result.message = `SmartAccount reverted with ${errorName}()`;
                
                // エラーに応じた詳細情報を追加
                if (errorName === "InvalidSignature") {
                    result.details = "Signature recovery did not match OWNER_EOA";
                } else if (errorName === "InvalidAuthType") {
                    result.details = "authType must be 0x02";
                } else if (errorName === "InvalidUserSigV") {
                    result.details = "UserOp signature: v must be 27 or 28 (after normalization)";
                } else if (errorName === "InvalidOpSigV") {
                    result.details = "OP attestation: v must be 27 or 28 (after normalization)";
                } else if (errorName === "PaymasterRequired") {
                    result.details = "Paymaster is required for this SmartAccount";
                } else if (errorName === "InvalidCallData") {
                    result.details = "callData must be executeIntent(...)";
                }
                
                return result;
            }
        } catch (e) {
            // エラーセレクターが一致しない場合は次を試行
            continue;
        }
    }
    
    // カスタムエラーが見つからない場合
    result.errorType = "unknown_error";
    result.errorSelector = errorSelector;
    result.revertData = revertData;
    result.message = `Unknown error selector: ${errorSelector}`;
    
    return result;
}

/**
 * debug_traceCall の callTracer 結果から「どこで revert したか」を確定する。
 * simulateValidation の calldata を trace したとき、
 * - EntryPoint → account.validateUserOp() で revert → Account 側
 * - EntryPoint → paymaster.validatePaymasterUserOp() で revert → Paymaster 側
 * - EntryPoint 内で revert（paymaster 呼ぶ前/後）→ EntryPoint 内部
 *
 * @param {Object} trace - callTracer のルートノード
 * @param {string} senderAddress - SmartAccount (UserOp.sender) アドレス（小文字推奨）
 * @param {string|null} paymasterAddress - Paymaster アドレス（paymasterAndData 先頭 20 バイト）。無い場合は null
 * @returns {{ revertedBy: 'account'|'paymaster'|'entrypoint_internal', revertedCalls: Array<{to,selector,reason?,output}> }}
 */
function classifyRevertFromTrace(trace, senderAddress, paymasterAddress) {
    const revertedCalls = collectRevertedCalls(trace);
    const sender = (senderAddress || "").toString().toLowerCase();
    const paymaster = paymasterAddress ? (paymasterAddress + "").toString().toLowerCase() : null;

    for (const r of revertedCalls) {
        const to = (r.to || "").toLowerCase();
        if (to === sender) {
            return { revertedBy: "account", revertedCalls };
        }
        if (paymaster && to === paymaster) {
            return { revertedBy: "paymaster", revertedCalls };
        }
    }
    // RPC が子コールに error を付けない場合: SmartAccount/Paymaster 宛てで output があるノードを優先
    const saWithOutput = collectCallsToWithOutput(trace, sender);
    if (saWithOutput && saWithOutput.output && saWithOutput.output.length >= 10) {
        return { revertedBy: "account", revertedCalls: revertedCalls.concat([saWithOutput]) };
    }
    if (paymaster) {
        const pmWithOutput = collectCallsToWithOutput(trace, paymaster);
        if (pmWithOutput && pmWithOutput.output && pmWithOutput.output.length >= 10) {
            return { revertedBy: "paymaster", revertedCalls: revertedCalls.concat([pmWithOutput]) };
        }
    }
    return { revertedBy: "entrypoint_internal", revertedCalls };
}

module.exports = {
    simulateValidation,
    traceSimulateValidation,
    findRevertedCall,
    findRevertedCallPreferSmartAccount,
    collectRevertedCalls,
    classifyRevertFromTrace,
    decodeRevertData,
    normalizeUserOpForSimulation,
    validateUserOpDirect,
    decodeSmartAccountError
};

