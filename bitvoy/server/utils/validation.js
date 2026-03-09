// validation.js
// 入力・データバリデーション用ユーティリティ

class ValidationUtils {
    // 例: 必須チェック
    static require(value, fieldName = 'value') {
        if (value === undefined || value === null || value === '') {
            throw new Error(`${fieldName} is required`);
        }
    }

    // 例: 型チェック
    static isString(value, fieldName = 'value') {
        if (typeof value !== 'string') {
            throw new Error(`${fieldName} must be a string`);
        }
    }

    // 例: 数値チェック
    static isNumber(value, fieldName = 'value') {
        if (typeof value !== 'number' || isNaN(value)) {
            throw new Error(`${fieldName} must be a valid number`);
        }
    }

    // 例: メールアドレス形式チェック
    static isEmail(value, fieldName = 'email') {
        const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
        if (!re.test(value)) {
            throw new Error(`${fieldName} must be a valid email address`);
        }
    }
}

module.exports = ValidationUtils; 