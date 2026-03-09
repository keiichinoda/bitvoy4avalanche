/**
 * bitvoy-signout-init.js - BitVoy signout functionality initialization
 * Lightweight signout implementation that doesn't require full BitVoy initialization
 */

(function() {
    'use strict';
    
    // Lightweight signout function (doesn't require BitVoyMPC, BitVoyWallet, etc.)
    function lightweightSignout() {
        try {
            console.log("🔄 Starting lightweight signout...");
            
            // セッションストレージをクリア
            sessionStorage.clear();
            
            // index.htmlへリダイレクト
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error("❌ Error during signout:", error);
            // エラーが発生してもリダイレクト
            window.location.href = 'index.html';
        }
    }
    
    // Initialize lightweight signout immediately
    window.bitvoy = { signout: lightweightSignout };
    console.log('✅ Lightweight signout initialized');
    
    // .signoutクラスを持つ要素にイベントリスナーを登録
    function setupSignoutButtons() {
        // 既存の要素にイベントリスナーを追加
        document.querySelectorAll('.signout').forEach(button => {
            // 既にイベントリスナーが登録されているかチェック
            if (!button.hasAttribute('data-signout-listener')) {
                button.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    lightweightSignout();
                });
                button.setAttribute('data-signout-listener', 'true');
            }
        });
    }
    
    // DOMContentLoadedまたは既に読み込み済みの場合
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupSignoutButtons);
    } else {
        setupSignoutButtons();
    }
    
    // 動的に追加される要素にも対応するため、MutationObserverを使用
    const observer = new MutationObserver(function(mutations) {
        setupSignoutButtons();
    });
    
    // ドキュメント全体を監視
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });
})();

