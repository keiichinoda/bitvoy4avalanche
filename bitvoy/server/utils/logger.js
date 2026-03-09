/**
 * backend/utils/logger.js
 * Structured logging utility
 */

const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
        winston.format.simple()
        ),
        transports: [
        new winston.transports.Console()
        ]
    });

module.exports = logger;