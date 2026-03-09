/**
 * OIDC Payment AA (Account Abstraction) 実装
 * Intent-bound UserOperation (IBUO v1) 対応
 */

/**
 * AA用のIntent承認とMPC署名参加
 * @param {string} intentId - Intent ID
 * @param {string} masterId - Master ID（オプション、指定されない場合はsessionStorageから取得）
 * @param {object} passkeyCredential - Passkey credential（オプション、現在は未使用）
 */
async function approveIntentWithAA(intentId, masterId = null, passkeyCredential = null) {
    try {
        // masterIdを取得（引数で指定されていない場合はsessionStorageから取得）
        if (!masterId) {
            masterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
            if (!masterId) {
                throw new Error('Master ID not found. Please provide masterId or ensure it is stored in sessionStorage.');
            }
        }
        
        // 1. Passkey認証（1回のWebAuthnで承認と署名鍵復号を兼ねる）
        // passkeyCredentialが渡されている場合はそれを再利用、なければ新たに認証
        let singlePasskeyCredential = passkeyCredential;
        if (!singlePasskeyCredential) {
            if (typeof window.bitvoyMPC.mpc.authenticateWithPasskey !== 'function') {
                throw new Error('BitVoyMPC.authenticateWithPasskey is not available');
            }
            singlePasskeyCredential = await window.bitvoyMPC.mpc.authenticateWithPasskey(masterId);
        }
        if (!singlePasskeyCredential) {
            throw new Error('Passkey authentication failed');
        }
        
        // 2. JWT取得（BitVoy Server API用）
        const jwt = await getJWT(masterId);
        if (!jwt) {
            throw new Error('Failed to obtain JWT for BitVoy Server API');
        }
        
        // 3. UserOperation構築リクエスト
        const buildResponse = await fetch('/walletapi/aa/build-userop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({
                intent_id: intentId
            })
        });
        
        if (!buildResponse.ok) {
            const errorData = await buildResponse.json().catch(() => ({}));
            throw new Error(`Failed to build UserOperation: ${buildResponse.status} ${errorData.message || ''}`);
        }
        
        const { userOpFinal, userOpHash, hashToSign, ownerAddress: serverOwnerAddress, intentHash } = await buildResponse.json();
        // userOpFinalは既にfinal(unsigned)状態（paymasterAndData/gasセット、signatureは空）
        // hashToSignが存在する場合はそれを使用、なければuserOpHashを使用（後方互換性）
        const signatureTarget = hashToSign || userOpHash;
        
        // 3.5. ownerAddressをMPC公開鍵から計算（ecdsa_tss公開鍵（65バイト非圧縮形式）を使用）
        let ownerAddress = serverOwnerAddress;
        try {
            if (!window.bitvoyMPC || !window.bitvoyMPC.mpc) {
                throw new Error('BitVoyMPC is not available');
            }
            
            // MPC公開鍵を取得
            const metadata = await window.bitvoyMPC.mpc.storage.getMetadata(masterId, 'ecdsa_tss');
            if (!metadata || !metadata.publicKey) {
                throw new Error('ecdsa_tss publicKey not found in metadata');
            }
            
            // ecdsa_tss公開鍵（65バイト非圧縮形式）を取得
            const ecdsaTssPublicKey = metadata.publicKey;
            
            // MPC公開鍵からEOAアドレスを計算
            if (!window.ethers || !window.ethers.utils || !window.ethers.utils.computeAddress) {
                throw new Error('ethers.utils.computeAddress is not available');
            }
            
            // ecdsa_tss公開鍵を正規化（0xプレフィックスを追加、必要に応じて0x04プレフィックスを追加）
            let publicKeyHex = ecdsaTssPublicKey;
            if (!publicKeyHex.startsWith('0x')) {
                publicKeyHex = '0x' + publicKeyHex;
            }
            
            // 65バイト非圧縮形式（0x04で始まる）に正規化
            // 128文字（64バイト）の場合は0x04を追加
            const publicKeyWithout0x = publicKeyHex.substring(2);
            if (publicKeyWithout0x.length === 128 && !publicKeyWithout0x.startsWith('04')) {
                publicKeyHex = '0x04' + publicKeyWithout0x;
                console.log('🔧 [approveIntentWithAA] Normalized ecdsa_tss public key to uncompressed format (added 0x04 prefix)');
            }
            
            // 公開鍵からEOAアドレスを計算
            const computedOwnerAddress = window.ethers.utils.computeAddress(publicKeyHex);
            
            console.log('🔍 [approveIntentWithAA] OwnerAddress comparison:', {
                serverOwnerAddress,
                computedOwnerAddress,
                ecdsaTssPublicKeyLength: publicKeyHex.length,
                ecdsaTssPublicKeyPreview: publicKeyHex.substring(0, 20) + '...',
                match: serverOwnerAddress && serverOwnerAddress.toLowerCase() === computedOwnerAddress.toLowerCase()
            });
            
            // 計算されたアドレスを使用（サーバー側の値が正しくない可能性があるため）
            ownerAddress = computedOwnerAddress;
            
            if (serverOwnerAddress && serverOwnerAddress.toLowerCase() !== computedOwnerAddress.toLowerCase()) {
                console.warn('⚠️ [approveIntentWithAA] Server ownerAddress does not match computed address:', {
                    server: serverOwnerAddress,
                    computed: computedOwnerAddress,
                    note: 'This may indicate that DB owner_eoa was computed from verifying_key (compressed). Using computed address.'
                });
                
                // 注意: DBのowner_eoaが古い値（verifying_keyから計算）の可能性がある
                // クライアント側で計算した値を使用するため、処理は継続
                // DBの更新が必要な場合は、手動で更新するか、/walletapi/aa/smart-account/registerエンドポイントを使用して再登録してください
            }
            
            console.log('✅ [approveIntentWithAA] Using computed ownerAddress:', ownerAddress);
        } catch (error) {
            console.warn('⚠️ [approveIntentWithAA] Failed to compute ownerAddress from MPC public key, using server value:', error);
            // サーバー側の値を使用（フォールバック）
            if (!ownerAddress) {
                throw new Error(`Failed to get ownerAddress: ${error.message}`);
            }
        }
        
        // 4. MPC署名参加（signatureTargetに対して）
        // masterIdを渡して確実に取得できるようにする
        console.log('🔍 [approveIntentWithAA] Before MPC signing:', {
            signatureTarget,
            userOpHash,
            hashToSign,
            ownerAddress,
            signatureTargetLength: signatureTarget.length,
            signatureTargetType: typeof signatureTarget
        });
        const saSignature = await participateInMPCSignature(signatureTarget, masterId, singlePasskeyCredential);
        console.log('🔍 [approveIntentWithAA] After MPC signing:', {
            saSignatureType: typeof saSignature,
            saSignatureLength: typeof saSignature === 'string' ? saSignature.length : 'N/A',
            saSignaturePreview: typeof saSignature === 'string' ? saSignature.substring(0, 50) + '...' : JSON.stringify(saSignature).substring(0, 50) + '...'
        });
        
        // 5. 署名形式の検証（ownerAddressと一致するか確認）
        // 注意: signMessageWithOP側でECDSA-TSS署名形式（r||s形式、128文字）を返す。
        // ここでは検証のみ行う。
        console.log('🔍 [approveIntentWithAA] Before formatSASignatureForAA:', {
            signatureTarget,
            ownerAddress,
            saSignatureLength: typeof saSignature === 'string' ? saSignature.length : 'N/A'
        });
        const formattedSignature = formatSASignatureForAA(saSignature, signatureTarget, ownerAddress);
        console.log('✅ [approveIntentWithAA] After formatSASignatureForAA:', {
            formattedSignatureLength: formattedSignature.length,
            formattedSignaturePreview: formattedSignature.substring(0, 30) + '...'
        });
        
        // 5. UserOperation送信（userOpFinal + signature）
        // JWTは既に取得済み（再利用）
        const sendResponse = await fetch('/walletapi/aa/send-userop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({
                intent_id: intentId,
                user_op: {
                    ...userOpFinal,
                    signature: formattedSignature // userOpFinalにsignatureを追加
                }
            })
        });
        
        if (!sendResponse.ok) {
            const errorData = await sendResponse.json().catch(() => ({}));
            throw new Error(`Failed to send UserOperation: ${sendResponse.status} ${errorData.message || ''}`);
        }
        
        return await sendResponse.json();
        
    } catch (error) {
        console.error('AA approval error:', error);
        throw error;
    }
}

