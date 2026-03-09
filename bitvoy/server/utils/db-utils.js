/**
 * データベース接続ユーティリティ
 * 統一的なデータベース接続管理を提供
 */

/**
 * データベースクエリを実行（接続プール使用）
 * @param {string} query - SQLクエリ
 * @param {Array} params - クエリパラメータ
 * @returns {Promise<Object>} クエリ結果
 */
async function executeQuery(query, params = []) {
    try {
        /*
        console.log('[DB Utils] Executing query:', {
            query: query,
            params: params,
            dbClientExists: !!global.mpcServer?.dbClient
        });
        */

        const result = await global.mpcServer.dbClient.query(query, params);
       
        /*
        console.log('[DB Utils] Query result:', {
            rowCount: result.rows.length,
            hasRows: result.rows.length > 0,
            firstRow: result.rows.length > 0 ? result.rows[0] : null
        });
        */
        return result;
    } catch (error) {
        console.error('[DB Utils] Query execution failed:', error);
        throw error;
    }
}

/**
 * トランザクション内でクエリを実行
 * @param {Function} callback - トランザクション内で実行する関数
 * @returns {Promise<any>} コールバックの戻り値
 */
async function executeTransaction(callback) {
    const client = await global.mpcServer.dbClient.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB Utils] Transaction failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    executeQuery,
    executeTransaction
};
