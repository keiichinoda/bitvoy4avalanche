#!/usr/bin/env node

/**
 * BitVoy OIDC Provider - redirect_uris形式チェック・修正スクリプト
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function checkAndFixRedirectUris() {
    console.log('🔍 BitVoy OIDC Provider - redirect_uris形式チェック・修正');
    console.log('=' .repeat(60));
    
    const config = {
        host: process.env.BITVOY_DB_HOST || 'localhost',
        port: process.env.BITVOY_DB_PORT || 3306,
        user: process.env.BITVOY_DB_USER || 'root',
        password: process.env.BITVOY_DB_PASS || '',
        database: process.env.BITVOY_WALLET_DB_NAME || 'bitvoy',
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true,
        charset: 'utf8mb4'
    };
    
    try {
        console.log('🔄 データベース接続中...');
        const pool = mysql.createPool(config);
        const connection = await pool.getConnection();
        
        console.log('✅ データベース接続成功');
        
        // クライアント一覧を取得
        const [rows] = await connection.execute(
            'SELECT client_id, client_name, redirect_uris FROM oidc_clients'
        );
        
        console.log(`📋 クライアント数: ${rows.length}`);
        console.log('');
        
        let fixedCount = 0;
        
        for (const row of rows) {
            console.log(`🔍 クライアント: ${row.client_id} (${row.client_name})`);
            console.log(`   現在のredirect_uris: ${row.redirect_uris}`);
            
            let needsFix = false;
            let fixedUris = null;
            
            // 形式チェック
            if (typeof row.redirect_uris === 'string') {
                try {
                    JSON.parse(row.redirect_uris);
                    console.log('   ✅ JSON形式は正常');
                } catch (parseError) {
                    console.log('   ❌ JSON形式エラー:', parseError.message);
                    needsFix = true;
                    
                    // 修正: 単一のURIを配列に変換
                    if (row.redirect_uris.trim()) {
                        fixedUris = JSON.stringify([row.redirect_uris.trim()]);
                        console.log(`   🔧 修正後: ${fixedUris}`);
                    }
                }
            } else if (row.redirect_uris === null) {
                console.log('   ⚠️  NULL値');
                needsFix = true;
                fixedUris = JSON.stringify([]);
                console.log(`   🔧 修正後: ${fixedUris}`);
            } else {
                console.log(`   ⚠️  予期しない形式: ${typeof row.redirect_uris}`);
                needsFix = true;
                if (Array.isArray(row.redirect_uris)) {
                    fixedUris = JSON.stringify(row.redirect_uris);
                } else {
                    fixedUris = JSON.stringify([]);
                }
                console.log(`   🔧 修正後: ${fixedUris}`);
            }
            
            // 修正が必要な場合
            if (needsFix && fixedUris !== null) {
                try {
                    await connection.execute(
                        'UPDATE oidc_clients SET redirect_uris = ? WHERE client_id = ?',
                        [fixedUris, row.client_id]
                    );
                    console.log('   ✅ 修正完了');
                    fixedCount++;
                } catch (updateError) {
                    console.error('   ❌ 修正失敗:', updateError.message);
                }
            }
            
            console.log('');
        }
        
        console.log(`📊 修正完了: ${fixedCount}/${rows.length} クライアント`);
        
        connection.release();
        await pool.end();
        
        console.log('✅ チェック・修正処理完了');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ エラー:', error);
        process.exit(1);
    }
}

// スクリプト実行
checkAndFixRedirectUris();