/**
 * MPC署名参加（Client + OP MPC Signフロー）
 * BitVoyMPC.signMessageWithOPを呼び出す
 * 
 * @param {string} userOpHash - UserOperation Hash
 * @param {string} masterId - Master ID（オプション、sessionStorageから取得する場合は省略可）
 */
async function participateInMPCSignature(userOpHash, masterId = null, preAuthCredential = null) {
    if (!window.bitvoyMPC) {
        throw new Error('BitVoy is not initialized');
    }
    
    if (!window.bitvoyMPC.mpc) {
        throw new Error('BitVoyMPC instance not found. window.bitvoyMPC.mpc is required.');
    }
    
    if (!window.bitvoyMPC.mpc.signMessageWithOP) {
        throw new Error('signMessageWithOP method not available in BitVoyMPC');
    }
    
    // masterIdが指定されていない場合はsessionStorageから取得
    if (!masterId) {
        masterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
    }
    
    // BitVoyMPC.signMessageWithOPを直接使用（Phase 2実装）
    return await window.bitvoyMPC.mpc.signMessageWithOP(userOpHash, masterId, preAuthCredential);
}

/**
 * AA用のSA署名フォーマット（0x02 || r||s||v、65バイト）
 * @param {string|object} signature - 128文字hex文字列（r||s形式）または{r, s}オブジェクト
 * @param {string} userOpHash - UserOperation Hash（recid計算用）
 * @param {string} ownerAddress - Owner EOAアドレス（MPC公開鍵のEOA、recid計算用、必須）
 * @returns {string} 0x02 || r||s||v（65バイト、hex文字列）
 */
