/**
 * Payment Consent Page Handler
 * 支払い同意ページの処理スクリプト（外部ファイル化してCSP準拠）
 */

(function() {
    /**
     * 通貨コードから表示名へのマッピング（WalletAction.class.phpと同期）
     */
    function getCurrencyDisplayName(currencyCode) {
        const currencyNames = {
            'BTC': 'Bitcoin (BTC)',
            'SOL': 'Solana (SOL)',
            'TON': 'Toncoin (TON)',
            'ETH': 'Ethereum (ETH)',
            'POL': 'Polygon (POL)',
            'AVAX': 'Avalanche (AVAX)',
            'JPYC_POL': 'JPY Coin (JPYC - Polygon)',
            'USDC_POL': 'USD Coin (USDC - Polygon)',
            'USDT_POL': 'Tether (USDT - Polygon)',
            'JPYC_AVAX': 'JPY Coin (JPYC - Avalanche)',
            'USDC_AVAX': 'USD Coin (USDC - Avalanche)',
            'USDT_AVAX': 'Tether (USDT - Avalanche)',
            'USDT_TON': 'Tether (USDT - TON)',
            'BVT_SOL': 'BitVoy Token (BVT - Solana)',
            'BVT_TON': 'BitVoy Token (BVT - TON)',
            'BVT_ERC20': 'BitVoy Token (BVT - Ethereum)',
            'USDT_SOL': 'Tether (USDT - Solana)',
            'USDT_ERC20': 'Tether (USDT - Ethereum)'
        };
        return currencyNames[currencyCode] || currencyCode;
    }
    
    // DOMContentLoadedイベントで初期化（CSP準拠のためイベントリスナーを使用）
    async function init() {
        // URLパラメータから値を取得
        const params = new URLSearchParams(window.location.search);
        const queryLang = params.get('lang');
        
        // パスから言語を取得（例: /en/, /ja/, /zh/）
        const pathFirst = (location.pathname.split('/')[1] || '').toLowerCase();
        const pathLang = (pathFirst === 'en' || pathFirst === 'ja') ? pathFirst : '';
        
        // 優先順位: クエリパラメータ > パス > デフォルト
        const lang = queryLang || pathLang || 'en';
        
        // Intent情報を取得（intent_idが存在する場合）
        const intentId = params.get('intent_id') || document.getElementById('intent_id')?.value || '';
        let intentData = null;
        
        if (intentId) {
            try {
                const clientId = params.get('client_id') || document.getElementById('client_id')?.value || '';
                const response = await fetch(`/oidc-payment/intents/${intentId}?client_id=${clientId}`);
                if (response.ok) {
                    intentData = await response.json();
                    console.log('✅ Intent情報を取得:', intentData);
                } else {
                    console.warn('⚠️ Intent情報の取得に失敗:', response.status);
                }
            } catch (error) {
                console.error('❌ Intent情報取得エラー:', error);
            }
        }
        
        // Intent情報があればそれを使用、なければURLパラメータを使用
        const currencyCode = intentData ? intentData.currency : (params.get('currency') || '');
        const amount = intentData ? intentData.amount : (params.get('amount') || '');
        const toAddress = intentData ? intentData.payee?.address : (params.get('to') || '');
        
        // 通貨コードを表示名に変換して表示
        if (currencyCode) {
            const currencyDisplayName = getCurrencyDisplayName(currencyCode);
            // 通貨行の.value要素を特定（最初の.row内の.value要素）
            const rows = document.querySelectorAll('.row');
            if (rows.length > 0) {
                const currencyRow = rows[0]; // 最初の行が通貨行
                const currencyValueElement = currencyRow.querySelector('.value');
                if (currencyValueElement) {
                    currencyValueElement.textContent = currencyDisplayName;
                }
            }
        }
        
        // 金額を表示
        if (amount) {
            const rows = document.querySelectorAll('.row');
            if (rows.length >= 2) {
                const amountRow = rows[1]; // 2番目の行が金額行
                const amountValueElement = amountRow.querySelector('.value');
                if (amountValueElement) {
                    amountValueElement.textContent = amount;
                }
            }
        }
        
        // 送信先アドレスを短縮表示（前後8文字ずつ、間を4つのドット）
        if (toAddress && toAddress.length > 16) {
            const rows = document.querySelectorAll('.row');
            if (rows.length >= 3) {
                const toRow = rows[2]; // 3番目の行が送信先行
                const toValueElement = toRow.querySelector('.value');
                if (toValueElement) {
                    const shortenedAddress = toAddress.substring(0, 8) + '....' + toAddress.substring(toAddress.length - 8);
                    toValueElement.textContent = shortenedAddress;
                }
            }
        }
        
        function post(path, params) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = path + '?lang=' + lang;
            for (const [k, v] of Object.entries(params)) {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = k;
                input.value = v == null ? '' : v;
                form.appendChild(input);
            }
            document.body.appendChild(form);
            form.submit();
        }
        
        function onSign() {
            // ウォレットUIでSOL処理を実行するため、支払いパラメータを付けてindexへ
            // confirmed=1 を追加して、既に同意済みであることを示す
            const params = new URLSearchParams(window.location.search);
            const currentIntentId = params.get('intent_id') || document.getElementById('intent_id')?.value || '';
            const walletParams = new URLSearchParams({
                pay: '1',
                confirmed: '1', // 既にpayment-consentで確認済み
                currency: intentData ? intentData.currency : (params.get('currency') || ''),
                amount: intentData ? intentData.amount : (params.get('amount') || ''),
                to: intentData ? intentData.payee?.address : (params.get('to') || ''),
                chain: intentData ? intentData.chain : (params.get('chain') || ''),
                network: intentData ? intentData.network : (params.get('network') || ''),
                intent_id: currentIntentId,
                session_token: params.get('session_token') || '',
                response_type: params.get('response_type') || 'code',
                client_id: params.get('client_id') || document.getElementById('client_id')?.value || '',
                redirect_uri: params.get('redirect_uri') || '',
                scope: params.get('scope') || '',
                state: params.get('state') || '',
                nonce: params.get('nonce') || '',
                code_challenge: params.get('code_challenge') || '',
                code_challenge_method: params.get('code_challenge_method') || '',
                lang: lang
            }).toString();
            window.location.href = '/index.html?' + walletParams;
        }
        
        function onCancel() {
            const params = new URLSearchParams(window.location.search);
            post('/wallet/payment-cancel', {
                session_token: params.get('session_token') || '',
                client_id: params.get('client_id') || '',
                redirect_uri: params.get('redirect_uri') || '',
                state: params.get('state') || '',
                error: 'access_denied'
            });
        }
        
        // ボタンにイベントリスナーを設定（CSP準拠）
        const signButton = document.getElementById('sign-button');
        const cancelButton = document.getElementById('cancel-button');
        
        if (signButton) {
            signButton.addEventListener('click', onSign);
        }
        
        if (cancelButton) {
            cancelButton.addEventListener('click', onCancel);
        }
    }
    
    // DOMが読み込まれた後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMがすでに読み込まれている場合
        init();
    }
})();

