/**
 * BitVoyMPCBridge.js
 * WalletConnect と BitVoy MPC 署名システムの橋渡し
 */

// BitVoy のグローバルインスタンスを想定
// 実際の実装では、BitVoy と BitVoyWallet がグローバルに利用可能であることを前提とする

/**
 * メッセージ署名（personal_sign, eth_sign, eth_signTypedData）
 * @param {Object} params
 * @param {string} params.chainId - チェーンID (例: "eip155:1")
 * @param {string} params.address - 署名するアドレス
 * @param {string|Object} params.message - 署名するメッセージ（文字列またはEIP-712オブジェクト）
 * @param {string} params.type - 署名タイプ ("personal_sign", "eth_sign", "eip712")
 * @returns {Promise<string>} 署名（0x付き16進数文字列）
 */
export async function bitvoySignMessage({ chainId, address, message, type = "personal_sign" }) {
    try {
        console.log("[BitVoyMPCBridge] bitvoySignMessage called:", { chainId, address, message, type });

        // BitVoy インスタンスの確認
        if (typeof bitvoy === 'undefined' || !bitvoy) {
            throw new Error("BitVoy instance not available");
        }

        // masterId の取得
        const masterId = bitvoy.getMasterId();
        if (!masterId) {
            throw new Error("Master ID not found. Please sign in first.");
        }

        // メッセージのハッシュ化
        let messageHash;
        if (type === "eip712") {
            // EIP-712 署名の場合
            const { ethers } = await import('/jspkg/ethers.umd.min.js');
            const typedData = typeof message === 'string' ? JSON.parse(message) : message;
            const domain = typedData.domain;
            const types = typedData.types;
            const value = typedData.message;
            
            // ethers.js の _TypedDataEncoder を使用
            const hash = ethers.TypedDataEncoder.hash(domain, types, value);
            messageHash = hash.slice(2); // 0x を除去
        } else {
            // personal_sign または eth_sign の場合
            const { ethers } = await import('/jspkg/ethers.umd.min.js');
            const messageBytes = typeof message === 'string' ? message : JSON.stringify(message);
            
            // Ethereum Signed Message プレフィックスを追加
            const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
            const prefixedMessage = prefix + messageBytes;
            
            // Keccak256 ハッシュを計算
            if (!ethers.utils || !ethers.utils.toUtf8Bytes || !ethers.utils.keccak256) {
                throw new Error('ethers.utils.toUtf8Bytes or ethers.utils.keccak256 is not available');
            }
            const prefixedBytes = ethers.utils.toUtf8Bytes(prefixedMessage);
            const messageHashHex = ethers.utils.keccak256(prefixedBytes);
            messageHash = messageHashHex.slice(2); // 0x を除去
        }

        console.log("[BitVoyMPCBridge] Message hash:", messageHash);

        // MPC署名実行
        const signature = await bitvoy.signWithMPC(
            masterId,
            messageHash,
            {
                blockchain: 'ethereum',
                transactionType: 'sign',
                messageType: type
            }
        );

        console.log("[BitVoyMPCBridge] MPC signature received:", signature);

        // 署名形式の変換（BitVoyMPC から返される形式を WalletConnect 形式に変換）
        // BitVoyMPC は {r, s, recid} 形式または hex 文字列を返す可能性がある
        let sigHex;
        if (typeof signature === 'string') {
            sigHex = signature;
        } else if (signature && signature.r && signature.s) {
            // {r, s, recid} 形式の場合
            const r = signature.r.startsWith('0x') ? signature.r.slice(2) : signature.r;
            const s = signature.s.startsWith('0x') ? signature.s.slice(2) : signature.s;
            const recid = signature.recid !== undefined ? signature.recid : 0;
            sigHex = r + s + recid.toString(16).padStart(2, '0');
        } else {
            throw new Error("Invalid signature format from BitVoyMPC");
        }

        // 0x プレフィックスを追加
        if (!sigHex.startsWith('0x')) {
            sigHex = '0x' + sigHex;
        }

        console.log("[BitVoyMPCBridge] Final signature:", sigHex);
        return sigHex;

    } catch (error) {
        console.error("[BitVoyMPCBridge] bitvoySignMessage error:", error);
        throw error;
    }
}

