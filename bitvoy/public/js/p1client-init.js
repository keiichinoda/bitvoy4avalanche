/**
 * p1client-init.js
 * p1client.bundle.jsの初期化スクリプト
 * CSP対応のため、インラインスクリプトを外部ファイルに分離
 */

(async function() {
    try {
        // Wait for frost_wasm to be initialized
        await new Promise((resolve) => {
            if (window.frost_wasm) {
                resolve();
            } else {
                window.addEventListener('frost_wasm_ready', resolve, { once: true });
            }
        });
        
        // Import p1client bundle
        const { ed_p1Keygen, ed_p1Sign, secp_p1Keygen, secp_p1Sign, ecdsa_tss_p1Keygen, ecdsa_tss_p1Sign } = await import('/js/p1client.bundle.js');
        
        // Export ed25519 functions directly to window
        window.ed_p1Keygen = (api) => ed_p1Keygen({ ...api, frostWasm: window.frost_wasm });
        window.ed_p1Sign = (api) => ed_p1Sign({ ...api, frostWasm: window.frost_wasm });
        
        // Export secp256k1 functions directly to window
        window.secp_p1Keygen = (api) => secp_p1Keygen({ ...api, frostWasm: window.frost_wasm });
        window.secp_p1Sign = (api) => secp_p1Sign({ ...api, frostWasm: window.frost_wasm });
        
        // Export ecdsa_tss functions directly to window
        window.ecdsa_tss_p1Keygen = ecdsa_tss_p1Keygen;
        window.ecdsa_tss_p1Sign = ecdsa_tss_p1Sign;
        
        console.log('✅ p1client (ed25519, secp256k1, ecdsa_tss) loaded successfully');
        console.log('✅ Available functions:');
        console.log('  - window.ed_p1Keygen / window.ed_p1Sign (ed25519)');
        console.log('  - window.secp_p1Keygen / window.secp_p1Sign (secp256k1)');
        console.log('  - window.ecdsa_tss_p1Keygen / window.ecdsa_tss_p1Sign (ecdsa_tss)');
        
        // イベントを発火して、他のスクリプトに読み込み完了を通知
        window.dispatchEvent(new Event('p1client_ready'));
    } catch (error) {
        console.error('❌ Failed to load p1client:', error);
        throw error;
    }
})();

