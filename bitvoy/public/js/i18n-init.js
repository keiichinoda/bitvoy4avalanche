(function () {
    // -------------------------
    // 1. 言語決定
    // -------------------------
    var supported = ['en', 'ja'];

    function detectLang() {
        var params = new URLSearchParams(location.search);
        var qLang = (params.get('lang') || '').toLowerCase();
        var pathFirst = (location.pathname.split('/')[1] || '').toLowerCase();
        var pathLang = (pathFirst === 'en' || pathFirst === 'ja') ? pathFirst : '';
        var storedLang = localStorage.getItem('lang');

        // 優先順位: クエリパラメータ > パス > localStorage > デフォルト
        // パスやクエリを優先することで、URLに基づく言語設定を反映
        var preferred;
        if (qLang && supported.indexOf(qLang) >= 0) {
            // クエリパラメータが指定されている場合は最優先
            preferred = qLang;
            // localStorageに保存（対応言語チェック済み）
            localStorage.setItem('lang', preferred);
        } else if (pathLang && supported.indexOf(pathLang) >= 0) {
            // パスが指定されている場合は次に優先（localStorageより優先）
            preferred = pathLang;
            // localStorageに保存（対応言語チェック済み）
            localStorage.setItem('lang', preferred);
        } else if (storedLang && supported.indexOf(storedLang) >= 0) {
            // localStorageに保存されている場合は次に優先
            preferred = storedLang;
        } else {
            // デフォルトは'en'
            preferred = 'en';
        }
        
        return preferred;
    }

    var lng = detectLang();

    // -------------------------
    // 2. ページごとの namespace
    // -------------------------
    var pathParts = location.pathname.split('/').filter(function(p) { return p; });
    // パスから言語コードを除外（例: /ja/ → ['ja'] → []）
    var filteredPathParts = pathParts.filter(function(p) {
        return p !== 'en' && p !== 'ja';
    });
    var pageName = filteredPathParts.length > 0 ? filteredPathParts[filteredPathParts.length - 1] : 'index';
    pageName = pageName.replace(/\.html?$/i, '') || 'index';

    // index.htmlには複数のページ（home、coins、swapなど）が含まれているため、
    // coinsとswap名前空間も読み込む
    var namespaces = ['common', pageName];
    if (pageName === 'index') {
        if (namespaces.indexOf('coins') < 0) {
        namespaces.push('coins');
        }
        if (namespaces.indexOf('swap') < 0) {
            namespaces.push('swap');
        }
        if (namespaces.indexOf('crosschain') < 0) {
            namespaces.push('crosschain');
        }
    }

    // -------------------------
    // 3. DOM への適用関数
    // -------------------------
    // 実際の翻訳処理（初期化チェックなし）
    function applyTranslations() {
        // localStorageから言語を取得（i18n-init.jsでパスやクエリから設定済み）
        var storedLang = localStorage.getItem('lang');
        var currentLang = (storedLang && supported.indexOf(storedLang) >= 0) ? storedLang : (lng || 'en');
        document.documentElement.setAttribute('lang', currentLang);
        document.documentElement.setAttribute('dir', (i18next.dir && i18next.dir()) || 'ltr');

        // data-i18n: 中身 or placeholder
        var elements = document.querySelectorAll('[data-i18n]');
        
        // 現在の言語の名前空間を取得（i18next.store.data[language]の中のキー）
        // localStorageから言語を取得（i18n-init.jsでパスやクエリから設定済み）
        var storedLangForNS = localStorage.getItem('lang');
        var currentLang = (storedLangForNS && supported.indexOf(storedLangForNS) >= 0) ? storedLangForNS : (lng || 'en');
        var availableNS = i18next.store.data && i18next.store.data[currentLang] 
            ? Object.keys(i18next.store.data[currentLang]) 
            : [];
        
        console.log('📊 applyI18n() called:', {
            elementCount: elements.length,
            language: i18next.language,
            defaultNS: i18next.options.defaultNS,
            availableNamespaces: availableNS,
            storeDataLanguages: i18next.store.data ? Object.keys(i18next.store.data) : []
        });
        
        var translatedCount = 0;
        var skippedCount = 0;
        
        elements.forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            if (!key) return;
            
            // キーの形式を判断
            // 例: "coins.actions.send" → coins名前空間のactions.send
            // 例: "nav.menu" → common名前空間のnav.menu（またはcoins名前空間のnav.menu）
            var text;
            var parts = key.split('.');
            
            // デバッグ: 最初の10個の要素のみログ出力
            var allElements = Array.from(elements);
            var isFirstFew = allElements.length <= 10 || allElements.indexOf(el) < 10;
            var debugInfo = {};
            
            // 最初の部分が名前空間かどうかを判断
            if (parts.length > 1 && availableNS.indexOf(parts[0]) >= 0) {
                // 最初の部分が名前空間の場合
                // 例: "coins.actions.send" → coins名前空間で "actions.send" を探す
                var ns = parts[0];
                var keyWithoutNS = parts.slice(1).join('.');
                debugInfo = {
                    originalKey: key,
                    detectedNS: ns,
                    keyWithoutNS: keyWithoutNS,
                    method: 'explicit-namespace'
                };
                text = i18next.t(keyWithoutNS, { ns: ns });
            } else {
                // 名前空間が含まれていない、または名前空間が見つからない場合
                // defaultNSとfallbackNSを使用して自動的に解決
                debugInfo = {
                    originalKey: key,
                    method: 'auto-resolve',
                    defaultNS: i18next.options.defaultNS,
                    fallbackNS: i18next.options.fallbackNS
                };
                text = i18next.t(key);
            }
            
            if (isFirstFew) {
                console.log('🌐 Translation:', {
                    key: key,
                    text: text,
                    originalText: el.textContent || el.placeholder,
                    language: i18next.language,
                    isInitialized: i18next.isInitialized,
                    debug: debugInfo
                });
            }
            
            if (!text || text === key) {
                // 翻訳が見つからない場合のデバッグ
                skippedCount++;
                if (isFirstFew) {
                    console.warn('⚠️ Translation not found:', {
                        key: key,
                        language: i18next.language,
                        defaultNS: i18next.options.defaultNS,
                        fallbackNS: i18next.options.fallbackNS,
                        storeData: i18next.store.data,
                        debug: debugInfo,
                        // 実際に試したキーを確認
                        triedKey: parts.length > 1 && availableNS.indexOf(parts[0]) >= 0 
                            ? parts.slice(1).join('.') 
                            : key,
                        triedNS: parts.length > 1 && availableNS.indexOf(parts[0]) >= 0 
                            ? parts[0] 
                            : i18next.options.defaultNS,
                        // 実際に存在するキーを確認（デバッグ用）
                        availableNS: availableNS,
                        currentLang: currentLang,
                        coinsBanner: i18next.store.data && i18next.store.data[currentLang] && i18next.store.data[currentLang].coins 
                            ? i18next.store.data[currentLang].coins.banner 
                            : 'not found'
                    });
                }
                // 翻訳が見つからない場合でも、処理は継続（他の要素の翻訳は続行）
                return;
            }

            translatedCount++;
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else if (el.tagName === 'TITLE') {
                document.title = text;
            } else {
                el.textContent = text;
            }
        });
        
        console.log('📊 applyI18n() completed:', {
            total: elements.length,
            translated: translatedCount,
            skipped: skippedCount
        });

        // data-i18n-attr="attr:key,attr2:key2"
        document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
            el.getAttribute('data-i18n-attr').split(',').forEach(function (pair) {
                var parts = pair.split(':');
                if (parts.length !== 2) return;
                var attr = parts[0].trim();
                var key  = parts[1].trim();
                var val  = i18next.t(key);
                if (val && val !== key) el.setAttribute(attr, val);
            });
        });

        // data-i18n-title → title
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-title');
            var text = i18next.t(key);
            if (text && text !== key) el.setAttribute('title', text);
        });

        // data-i18n-aria-label → aria-label
        document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-aria-label');
            var text = i18next.t(key);
            if (text && text !== key) el.setAttribute('aria-label', text);
        });

        // data-i18n-title → title (for <title> tag)
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-title');
            var text = i18next.t(key);
            if (text && text !== key) {
                if (el.tagName === 'TITLE') {
                    document.title = text;
                } else {
                    el.setAttribute('title', text);
                }
            }
        });

        // data-i18n-html: HTMLコンテンツを設定
        var htmlElements = document.querySelectorAll('[data-i18n-html]');
        var htmlTranslatedCount = 0;
        var htmlSkippedCount = 0;
        
        htmlElements.forEach(function (el) {
            var key = el.getAttribute('data-i18n-html');
            if (!key) return;
            
            var parts = key.split('.');
            var html;
            
            // 名前空間の処理（data-i18nと同じロジック）
            if (parts.length > 1 && availableNS.indexOf(parts[0]) >= 0) {
                var ns = parts[0];
                var keyWithoutNS = parts.slice(1).join('.');
                html = i18next.t(keyWithoutNS, { ns: ns });
            } else {
                html = i18next.t(key);
            }
            
            if (html && html !== key) {
                el.innerHTML = html;
                htmlTranslatedCount++;
            } else {
                htmlSkippedCount++;
                console.warn('⚠️ HTML translation not found:', {
                    key: key,
                    html: html,
                    language: i18next.language,
                    availableNS: availableNS
                });
            }
        });
        
        if (htmlElements.length > 0) {
            console.log('📊 HTML translations completed:', {
                total: htmlElements.length,
                translated: htmlTranslatedCount,
                skipped: htmlSkippedCount
            });
        }
    }

    // 初期化チェック付きのラッパー関数
    function applyI18n() {
        // i18nextが初期化されていない場合、少し待ってから再試行
        if (!i18next.isInitialized) {
            console.warn('⚠️ i18next is not initialized yet, waiting...');
            // 最大5秒待機（100ms間隔で50回チェック）
            var waitCount = 0;
            var maxWait = 50;
            var checkInterval = setInterval(function() {
                waitCount++;
                if (i18next.isInitialized) {
                    clearInterval(checkInterval);
                    console.log('✅ i18next initialized, applying translations...');
                    // 翻訳処理を直接実行（再帰なし）
                    applyTranslations();
                } else if (waitCount >= maxWait) {
                    clearInterval(checkInterval);
                    console.error('❌ i18next initialization timeout after 5 seconds');
                }
            }, 100);
            return;
        }
        // 初期化済みの場合は直接翻訳処理を実行
        applyTranslations();
    }

    // グローバルに使いたければ export
    window.applyI18n = applyI18n;

    // -------------------------
    // 4. i18next 初期化
    // -------------------------
    if (typeof i18next === 'undefined' || typeof i18nextHttpBackend === 'undefined') {
        console.error('i18next / i18nextHttpBackend が読み込まれていません');
        return;
    }

    // 言語設定を保存（i18next初期化の成功/失敗に関わらず実行）
    // detectLang()で既に保存されているが、確実に保存するためここでも実行
    // ただし、パスやクエリパラメータから検出した言語を優先する
    var params = new URLSearchParams(location.search);
    var qLang = (params.get('lang') || '').toLowerCase();
    var pathFirst = (location.pathname.split('/')[1] || '').toLowerCase();
    var pathLang = (pathFirst === 'en' || pathFirst === 'ja') ? pathFirst : '';
    var storedLang = localStorage.getItem('lang');
    
    // パスやクエリパラメータから検出した言語を優先して保存
    // これにより、既存のlocalStorageの値が上書きされることを防ぐ
    if (qLang && supported.indexOf(qLang) >= 0) {
        localStorage.setItem('lang', qLang);
        lng = qLang; // i18next初期化用のlngも更新
    } else if (pathLang && supported.indexOf(pathLang) >= 0) {
        // パスから検出した言語は、既存のlocalStorageの値に関わらず保存
        localStorage.setItem('lang', pathLang);
        lng = pathLang; // i18next初期化用のlngも更新
    } else if (!storedLang) {
        // localStorageに値がない場合のみ、検出した言語を保存
        localStorage.setItem('lang', lng);
    }

    i18next
        .use(i18nextHttpBackend)
        .init({
            lng: lng,
            fallbackLng: 'en',
            ns: namespaces,
            defaultNS: pageName, // ページ固有の名前空間をデフォルトに
            fallbackNS: ['common'], // フォールバックはcommon
            backend: {
                loadPath: '/locales/{{lng}}/{{ns}}.json'
            }
        })
        .then(function () {
            // デバッグ: 初期化完了時の状態を確認
            console.log('✅ i18next initialized:', {
                language: i18next.language,
                isInitialized: i18next.isInitialized,
                namespaces: i18next.options.ns,
                defaultNS: i18next.options.defaultNS,
                storeData: i18next.store.data ? Object.keys(i18next.store.data) : 'no data',
                sampleCommon: i18next.t('nav.menu', { ns: 'common' }),
                sampleCoins: i18next.t('actions.send', { ns: 'coins' })
            });
            
            // 翻訳リソース読み込み完了後に適用
            applyI18n();
            
            // DOM 構築後にもう一回（遅れて出てきた要素にも対応）
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    setTimeout(function() {
                        applyI18n();
                    }, 200);
                });
            } else {
                setTimeout(function() {
                    applyI18n();
                }, 200);
            }
        })
        .catch(function (err) {
            console.error('i18next init error:', err);
            // エラー時でも最低限の翻訳適用を試みる
            try {
                applyI18n();
            } catch (e) {
                console.error('Failed to apply i18n:', e);
            }
        });

    // -------------------------
    // 5. 言語変更時
    // -------------------------
    i18next.on('languageChanged', function (newLng) {
        // パスやクエリパラメータから検出した言語を確認
        var params = new URLSearchParams(location.search);
        var qLang = (params.get('lang') || '').toLowerCase();
        var pathFirst = (location.pathname.split('/')[1] || '').toLowerCase();
        var pathLang = (pathFirst === 'en' || pathFirst === 'ja') ? pathFirst : '';
        
        // パスやクエリパラメータから検出した言語がある場合、それに一致する場合のみ保存
        // これにより、パスから検出した言語がi18nextの初期化で'en'に上書きされることを防ぐ
        if (qLang && supported.indexOf(qLang) >= 0 && newLng === qLang) {
            localStorage.setItem('lang', newLng);
        } else if (pathLang && supported.indexOf(pathLang) >= 0 && newLng === pathLang) {
            localStorage.setItem('lang', newLng);
        } else if (!qLang && !pathLang) {
            // パスやクエリパラメータがない場合のみ、i18nextの変更を保存
            localStorage.setItem('lang', newLng);
        }
        // それ以外の場合は、既存のlocalStorageの値を保持（パスから検出した言語を優先）
        
        applyI18n();
    });

    // 任意で、外から呼べる簡単な変更API
    window.changeLanguage = function (newLng) {
        if (supported.indexOf(newLng) < 0) return;
        i18next.changeLanguage(newLng);
    };
})();
