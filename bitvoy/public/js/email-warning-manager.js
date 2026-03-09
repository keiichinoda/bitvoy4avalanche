/**
 * Email Warning Manager - メール設定注意メッセージ管理
 * MPC初期化後、メール未設定の場合に注意メッセージを表示
 */

class EmailWarningManager {
    constructor() {
        this.warningBanner = document.getElementById('email-warning-banner');
        this.emailAlert = document.getElementById('setemailalert');
        this.emailSection1 = document.getElementById('setemailsection1');
        this.emailSection2 = document.getElementById('setemailsection2');
        this.emailInput = document.getElementById('email');
        this.authcodeInput = document.getElementById('authcode');
        
        this.isWarningDismissed = false;
        this.isEmailSetupComplete = false;
        
        this.init();
    }

    init() {
        // 初期状態では全て非表示
        this.hideAllEmailSections();
        
        // イベントリスナーの設定
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 認証コード入力フィールドの制限
        if (this.authcodeInput) {
            this.authcodeInput.addEventListener('input', (e) => {
                // 数字のみ許可
                e.target.value = e.target.value.replace(/[^0-9]/g, '');
                // 6桁まで制限
                if (e.target.value.length > 6) {
                    e.target.value = e.target.value.slice(0, 6);
                }
            });
        }

        // メール設定開始ボタン
        const startEmailSetupBtn = document.getElementById('start-email-setup-btn');
        if (startEmailSetupBtn) {
            startEmailSetupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startEmailSetup();
            });
        }

        // メール設定を後回しにするボタン
        const dismissEmailWarningBtn = document.getElementById('dismiss-email-warning-btn');
        if (dismissEmailWarningBtn) {
            dismissEmailWarningBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.dismissEmailWarning();
            });
        }

        // 認証コード送信ボタン
        const sendVerificationBtn = document.getElementById('send-verification-btn');
        if (sendVerificationBtn) {
            sendVerificationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.sendEmailVerification();
            });
        }

        // メール設定キャンセルボタン
        const cancelEmailSetupBtn = document.getElementById('cancel-email-setup-btn');
        if (cancelEmailSetupBtn) {
            cancelEmailSetupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.cancelEmailSetup();
            });
        }

        // メール設定完了ボタン
        const completeEmailSetupBtn = document.getElementById('complete-email-setup-btn');
        if (completeEmailSetupBtn) {
            completeEmailSetupBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.completeEmailSetup();
            });
        }

        // メール入力に戻るボタン
        const backToEmailInputBtn = document.getElementById('back-to-email-input-btn');
        if (backToEmailInputBtn) {
            backToEmailInputBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.backToEmailInput();
            });
        }

        // ウォレット復旧ボタン
        const restoreWalletBtn = document.getElementById('restore-wallet-btn');
        if (restoreWalletBtn) {
            restoreWalletBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.restoreWallet === 'function') {
                    window.restoreWallet();
                }
            });
        }

        // Emergency Recoveryボタン
        const emergencyRecoveryBtn = document.getElementById('emergency-recovery-btn-menu');
        if (emergencyRecoveryBtn) {
            emergencyRecoveryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.restoreWallet === 'function') {
                    window.restoreWallet();
                }
            });
        }

        // MPCウォレット初期化ボタン
        const initializeWalletBtn = document.getElementById('initialize-wallet-btn');
        if (initializeWalletBtn) {
            initializeWalletBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window.initializeWallet === 'function') {
                    window.initializeWallet();
                }
            });
        }

        // Log Outボタンはbitvoy-signout-init.jsで処理されるため、ここでは何もしない

        // Complete Log Outボタン
        const completeSignOutBtn = document.querySelector('.complete-signout');
        if (completeSignOutBtn) {
            completeSignOutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (window.bitvoyMPC) {
                    const confirmed = await window.bitvoyMPC.completeSignout();
                    if (confirmed) {
                        location.reload();
                    }
                }
            });
        }
    }

    /**
     * MPC初期化後のメール設定チェック
     */
    checkEmailSetupAfterMPCInit() {
        // メール設定チェックを無効化
        return;
        
        // if (this.isWarningDismissed || this.isEmailSetupComplete) {
        //     return;
        // }

        // // 認証済み判定（セッションストレージに masterId 等が保存されていることを前提）
        // const sessionMasterId = (typeof sessionStorage !== 'undefined') ? (sessionStorage.getItem('mpc.masterid') || '') : '';

        // // 認証情報が無ければチェックを行わない（サインアウト状態など）
        // if (!sessionMasterId) {
        //     return;
        // }

        // this.checkEmailSetupStatus(sessionMasterId);
        
        // エレメントを非表示に保つ
        if (this.warningBanner) {
            this.warningBanner.style.display = 'none';
        }
    }

    /**
     * メール設定状態を確認
     */
    async checkEmailSetupStatus(masterId) {
        try {
            const response = await fetch(`/mpcapi/email/setup/check?masterId=${masterId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            
            if (result.status === 'OK' && !result.isSetup) {
                // メール未設定の場合、注意メッセージを表示
                this.showEmailWarning();
            }
        } catch (error) {
            console.error('Email setup status check failed:', error);
            // エラーの場合も注意メッセージを表示（安全側）
            this.showEmailWarning();
        }
    }

    /**
     * メール設定注意メッセージを表示
     */
    showEmailWarning() {
        // メール警告の表示を無効化
        return;
        
        // if (this.warningBanner) {
        //     this.warningBanner.style.display = 'block';
        //     
        //     // スムーズな表示アニメーション
        //     this.warningBanner.style.opacity = '0';
        //     this.warningBanner.style.transform = 'translateY(-20px)';
        //     
        //     setTimeout(() => {
        //         this.warningBanner.style.transition = 'all 0.3s ease';
        //         this.warningBanner.style.opacity = '1';
        //         this.warningBanner.style.transform = 'translateY(0)';
        //     }, 100);
        // }
        
        // エレメントを非表示に保つ
        if (this.warningBanner) {
            this.warningBanner.style.display = 'none';
        }
    }

    /**
     * メール設定注意メッセージを非表示
     */
    hideEmailWarning() {
        if (this.warningBanner) {
            this.warningBanner.style.transition = 'all 0.3s ease';
            this.warningBanner.style.opacity = '0';
            this.warningBanner.style.transform = 'translateY(-20px)';
            
            setTimeout(() => {
                this.warningBanner.style.display = 'none';
            }, 300);
        }
    }

    /**
     * メール設定を開始
     */
    startEmailSetup() {
        this.hideEmailWarning();
        this.showEmailSection1();
    }

    /**
     * メール設定をキャンセル
     */
    cancelEmailSetup() {
        this.hideAllEmailSections();
        this.showEmailWarning(); // 注意メッセージを再表示
    }

    /**
     * メール設定を後回しにする
     */
    dismissEmailWarning() {
        this.isWarningDismissed = true;
        this.hideEmailWarning();
    }

    /**
     * メール設定セクション1を表示
     */
    showEmailSection1() {
        this.hideAllEmailSections();
        if (this.emailSection1) {
            this.emailSection1.style.display = 'block';
            this.emailSection1.style.opacity = '0';
            this.emailSection1.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                this.emailSection1.style.transition = 'all 0.3s ease';
                this.emailSection1.style.opacity = '1';
                this.emailSection1.style.transform = 'translateY(0)';
            }, 100);
        }
    }

    /**
     * メール設定セクション2を表示
     */
    showEmailSection2() {
        this.hideAllEmailSections();
        if (this.emailSection2) {
            this.emailSection2.style.display = 'block';
            this.emailSection2.style.opacity = '0';
            this.emailSection2.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                this.emailSection2.style.transition = 'all 0.3s ease';
                this.emailSection2.style.opacity = '1';
                this.emailSection2.style.transform = 'translateY(0)';
            }, 100);
        }
    }

    /**
     * メール設定セクション1に戻る
     */
    backToEmailInput() {
        this.showEmailSection1();
    }

    /**
     * 全てのメール設定セクションを非表示
     */
    hideAllEmailSections() {
        if (this.emailAlert) {
            this.emailAlert.style.display = 'none';
        }
        if (this.emailSection1) {
            this.emailSection1.style.display = 'none';
        }
        if (this.emailSection2) {
            this.emailSection2.style.display = 'none';
        }
    }

    /**
     * メール設定完了時の処理
     */
    onEmailSetupComplete() {
        this.isEmailSetupComplete = true;
        this.hideAllEmailSections();
        this.hideEmailWarning();
        
        // 成功メッセージを表示
        this.showSuccessMessage();
    }

    /**
     * 成功メッセージを表示
     */
    showSuccessMessage() {
        // 一時的な成功メッセージを表示
        const successDiv = document.createElement('div');
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        successDiv.innerHTML = `
            <h4 style="margin: 0 0 5px 0;">✅ Email settings completed</h4>
            <p style="margin: 0; font-size: 0.9em;">Emergency Recovery Enabled</p>
        `;
        
        document.body.appendChild(successDiv);
        
        // アニメーション表示
        setTimeout(() => {
            successDiv.style.opacity = '1';
            successDiv.style.transform = 'translateX(0)';
        }, 100);
        
        // 3秒後に自動削除
        setTimeout(() => {
            successDiv.style.opacity = '0';
            successDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(successDiv);
            }, 300);
        }, 3000);
    }

    /**
     * エラーメッセージを表示
     */
    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #f44336, #d32f2f);
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(244, 67, 54, 0.3);
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 300px;
        `;
        errorDiv.innerHTML = `
            <h4 style="margin: 0 0 5px 0;">❌ エラー</h4>
            <p style="margin: 0; font-size: 0.9em;">${message}</p>
        `;
        
        document.body.appendChild(errorDiv);
        
        // アニメーション表示
        setTimeout(() => {
            errorDiv.style.opacity = '1';
            errorDiv.style.transform = 'translateX(0)';
        }, 100);
        
        // 5秒後に自動削除
        setTimeout(() => {
            errorDiv.style.opacity = '0';
            errorDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(errorDiv);
            }, 300);
        }, 5000);
    }

    /**
     * メール認証コードを送信
     */
    async sendEmailVerification() {
        const email = this.emailInput ? this.emailInput.value : '';
        
        if (!email) {
            this.showErrorMessage('メールアドレスを入力してください');
            return;
        }

        try {
            const response = await fetch('/mpcapi/auth/email/send-verification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    masterId: window.bitvoyMPC ? window.bitvoyMPC.masterId : null
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showEmailSection2();
            } else {
                this.showErrorMessage(result.error || '認証コードの送信に失敗しました');
            }
        } catch (error) {
            console.error('Email verification request failed:', error);
            this.showErrorMessage('ネットワークエラーが発生しました');
        }
    }

    /**
     * メール設定を完了
     */
    async completeEmailSetup() {
        const email = this.emailInput ? this.emailInput.value : '';
        const authcode = this.authcodeInput ? this.authcodeInput.value : '';
        
        if (!email || !authcode) {
            this.showErrorMessage('メールアドレスと認証コードを入力してください');
            return;
        }

        try {
            const response = await fetch('/mpcapi/email/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    masterId: window.bitvoyMPC ? window.bitvoyMPC.masterId : null,
                    email: email,
                    authcode: authcode
                })
            });

            const result = await response.json();
            
            if (result.status === 'OK') {
                this.onEmailSetupComplete();
            } else {
                this.showErrorMessage(result.message || 'メール設定に失敗しました');
            }
        } catch (error) {
            console.error('Email setup failed:', error);
            this.showErrorMessage('ネットワークエラーが発生しました');
        }
    }
}

// グローバル関数として公開
window.EmailWarningManager = EmailWarningManager;

// インスタンスを作成
let emailWarningManager;

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
    emailWarningManager = new EmailWarningManager();
    
    // MPC初期化完了を監視
    const checkMPCInit = () => {
        if (window.bitvoyMPC && window.bitvoyMPC.isInitialized) {
            // MPC初期化完了後、少し待ってからメール設定チェック
            setTimeout(() => {
                if (emailWarningManager) {
                    emailWarningManager.checkEmailSetupAfterMPCInit();
                }
            }, 2000); // 2秒後にチェック
        } else {
            // MPC初期化完了まで待機
            setTimeout(checkMPCInit, 1000);
        }
    };
    
    // 初期チェック開始
    setTimeout(checkMPCInit, 1000);
}); 