function formatSASignatureForAA(signature, userOpHash, ownerAddress) {
    const authType = "0x02";
    const { ethers } = window;
    
    console.log('🔍 [formatSASignatureForAA] Input parameters:', {
        signatureType: typeof signature,
        signatureLength: typeof signature === 'string' ? signature.length : 'N/A',
        signaturePreview: typeof signature === 'string' ? signature.substring(0, 50) + '...' : JSON.stringify(signature).substring(0, 50) + '...',
        userOpHash,
        ownerAddress
    });
    if (!ethers) {
        throw new Error('ethers.js is required');
    }
    
    // secp256k1曲線の位数（定数）
    const secp256k1n = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
    
    // 署名を{r, s}形式に正規化
    // 注意: signMessageWithOP側でECDSA-TSS署名形式（r||s形式、128文字）を返す
    // この関数は128文字（r||s形式）のみを受け付ける
    let r, s;
    if (typeof signature === 'string') {
        // JSON文字列の引用符を除去（"..."形式の場合）
        let cleanSig = signature.replace(/^["']|["']$/g, '').replace(/^0x/, '');
        
        if (cleanSig.length === 128) {
            // r||s形式（signMessageWithOP側で変換済み）
            r = cleanSig.substring(0, 64);
            s = cleanSig.substring(64, 128);
        } else {
                throw new Error(`Invalid signature length: expected 128 hex chars (r||s format from ECDSA-TSS), got ${cleanSig.length}`);
        }
    } else if (signature && signature.r && signature.s) {
        r = signature.r.replace(/^0x/, '').padStart(64, '0');
        s = signature.s.replace(/^0x/, '').padStart(64, '0');
    } else {
        throw new Error('Invalid signature format');
    }
    
    if (!userOpHash || !ownerAddress) {
        throw new Error('userOpHash and ownerAddress are required');
    }
    
    // 1. high-sかどうかをチェックし、必要に応じてlow-sに正規化
    const sBigInt = BigInt('0x' + s);
    const halfN = secp256k1n / BigInt(2);
    
    // high-sの場合は、先にlow-sに正規化してからrecoverAddressを呼び出す
    let sNormalized = s;
    
    if (sBigInt > halfN) {
        // high-sの場合、low-sに正規化
        const sLow = secp256k1n - sBigInt;
        sNormalized = sLow.toString(16).padStart(64, '0');
        console.log('🔍 [formatSASignatureForAA] High-s detected, normalizing to low-s');
    }
    
    const msgHash = userOpHash.startsWith('0x') ? userOpHash : '0x' + userOpHash;
    const rHex = '0x' + r;
    const sNormalizedHex = '0x' + sNormalized;
    
    const sHex = '0x' + s; // 元のs値（ログ用）
    
    console.log('🔍 [formatSASignatureForAA] Starting recovery:', {
        msgHash,
        r: rHex,
        s: sHex,
        sNormalized: sNormalizedHex,
        isHighS: sBigInt > halfN,
        ownerAddress
    });
    
    // 2. recid=0と1を試行してownerAddressと一致する方を採用（low-s正規化後）
    // 仕様: SA署名は生userOpHashのみ（EIP-191形式は適用しない）
    // ethers.utils.recoverAddressはEIP-191形式を自動適用するため、生ハッシュに対しては使用できない
    // 代わりに、ethers.utils.recoverPublicKeyを使用して公開鍵を復元し、そこからアドレスを計算する
    // vの正規化: recoverPublicKeyはvが27/28か0/1かで挙動が変わる可能性があるため、常に27/28に正規化
    const normalizeV = (v) => {
        if (v === 0 || v === 1) v += 27;
        if (v !== 27 && v !== 28) throw new Error(`Invalid v value: ${v} (must be 27 or 28)`);
        return v;
    };
    
    console.log('🔍 [formatSASignatureForAA] Starting recovery with:', {
        msgHash,
        msgHashLength: msgHash.length,
        r: rHex,
        s: sNormalizedHex,
        ownerAddress,
        isHighS: sBigInt > halfN
    });
    
    let recoveredAddress0 = null, recoveredAddress1 = null;
    try {
        if (!ethers.utils || !ethers.utils.recoverPublicKey || !ethers.utils.computeAddress) {
            throw new Error('ethers.utils.recoverPublicKey and computeAddress are required');
        }
        
        // vを正規化（27/28に確実にする）
        const v0 = normalizeV(27);
        const v1 = normalizeV(28);
        
        // 生ハッシュに対して直接公開鍵を復元（EIP-191形式は適用しない）
        // recoverPublicKeyは生ハッシュに対して直接動作する（EIP-191形式は適用しない）
        const publicKey0 = ethers.utils.recoverPublicKey(msgHash, { r: rHex, s: sNormalizedHex, v: v0 });
        const publicKey1 = ethers.utils.recoverPublicKey(msgHash, { r: rHex, s: sNormalizedHex, v: v1 });
        
        // 公開鍵からアドレスを計算
        recoveredAddress0 = ethers.utils.computeAddress(publicKey0);
        recoveredAddress1 = ethers.utils.computeAddress(publicKey1);
    } catch (error) {
        console.error('❌ [formatSASignatureForAA] Recovery error:', error);
        throw new Error(`Failed to recover address: ${error.message}`);
    }
    
    console.log('🔍 [formatSASignatureForAA] Recovered addresses:', {
        recoveredAddress0,
        recoveredAddress1,
        ownerAddress,
        match0: recoveredAddress0 && recoveredAddress0.toLowerCase() === ownerAddress.toLowerCase(),
        match1: recoveredAddress1 && recoveredAddress1.toLowerCase() === ownerAddress.toLowerCase()
    });
    
    // デバッグ: 復元された公開鍵とアドレスの情報をログ出力
    try {
        if (recoveredAddress0 && ethers.utils && ethers.utils.recoverPublicKey) {
            const recoveredPublicKey0 = ethers.utils.recoverPublicKey(msgHash, { r: rHex, s: sNormalizedHex, v: 27 });
            const addressFromPubKey0 = ethers.utils.computeAddress(recoveredPublicKey0);
            
            console.log('🔍 [formatSASignatureForAA] Public key recovery (recid=0):', {
                publicKeyFull: recoveredPublicKey0.substring(0, 30) + '...',
                addressFromPubKey: addressFromPubKey0,
                matchesRecovered: addressFromPubKey0.toLowerCase() === recoveredAddress0.toLowerCase()
            });
        }
    } catch (e) {
        console.warn('⚠️ [formatSASignatureForAA] Failed to log public key recovery:', e);
    }
    
    const expectedAddrLower = ownerAddress.toLowerCase();
    let recid = 0;
    if (recoveredAddress0 && recoveredAddress0.toLowerCase() === expectedAddrLower) {
        recid = 0;
        console.log('✅ [formatSASignatureForAA] Using recid=0');
    } else if (recoveredAddress1 && recoveredAddress1.toLowerCase() === expectedAddrLower) {
        recid = 1;
        console.log('✅ [formatSASignatureForAA] Using recid=1');
    } else {
        // エラーメッセージを改善：どの公開鍵からownerAddressが計算されたかを表示
        console.error('❌ [formatSASignatureForAA] Recovery mismatch details:', {
            recoveredAddress0,
            recoveredAddress1,
            expectedOwnerAddress: ownerAddress,
            msgHash,
            r: rHex,
            s: sNormalizedHex,
            isHighS: sBigInt > halfN
        });
        throw new Error(`Could not determine recid: recovered addresses (${recoveredAddress0 || 'null'}, ${recoveredAddress1 || 'null'}) do not match ownerAddress ${ownerAddress}. This may indicate that the ownerAddress is incorrect or the signature was created with a different key.`);
    }
    
    // 注意: high-sをlow-sに正規化した後、そのsNormalizedでrecoveryParam=0/1を試して
    // 一致する方を選んだrecidが既に正解なので、追加のflipは不要
    
    // 4. vを計算（27または28）し、正規化
    let v = 27 + recid;
    v = normalizeV(v); // 念のため正規化（0/1の場合は27/28に変換）
    
    // 5. 最終確認：もう一度recover assert（low-s正規化後）
    // 仕様: SA署名は生userOpHashのみ（EIP-191形式は適用しない）
    let recoveredFinal = null;
    try {
        if (!ethers.utils || !ethers.utils.recoverPublicKey || !ethers.utils.computeAddress) {
            throw new Error('ethers.utils.recoverPublicKey and computeAddress are required');
        }
        // 生ハッシュに対して直接公開鍵を復元（EIP-191形式は適用しない）
        // vは既に正規化済み（27または28）
        const publicKeyFinal = ethers.utils.recoverPublicKey(msgHash, { r: rHex, s: sNormalizedHex, v: v });
        recoveredFinal = ethers.utils.computeAddress(publicKeyFinal);
    } catch (error) {
        console.error('❌ [formatSASignatureForAA] Final recovery error:', error);
        throw new Error(`Failed to recover address after normalization: ${error.message}`);
    }
    
    console.log('🔍 [formatSASignatureForAA] Final recovery:', {
        recoveredFinal,
        ownerAddress,
        recid,
        v,
        sNormalized: sNormalizedHex,
        match: recoveredFinal && recoveredFinal.toLowerCase() === expectedAddrLower
    });
    
    if (!recoveredFinal || recoveredFinal.toLowerCase() !== expectedAddrLower) {
        throw new Error(`Signature recovery failed after low-s normalization: expected ${ownerAddress}, got ${recoveredFinal || 'null'}`);
    }
    
    // 5. 0x02 || r||s||v形式（66バイト）を返す
    const vHex = v.toString(16).padStart(2, '0');
    const finalSignature = ethers.utils.hexConcat([authType, '0x' + r + sNormalized + vHex]);
    
    console.log('✅ [formatSASignatureForAA] Final signature generated:', {
        signatureLength: finalSignature.length,
        signaturePreview: finalSignature.substring(0, 20) + '...',
        authType,
        r: rHex,
        s: sNormalizedHex,
        v: v,
        vHex,
        ownerAddress,
        recoveredFinal
    });
    
    return finalSignature;
}

/**
 * Passkey承認
 */
async function approveWithPasskey(masterId, credential = null) {
    // Passkey承認処理（既存の実装を使用）
    if (!window.bitvoyMPC) {
        throw new Error('BitVoy is not initialized');
    }
    
    if (!window.bitvoyMPC.mpc) {
        throw new Error('BitVoyMPC instance not found. window.bitvoyMPC.mpc is required.');
    }
    
    if (!masterId) {
        // フォールバック: sessionStorageから取得を試行
        masterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
        if (!masterId) {
            throw new Error('Master ID not found');
        }
    }
    
    // window.bitvoyMPCはBitVoyクラスのインスタンスで、mpcプロパティがBitVoyMPCのインスタンス
    // app-spa.jsの行3406を参照: window.bitvoyMPC.mpc.authenticateWithPasskey(masterId)
    if (typeof window.bitvoyMPC.mpc.authenticateWithPasskey !== 'function') {
        throw new Error('BitVoyMPC.authenticateWithPasskey is not available');
    }
    
    // Passkey認証実行（credentialは現在未使用、将来の拡張用）
    const result = await window.bitvoyMPC.mpc.authenticateWithPasskey(masterId);
    return { success: !!result };
}

/**
 * JWT取得（BitVoy Server API用）
 * @param {string} masterId - Master ID（オプション、指定されない場合はsessionStorageから取得）
 * @returns {Promise<string|null>} JWTトークン（失敗時はnull）
 */
async function getJWT(masterId = null) {
    // masterIdを取得
    if (!masterId) {
        masterId = sessionStorage.getItem('mpc.masterid') || sessionStorage.getItem('masterId');
    }
    
    if (!masterId) {
        console.warn('⚠️ Master ID not found for JWT acquisition');
        return null;
    }
    
    // BitVoyWalletのobtainJWTメソッドを使用（他のコードと同様）
    // window.bitvoyMPCはBitVoyクラスのインスタンスで、walletプロパティがBitVoyWalletのインスタンス
    if (window.bitvoyMPC && window.bitvoyMPC.wallet && typeof window.bitvoyMPC.wallet.obtainJWT === 'function') {
        try {
            const jwt = await window.bitvoyMPC.wallet.obtainJWT(masterId, 'blockchain_access');
            return jwt;
        } catch (error) {
            console.error('❌ Failed to obtain JWT:', error);
            return null;
        }
    }
    
    // フォールバック: セッションストレージから取得
    return sessionStorage.getItem('guardianJWT') || 
           sessionStorage.getItem('jwt') ||
           null;
}

// グローバルスコープで利用可能にする
if (typeof window !== 'undefined') {
    window.approveIntentWithAA = approveIntentWithAA;
    window.participateInMPCSignature = participateInMPCSignature;
    window.formatSASignatureForAA = formatSASignatureForAA;
}

