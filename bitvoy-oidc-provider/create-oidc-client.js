/**
 * BitVoy OIDCクライアント作成スクリプト
 * BitVoy側でOIDCクライアントを登録するためのユーティリティ
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');
const dotenv = require('dotenv');

// .envファイルを読み込み
dotenv.config();

// インタラクティブ入力の設定
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function createOIDCClient() {
    let connection;
    
    try {
        console.log('🚀 BitVoy OIDCクライアント作成を開始します...\n');
        
        // データベース設定
        const dbConfig = {
            host: process.env.BITVOY_DB_HOST || 'localhost',
            port: process.env.BITVOY_DB_PORT || 3306,
            user: process.env.BITVOY_DB_USER || 'root',
            password: process.env.BITVOY_DB_PASS || '',
            database: process.env.BITVOY_WALLET_DB_NAME || 'bitvoy',
            charset: 'utf8mb4',
            timezone: '+09:00'
        };
        
        console.log('📊 データベース設定:', {
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            database: dbConfig.database
        });
        
        // データベース接続
        try {
            connection = await mysql.createConnection(dbConfig);
            console.log('✅ データベース接続が確立されました\n');
        } catch (connectionError) {
            console.error('❌ データベース接続エラー:', connectionError.message);
            console.error('📋 接続設定:', {
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                database: dbConfig.database,
                password: dbConfig.password ? '***設定済み***' : '***未設定***'
            });
            console.error('💡 解決方法:');
            console.error('   1. .envファイルが存在するか確認してください');
            console.error('   2. データベース設定が正しいか確認してください');
            console.error('   3. MySQLサーバーが起動しているか確認してください');
            process.exit(1);
        }
        
        // クライアント情報の入力
        const clientName = await question('クライアント名を入力してください: ');
        const clientDescription = await question('クライアント説明を入力してください: ');
        const redirectUri = await question('リダイレクトURIを入力してください (例: http://localhost:3000/callback): ');
        
        // 追加のリダイレクトURI
        let additionalRedirectUris = [];
        while (true) {
            const additional = await question('追加のリダイレクトURIを入力してください (空で終了): ');
            if (!additional) break;
            additionalRedirectUris.push(additional);
        }
        
        // スコープの選択
        console.log('\n利用可能なスコープ:');
        console.log('1. openid (必須)');
        console.log('2. profile');
        console.log('3. email');
        console.log('4. address');
        console.log('5. phone');
        
        const scopeInput = await question('スコープを選択してください (カンマ区切り、例: 1,2,3): ');
        const scopeNumbers = scopeInput.split(',').map(s => s.trim());
        
        const scopeMap = {
            '1': 'openid',
            '2': 'profile',
            '3': 'email',
            '4': 'address',
            '5': 'phone'
        };
        
        const scopes = scopeNumbers.map(num => scopeMap[num]).filter(Boolean);
        if (!scopes.includes('openid')) {
            scopes.unshift('openid'); // openidは必須
        }
        
        // Webhook設定（オプション）
        console.log('\n📡 Webhook設定（オプション）:');
        const webhookUrl = await question('Webhook URLを入力してください (空でスキップ): ');
        let webhookSecret = null;
        if (webhookUrl && webhookUrl.trim() !== '') {
            webhookSecret = await question('Webhook署名用シークレットを入力してください (空でスキップ): ');
            if (webhookSecret && webhookSecret.trim() === '') {
                webhookSecret = null;
            }
        }
        
        // クライアントIDとシークレットの生成
        const clientId = crypto.randomBytes(16).toString('hex');
        const clientSecret = crypto.randomBytes(32).toString('hex');
        const hashedSecret = await bcrypt.hash(clientSecret, 12);
        
        // リダイレクトURI一覧
        const redirectUris = [redirectUri, ...additionalRedirectUris];
        
        // クライアントデータの準備
        const clientData = {
            client_id: clientId,
            client_secret: hashedSecret,
            client_name: clientName,
            client_description: clientDescription,
            redirect_uris: JSON.stringify(redirectUris),
            grant_types: JSON.stringify(['authorization_code', 'refresh_token']),
            response_types: JSON.stringify(['code']),
            scopes: JSON.stringify(scopes),
            token_endpoint_auth_method: 'client_secret_post',
            require_pkce: true,
            require_nonce: true,
            access_token_lifetime: 3600,
            refresh_token_lifetime: 2592000,
            id_token_lifetime: 3600,
            status: 'active',
            created_by: 'admin',
            webhook_url: webhookUrl && webhookUrl.trim() !== '' ? webhookUrl.trim() : null,
            webhook_secret: webhookSecret
        };
        
        // クライアントの登録
        const insertQuery = `
            INSERT INTO oidc_clients (
                client_id, client_secret, client_name, client_description,
                redirect_uris, grant_types, response_types, scopes,
                token_endpoint_auth_method, require_pkce, require_nonce,
                access_token_lifetime, refresh_token_lifetime, id_token_lifetime,
                status, created_by, webhook_url, webhook_secret
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.execute(insertQuery, [
            clientData.client_id,
            clientData.client_secret,
            clientData.client_name,
            clientData.client_description,
            clientData.redirect_uris,
            clientData.grant_types,
            clientData.response_types,
            clientData.scopes,
            clientData.token_endpoint_auth_method,
            clientData.require_pkce,
            clientData.require_nonce,
            clientData.access_token_lifetime,
            clientData.refresh_token_lifetime,
            clientData.id_token_lifetime,
            clientData.status,
            clientData.created_by,
            clientData.webhook_url,
            clientData.webhook_secret
        ]);
        
        console.log('\n✅ OIDCクライアントが正常に作成されました！\n');
        
        // 結果の表示
        console.log('📋 クライアント情報:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`クライアントID: ${clientId}`);
        console.log(`クライアントシークレット: ${clientSecret}`);
        console.log(`クライアント名: ${clientName}`);
        console.log(`説明: ${clientDescription}`);
        console.log(`リダイレクトURI: ${redirectUris.join(', ')}`);
        console.log(`スコープ: ${scopes.join(' ')}`);
        if (clientData.webhook_url) {
            console.log(`Webhook URL: ${clientData.webhook_url}`);
            console.log(`Webhookシークレット: ${clientData.webhook_secret ? '***設定済み***' : '未設定'}`);
        } else {
            console.log('Webhook URL: 未設定');
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // 環境変数ファイルの生成
        console.log('📝 相手ドメイン側の環境変数設定例:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`BITVOY_CLIENT_ID=${clientId}`);
        console.log(`BITVOY_CLIENT_SECRET=${clientSecret}`);
        console.log(`BITVOY_REDIRECT_URI=${redirectUri}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        console.log('⚠️  重要: クライアントシークレットは一度しか表示されません。');
        console.log('   安全な場所に保存してください。\n');
        
    } catch (error) {
        console.error('❌ エラーが発生しました:', error.message);
        
        // データベース関連のエラーの場合、詳細情報を表示
        if (error.code === 'ECONNREFUSED') {
            console.error('💡 データベース接続が拒否されました。MySQLサーバーが起動しているか確認してください。');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('💡 アクセスが拒否されました。ユーザー名とパスワードが正しいか確認してください。');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('💡 データベースが存在しません。データベースを作成してください。');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('💡 データベース接続がタイムアウトしました。ネットワーク接続を確認してください。');
        }
        
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
        rl.close();
    }
}

// スクリプトの実行
if (require.main === module) {
    createOIDCClient();
}

module.exports = { createOIDCClient }; 