/**
 * トランザクション送信（eth_sendTransaction）
 * @param {Object} params
 * @param {string} params.chainId - チェーンID (例: "eip155:1")
 * @param {string} params.from - 送信元アドレス
 * @param {string} params.to - 送信先アドレス
 * @param {string} [params.value] - 送金額（wei、16進数文字列）
 * @param {string} [params.data] - トランザクションデータ（16進数文字列）
 * @param {string} [params.gas] - ガス制限（16進数文字列）
 * @param {string} [params.gasPrice] - ガス価格（wei、16進数文字列）
 * @param {string} [params.nonce] - ノンス（16進数文字列）
 * @returns {Promise<string>} トランザクションハッシュ（0x付き16進数文字列）
 */
export async function bitvoySendTransaction({ chainId, from, to, value = "0x0", data = "0x", gas, gasPrice, nonce }) {
    try {
        console.log("[BitVoyMPCBridge] bitvoySendTransaction called:", { chainId, from, to, value, data, gas, gasPrice, nonce });

        // BitVoyWallet インスタンスの確認
        if (typeof bitvoywallet === 'undefined' || !bitvoywallet) {
            throw new Error("BitVoyWallet instance not available");
        }

        // masterId の取得
        const masterId = bitvoy.getMasterId();
        if (!masterId) {
            throw new Error("Master ID not found. Please sign in first.");
        }

        // chainId からチェーン名を判定（coins-libs.jsのCHAINオブジェクトを使用）
        const chainIdNum = parseInt(chainId.split(':')[1] || chainId, 10);
        let chainName = 'ethereum'; // デフォルト
        
        // coins-libs.jsのCHAINオブジェクトから検索
        if (window.CoinsLibs && window.CoinsLibs.CHAIN) {
            const CHAIN = window.CoinsLibs.CHAIN;
            
            // mainnetとtestnetの両方を検索
            for (const network of ['mainnet', 'testnet']) {
                if (CHAIN[network]) {
                    for (const [chain, config] of Object.entries(CHAIN[network])) {
                        if (config.chainId === chainIdNum) {
                            chainName = chain;
                            console.log(`[BitVoyMPCBridge] Found chain: ${chainName} for chainId: ${chainIdNum} (network: ${network})`);
                break;
                        }
                    }
                    if (chainName !== 'ethereum') break; // 見つかった場合はループを抜ける
                }
            }
        } else {
            console.warn('[BitVoyMPCBridge] CoinsLibs.CHAIN not available, using default chain: ethereum');
        }

        // トランザクション構築
        const { ethers } = await import('/jspkg/ethers.umd.min.js');
        
        // ガス価格の取得（未指定の場合）
        let finalGasPrice = gasPrice;
        if (!finalGasPrice) {
            // プロキシAPIからガス価格を取得
            const proxyBase = chainName.includes('sepolia') || chainName.includes('amoy')
                ? `/proxyapi/blockchain/${chainName}`
                : `/proxyapi/blockchain/${chainName}`;
            
            try {
                const response = await fetch(`${proxyBase}/gasprice`, {
                    method: 'GET'
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data) {
                        finalGasPrice = data.data;
                    }
                }
            } catch (e) {
                console.warn("[BitVoyMPCBridge] Failed to fetch gas price, using default");
            }
            
            // デフォルト値
            if (!finalGasPrice) {
                finalGasPrice = ethers.parseUnits("20", "gwei").toString();
            }
        }

        // ガス制限の取得（未指定の場合）
        let finalGas = gas;
        if (!finalGas) {
            finalGas = data === "0x" || data === "0x0" ? "0x5208" : "0x186a0"; // 21000 or 100000
        }

        // ノンスの取得（未指定の場合）
        let finalNonce = nonce;
        if (!finalNonce) {
            // プロキシAPIからノンスを取得
            const proxyBase = chainName.includes('sepolia') || chainName.includes('amoy')
                ? `/proxyapi/blockchain/${chainName}`
                : `/proxyapi/blockchain/${chainName}`;
            
            try {
                const response = await fetch(`${proxyBase}/address/${from}/nonce`, {
                    method: 'GET'
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data) {
                        finalNonce = data.data;
                    }
                }
            } catch (e) {
                console.warn("[BitVoyMPCBridge] Failed to fetch nonce, using 0");
            }
            
            if (!finalNonce) {
                finalNonce = "0x0";
            }
        }

        // トランザクション構築（署名なし）
        const unsignedTx = {
            to: to,
            value: value,
            data: data,
            gasLimit: finalGas,
            gasPrice: finalGasPrice,
            nonce: finalNonce,
            chainId: chainIdNum
        };

        console.log("[BitVoyMPCBridge] Unsigned transaction:", unsignedTx);

        // トランザクションハッシュの生成（署名用）
        if (!ethers.utils || !ethers.utils.serializeTransaction || !ethers.utils.keccak256) {
            throw new Error('ethers.utils.serializeTransaction or ethers.utils.keccak256 is not available');
        }
        const serializedTx = ethers.utils.serializeTransaction(unsignedTx);
        // Keccak256 ハッシュを計算
        const messageHash = ethers.utils.keccak256(serializedTx).slice(2); // 0x を除去

        console.log("[BitVoyMPCBridge] Transaction message hash:", messageHash);

        // MPC署名実行
        const signature = await bitvoy.signWithMPC(
            masterId,
            messageHash,
            {
                blockchain: chainName,
                transactionType: 'transfer',
                amount: ethers.utils.formatEther(value || "0x0")
            }
        );

        console.log("[BitVoyMPCBridge] MPC signature received:", signature);

        // 署名形式の変換
        let r, s, v;
        if (typeof signature === 'string') {
            // hex 文字列の場合（130文字 = 65バイト = r(32) + s(32) + v(1)）
            const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
            r = '0x' + sigHex.slice(0, 64);
            s = '0x' + sigHex.slice(64, 128);
            const recid = parseInt(sigHex.slice(128, 130), 16);
            v = chainIdNum * 2 + 35 + recid;
        } else if (signature && signature.r && signature.s) {
            r = signature.r.startsWith('0x') ? signature.r : '0x' + signature.r;
            s = signature.s.startsWith('0x') ? signature.s : '0x' + signature.s;
            const recid = signature.recid !== undefined ? signature.recid : 0;
            v = chainIdNum * 2 + 35 + recid;
        } else {
            throw new Error("Invalid signature format from BitVoyMPC");
        }

        // 署名付きトランザクション構築
        if (!ethers.utils || !ethers.utils.serializeTransaction) {
            throw new Error('ethers.utils.serializeTransaction is not available');
        }
        const signedTxHex = ethers.utils.serializeTransaction({
            ...unsignedTx,
            r, s, v
        });

        console.log("[BitVoyMPCBridge] Signed transaction:", signedTxHex);

        // ブロードキャスト
        const proxyBase = chainName.includes('sepolia') || chainName.includes('amoy')
            ? `/proxyapi/blockchain/${chainName}`
            : `/proxyapi/blockchain/${chainName}`;
        
        const broadcastResponse = await fetch(`${proxyBase}/tx`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                network: chainName.includes('sepolia') || chainName.includes('amoy') ? 'testnet' : 'mainnet',
                rawTransaction: signedTxHex
            })
        });

        if (!broadcastResponse.ok) {
            const errorData = await broadcastResponse.json().catch(() => ({}));
            throw new Error(`Transaction broadcast failed: ${broadcastResponse.status} - ${errorData.error || 'Unknown error'}`);
        }

        const broadcastData = await broadcastResponse.json();
        const txHash = signedTx.hash;

        console.log("[BitVoyMPCBridge] Transaction broadcasted, hash:", txHash);
        return txHash;

    } catch (error) {
        console.error("[BitVoyMPCBridge] bitvoySendTransaction error:", error);
        throw error;
    }
}

