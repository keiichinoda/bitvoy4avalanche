/**
 * OIDC i18next Initialization
 * OIDC認証ページ用のi18next初期化スクリプト（既存方式に準拠）
 */

(function () {
    // 既存のi18n-init.jsと同じ方式で言語検出
    var params = new URLSearchParams(location.search);
    var qLang = params.get('lang');
    var stored = localStorage.getItem('lang');
    var pathFirst = (location.pathname.split('/')[1] || '').toLowerCase();
    var pathLang = (pathFirst === 'en' || pathFirst === 'ja') ? pathFirst : '';
    var preferred = (qLang || pathLang || stored || 'en').toLowerCase();
    var supported = ['en', 'ja'];
    var lng = supported.indexOf(preferred) >= 0 ? preferred : 'en';

    // ページ名に基づく名前空間設定
    var pathParts = location.pathname.split('/').filter(function(p) { return p; });
    // パスから言語コードを除外（例: /ja/oidc/authorize → ['ja', 'oidc', 'authorize'] → ['oidc', 'authorize']）
    var filteredPathParts = pathParts.filter(function(p) {
        return p !== 'en' && p !== 'ja';
    });
    var pageName = filteredPathParts.length > 0 ? filteredPathParts[filteredPathParts.length - 1] : 'login';
    pageName = pageName.replace(/\.html?$/i, '') || 'login';
    // payment-consentページの場合の特別処理
    if (pageName === 'payment-consent' || location.pathname.includes('payment-consent')) {
        pageName = 'payment-consent';
    }
    var namespaces = ['common', pageName];

    // 翻訳適用関数（既存方式と同じ）
    function applyI18n() {
        document.documentElement.setAttribute('lang', i18next.language || lng);
        document.documentElement.setAttribute('dir', (i18next.dir && i18next.dir()) || 'ltr');

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var text = i18next.t(key);
            if (text && text !== key) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.placeholder = text;
                } else {
                    el.textContent = text;
                }
            }
        });

        document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
            var spec = el.getAttribute('data-i18n-attr');
            spec.split(',').forEach(function (pair) {
                var parts = pair.split(':');
                if (parts.length !== 2) return;
                var attr = parts[0].trim();
                var key = parts[1].trim();
                var val = i18next.t(key);
                if (val && val !== key) el.setAttribute(attr, val);
            });
        });

        // 言語セレクターの設定
        var languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.value = i18next.language || lng;
        }
    }

    // 言語変更イベントリスナー
    function setupLanguageSelector() {
        var languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.addEventListener('change', function(e) {
                var newLang = e.target.value;
                if (supported.indexOf(newLang) >= 0) {
                    i18next.changeLanguage(newLang, function(err, t) {
                        if (err) {
                            console.error('Language change failed:', err);
                        } else {
                            localStorage.setItem('lang', newLang);
                            applyI18n();
                        }
                    });
                }
            });
        }
    }

    // グローバル関数として公開
    window.applyI18n = applyI18n;
    window.setupLanguageSelector = setupLanguageSelector;

    // 言語設定を保存（i18next初期化の成功/失敗に関わらず実行）
    // 初期化が失敗しても、検出した言語はlocalStorageに保存する
    if (qLang && supported.indexOf(qLang) >= 0) {
        localStorage.setItem('lang', qLang);
    } else if (pathLang && supported.indexOf(pathLang) >= 0) {
        localStorage.setItem('lang', pathLang);
    } else if (!stored) {
        localStorage.setItem('lang', lng);
    }

    // i18next初期化（既存方式と同じ）
    i18next
        .use(i18nextHttpBackend)
        .init({
            lng: lng,
            fallbackLng: 'en',
            ns: namespaces,
            defaultNS: namespaces[1] || 'common',
            fallbackNS: ['common'],
            backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' }
        }, function (err, t) {
            if (err) {
                console.error('i18next initialization failed:', err);
                // エラー時でも最低限の翻訳適用を試みる
                try {
                    applyI18n();
                } catch (e) {
                    console.error('Failed to apply i18n:', e);
                }
            } else {
                // 初期翻訳適用
                applyI18n();
                
                // 言語セレクター設定
                setupLanguageSelector();
            }
        });
})();
