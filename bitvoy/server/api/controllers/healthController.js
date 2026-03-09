// controllers/healthController.js
// ヘルスチェック用APIコントローラー
 
exports.health = (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
}; 