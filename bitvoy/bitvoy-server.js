/**
 * bitvoy-server.js - BitVoy MPC Server (JavaScript完全実装)
 * Passkey + Email認証 + JWT発行 + MPC Share A署名
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const { pool: mysqlPool } = require("./config/db-connection");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const winston = require("winston");
const axios = require("axios");
const ethers = require("ethers");

// Services
const PasskeyService = require("./server/services/PasskeyService");
const EmailService = require("./server/services/EmailService");
const JWTAuthorityService = require("./server/services/JWTAuthorityService");
const MPCService = require("./server/services/MPCService");
const GuardianService = require("./server/services/GuardianService");
const GuardianDiscoveryService = require("./server/services/GuardianDiscoveryService");
const WalletService = require("./server/services/WalletService");
const NFTService = require("./server/services/NFTService");
const SecurityService = require("./server/services/SecurityService");
const SwapService = require("./server/services/SwapService");
const CrossChainSwapService = require("./server/services/CrossChainSwapService");
const { simulateValidation, normalizeUserOpForSimulation, validateUserOpDirect, traceSimulateValidation, findRevertedCallPreferSmartAccount, classifyRevertFromTrace, decodeSmartAccountError } = require("./server/utils/entrypoint-simulate");
const { getHashToSign: getHashToSignUtil } = require('./server/utils/aa-utils');

class BitVoyMPCServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3001,
            host: config.host || "0.0.0.0",

            // Database configuration (MySQL)
            database: {
                host: config.dbHost || process.env.MYSQL_HOST || process.env.DB_HOST || "localhost",
                port: config.dbPort || parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || "3306", 10),
                database: config.dbName || process.env.MYSQL_DATABASE || process.env.DB_NAME || "bitvoy",
                user: config.dbUser || process.env.MYSQL_USER || process.env.DB_USER || "bitvoy",
                password: config.dbPassword || process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
            },

            // JWT configuration
            jwt: {
                privateKeyPath:
                    config.jwtPrivateKey || "./keys/jwt-private.pem",
                publicKeyPath: config.jwtPublicKey || "./keys/jwt-public.pem",
                algorithm: "ES256",
                issuer: process.env.JWT_ISSUER,
                audience: "guardian-network",
                expirySeconds: 300, // 5分
            },

            // Security configuration
            security: {
                corsOrigins: config.corsOrigins || [
                    process.env.BITVOY_SERVER_URL,
                ],
                rateLimitWindow: 15 * 60 * 1000, // 15分
                rateLimitMax: 100,
                sessionSecret:
                    config.sessionSecret || process.env.SESSION_SECRET,
                encryptionKey:
                    config.encryptionKey || process.env.ENCRYPTION_KEY,
            },

            // Guardian Network configuration
            guardian: {
                networkSize: process.env.GUARDIAN_NETWORK_SIZE || 1,
                nodesPerUser: process.env.GUARDIAN_NODES_PER_USER || 1,
                backupNodesPerUser:
                    process.env.GUARDIAN_BACKUP_NODES_PER_USER || 0,
                healthCheckInterval:
                    process.env.GUARDIAN_HEALTH_CHECK_INTERVAL || 30000,
                failoverThreshold:
                    process.env.GUARDIAN_FAILOVER_THRESHOLD || 0.7,
            },

            // MPC configuration
            mpc: {
                threshold: 2,
                totalParties: 3,
                frostWasmPath: config.frostWasmPath || "./rust/frost-wasm/pkg-node/frost_wasm.js",
                sessionTimeout: 300000, // 5分
                maxRetries: 3,
                retryDelay: 1000,
            },

            // Bootstrap Node configuration
            bootstrap: {
                isBootstrapNode:
                    config.isBootstrapNode ||
                    process.env.IS_BOOTSTRAP_NODE === "true",
                bootstrapNodeId:
                    config.bootstrapNodeId || process.env.BOOTSTRAP_NODE_ID,
                bootstrapEndpoint:
                    config.bootstrapEndpoint || process.env.BOOTSTRAP_ENDPOINT,
                region:
                    config.region || process.env.BOOTSTRAP_REGION || "unknown",
            },

            // Account Abstraction (AA) / Smart Account設定
            // BitVoyConfig.jsと同様の構造で環境変数から読み込む
            sa: {
                polygon: {
                    mainnet: {
                        entryPointAddress: process.env.POLYGON_MAINNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.POLYGON_MAINNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.POLYGON_MAINNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.POLYGON_MAINNET_RPC_URL || null,
                        factoryV2Address: process.env.POLYGON_MAINNET_FACTORY_V2_ADDRESS || null, // IBUOv2 token-agnostic factory
                        allowedTokens: {
                            USDC: {
                                factoryAddress: process.env.POLYGON_MAINNET_FACTORY_ADDRESS_USDC || null,
                                tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' // Polygon Mainnet USDC (Circle native)
                            },
                            JPYC: {
                                factoryAddress: process.env.POLYGON_MAINNET_FACTORY_ADDRESS_JPYC || null,
                                tokenAddress: '0x6AE7Dfc73E0dDE2aa99ac063DcF7e8A63265108c' // Polygon Mainnet JPYC
                            }
                        }
                    },
                    testnet: {
                        entryPointAddress: process.env.POLYGON_TESTNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.POLYGON_TESTNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.POLYGON_TESTNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.POLYGON_TESTNET_RPC_URL || null,
                        factoryV2Address: process.env.POLYGON_TESTNET_FACTORY_V2_ADDRESS || null, // IBUOv2 token-agnostic factory
                        allowedTokens: {
                            USDC: {
                                factoryAddress: process.env.POLYGON_TESTNET_FACTORY_ADDRESS_USDC || null,
                                tokenAddress: '0x2c9410D676938575c9285496e1C24EB803309584' // Polygon Amoy Testnet USDC (BitVoy Original)
                            },
                            JPYC: {
                                factoryAddress: process.env.POLYGON_TESTNET_FACTORY_ADDRESS_JPYC || null,
                                tokenAddress: '0xf72d15468a94871150AEDa9371060bf21783f3a7' // Polygon Amoy Testnet JPYC (BitVoy Original)
                            }
                        }
                    }
                },
                // Ethereum設定（将来の拡張用）
                ethereum: {
                    mainnet: {
                        entryPointAddress: process.env.ETHEREUM_MAINNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.ETHEREUM_MAINNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.ETHEREUM_MAINNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.ETHEREUM_MAINNET_RPC_URL || null,
                        allowedTokens: null
                    },
                    testnet: {
                        entryPointAddress: process.env.ETHEREUM_TESTNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.ETHEREUM_TESTNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.ETHEREUM_TESTNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.ETHEREUM_TESTNET_RPC_URL || null,
                        allowedTokens: null
                    }
                },
                // Avalanche設定
                avalanche: {
                    mainnet: {
                        entryPointAddress: process.env.AVALANCHE_MAINNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.AVALANCHE_MAINNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.AVALANCHE_MAINNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.AVALANCHE_MAINNET_RPC_URL || null,
                        factoryV2Address: process.env.AVALANCHE_MAINNET_FACTORY_V2_ADDRESS || null,
                        allowedTokens: {
                            USDC: {
                                factoryAddress: process.env.AVALANCHE_MAINNET_FACTORY_ADDRESS_USDC || null,
                                tokenAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' // Avalanche Mainnet USDC (Circle native)
                            },
                            JPYC: {
                                factoryAddress: process.env.AVALANCHE_MAINNET_FACTORY_ADDRESS_JPYC || null,
                                tokenAddress: '0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29' // Avalanche Mainnet JPYC (JPY Coin)
                            }
                        }
                    },
                    testnet: {
                        entryPointAddress: process.env.AVALANCHE_TESTNET_ENTRY_POINT_ADDRESS || null,
                        opSignerAddress: process.env.AVALANCHE_TESTNET_OP_SIGNER_ADDRESS || null,
                        bundlerRpcUrl: process.env.AVALANCHE_TESTNET_BUNDLER_RPC_URL || null,
                        rpcUrl: process.env.AVALANCHE_TESTNET_RPC_URL || null,
                        factoryV2Address: process.env.AVALANCHE_TESTNET_FACTORY_V2_ADDRESS || null,
                        allowedTokens: {
                            USDC: {
                                factoryAddress: process.env.AVALANCHE_TESTNET_FACTORY_ADDRESS_USDC || null,
                                tokenAddress: '0x5425890298aed601595a70AB815c96711a31Bc65' // Avalanche Fuji Testnet USDC (Circle)
                            },
                            JPYC: {
                                factoryAddress: process.env.AVALANCHE_TESTNET_FACTORY_ADDRESS_JPYC || null,
                                tokenAddress: process.env.AVALANCHE_TESTNET_JPYC_ADDRESS || null // Fuji JPYC (set when deployed)
                            }
                        }
                    }
                }
            },
        };

        this.app = express();
        this.db = null;
        this.logger = this.setupLogger();
        this.frostWasm = null; // frost_wasmインスタンス
        this.mpcServer = null; // MPC Serverインスタンス

        // AA Gas presets — loaded from aa_gas_presets table at startup; fall back to hardcoded.
        // V1 (A_V1) removed: only V2 Smart Accounts are supported.
        this.GAS_PRESET = {
            A_V2: { vgl: "0x50000",  cgl: "0x28000", pvg: "0x10000" }, // deployed V2 SA
            B:    { vgl: "0x250000", cgl: "0x80000", pvg: "0x40000" }, // initCode (deploy)
        };

        // Initialize services
        this.webauthnService = new PasskeyService(this.config, this.logger);

        // デバッグ: PasskeyServiceのisHealthyメソッド確認
        if (typeof this.webauthnService.isHealthy !== "function") {
            this.logger.error("PasskeyService isHealthy method not found!");
            this.logger.error(
                "PasskeyService methods:",
                Object.getOwnPropertyNames(
                    Object.getPrototypeOf(this.webauthnService),
                ),
            );
        } else {
            this.logger.info("✅ PasskeyService isHealthy method found");
        }

        this.emailService = new EmailService(this.config, this.logger);
        this.jwtService = new JWTAuthorityService(this.config, this.logger);
        this.mpcService = new MPCService(this.config, this.logger);
        this.guardianService = new GuardianService(this.config, this.logger);

        // GuardianDiscoveryServiceにブートストラップ設定を渡す
        const discoveryConfig = {
            ...this.config,
            isBootstrapNode: this.config.bootstrap.isBootstrapNode,
            bootstrapNodeId: this.config.bootstrap.bootstrapNodeId,
            bootstrapEndpoint: this.config.bootstrap.bootstrapEndpoint,
            region: this.config.bootstrap.region,
            db: this.db, // データベース接続を追加
        };
        this.guardianDiscoveryService = new GuardianDiscoveryService(
            discoveryConfig,
            this.logger,
            this.app // メインのExpressアプリを渡す
        );

        this.walletService = WalletService;
        this.nftService = NFTService;
        this.securityService = SecurityService;
        this.swapService = new SwapService(this.config, this.logger);
        this.crossChainSwapService = new CrossChainSwapService(this.config, this.logger);

        // Server state
        this.stats = {
            startTime: Date.now(),
            totalRequests: 0,
            webauthnChallenges: 0,
            jwtTokensIssued: 0,
            mpcSignatures: 0,
            guardiansConnected: 0,
        };
    }

    /**
     * サーバー初期化・起動
     */
    async start() {
        try {
            this.logger.info("Starting BitVoy MPC Server...");

            // frost_wasm動的読み込み
            await this.loadFrostWasm();

            // データベース接続
            await this.connectDatabase();

            // AA Gas presets from DB (non-fatal if table not yet migrated)
            await this.loadGasPresets();

            // 各サービス初期化
            await this.initializeServices();

            // Express設定
            this.setupExpress();

            // ルート設定
            this.setupRoutes();

            // MPC/WASM をルーティング受付前に初期化（全ワーカーでawait）
            const mpcEndpoints = require('./server/mpc-endpoints');
            await mpcEndpoints.initializeMPC();

            // Guardian Network初期化
            await this.initializeGuardianNetwork();

            // サーバー起動（初期化済みの状態でlisten開始）
            const port = process.env.PORT || 4000;
            const host = process.env.HOST || 'localhost';
            
            this.server = this.app.listen(port, '::', () => {
                console.log(`🚀 BitVoy Server running on http://${host}:${port}`);
                console.log(`📊 Health check: http://${host}:${port}/health`);
                console.log(`🔧 Admin panel: http://${host}:${port}/admin`);
                console.log(`📱 MPC Wallet: http://${host}:${port}/index-mpc.html`);
                console.log(`❄️ frost_wasm: ${this.frostWasm ? 'Available' : 'Fallback mode'}`);
            });

            // Graceful shutdown設定
            this.setupGracefulShutdown();

            // 定期タスク開始
            this.startPeriodicTasks();
        } catch (error) {
            this.logger.error("Failed to start BitVoy Server:", error);
            process.exit(1);
        }
    }

    /**
     * Winston Logger設定
     */
    setupLogger() {
        return winston.createLogger({
            level: process.env.LOG_LEVEL || "info",
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json(),
            ),
            defaultMeta: {
                service: "bitvoy-server",
                version: "2.1.0",
            },
            transports: [
                new winston.transports.File({
                    filename: "logs/bitvoy-error.log",
                    level: "error",
                }),
                new winston.transports.File({
                    filename: "logs/bitvoy-combined.log",
                }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple(),
                    ),
                }),
            ],
        });
    }

    /**
     * データベース接続
     */
    async connectDatabase() {
        try {
            // MySQLプールを使用（config/db-connection.jsから取得）
            this.db = mysqlPool;

            // 接続テスト
            await this.db.query("SELECT NOW() AS now");

            this.logger.info("✅ Database connected successfully");

            // データベース初期化
            await this.initializeDatabase();
        } catch (error) {
            this.logger.error("❌ Database connection failed:", error);
            throw error;
        }
    }

    /**
     * データベース初期化
     * Note: Tables are assumed to already exist, so this function does nothing
     */
    async initializeDatabase() {
        // テーブルは既に存在するため、何もしない
        this.logger.info("✅ Database initialization skipped (tables already exist)");
        
        // NonceManagementServiceを初期化
        try {
            const WalletService = require('./server/services/WalletService');
            WalletService.initNonceService(this.db);
        } catch (error) {
            this.logger.warn("⚠️ NonceService initialization failed (non-fatal):", error.message);
        }
        
        return;
    }

    /**
     * 各サービス初期化
     */
    async initializeServices() {
        try {
            await this.webauthnService.init(this.db);
            
            // EmailServiceの初期化（エラーが発生しても続行、またはスキップ）
            const skipSmtp = String(process.env.SKIP_SMTP || '').toLowerCase() === 'true' || process.env.SKIP_SMTP === '1';
            if (skipSmtp) {
                this.logger.warn("⚠️ SKIP_SMTP is enabled. Email service initialization skipped.");
            } else {
                try {
                    await this.emailService.init(this.db);
                    this.logger.info("✅ Email Service initialized successfully");
                } catch (error) {
                    this.logger.error("❌ Email Service initialization failed, but continuing...", error);
                    this.logger.warn("⚠️ Email features will be unavailable, but OIDC authentication will continue to work");
                }
            }
            
            await this.jwtService.init(this.db);
            
            // MPCServiceにfrost_wasmインスタンスを設定
            this.mpcService.setFrostWasm(this.frostWasm);
            await this.mpcService.init(this.db);
            
            // MPC Server初期化
            const MPCServer = require('./server/mpc-server');
            this.mpcServer = new MPCServer(this.db, this.logger);
            global.mpcServer = this.mpcServer; // グローバルアクセス用
            
            await this.guardianService.init(this.db);
            
            // SwapServiceの初期化
            await this.swapService.init(this.db);
            
            // CrossChainSwapServiceの初期化
            await this.crossChainSwapService.init(this.db);
            
            // GuardianDiscoveryServiceの初期化
            this.logger.info("🔍 Initializing Guardian Discovery Service...");
            try {
                const discoveryInitResult = await this.guardianDiscoveryService.init(this.db);
                if (!discoveryInitResult) {
                    this.logger.warn("⚠️ Guardian Discovery Service initialization failed, but continuing...");
                } else {
                    this.logger.info("✅ Guardian Discovery Service initialized successfully");
                }
                
                // GuardianDiscoveryServiceの初期化確認（簡略化）
                this.logger.info("✅ GuardianDiscoveryService ready for route mounting");
            } catch (error) {
                this.logger.error("❌ Guardian Discovery Service initialization error:", error);
                this.logger.error("Error details:", error.stack);
            }

            this.logger.info("✅ All services initialized successfully");
        } catch (error) {
            this.logger.error("❌ Service initialization failed:", error);
            throw error;
        }
    }

    /**
     * Express設定
     */
    setupExpress() {
        // セキュリティミドルウェア
        this.app.use(
            helmet({
                contentSecurityPolicy: {
                    directives: {
                        defaultSrc: ["'self'"],
                        styleSrc: ["'self'", "'unsafe-inline'"],
                        scriptSrc: [
                            "'self'",
                            "'unsafe-inline'",
                            "'unsafe-eval'",
                        ], // TODO: delete unsafe-* for production
                        connectSrc: ["'self'", "blob:", "data:", process.env.BITVOY_SERVER_URL, "ws://localhost:*", process.env.BITVOY_SERVER_URL?.replace(/^https:/, 'wss:'), "wss://relay.walletconnect.com", "https://relay.walletconnect.com", "https://pulse.walletconnect.org", "https://verify.walletconnect.org"], // allow OP domain for OIDC Pay, local WebSocket for P2 server, WalletConnect relay, telemetry and verification servers
                        workerSrc: ["'self'", "blob:"],
                        imgSrc: ["'self'", "data:", "https:"],
                        fontSrc: ["'self'"],
                        objectSrc: ["'none'"],
                        mediaSrc: ["'self'"],
                        frameSrc: ["'none'"],
                        formAction: ["'self'", process.env.BITVOY_SERVER_URL],
                    },
                },
                hsts: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true,
                },
            }),
        );

        // CORS設定
        this.app.use(
            cors({
                origin: this.config.security.corsOrigins,
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowedHeaders: [
                    "Content-Type",
                    "Authorization",
                    "X-Requested-With",
                    "X-Guardian-Session",
                    "x-guardian-session", // 小文字バージョンも許可（ブラウザが正規化する場合がある）
                ],
            }),
        );

        // レート制限
        const generalLimiter = rateLimit({
            windowMs: this.config.security.rateLimitWindow,
            max: this.config.security.rateLimitMax,
            message: "Too many requests from this IP",
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use("/api/", generalLimiter);

        // staticコンテンツ
        this.app.use(express.static(path.join(__dirname, "public")));
        this.app.use("/js", express.static(path.join(__dirname, "js")));
        this.app.use("/css", express.static(path.join(__dirname, "css")));
        this.app.use("/images", express.static(path.join(__dirname, "images")));
        this.app.use("/jspkg", express.static(path.join(__dirname, "jspkg")));

        // 特別なレート制限（認証系）
        const authLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15分
            max: 20, // 20回/15分
            message: "Too many authentication attempts",
        });
        this.app.use("/api/auth/", authLimiter);

        // その他のミドルウェア
        this.app.use(compression());
        this.app.use(express.json({ limit: "10mb" }));
        this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

        // セッション管理（簡易版）
        this.app.use((req, res, next) => {
            // クッキーまたはヘッダーからmasterIdを取得
            req.masterId = req.cookies?.masterId || req.headers["x-master-id"];
            next();
        });

        // エンドポイント名ロガー
        this.app.use((req, res, next) => {
            console.log(`[Server] Endpoint called: ${req.method} ${req.url}`);
            next();
        });

        // リクエストロガー
        this.app.use((req, res, next) => {
            this.stats.totalRequests++;
            const start = Date.now();

            res.on("finish", () => {
                const duration = Date.now() - start;
                this.logger.info("HTTP Request", {
                    method: req.method,
                    url: req.url,
                    status: res.statusCode,
                    //duration: duration,
                    //ip: req.ip,
                    //userAgent: req.get("User-Agent"),
                });
            });

            next();
        });
    }

    /**
     * API ルート設定
     */
    setupRoutes() {
        // ヘルスチェック
        this.app.post("/mpcapi/health", (req, res) => {
            res.json({
                status: "healthy",
                version: "2.1.0",
                uptime: Date.now() - this.stats.startTime,
                services: {
                    webauthn: this.webauthnService.isHealthy(),
                    email: this.emailService.isHealthy(),
                    jwt: this.jwtService.isHealthy(),
                    mpc: this.mpcService.isHealthy(),
                    guardian: this.guardianService.isHealthy(),
                    guardianDiscovery:
                        this.guardianDiscoveryService.getStats().healthyNodes >
                        0,
                },
                guardianNetwork: {
                    discoveredNodes:
                        this.guardianDiscoveryService.getStats()
                            .registeredNodes,
                    healthyNodes:
                        this.guardianDiscoveryService.getStats().healthyNodes,
                    bootstrapNodes:
                        this.guardianDiscoveryService.getStats().bootstrapNodes
                            .length,
                    environment: this.guardianService.currentEnvironment,
                },
                stats: this.stats,
                timestamp: Date.now(),
            });
        });

        // 詳細ヘルスチェック
        this.app.post("/mpcapi/health/detailed", async (req, res) => {
            try {
                const detailedHealth = await this.performDetailedHealthCheck();
                res.json(detailedHealth);
            } catch (error) {
                this.logger.error("Detailed health check failed:", error);
                res.status(500).json({
                    status: "unhealthy",
                    error: error.message,
                    timestamp: Date.now(),
                });
            }
        });

        // Guardian Node接続検証API
        this.app.post("/mpcapi/mpc/verify-connection", async (req, res) => {
            try {
                const { masterId } = req.body;

                if (!masterId) {
                    return res.status(400).json({ error: "Missing masterId" });
                }

                const verificationResult =
                    await this.verifyGuardianConnections(masterId);

                res.json({
                    success: true,
                    guardianNodes: verificationResult.guardianNodes,
                    connectionStatus: verificationResult.status,
                });
            } catch (error) {
                this.logger.error(
                    "Guardian connection verification failed:",
                    error,
                );
                res.status(500).json({
                    error: "Guardian verification failed",
                    details: error.message,
                });
            }
        });

        // サーバー情報
        this.app.post("/mpcapi/info", (req, res) => {
            const discoveryStats = this.guardianDiscoveryService.getStats();

            res.json({
                name: "BitVoy MPC Server",
                version: "2.1.0",
                features: {
                    webauthn: true,
                    email_auth: true,
                    jwt_authority: true,
                    mpc_signing: true,
                    guardian_network: true,
                    guardian_discovery: true,
                },
                supported_chains: ["BTC", "ETH", "SOL", "TON"],
                guardian_network: {
                    total_nodes: discoveryStats.registeredNodes,
                    healthy_nodes: discoveryStats.healthyNodes,
                    bootstrap_nodes: discoveryStats.bootstrapNodes.length,
                    nodes_per_user: this.config.guardian.nodesPerUser,
                    health_check_interval:
                        this.config.guardian.healthCheckInterval,
                    discovery_mode:
                        this.guardianService.currentEnvironment === "production"
                            ? "P2P"
                            : "Legacy",
                },
            });
        });

        // Passkey 認証 API
        this.setupPasskeyRoutes();

        // Email 認証 API
        this.setupEmailRoutes();

        // JWT Authority API
        this.setupJWTRoutes();

        // MPC Routes設定 - 真の分散鍵生成対応
        this.setupMPCRoutes();

        // Guardian Network API
        this.setupGuardianRoutes();

        // MPC Recovery API
        this.setupRecoveryRoutes();

        // Wallet API
        this.setupWalletRoutes();

        // NFT API
        this.setupNFTRoutes();

        // Smart Account API
        this.setupSmartAccountRoutes();

        // Security API
        this.setupSecurityRoutes();

        // Proxy API
        this.setupProxyRoutes();

        // Guardian Discovery Service API（初期化後にマウント）
        // 注意: GuardianDiscoveryServiceの初期化が完了してからマウント
        this.setupGuardianDiscoveryRoutes();

        // エラーハンドリング
        this.app.use((error, req, res, next) => {
            this.logger.error("API Error:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message:
                    process.env.NODE_ENV === "development"
                        ? error.message
                        : "Something went wrong",
                timestamp: Date.now(),
            });
        });

        // 404ハンドリング
        this.app.use((req, res) => {
            res.status(404).json({
                error: "Not Found",
                message: "The requested endpoint does not exist",
                timestamp: Date.now(),
            });
        });
    }

    /**
     * パスキー認証ルート
     */
    setupPasskeyRoutes() {

        // ユーザー登録エンドポイント（BitVoy.js用）
        // 注意: webauthn_credentialは送信しない（セキュリティ上の理由）
        // パスキー登録は別途 /mpcapi/auth/webauthn/register/begin と /mpcapi/auth/webauthn/register/complete で行う
        this.app.post(
            `/mpcapi/user/register`,
            async (req, res) => {
                try {
                    const { masterId } = req.body;

                    if (!masterId) {
                        return res.status(400).json({ 
                            success: false, 
                            error: "Missing masterId" 
                        });
                    }

                    this.logger.info('ユーザー登録リクエスト', { 
                        masterId
                    });

                    // 既存ユーザーをチェック
                    const existingUser = await this.db.query(
                        'SELECT master_id FROM user_accounts WHERE master_id = ?',
                        [masterId]
                    );

                    let isNewUser = false;
                    const existingRows = Array.isArray(existingUser) ? existingUser : (existingUser[0] ? [existingUser[0]] : []);
                    if (existingRows.length > 0) {
                        this.logger.info('既存ユーザーが見つかりました', { masterId });
                    } else {
                        // 新規ユーザーを作成（UUIDを生成）
                        const crypto = require('crypto');
                        const userId = crypto.randomUUID();
                        await this.db.query(
                            'INSERT INTO user_accounts (id, master_id, email_address, email_verified, webauthn_registered, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
                            [userId, masterId, null, false, false]
                        );
                        isNewUser = true;
                        this.logger.info('新規ユーザー作成完了', { masterId });
                    }

                    // 注意: webauthn_credentialは送信しない
                    // パスキー登録は別途 /mpcapi/auth/webauthn/register/begin と /mpcapi/auth/webauthn/register/complete で行う
                    // サーバー側で検証して公開鍵のみを保存する

                    this.logger.info('ユーザー登録完了', { 
                        masterId, 
                        isNewUser
                    });
                    res.json({
                        success: true,
                        message: isNewUser ? "User registered successfully" : "User already exists",
                        existing: !isNewUser
                    });

                } catch (error) {
                    this.logger.error('ユーザー登録エラー:', error);
                    res.status(500).json({
                        success: false,
                        error: "User registration failed",
                        details: error.message
                    });
                }
            }
        );

        // クレデンシャル情報取得（OIDC認証用）
        this.app.post(
            `/mpcapi/webauthn/get-credential`,
            async (req, res) => {
                try {
                    const { credential_id, master_id } = req.body;

                    if (!credential_id || !master_id) {
                        return res.status(400).json({ 
                            success: false,
                            error: "Missing credential_id or master_id" 
                        });
                    }

                    this.logger.info(`🔍 クレデンシャル取得: ${credential_id}`);

                    // クレデンシャル情報を取得
                    const credential = await this.webauthnService.getCredentialById(credential_id);

                    if (!credential) {
                        this.logger.info(`❌ クレデンシャルが見つかりません: ${credential_id}`);
                        return res.json({
                            success: false,
                            message: "Credential not found"
                        });
                    }

                    // master_idの一致確認
                    if (credential.master_id !== master_id) {
                        this.logger.warn(`❌ master_id不一致: ${credential_id}`);
                        return res.json({
                            success: false,
                            message: "Credential master_id mismatch"
                        });
                    }

                    this.logger.info(`✅ クレデンシャル取得成功: ${credential_id}`);
                    
                    // public_keyをArray形式に変換（Uint8Arrayの場合はArrayに変換、既にArrayの場合はそのまま）
                    let publicKeyArray;
                    if (credential.public_key instanceof Uint8Array) {
                        publicKeyArray = Array.from(credential.public_key);
                    } else if (Array.isArray(credential.public_key)) {
                        publicKeyArray = credential.public_key;
                    } else if (typeof credential.public_key === 'string') {
                        // JSON文字列の場合はそのまま（webauthn_credentialsテーブルから取得した形式）
                        try {
                            publicKeyArray = JSON.parse(credential.public_key);
                        } catch (e) {
                            // パースに失敗した場合はそのまま
                            publicKeyArray = credential.public_key;
                        }
                    } else {
                        publicKeyArray = Array.from(new Uint8Array(credential.public_key));
                    }
                    
                    res.json({
                        success: true,
                        credential: {
                            credential_id: credential.credential_id,
                            public_key: publicKeyArray, // Array形式で返す
                            counter: credential.counter,
                            is_active: credential.is_active
                        }
                    });
                } catch (error) {
                    this.logger.error("クレデンシャル取得エラー:", error);
                    res.status(500).json({
                            success: false,
                        error: "Internal server error",
                        details: error.message
                    });
                }
            }
        );

        // WebAuthnクレデンシャル取得エンドポイント（公開鍵ベース）
        this.app.post(
            `/mpcapi/webauthn/get-credential-by-public-key`,
            async (req, res) => {
                try {
                    const { public_key, master_id } = req.body;

                    if (!public_key || !master_id) {
                        return res.status(400).json({ 
                            success: false,
                            error: "Missing public_key or master_id" 
                        });
                    }

                    this.logger.info(`🔑 公開鍵ベースでクレデンシャル検索: ${master_id}`);

                    // 公開鍵でクレデンシャル情報を取得
                    const credential = await this.webauthnService.getCredentialByPublicKey(public_key, master_id);

                    if (!credential) {
                        this.logger.info(`❌ 公開鍵に一致するクレデンシャルが見つかりません: ${master_id}`);
                        return res.json({
                            success: false,
                            message: "Credential not found for public key"
                        });
                    }

                    this.logger.info(`✅ 公開鍵ベースでクレデンシャル取得成功: ${credential.id}`);
                    res.json({
                        success: true,
                        credential: {
                            id: credential.id,
                            master_id: credential.master_id, // セキュリティ強化: master_idを含める
                            public_key: credential.public_key,
                            counter: credential.counter,
                            is_active: credential.is_active
                        }
                    });
                } catch (error) {
                    this.logger.error("公開鍵ベースクレデンシャル取得エラー:", error);
                    res.status(500).json({
                        success: false,
                        error: "Internal server error",
                        details: error.message
                    });
                }
            }
        );

        // ==========================================
        // 初期化フロー（新仕様）
        // ==========================================

        // 初期化フロー: 登録開始
        this.app.post(
            `/auth/init/start`,
            async (req, res) => {
                try {
                    const { displayName } = req.body;

                    // リクエストのOriginからRP IDを決定
                    const origin = req.headers.origin || req.headers.referer;
                    let rpId = 'localhost';
                    if (origin) {
                        try {
                            const url = new URL(origin);
                            rpId = url.hostname === 'localhost' || url.hostname === '127.0.0.1' 
                                ? 'localhost' 
                                : url.hostname;
                        } catch (e) {
                            // URL解析に失敗した場合はデフォルト値を使用
                            this.logger.warn('Failed to parse origin:', origin);
                        }
                    }

                    const options = await this.webauthnService.generateInitRegistrationOptions(
                        displayName || 'BitVoy User',
                        rpId // RP IDを渡す
                    );

                    res.json(options);
                } catch (error) {
                    this.logger.error('Init registration start failed:', error);
                    res.status(500).json({
                        error: 'Init registration failed',
                        details: error.message
                    });
                }
            }
        );

        // 初期化フロー: 登録完了
        this.app.post(
            `/auth/init/finish`,
            async (req, res) => {
                try {
                    const { credential, challengeKey } = req.body;

                    if (!credential || !challengeKey) {
                        return res.status(400).json({ error: 'Missing required fields' });
                    }

                    // リクエストのOriginを取得
                    const origin = req.headers.origin || req.headers.referer;
                    let expectedOrigin = this.webauthnService.origin;
                    if (origin) {
                        try {
                            const url = new URL(origin);
                            expectedOrigin = url.origin;
                        } catch (e) {
                            // URL解析に失敗した場合はデフォルト値を使用
                            this.logger.warn('Failed to parse origin:', origin);
                        }
                    }

                    const result = await this.webauthnService.verifyInitRegistration(
                        credential,
                        challengeKey,
                        expectedOrigin
                    );

                    if (result?.verified && result.masterId) {
                        if (!this.jwtService) {
                            throw new Error('JWT service is not initialized');
                        }

                        const jwtResult = await this.jwtService.issueServerJWT(
                            result.masterId,
                            'wallet_register',
                            {
                                source: 'init_flow',
                                authMethods: ['webauthn_registration']
                            }
                        );

                        if (!jwtResult.success) {
                            this.logger.error('Failed to issue wallet_register JWT during init finish', {
                                masterId: result.masterId,
                                error: jwtResult.error
                            });
                            return res.status(500).json({
                                error: 'Failed to issue wallet registration JWT',
                                details: jwtResult.error
                            });
                        }

                        res.json({
                            masterId: result.masterId,
                            credentialId: result.credentialId,
                            walletRegisterJWT: jwtResult.token,
                            walletRegisterJWTExpiresAt: jwtResult.expiresAt,
                            jwtRemainingQuota: jwtResult.remainingQuota
                        });
                    } else {
                        res.status(400).json({
                            error: 'Init registration verification failed',
                            details: result.error
                        });
                    }
                } catch (error) {
                    this.logger.error('Init registration finish failed:', error);
                    res.status(500).json({
                        error: 'Init registration failed',
                        details: error.message
                    });
                }
            }
        );

        // ==========================================
        // リカバリーフロー（新仕様）
        // ==========================================

        // リカバリーフロー: 認証開始
        this.app.post(
            `/auth/recovery/start`,
            async (req, res) => {
                try {
                    // リクエストのOriginからRP IDを決定
                    const origin = req.headers.origin || req.headers.referer;
                    let rpId = 'localhost';
                    if (origin) {
                        try {
                            const url = new URL(origin);
                            rpId = url.hostname === 'localhost' || url.hostname === '127.0.0.1' 
                                ? 'localhost' 
                                : url.hostname;
                        } catch (e) {
                            // URL解析に失敗した場合はデフォルト値を使用
                            this.logger.warn('Failed to parse origin:', origin);
                        }
                    }

                    const options = await this.webauthnService.generateRecoveryOptions(rpId);

                    res.json(options);
                } catch (error) {
                    this.logger.error('Recovery start failed:', error);
                    res.status(500).json({
                        error: 'Recovery failed',
                        details: error.message
                    });
                }
            }
        );

        // リカバリーフロー: 認証完了
        this.app.post(
            `/auth/recovery/finish`,
            async (req, res) => {
                try {
                    const { credential, challengeKey } = req.body;

                    if (!credential || !challengeKey) {
                        return res.status(400).json({ error: 'Missing required fields' });
                    }

                    // リクエストのOriginを取得
                    const origin = req.headers.origin || req.headers.referer;
                    let expectedOrigin = this.webauthnService.origin;
                    if (origin) {
                        try {
                            const url = new URL(origin);
                            expectedOrigin = url.origin;
                        } catch (e) {
                            // URL解析に失敗した場合はデフォルト値を使用
                            this.logger.warn('Failed to parse origin:', origin);
                        }
                    }

                    const result = await this.webauthnService.verifyRecoveryAuthentication(
                        credential,
                        challengeKey,
                        expectedOrigin
                    );

                    if (result.verified && result.masterId) {
                        if (!this.jwtService) {
                            throw new Error('JWT service is not initialized');
                        }

                        const jwtResult = await this.jwtService.issueServerJWT(
                            result.masterId,
                            'wallet_register',
                            {
                                source: 'recovery_flow',
                                authMethods: ['webauthn_recovery']
                            }
                        );

                        if (!jwtResult.success) {
                            this.logger.error('Failed to issue wallet_register JWT during recovery finish', {
                                masterId: result.masterId,
                                error: jwtResult.error
                            });
                            return res.status(500).json({
                                error: 'Failed to issue wallet registration JWT',
                                details: jwtResult.error
                            });
                        }

                        res.json({
                            masterId: result.masterId,
                            credentialId: result.credentialId,
                            walletRegisterJWT: jwtResult.token,
                            walletRegisterJWTExpiresAt: jwtResult.expiresAt,
                            jwtRemainingQuota: jwtResult.remainingQuota
                        });
                    } else {
                        res.status(401).json({
                            error: 'Recovery authentication failed',
                            details: result.error
                        });
                    }
                } catch (error) {
                    this.logger.error('Recovery finish failed:', error);
                    res.status(500).json({
                        error: 'Recovery failed',
                        details: error.message
                    });
                }
            }
        );

    }

    /**
     * Email認証ルート
     */
    setupEmailRoutes() {
        // Email認証コード送信
        this.app.post(
            `/mpcapi/auth/email/send-verification`,
            async (req, res) => {
                try {
                    const { email, masterId } = req.body;

                    if (!email) {
                        return res.status(400).json({ error: "Missing email" });
                    }

                    const result = await this.emailService.sendVerificationCode(
                        email,
                        masterId,
                    );

                    if (result.success) {
                        res.json({
                            success: true,
                            message: "Verification code sent successfully",
                            expiresIn: 600, // 10分
                        });
                    } else {
                        res.status(400).json({
                            error: "Failed to send verification code",
                            details: result.error,
                        });
                    }
                } catch (error) {
                    this.logger.error("Email verification send failed:", error);
                    res.status(500).json({
                        error: "Email service failed",
                        details: error.message,
                    });
                }
            },
        );

        // Email認証コード検証
        this.app.post(`/mpcapi/auth/email/verify-code`, async (req, res) => {
            try {
                const { email, code, masterId } = req.body;

                if (!email || !code) {
                    return res
                        .status(400)
                        .json({ error: "Missing email or verification code" });
                }

                const result = await this.emailService.verifyCode(
                    email,
                    code,
                    masterId,
                );

                if (result.verified) {
                    res.json({
                        success: true,
                        masterId: result.masterId || masterId,
                        emailVerified: true,
                        message: "Email verification successful",
                    });
                } else {
                    res.status(401).json({
                        error: "Email verification failed",
                        details: result.error,
                        attemptsRemaining: result.attemptsRemaining,
                    });
                }
            } catch (error) {
                this.logger.error("Email verification failed:", error);
                res.status(500).json({
                    error: "Email verification failed",
                    details: error.message,
                });
            }
        });

        // Email認証（緊急復旧用）
        this.app.post(`/mpcapi/email/verify`, async (req, res) => {
            try {
                const { email, code, context } = req.body;

                if (!email || !code) {
                    return res
                        .status(400)
                        .json({ error: "Missing email or verification code" });
                }

                const result = await this.emailService.verifyCode(
                    email,
                    code,
                    null,
                    context,
                );

                if (!result.masterId) {
                    return res
                        .status(404)
                        .json({
                            error: "No wallet found for this email",
                            masterId: null,
                        });
                }

                res.json({
                    success: true,
                    masterId: result.masterId,
                    emailVerified: true,
                    message: "Email verification successful",
                    context: context,
                });
            } catch (error) {
                this.logger.error("Email verification failed:", error);
                res.status(500).json({
                    error: "Email verification failed",
                    details: error.message,
                });
            }
        });

        // Email設定確認（BitVoy.js用）
        this.app.post(`/mpcapi/email/setup/check`, async (req, res) => {
            try {
                // クエリパラメータまたはヘッダーからmasterIdを取得
                const masterId = req.query.masterId || req.masterId;

                if (!masterId) {
                    return res.json({
                        status: "OK",
                        isSetup: false,
                        message: "No masterId provided",
                    });
                }

                // データベースからメール設定を確認
                const query = `
                    SELECT email_verified, email_address 
                    FROM user_accounts 
                    WHERE master_id = ?
                `;
                const [result] = await this.db.query(query, [masterId]);

                const resultRows = Array.isArray(result) ? result : [];
                const isSetup =
                    resultRows.length > 0 &&
                    resultRows[0].email_verified === true;

                res.json({
                    status: "OK",
                    isSetup: isSetup,
                    email: resultRows[0]?.email_address || null,
                });
            } catch (error) {
                this.logger.error("Email setup check failed:", error);
                res.status(500).json({
                    status: "ERROR",
                    isSetup: false,
                    error: "Email setup check failed",
                });
            }
        });

        // Email設定（BitVoy.js用）
        this.app.post(`/mpcapi/email/setup`, async (req, res) => {
            try {
                const { masterId, email, authcode } = req.body;

                if (!masterId || !email || !authcode) {
                    return res.status(400).json({
                        status: "ERROR",
                        message: "Missing required fields",
                    });
                }

                // 認証コードを検証
                const result = await this.emailService.verifyCode(
                    email,
                    authcode,
                    masterId,
                );

                if (result.verified) {
                    // データベースにメール設定を保存
                    // user_accountsテーブルにレコードが存在するかチェック
                    const checkQuery = `SELECT id FROM user_accounts WHERE master_id = ?`;
                    const [checkResult] = await this.db.query(checkQuery, [masterId]);

                    const checkRows = Array.isArray(checkResult) ? checkResult : [];
                    if (checkRows.length === 0) {
                        // レコードが存在しない場合は新規作成（UUIDを生成）
                        const crypto = require('crypto');
                        const userId = crypto.randomUUID();
                        const insertQuery = `
                            INSERT INTO user_accounts (id, master_id, email_address, email_verified, created_at, updated_at)
                            VALUES (?, ?, ?, true, NOW(), NOW())
                        `;
                        await this.db.query(insertQuery, [userId, masterId, email]);
                    } else {
                        // レコードが存在する場合は更新
                        const updateQuery = `
                            UPDATE user_accounts 
                            SET email_address = ?, email_verified = true, updated_at = NOW()
                            WHERE master_id = ?
                        `;
                        await this.db.query(updateQuery, [email, masterId]);
                    }

                    res.json({
                        status: "OK",
                        message: "Email setup successful",
                    });
                } else {
                    res.status(400).json({
                        status: "ERROR",
                        message: result.error || "Invalid authentication code",
                    });
                }
            } catch (error) {
                this.logger.error("Email setup failed:", error);
                res.status(500).json({
                    status: "ERROR",
                    message: "Email setup failed",
                });
            }
        });

        // Email復旧認証（BitVoy.js用）
        this.app.post(`/mpcapi/email/verify-restore`, async (req, res) => {
            try {
                const { email, verificationCode } = req.body;

                if (!email || !verificationCode) {
                    return res.status(400).json({
                        status: "ERROR",
                        message: "Missing email or verification code",
                    });
                }

                // 復旧用の認証コードを検証
                const result = await this.emailService.verifyCode(
                    email,
                    verificationCode,
                    null,
                    { action: "restore" },
                );

                if (result.verified) {
                    res.json({
                        status: "OK",
                        masterId: result.masterId,
                        restoreToken:
                            result.restoreToken || "mock-restore-token",
                        message: "Email verification for restore successful",
                    });
                } else {
                    res.status(401).json({
                        status: "ERROR",
                        message: result.error || "Email verification failed",
                    });
                }
            } catch (error) {
                this.logger.error("Email restore verification failed:", error);
                res.status(500).json({
                    status: "ERROR",
                    message: "Email restore verification failed",
                });
            }
        });
    }

    /**
     * JWT Authority ルート
     * - BitVoy Server用JWT（汎用サーバーアクション）
     * - Guardian Share Token（guardianシェアAPI用）
     */
    setupJWTRoutes() {
        // BitVoy Server用JWT発行（汎用サーバーアクション用）
        // チャレンジ-レスポンス方式でパスキー認証を行い、webauthnCredentialをサーバーに送信しない
        
        // Step 1: チャレンジ取得
        this.app.post(`/mpcapi/auth/server-jwt/begin`, async (req, res) => {
            try {
                const { masterId, action } = req.body;

                if (!masterId || !action) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or action" });
                }

                // アクションの妥当性確認
                if (!this.jwtService.allowedActions.includes(action)) {
                    return res.status(400).json({
                        error: `Unauthorized action: ${action}`
                    });
                }

                // パスキー認証オプション生成（チャレンジ含む）
                const requestRpId = req.hostname || this.config?.rpId;
                const options = await this.webauthnService.generateAuthenticationOptions(masterId, requestRpId);
                this.stats.webauthnChallenges++;

                // チャレンジとアクション情報を保存（JWT発行時に使用）
                const sessionKey = `jwt_${masterId}_${Date.now()}`;
                this.jwtService.challengeStore = this.jwtService.challengeStore || new Map();
                this.jwtService.challengeStore.set(sessionKey, {
                    masterId,
                    action,
                    challengeKey: options.challengeKey,
                    expires: Date.now() + 5 * 60 * 1000 // 5分
                });

                res.json({
                    success: true,
                    options: options,
                    sessionKey: sessionKey,
                    expires: Date.now() + 5 * 60 * 1000
                });
            } catch (error) {
                this.logger.error("Server JWT challenge generation failed:", error);
                res.status(500).json({
                    error: "Challenge generation failed",
                    details: error.message,
                });
            }
        });

        // Step 2: 認証完了とJWT発行
        this.app.post(`/mpcapi/auth/server-jwt/complete`, async (req, res) => {
            try {
                const {
                    masterId,
                    sessionKey,
                    credential,
                    challengeKey,
                    emailVerified,
                    context,
                } = req.body;

                if (!masterId || !sessionKey || !credential || !challengeKey) {
                    return res
                        .status(400)
                        .json({ error: "Missing required fields: masterId, sessionKey, credential, or challengeKey" });
                }

                // セッション情報を取得
                const sessionData = this.jwtService.challengeStore?.get(sessionKey);
                if (!sessionData) {
                    return res.status(400).json({
                        error: "Invalid or expired session"
                    });
                }

                if (sessionData.masterId !== masterId) {
                    return res.status(400).json({
                        error: "MasterId mismatch"
                    });
                }

                if (Date.now() > sessionData.expires) {
                    this.jwtService.challengeStore.delete(sessionKey);
                    return res.status(400).json({
                        error: "Session expired"
                    });
                }

                const action = sessionData.action;

                // パスキー認証検証（チャレンジ-レスポンス方式）
                const authResult = await this.webauthnService.verifyAuthentication(
                    masterId,
                    credential,
                    challengeKey
                );

                if (!authResult.verified) {
                    return res.status(401).json({
                        error: "Passkey authentication failed",
                        details: authResult.error
                    });
                }

                // Email認証確認（緊急復旧時はオプショナル）
                // メール認証が提供されている場合は検証、提供されていない場合はスキップ
                if (["emergency_restore", "device_recovery"].includes(action)) {
                    if (emailVerified !== undefined && !emailVerified) {
                        return res.status(401).json({
                            error: "Email verification required for emergency recovery",
                        });
                    }
                    // emailVerifiedが未提供の場合は、パスキー認証のみで進める
                }

                // セッション情報を削除
                this.jwtService.challengeStore.delete(sessionKey);

                // contextにemailVerifiedを含める
                const contextWithAuth = {
                    ...context,
                    emailVerified: emailVerified || false
                };

                // JWT発行（BitVoy Server用JWT - 汎用サーバーアクション用）
                const jwtResult = await this.jwtService.issueServerJWT(
                    masterId,
                    action,
                    contextWithAuth,
                );

                if (jwtResult.success) {
                    this.stats.jwtTokensIssued++;

                    res.json({
                        success: true,
                        jwt: jwtResult.token,
                        expiresAt: jwtResult.expiresAt,
                        action: action,
                        remainingQuota: jwtResult.remainingQuota,
                    });
                } else {
                    res.status(400).json({
                        error: "JWT issuance failed",
                        details: jwtResult.error,
                    });
                }
            } catch (error) {
                this.logger.error("Server JWT issuance failed:", error);
                res.status(500).json({
                    error: "JWT service failed",
                    details: error.message,
                });
            }
        });

        // ブロックチェーンアクセス用JWT発行（簡易版）
        this.app.post(`/mpcapi/jwt/obtain`, async (req, res) => {
            try {
                const {
                    masterId,
                    operation,
                    context,
                } = req.body;

                if (!masterId || !operation) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or operation" });
                }

                // 簡易認証：masterIdが存在するかチェック
                this.logger.info(`🔍 Checking wallet existence for masterId: ${masterId}`);
                const [walletRows] = await this.db.query(
                    'SELECT id FROM mpc_wallets WHERE master_id = ? LIMIT 1',
                    [masterId]
                );

                if (!walletRows || walletRows.length === 0) {
                    this.logger.warn(`❌ Wallet not found for masterId: ${masterId}`);
                    // デバッグ用：全master_idを確認（本番環境では削除推奨）
                    const allWallets = await this.db.query(
                        'SELECT DISTINCT master_id FROM mpc_wallets LIMIT 10'
                    );
                    this.logger.debug(`Available master_ids in mpc_wallets:`, 
                        allWallets.rows.map(r => r.master_id));
                    
                    return res.status(401).json({
                        error: "Invalid masterId or wallet not found",
                        masterId: masterId
                    });
                }
                
                this.logger.info(`✅ Wallet found for masterId: ${masterId}`);

                // ブロックチェーンアクセス用JWT発行
                const jwtResult = await this.jwtService.issueBlockchainJWT(
                    masterId,
                    operation,
                    context,
                );

                if (jwtResult.success) {
                    this.stats.jwtTokensIssued++;

                    res.json({
                        success: true,
                        jwt: jwtResult.token,
                        expiresAt: jwtResult.expiresAt,
                        operation: operation,
                        remainingQuota: jwtResult.remainingQuota,
                    });
                } else {
                    res.status(400).json({
                        error: "JWT issuance failed",
                        details: jwtResult.error,
                    });
                }
            } catch (error) {
                this.logger.error("Blockchain JWT issuance failed:", error);
                res.status(500).json({
                    error: "JWT service failed",
                    details: error.message,
                });
            }
        });

        // JWT検証エンドポイント
        this.app.post(`/mpcapi/auth/verify-jwt`, async (req, res) => {
            try {
                const { token, masterId } = req.body;

                if (!token) {
                    return res.status(400).json({ error: "Missing JWT token" });
                }

                const result = await this.jwtService.verifyToken(
                    token,
                    masterId,
                );

                if (result.valid) {
                    res.json({
                        valid: true,
                        payload: result.payload,
                        remainingQuota: result.remainingQuota,
                        expiresIn: result.expiresIn,
                    });
                } else {
                    res.status(401).json({
                        valid: false,
                        error: result.error,
                    });
                }
            } catch (error) {
                this.logger.error("JWT verification failed:", error);
                res.status(500).json({
                    error: "JWT verification failed",
                    details: error.message,
                });
            }
        });
    }

    /**
     * MPC Routes設定 - 真の分散鍵生成対応
     */
    setupMPCRoutes() {

        // 必要な依存
        const mpcEndpoints = require('./server/mpc-endpoints');
        const axios = require('axios');
        mpcEndpoints.setDB(this.db);

        // サーバ起動時に一度だけMPC/WASMを初期化
        (async () => {
            try {
                await mpcEndpoints.initializeMPC();
                console.log('[Server] MPC/WASM initialized at startup');
            } catch (e) {
                console.error('[Server] Failed to initialize MPC/WASM at startup:', e);
            }
        })();

        // バッチ用エンドポイント
        this.app.post('/dkg/batch/round1', mpcEndpoints.handleDkgBatchRound1);
        this.app.post('/dkg/batch/round2', mpcEndpoints.handleDkgBatchRound2);
        this.app.post('/dkg/batch/round3', mpcEndpoints.handleDkgBatchRound3);
        this.app.post('/dkg/batch/public-key-package', mpcEndpoints.handleGetBatchPublicKeyPackage);

        // GuardianノードへのリレーAPI
        this.app.post('/mpcapi/guardian/dkg/batch/round1', async (req, res) => {
            try {
                const guardianUrl = process.env.GUARDIAN_URL || 'http://localhost:5000';
                const response = await axios.post(`${guardianUrl}/mpc/dkg/batch/round1`, req.body, {
                    headers: { 'Content-Type': 'application/json' }
                });
                res.status(response.status).json(response.data);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/mpcapi/guardian/dkg/batch/round2', async (req, res) => {
            try {
                const guardianUrl = process.env.GUARDIAN_URL || 'http://localhost:5000';
                const response = await axios.post(`${guardianUrl}/mpc/dkg/batch/round2`, req.body, {
                    headers: { 'Content-Type': 'application/json' }
                });
                res.status(response.status).json(response.data);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/mpcapi/guardian/dkg/batch/round3', async (req, res) => {
            try {
                const guardianUrl = process.env.GUARDIAN_URL || 'http://localhost:5000';
                const response = await axios.post(`${guardianUrl}/mpc/dkg/batch/round3`, req.body, {
                    headers: { 'Content-Type': 'application/json' }
                });
                res.status(response.status).json(response.data);
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Guardian Shares API プロキシ（JWT検証をBitVoyサーバー側で実施）
        this.app.post('/mpcapi/guardian/shares', async (req, res) => {
            try {
                // JWT検証をBitVoyサーバー側で実施
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Missing or invalid Authorization header'
                    });
                }

                const token = authHeader.substring(7);
                
                // JWTAuthorityServiceでトークンを検証
                const verifyResult = await this.jwtService.verifyGuardianShareToken(token);
                if (!verifyResult.valid) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: verifyResult.error || 'Invalid or expired token'
                    });
                }

                const decoded = verifyResult.payload;

                // scope確認（share.saveが必要）
                const scope = decoded.scope || '';
                const scopes = scope.split(' ');
                if (!scopes.includes('guardian:share.save')) {
                    return res.status(403).json({
                        error: 'Forbidden',
                        message: 'Insufficient scope: guardian:share.save required'
                    });
                }

                // ガーディアンサーバーにリクエストを転送
                // 検証済みの情報をヘッダーに含める（ガーディアンサーバー側のJWT検証をスキップ）
                const guardianUrl = process.env.GUARDIAN_URL || 'http://localhost:9600';
                const response = await axios.post(`${guardianUrl}/guardianapi/shares`, req.body, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-BitVoy-Verified': 'true', // BitVoyサーバー側で検証済みであることを示す
                        'X-BitVoy-Master-Id': decoded.sub,
                        'X-BitVoy-Device-Id': decoded.device_id || '',
                        'X-BitVoy-Scope': decoded.scope || '',
                        ...(req.headers['x-guardian-session'] && { 'X-Guardian-Session': req.headers['x-guardian-session'] })
                    }
                });
                res.status(response.status).json(response.data);
            } catch (error) {
                this.logger.error('Guardian shares API error:', error);
                res.status(error.response?.status || 500).json({ 
                    success: false, 
                    error: error.response?.data || error.message 
                });
            }
        });

        this.app.get('/mpcapi/guardian/shares', async (req, res) => {
            try {
                // JWT検証をBitVoyサーバー側で実施
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Missing or invalid Authorization header'
                    });
                }

                const token = authHeader.substring(7);
                
                // JWTAuthorityServiceでトークンを検証
                const verifyResult = await this.jwtService.verifyGuardianShareToken(token);
                if (!verifyResult.valid) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: verifyResult.error || 'Invalid or expired token'
                    });
                }

                const decoded = verifyResult.payload;

                // scope確認（share.getが必要）
                const scope = decoded.scope || '';
                const scopes = scope.split(' ');
                if (!scopes.includes('guardian:share.get')) {
                    return res.status(403).json({
                        error: 'Forbidden',
                        message: 'Insufficient scope: guardian:share.get required'
                    });
                }

                // ガーディアンサーバーにリクエストを転送
                const guardianUrl = process.env.GUARDIAN_URL || 'http://localhost:9600';
                const queryString = new URLSearchParams(req.query).toString();
                const response = await axios.get(`${guardianUrl}/guardianapi/shares?${queryString}`, {
                    headers: {
                        'X-BitVoy-Verified': 'true', // BitVoyサーバー側で検証済みであることを示す
                        'X-BitVoy-Master-Id': decoded.sub,
                        'X-BitVoy-Device-Id': decoded.device_id || '',
                        'X-BitVoy-Scope': decoded.scope || '',
                        ...(req.headers['x-guardian-session'] && { 'X-Guardian-Session': req.headers['x-guardian-session'] })
                    }
                });
                res.status(response.status).json(response.data);
            } catch (error) {
                this.logger.error('Guardian shares GET API error:', error);
                res.status(error.response?.status || 500).json({ 
                    success: false, 
                    error: error.response?.data || error.message 
                });
            }
        });
		// 署名エンドポイント（未使用のため削除）

        // MPC署名フロー用エンドポイント（クライアント-サーバー間）
        // 注意: STANDARDモードはWebSocketベースのため、REST APIエンドポイントは不要
        // this.app.post('/mpcapi/mpc/round1-commit', mpcEndpoints.handleMpcRound1Commit);
        // this.app.post('/mpcapi/mpc/round2-sign', mpcEndpoints.handleMpcRound2Sign);
        // this.app.post('/mpcapi/mpc/current-epoch', mpcEndpoints.handleGetCurrentEpoch);

        // AA用のMPC署名フロー用エンドポイント（クライアント-サーバー間）
        // 既存の/mpcapi/mpc/*エンドポイントは一切変更しない
        // 注意: AAモードはWebSocketベースのため、REST APIエンドポイントは不要
        // this.app.post('/mpcapi/mpcaa/round1-commit', mpcEndpoints.handleMpcRound1Commit);
        // this.app.post('/mpcapi/mpcaa/round2-sign', mpcEndpoints.handleMpcRound2Sign);

        // バッチ復旧・ヘルスチェック用エンドポイント
        // サーバのGuardianService.jsからの呼び出し ガーディアンノードのシェア存在確認
        this.app.post('/recovery/batch/request-share', mpcEndpoints.handleBatchRecoveryRequestShare);
        // クライアントのBitVoyMPC.js からの呼び出し サーバのGuardianService.jsからガーディアンノードのシェア存在確認
        this.app.post('/recovery/batch/public-key-package', mpcEndpoints.handleGetBatchRecoveryPublicKeyPackage);
        this.app.post('/health/batch', mpcEndpoints.handleBatchHealth);

        // サーバーのシェア取得エンドポイント（緊急復旧用）
        this.app.post('/mpcapi/server/get-share', mpcEndpoints.handleGetServerShare);

        // サーバーのシェア保存エンドポイント（緊急復旧用）
        this.app.post('/mpcapi/server/store-share', mpcEndpoints.handleStoreServerShare);

        // エポック管理用エンドポイント
        this.app.post('/mpcapi/server/get-epoch-history', mpcEndpoints.handleGetEpochHistory);
        this.app.post('/mpcapi/server/get-epoch-share', mpcEndpoints.handleGetEpochShare);

        // リシェア用エンドポイント（リフレッシュ型リシェアで使用するもののみ）
        // round2のみリフレッシュ型リシェアのメソッドを使用
        this.app.post('/mpcapi/server/reshare/round2', mpcEndpoints.handleRefreshReshareRound2);
        
        // リフレッシュ型リシェア（新設計）エンドポイント
        console.log('[Server] Registering refresh reshare endpoints...');
        console.log('[Server] handleRefreshReshareInit:', typeof mpcEndpoints.handleRefreshReshareInit);
        console.log('[Server] handleRefreshReshareRound1:', typeof mpcEndpoints.handleRefreshReshareRound1);
        console.log('[Server] handleRefreshReshareRound2:', typeof mpcEndpoints.handleRefreshReshareRound2);
        console.log('[Server] handleRefreshReshareFinalize:', typeof mpcEndpoints.handleRefreshReshareFinalize);
        
        this.app.post('/mpcapi/server/reshare/init', mpcEndpoints.handleRefreshReshareInit);
        this.app.post('/mpcapi/server/reshare/round1', mpcEndpoints.handleRefreshReshareRound1);
        this.app.post('/mpcapi/server/reshare/round1/distribute-commitments', mpcEndpoints.handleRefreshReshareDistributeCommitments);
        this.app.post('/mpcapi/server/reshare/receive', mpcEndpoints.handleRefreshReshareReceive);
        this.app.post('/mpcapi/server/reshare/status', mpcEndpoints.handleRefreshReshareStatus);
        this.app.post('/mpcapi/server/reshare/finalize', mpcEndpoints.handleRefreshReshareFinalize);
        
        console.log('[Server] Refresh reshare endpoints registered successfully');
        
        // デバッグ用ログ
        this.logger.info('🔧 Reshare endpoints registered:', {
            round1: typeof mpcEndpoints.handleReshareRound1,
            round2: typeof mpcEndpoints.handleReshareRound2,
            commitments: typeof mpcEndpoints.handleStoreReshareCommitments,
            shares: typeof mpcEndpoints.handleStoreReshareShares,
            aggregate: typeof mpcEndpoints.handleAggregateReshareResults,
            results: typeof mpcEndpoints.handleGetReshareResults,
            refreshInit: typeof mpcEndpoints.handleRefreshReshareInit,
            refreshRound1: typeof mpcEndpoints.handleRefreshReshareRound1,
            refreshRound2: typeof mpcEndpoints.handleRefreshReshareRound2,
            refreshFinalize: typeof mpcEndpoints.handleRefreshReshareFinalize
        });

        this.logger.info('✅ MPC Routes configured (distributed key generation with epoch management and reshare)');
    }

    /**
     * Guardian Network ルート
     */
    setupGuardianRoutes() {
        // 認証ミドルウェアをインポート
        const authMiddleware = require('./server/api/middleware/auth');

        // Guardian Node登録エンドポイント
        this.app.post(`/mpcapi/guardian/register`, async (req, res) => {
            try {
                const {
                    nodeId,
                    endpoint,
                    capabilities,
                    region,
                    environment,
                    status,
                } = req.body;

                if (!nodeId || !endpoint) {
                    return res
                        .status(400)
                        .json({ error: "Missing nodeId or endpoint" });
                }

                this.logger.info(
                    `🔄 Guardian Node registration request: ${nodeId} at ${endpoint}`,
                );

                // GuardianServiceにノードを登録
                const registrationResult =
                    await this.guardianService.registerGuardianNode({
                        nodeId,
                        endpoint,
                        capabilities: capabilities || {},
                        region: region || "unknown",
                        environment: environment || "development",
                        status: status || "online",
                    });

                if (registrationResult.success) {
                    this.logger.info(
                        `✅ Guardian Node registered successfully: ${nodeId}`,
                    );
                    res.status(201).json({
                        success: true,
                        message: "Guardian Node registered successfully",
                        nodeId: nodeId,
                        endpoint: endpoint,
                        timestamp: Date.now(),
                    });
                } else {
                    this.logger.warn(
                        `⚠️ Guardian Node registration failed: ${nodeId}`,
                    );
                    res.status(400).json({
                        success: false,
                        error: "Guardian Node registration failed",
                        details: registrationResult.error,
                    });
                }
            } catch (error) {
                this.logger.error("Guardian Node registration failed:", error);
                res.status(500).json({
                    success: false,
                    error: "Guardian Node registration failed",
                    details: error.message,
                });
            }
        });

        // Guardian JWT取得
        this.app.post(`/mpcapi/guardian/jwt`, async (req, res) => {
            try {
                const { masterId, operation, payload, timestamp } = req.body;

                if (!masterId || !operation) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or operation" });
                }

                // JWTAuthorityServiceを使用してGuardian Share Tokenを直接発行
                // operationからopsを生成（guardian_shareの場合はshare.saveとshare.get）
                const ops = operation === 'guardian_share' 
                    ? ['share.save', 'share.get']
                    : operation.split('_').map(op => op.replace(/^guardian/, ''));
                
                const deviceId = payload?.deviceId || null;
                const keyId = payload?.keyId || null;

                if (!deviceId) {
                    return res
                        .status(400)
                        .json({ error: "Missing deviceId in payload" });
                }

                const jwtResult = await this.jwtService.issueGuardianShareToken(
                    masterId,
                    deviceId,
                    keyId,
                    ops
                );

                if (!jwtResult.success) {
                    return res.status(500).json({
                        error: "Guardian JWT issuance failed",
                        details: jwtResult.error
                    });
                }

                res.json({
                    success: true,
                    token: jwtResult.token,
                    expiresIn: jwtResult.expiresIn,
                    operation: operation,
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Guardian JWT acquisition failed:", error);
                res.status(500).json({
                    error: "Guardian JWT acquisition failed",
                    details: error.message,
                });
            }
        });


        // 緊急復旧用JWT取得（パスキー認証付き）
        this.app.post(`/mpcapi/guardian/emergency-jwt`, async (req, res) => {
            try {
                const {
                    masterId,
                    action,
                    webauthnCredential,
                    challengeKey,
                    emailVerified,
                    webauthnVerified,
                    context,
                } = req.body;

                if (!masterId || !action || !webauthnCredential) {
                    return res.status(400).json({
                        error: "Missing required parameters: masterId, action, or webauthnCredential",
                    });
                }

                // メール認証が提供されている場合は検証、提供されていない場合はスキップ
                if (emailVerified !== undefined && !emailVerified) {
                    return res.status(401).json({
                        error: "Email verification required for emergency recovery",
                    });
                }
                // emailVerifiedが未提供の場合は、パスキー認証のみで進める

                if (!webauthnVerified) {
                    return res.status(401).json({
                        error: "Passkey authentication required for emergency recovery",
                    });
                }

                // 緊急復旧時はパスキー認証成功フラグを信頼
                // データベースチェックは省略（iCloud/Googleリカバリー対応）
                // challengeKeyは必須ではない（緊急復旧時は簡略化）

                // Guardian Networkから緊急JWTを取得
                const emergencyJWTResult =
                    await this.guardianService.obtainEmergencyJWT(
                        masterId,
                        action,
                        webauthnCredential,
                        context,
                    );

                res.json({
                    success: true,
                    jwt: emergencyJWTResult.token,
                    expiresIn: emergencyJWTResult.expiresIn,
                    action: action,
                    emergency: true,
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Emergency JWT acquisition failed:", error);
                res.status(500).json({
                    error: "Emergency JWT acquisition failed",
                    details: error.message,
                });
            }
        });

        // Guardian接続検証
        this.app.post(
            `/mpcapi/guardian/verify-connection`,
            async (req, res) => {
                try {
                    const { masterId, timestamp } = req.body;
                    const authHeader = req.headers.authorization;

                    if (!masterId) {
                        return res
                            .status(400)
                            .json({ error: "Missing masterId" });
                    }

                    if (!authHeader || !authHeader.startsWith("Bearer ")) {
                        return res
                            .status(401)
                            .json({
                                error: "Missing or invalid authorization header",
                            });
                    }

                    const jwt = authHeader.substring(7);

                    // Guardian Network接続を検証
                    const verificationResult =
                        await this.guardianService.verifyConnection(
                            masterId,
                            jwt,
                        );

                    res.json({
                        success: true,
                        guardianNodes: verificationResult.guardianNodes,
                        connectionStatus: verificationResult.status,
                        timestamp: Date.now(),
                    });
                } catch (error) {
                    this.logger.error(
                        "Guardian connection verification failed:",
                        error,
                    );
                    res.status(500).json({
                        error: "Guardian connection verification failed",
                        details: error.message,
                    });
                }
            },
        );

        // Guardianリシェアエンドポイント
        this.app.post(`/mpcapi/guardian/reshare/init`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare init request received`);
                
                const { masterId, curve, sessionId, currentEpoch, targetEpoch, verifyingKeyFingerprint, participants } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || currentEpoch === undefined || targetEpoch === undefined || !verifyingKeyFingerprint || !participants) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, currentEpoch, targetEpoch, verifyingKeyFingerprint, participants'
                    });
                }

                // ガーディアンサービスにリシェアInitを委譲
                const result = await this.guardianService.handleReshareInit({
                    masterId,
                    curve,
                    sessionId,
                    currentEpoch,
                    targetEpoch,
                    verifyingKeyFingerprint,
                    participants,
                    authHeader
                });

                // 結果の成功/失敗をチェック
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }

            } catch (error) {
                this.logger.error('❌ Guardian reshare init failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post(`/mpcapi/guardian/reshare/round1`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare Round 1 request received`);
                
                const { masterId, curve, sessionId, targetEpoch } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || targetEpoch === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, targetEpoch'
                    });
                }

                // ガーディアンサービスにリシェアRound 1を委譲
                const result = await this.guardianService.handleReshareRound1({
                    masterId,
                    curve,
                    sessionId,
                    targetEpoch,
                    authHeader
                });

                // 結果の成功/失敗をチェック
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }

            } catch (error) {
                this.logger.error('❌ Guardian reshare Round 1 failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });


        this.app.post(`/mpcapi/guardian/reshare/round2`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare Round 2 request received`);
                
                const { masterId, curve, sessionId, commitments } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || !commitments) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, commitments'
                    });
                }

                // ガーディアンサービスにリシェアRound 2を委譲
                const result = await this.guardianService.handleReshareRound2({
                    masterId,
                    curve,
                    sessionId,
                    commitments,
                    authHeader
                });

                // 結果の成功/失敗をチェック
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }

            } catch (error) {
                this.logger.error('❌ Guardian reshare Round 2 failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.app.post(`/mpcapi/guardian/reshare/receive`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare receive request received`);
                const { masterId, curve, sessionId, to, from, payload } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || !to || !from || !payload) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, to, from, payload'
                    });
                }

                const result = await this.guardianService.handleReshareReceive({
                    masterId,
                    curve,
                    sessionId,
                    to,
                    from,
                    payload,
                    authHeader
                });

                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }
            } catch (error) {
                this.logger.error('❌ Guardian reshare receive failed:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post(`/mpcapi/guardian/reshare/finalize`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare finalize request received`);
                
                const { masterId, curve, sessionId, expectFrom } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || !expectFrom) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, expectFrom'
                    });
                }

                // ガーディアンサービスにリシェアFinalizeを委譲
                const result = await this.guardianService.handleReshareFinalize({
                    masterId,
                    curve,
                    sessionId,
                    expectFrom,
                    authHeader
                });

                // 結果の成功/失敗をチェック
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }

            } catch (error) {
                this.logger.error('❌ Guardian reshare finalize failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // ガーディアン用コミットメント配布エンドポイント
        this.app.post(`/mpcapi/guardian/reshare/round1/distribute-commitments`, async (req, res) => {
            try {
                this.logger.info(`🔄 Guardian reshare distribute commitments request received`);
                
                const { masterId, curve, sessionId, allCommitments } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !curve || !sessionId || !allCommitments) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: masterId, curve, sessionId, allCommitments'
                    });
                }

                // ガーディアンサービスにコミットメント配布を委譲
                const result = await this.guardianService.handleReshareDistributeCommitments({
                    masterId,
                    curve,
                    sessionId,
                    allCommitments,
                    authHeader
                });

                // 結果の成功/失敗をチェック
                if (result.success) {
                    res.json(result);
                } else {
                    res.status(500).json(result);
                }

            } catch (error) {
                this.logger.error('❌ Guardian reshare distribute commitments failed:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Guardianシェア保存
        this.app.post(`/mpcapi/guardian/store-share`, async (req, res) => {
            try {
                this.logger.info(`🔐 Guardian share storage request received`);
                this.logger.info(`📋 Request headers:`, {
                    authorization: req.headers.authorization ? 'Bearer [JWT]' : 'Missing',
                    contentType: req.headers['content-type'],
                    userAgent: req.headers['user-agent'],
                    timestamp: new Date().toISOString()
                });

                const { masterId, share, curve, timestamp } = req.body;
                const authHeader = req.headers.authorization;

                this.logger.info(`📊 Request body:`, {
                    masterId: masterId,
                    shareLength: share ? share.length : 0,
                    curve: curve || 'not specified',
                    timestamp: timestamp,
                    hasShare: !!share
                });

                if (!masterId || !share) {
                    this.logger.warn(`❌ Missing required fields:`, {
                        hasMasterId: !!masterId,
                        hasShare: !!share
                    });
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or share" });
                }

                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    this.logger.warn(`❌ Invalid authorization header:`, {
                        hasAuthHeader: !!authHeader,
                        startsWithBearer: authHeader ? authHeader.startsWith("Bearer ") : false
                    });
                    return res
                        .status(401)
                        .json({
                            error: "Missing or invalid authorization header",
                        });
                }

                const jwt = authHeader.substring(7);
                this.logger.info(`🔑 JWT extracted (length: ${jwt.length})`);

                // Guardian Networkにシェアを保存
                this.logger.info(`📤 Calling GuardianService.storeShare for masterId: ${masterId}`);
                const storeResult = await this.guardianService.storeShare(
                    masterId,
                    share,
                    jwt,
                );

                this.logger.info(`✅ Guardian share storage completed successfully for masterId: ${masterId}`, {
                    storeResult: storeResult,
                    timestamp: Date.now()
                });

                res.json({
                    success: true,
                    message: "Share stored successfully",
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error(`❌ Guardian share storage failed:`, {
                    error: error.message,
                    stack: error.stack,
                    masterId: req.body?.masterId,
                    timestamp: new Date().toISOString()
                });
                res.status(500).json({
                    error: "Guardian share storage failed",
                    details: error.message,
                });
            }
        });

        // Guardian Dual Shares保存（対応6: 2種類のシェアを同時保存）
        this.app.post(`/mpcapi/guardian/store-dual-shares`, async (req, res) => {
            try {
                const { masterId, secp256k1Share, ed25519Share, timestamp } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || (!secp256k1Share && !ed25519Share)) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or shares" });
                }

                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    return res
                        .status(401)
                        .json({
                            error: "Missing or invalid authorization header",
                        });
                }

                const jwt = authHeader.substring(7);

                // Guardian Networkに2種類のシェアを保存
                this.logger.info(`📤 Calling GuardianService.storeDualShares for masterId: ${masterId}`);
                const storeResult = await this.guardianService.storeDualShares(
                    masterId,
                    secp256k1Share,
                    ed25519Share,
                    jwt,
                );

                this.logger.info(`✅ Guardian dual shares storage completed successfully for masterId: ${masterId}`, {
                    storeResult: storeResult,
                    timestamp: Date.now()
                });

                // Guardianノードの自動割り当てを実行
                this.logger.info(`🔄 Auto-assigning Guardian nodes for masterId: ${masterId}`);
                const assignmentResult = await this.guardianService.saveGuardianAssignment(masterId, {
                    primaryNodes: storeResult.storedNodes.slice(0, 2).map(node => ({
                        nodeId: node.id,
                        endpoint: node.endpoint,
                        region: 'local'
                    })),
                    backupNodes: storeResult.storedNodes.slice(2).map(node => ({
                        nodeId: node.id,
                        endpoint: node.endpoint,
                        region: 'local'
                    })),
                    distributedAt: Date.now(),
                    autoAssigned: true,
                    assignedBy: 'initialization_flow'
                });

                this.logger.info(`✅ Guardian node auto-assignment completed for masterId: ${masterId}`, {
                    assignmentResult: assignmentResult,
                    timestamp: Date.now()
                });

                res.json({
                    success: true,
                    message: "Dual shares stored and Guardian nodes assigned successfully",
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Guardian dual shares storage failed:", error);
                res.status(500).json({
                    error: "Guardian dual shares storage failed",
                    details: error.message,
                });
            }
        });

        // Guardianバッチ復旧エンドポイント
        this.app.post(`/mpcapi/guardian/recovery/batch`, async (req, res) => {
            try {
                const { masterId, action, otherSecpKeyPackages, otherEdKeyPackages, timestamp } = req.body;
                const authHeader = req.headers.authorization;

                if (!masterId || !action) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or action" });
                }

                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    return res
                        .status(401)
                        .json({
                            error: "Missing or invalid authorization header",
                        });
                }

                const jwt = authHeader.substring(7);

                this.logger.info(`🔄 Processing Guardian batch recovery request for masterId: ${masterId}, action: ${action}`);

                // Guardian Networkからシェアを復旧
                const recoveryResult = await this.guardianService.recoverShares(
                    masterId,
                    action,
                    jwt,
                );

                if (!recoveryResult.success) {
                    return res.status(500).json({
                        error: "Guardian batch recovery failed",
                        details: recoveryResult.error
                    });
                }

                // 復旧結果の構造を安全に処理
                const safeRecoveryResult = this.sanitizeRecoveryResult(recoveryResult);

                // バッチ復旧の結果を返す
                res.json({
                    success: true,
                    secpRecoveredSecret: safeRecoveryResult.secpRecoveredSecret,
                    edRecoveredSecret: safeRecoveryResult.edRecoveredSecret,
                    secpKeyPackages: safeRecoveryResult.secpKeyPackages || [],
                    edKeyPackages: safeRecoveryResult.edKeyPackages || [],
                    guardianShare: safeRecoveryResult.guardianShare,
                    publicKeyPackages: safeRecoveryResult.publicKeyPackages,
                    metadata: safeRecoveryResult.metadata,
                    guardianNodes: safeRecoveryResult.guardianNodes,
                    timestamp: Date.now(),
                });

            } catch (error) {
                this.logger.error("Guardian batch recovery failed:", error);
                res.status(500).json({
                    error: "Guardian batch recovery failed",
                    details: error.message,
                });
            }
        });

        // Guardianノード一覧取得
        this.app.post(`/mpcapi/guardian/nodes`, async (req, res) => {
            try {
                const nodes = await this.guardianService.getAllGuardianNodes();
                res.json({
                    success: true,
                    nodes: nodes,
                    totalNodes: nodes.length,
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Guardian node retrieval failed:", error);
                res.status(500).json({
                    error: "Failed to get Guardian nodes",
                    details: error.message,
                });
            }
        });

        // Guardian Network ヘルス確認
        this.app.post(`/mpcapi/guardian/health`, async (req, res) => {
            try {
                const health = await this.guardianService.getNetworkHealth();

                res.json({
                    success: true,
                    totalNodes: health.totalNodes,
                    healthyNodes: health.healthyNodes,
                    healthPercentage: health.healthPercentage,
                    regionDistribution: health.regionDistribution,
                    averageResponseTime: health.averageResponseTime,
                    lastHealthCheck: health.lastHealthCheck,
                });
            } catch (error) {
                this.logger.error("Guardian health check failed:", error);
                res.status(500).json({
                    error: "Guardian health check failed",
                    details: error.message,
                });
            }
        });

        // Guardian Node一覧取得
        this.app.post(`/mpcapi/guardian/nodes/:masterId`, authMiddleware, async (req, res) => {
            try {
                const { masterId } = req.params;

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                const guardians =
                    await this.guardianService.getAssignedGuardians(masterId);

                res.json({
                    success: true,
                    masterId: masterId,
                    assignedGuardians: guardians.primary,
                    backupGuardians: guardians.backup,
                    totalNodes:
                        guardians.primary.length + guardians.backup.length,
                });
            } catch (error) {
                this.logger.error("Guardian node retrieval failed:", error);
                res.status(500).json({
                    error: "Failed to get Guardian nodes",
                    details: error.message,
                });
            }
        });

        // Guardianシェア登録通知エンドポイント
        this.app.post(`/bootstrap/share-registered`, async (req, res) => {
            try {
                const { masterId, curveType, nodeId, timestamp } = req.body;
                
                this.logger.info(`📝 Guardian share registration notification received:`, {
                    masterId,
                    curveType,
                    nodeId,
                    timestamp
                });
                
                // guardian_network_stateテーブルにシェアの存在を保存
                // 既存のレコードを確認
                const checkQuery = `
                    SELECT assigned_guardians, backup_guardians 
                    FROM guardian_network_state 
                    WHERE master_id = ?
                `;
                const [checkResult] = await this.db.query(checkQuery, [masterId]);
                
                const checkRows = Array.isArray(checkResult) ? checkResult : [];
                if (checkRows.length > 0) {
                    // 既存レコードがある場合、assigned_guardiansにシェア情報をマージ更新（endpointは保持）
                    const existingData = checkRows[0];
                    let assignedGuardians = existingData.assigned_guardians || [];
                    if (!Array.isArray(assignedGuardians)) assignedGuardians = [];

                    // ノードIDで一意化（重複があれば最後のものを採用）
                    const mapByNode = new Map();
                    for (const g of assignedGuardians) {
                        if (!g) continue;
                        mapByNode.set(g.nodeId || g.id, g);
                    }
                    const existingGuardian = mapByNode.get(nodeId) || null;

                    // shares型を正規化（number→object）
                    const normalizeShares = (s) => {
                        if (!s || typeof s !== 'object') return {};
                        return s;
                    };

                    if (existingGuardian) {
                        const current = { ...existingGuardian };
                        const shares = normalizeShares(current.shares);
                        // idempotent: 同一curveTypeは上書き（最新のtimestampに置換）
                        shares[curveType] = {
                            registered: true,
                            registeredAt: new Date().toISOString(),
                            timestamp
                        };
                        current.shares = shares;
                        current.nodeId = nodeId;
                        mapByNode.set(nodeId, current);
                    } else {
                        mapByNode.set(nodeId, {
                            nodeId,
                            shares: {
                                [curveType]: {
                                    registered: true,
                                    registeredAt: new Date().toISOString(),
                                    timestamp
                                }
                            }
                        });
                    }

                    // 配列へ復元
                    assignedGuardians = Array.from(mapByNode.values());
                    
                    // データベースを更新
                    const updateQuery = `
                        UPDATE guardian_network_state 
                        SET assigned_guardians = ?, updated_at = NOW()
                        WHERE master_id = ?
                    `;
                    await this.db.query(updateQuery, [JSON.stringify(assignedGuardians), masterId]);
                    
                    this.logger.info(`✅ Updated guardian_network_state for ${masterId}: added ${curveType} share to ${nodeId}`);
                } else {
                    // 新規レコードを作成（UUIDを生成）
                    const crypto = require('crypto');
                    const networkStateId = crypto.randomUUID();
                    const insertQuery = `
                        INSERT INTO guardian_network_state (
                            id, master_id, 
                            assigned_guardians, 
                            backup_guardians, 
                            created_at
                        ) VALUES (
                            ?, ?, ?, ?, NOW()
                        )
                    `;
                    
                    const assignedGuardians = [{
                        nodeId: nodeId,
                        shares: {
                            [curveType]: {
                                registered: true,
                                registeredAt: new Date().toISOString(),
                                timestamp: timestamp
                            }
                        }
                    }];
                    
                    await this.db.query(insertQuery, [
                        networkStateId,
                        masterId,
                        JSON.stringify(assignedGuardians),
                        JSON.stringify([]) // 空のbackup_guardians
                    ]);
                    
                    this.logger.info(`✅ Created guardian_network_state for ${masterId}: registered ${curveType} share on ${nodeId}`);
                }
                
                res.json({
                    success: true,
                    message: "Share registration recorded successfully",
                    masterId: masterId,
                    nodeId: nodeId,
                    curveType: curveType,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.logger.error("Guardian share registration notification failed:", error);
                res.status(500).json({
                    error: "Failed to record share registration",
                    details: error.message,
                });
            }
        });

        // ===== Recovery publicKey sync endpoints =====
        // 1) Server: Party3(guardian) verifying_share sync into server publicKeyPackage (ed/secp)
        this.app.post('/mpcapi/server/recovery/sync-publickey-party3', async (req, res) => {
            try {
                const { masterId, curve, party3VerifyingShare } = req.body || {};
                if (!masterId || !curve || !party3VerifyingShare) {
                    return res.status(400).json({ success: false, error: 'Missing parameters' });
                }
                const selectQ = `
                    SELECT id, public_key_package 
                    FROM server_shares 
                    WHERE master_id=? AND curve_type=? 
                    ORDER BY epoch_counter DESC, created_at DESC 
                    LIMIT 1`;
                const [sel] = await this.db.query(selectQ, [masterId, curve]);
                const selRows = Array.isArray(sel) ? sel : [];
                if (selRows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Server share not found' });
                }
                const targetId = selRows[0].id;
                let pkp = selRows[0].public_key_package;
                if (typeof pkp === 'string') {
                    try { pkp = JSON.parse(pkp); } catch(_) {}
                }
                const p3 = curve === 'ed25519' ? '0300000000000000000000000000000000000000000000000000000000000000' : '0000000000000000000000000000000000000000000000000000000000000003';
                pkp.verifying_shares = pkp.verifying_shares || {};
                pkp.verifying_shares[p3] = party3VerifyingShare;
                const updateQ = `UPDATE server_shares SET public_key_package=?, updated_at=NOW() WHERE id=?`;
                await this.db.query(updateQ, [JSON.stringify(pkp), targetId]);
                // notify bootstrap (idempotent)
                try {
                    await fetch(`${this.baseUrl || 'http://localhost:4000'}/bootstrap/share-registered`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ masterId, curveType: curve, nodeId: 'server-node', timestamp: Date.now() })});
                } catch(_) {}
                return res.json({ success: true });
            } catch (e) {
                return res.status(500).json({ success:false, error: e.message });
            }
        });

        // Guardian batch public-key-package取得エンドポイント（リレー）
        this.app.post('/mpcapi/guardian/recovery/batch/public-key-package', async (req, res) => {
            try {
                const { masterId } = req.body;
                if (!masterId) {
                    return res.status(400).json({ success: false, error: 'Missing masterId parameter' });
                }
                
                const guardianUrl = this.guardianService.guardianUrl;
                const guardianEndpoint = `/mpc/recovery/batch/public-key-package`;
                
                console.log(`[Server] Relaying POST request to Guardian: ${guardianUrl}${guardianEndpoint}`);
                
                const response = await fetch(`${guardianUrl}${guardianEndpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ masterId })
                });
                
                if (!response.ok) {
                    throw new Error(`Guardian request failed: ${response.status}`);
                }
                
                const data = await response.json();
                res.json(data);
                
            } catch (error) {
                console.error('[Server] Guardian batch public-key-package relay error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // 2) Relay to Guardian: Party2(server) verifying_share sync into guardian publicKeyPackage
        this.app.post('/mpcapi/guardian/recovery/sync-publickey-party2', async (req, res) => {
            try {
                const { masterId, curve, party2VerifyingShare } = req.body || {};
                if (!masterId || !curve || !party2VerifyingShare) {
                    return res.status(400).json({ success: false, error: 'Missing parameters' });
                }

                // 推奨フロー: 割当取得 → プローブ → 候補順フォールバック
                let candidates = [];
                // TEMP: テスト用固定ガーディアン（強制）
                const forcedGuardian = 'http://localhost:5000';
                if (forcedGuardian) {
                    candidates = [{ endpoint: forcedGuardian, nodeId: 'forced-local' }];
                }
                try {
                    if (candidates.length === 0 && this.guardianService && typeof this.guardianService.getGuardianAssignment === 'function') {
                        const assignment = await this.guardianService.getGuardianAssignment(masterId);
                        const primary = Array.isArray(assignment?.primary) ? assignment.primary : (assignment?.primary ? Object.values(assignment.primary) : []);
                        candidates = primary.filter(Boolean).slice(0, 5);
                    }
                } catch (_) {}

                // プローブで存在確認（成功ノードを優先）
                let finalCandidates = candidates;
                try {
                    const probed = [];
                    for (const g of candidates) {
                        try {
                            if (this.guardianService && typeof this.guardianService.probeNodeHasShare === 'function') {
                                const ok = await this.guardianService.probeNodeHasShare(g.endpoint, masterId);
                                if (ok) probed.push(g);
                            }
                        } catch (_) {}
                    }
                    if (probed.length > 0) finalCandidates = probed;
                } catch (_) {}

                // 候補を順に試行
                for (const g of finalCandidates) {
                    try {
                        const endpoint = g.endpoint?.replace(/\/$/, '') || '';
                        const r = await fetch(`${endpoint}/mpc/recovery/sync-publickey-party2`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ masterId, curve, party2VerifyingShare })
                        });
                        const js = await r.json().catch(() => ({ success: false }));
                        if (r.ok && js && js.success) {
                            // 成功: 共有登録の冪等通知
                            try {
                                let bootstrapUrl = process.env.BOOTSTRAP_ENDPOINT || 'http://localhost:4000/bootstrap';
                                if (!/\/bootstrap$/.test(bootstrapUrl)) bootstrapUrl = bootstrapUrl.replace(/\/$/, '') + '/bootstrap';
                                await fetch(`${bootstrapUrl}/share-registered`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ masterId, curveType: curve, nodeId: g.nodeId || 'unknown', timestamp: Date.now() })
                                });
                            } catch (_) {}
                            return res.json({ success: true, guardian: { endpoint, nodeId: g.nodeId } });
                        }
                    } catch (_) {
                        // 次候補へ
                    }
                }

                return res.status(503).json({ success: false, error: 'No guardian available or sync failed' });
            } catch (e) {
                return res.status(500).json({ success:false, error: e.message });
            }
        });

        // Guardianシェア存在確認エンドポイント
        this.app.post(`/bootstrap/shares/:masterId`, async (req, res) => {
            try {
                const { masterId } = req.params;
                
                this.logger.info(`🔍 Checking Guardian shares for masterId: ${masterId}`);
                
                // guardian_network_stateテーブルからシェア情報を取得
                const query = `
                    SELECT assigned_guardians, backup_guardians 
                    FROM guardian_network_state 
                    WHERE master_id = ?
                `;
                
                const [result] = await this.db.query(query, [masterId]);
                
                let shareInfo = [];
                
                const resultRows = Array.isArray(result) ? result : [];
                if (resultRows.length > 0) {
                    const networkState = resultRows[0];
                    const assignedGuardians = networkState.assigned_guardians || [];
                    const backupGuardians = networkState.backup_guardians || [];
                    
                    // assigned_guardiansからシェア情報を抽出
                    assignedGuardians.forEach(guardian => {
                        if (guardian.shares) {
                            Object.keys(guardian.shares).forEach(curveType => {
                                const shareData = guardian.shares[curveType];
                                if (shareData.registered) {
                                    shareInfo.push({
                                        nodeId: guardian.nodeId,
                                        curveType: curveType,
                                        registered: true,
                                        registeredAt: shareData.registeredAt,
                                        timestamp: shareData.timestamp
                                    });
                                }
                            });
                        }
                    });
                    
                    // backup_guardiansからもシェア情報を抽出
                    backupGuardians.forEach(guardian => {
                        if (guardian.shares) {
                            Object.keys(guardian.shares).forEach(curveType => {
                                const shareData = guardian.shares[curveType];
                                if (shareData.registered) {
                                    shareInfo.push({
                                        nodeId: guardian.nodeId,
                                        curveType: curveType,
                                        registered: true,
                                        registeredAt: shareData.registeredAt,
                                        timestamp: shareData.timestamp
                                    });
                                }
                            });
                        }
                    });
                }
                
                this.logger.info(`📋 Found ${shareInfo.length} Guardian shares for ${masterId}`);
                
                res.json({
                    success: true,
                    masterId: masterId,
                    shares: shareInfo,
                    totalNodes: shareInfo.length,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                this.logger.error("Guardian share check failed:", error);
                res.status(500).json({
                    error: "Failed to check Guardian shares",
                    details: error.message,
                });
            }
        });

        // Bootstrap nodes取得エンドポイント（GuardianDiscoveryService に統合済みのため本体側では未定義）

        // Guardian Share API - トークン発行エンドポイント
        // POST /guardianapi/guardian/session
        this.app.post('/guardianapi/guardian/session', async (req, res) => {
            try {
                const { device_id, key_id, ops } = req.body;

                // セッション認証（Cookie または Authorization header）
                const sessionToken = req.cookies?.bv_session || 
                    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

                if (!sessionToken) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'BitVoy session required'
                    });
                }

                // セッションから master_id を取得（簡易実装）
                // 実際の実装では、セッションストレージやJWTから master_id を取得
                let masterId;
                try {
                    // セッショントークンから master_id を取得する処理
                    // ここでは簡易的にリクエストボディから取得（実際にはセッションから取得）
                    const sessionData = await this.getSessionData(sessionToken);
                    masterId = sessionData?.masterId;
                } catch (error) {
                    this.logger.error('Session validation failed:', error);
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Invalid session'
                    });
                }

                if (!masterId) {
                    return res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Master ID not found in session'
                    });
                }

                // device_id の検証
                if (!device_id) {
                    return res.status(400).json({
                        error: 'Bad Request',
                        message: 'device_id is required'
                    });
                }

                // ops のデフォルト値
                const operations = ops || ['share.save', 'share.get'];

                // Guardian Share Token を発行
                const tokenResult = await this.jwtService.issueGuardianShareToken(
                    masterId,
                    device_id,
                    key_id,
                    operations
                );

                if (!tokenResult.success) {
                    return res.status(500).json({
                        error: 'Token Issuance Failed',
                        message: tokenResult.error
                    });
                }

                // Guardian サーバのベース URL を取得（環境変数から）
                const guardianBaseUrl = process.env.GUARDIAN_URL || 'https://guardian01.bitvoy.net';

                res.json({
                    guardian_base_url: guardianBaseUrl,
                    guardian_token: tokenResult.token,
                    expires_in: tokenResult.expiresIn
                });

            } catch (error) {
                this.logger.error('Guardian session token issuance failed:', error);
                res.status(500).json({
                    error: 'Internal Server Error',
                    message: error.message
                });
            }
        });
    }

    /**
     * セッションデータ取得（簡易実装）
     * 実際の実装では、セッションストレージやJWTから取得
     */
    async getSessionData(sessionToken) {
        // TODO: 実際のセッション管理実装に置き換え
        // ここでは簡易的に JWT をデコードして masterId を取得
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.decode(sessionToken);
            return {
                masterId: decoded?.sub || decoded?.masterId
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * MPC Recovery ルート
     */
    setupRecoveryRoutes() {
        // リカバリーチャレンジ取得（masterId不要版 - パスキー認証のみ）
        this.app.post(`/mpcapi/auth/recovery/start`, async (req, res) => {
            try {
                // リクエストのOriginからRP IDを抽出
                const origin = req.headers.origin || req.headers.referer;
                if (!origin) {
                    return res.status(400).json({ error: 'Origin header is required' });
                }

                let requestRpId;
                try {
                    const url = new URL(origin);
                    requestRpId = url.hostname;
                } catch (e) {
                    this.logger.error('Failed to parse origin for recovery start:', origin);
                    return res.status(400).json({ error: 'Invalid origin format' });
                }

                // masterIdは不要（userHandleから取得するため）
                const challengeResult = await this.webauthnService.generateEmergencyAuthenticationOptions(null, requestRpId);
                
                res.json({
                    success: true,
                    challenge: challengeResult.challenge,
                    challengeKey: challengeResult.challengeKey,
                    rpId: challengeResult.rpId,
                    allowCredentials: [] // discoverable credentialを有効化
                });
            } catch (error) {
                this.logger.error("Recovery challenge generation failed:", error);
                res.status(500).json({ 
                    error: "Recovery challenge generation failed",
                    details: error.message 
                });
            }
        });

        // リカバリー認証完了（userHandleからmasterIdを抽出）
        this.app.post(`/mpcapi/auth/recovery/finish`, async (req, res) => {
            try {
                const { credential, challengeKey } = req.body;
                
                if (!credential || !challengeKey) {
                    return res.status(400).json({ 
                        error: "Missing required fields: credential or challengeKey" 
                    });
                }

                // リクエストのOriginを取得
                const origin = req.headers.origin || req.headers.referer;
                if (!origin) {
                    return res.status(400).json({ error: 'Origin header is required' });
                }

                let requestOrigin;
                try {
                    const url = new URL(origin);
                    requestOrigin = url.origin;
                } catch (e) {
                    this.logger.error('Failed to parse origin for recovery finish:', origin);
                    return res.status(400).json({ error: 'Invalid origin format' });
                }

                // 環境変数のWEBAUTHN_ORIGINと比較検証
                const expectedOrigin = process.env.WEBAUTHN_ORIGIN;
                if (expectedOrigin && requestOrigin !== expectedOrigin) {
                    this.logger.warn('Origin mismatch in emergency recovery finish', { 
                        request: requestOrigin, 
                        expected: expectedOrigin 
                    });
                    return res.status(403).json({ error: 'Invalid origin' });
                }
                
                // 既存のverifyRecoveryAuthentication関数を使用
                // この関数は既にuserHandleからmasterIdを復元する機能を実装済み
                const authResult = await this.webauthnService.verifyRecoveryAuthentication(
                    credential, 
                    challengeKey,
                    requestOrigin
                );
                
                if (!authResult.verified) {
                    return res.status(401).json({ 
                        error: "Recovery authentication failed",
                        details: authResult.error 
                    });
                }
                
                // verifyRecoveryAuthenticationの戻り値にmasterIdが含まれている
                if (!authResult.masterId) {
                    return res.status(400).json({ 
                        error: "MasterId not found in userHandle" 
                    });
                }
                
                this.logger.info('Recovery authentication successful', { 
                    masterId: authResult.masterId 
                });

                // JWTを発行（リカバリーフロー完了時にウォレット登録用JWTを発行）
                let jwtResult = null;
                if (this.jwtService) {
                    try {
                        jwtResult = await this.jwtService.issueServerJWT(
                            authResult.masterId,
                            'wallet_register',
                            {
                                source: 'recovery_flow',
                                authMethods: ['webauthn_recovery']
                            }
                        );
                    } catch (jwtError) {
                        this.logger.warn('Failed to issue wallet_register JWT during recovery finish', {
                            masterId: authResult.masterId,
                            error: jwtError.message
                        });
                        // JWT発行に失敗してもmasterIdは返す（後で別途取得可能）
                    }
                }
                
                res.json({
                    success: true,
                    masterId: authResult.masterId,
                    credentialId: authResult.credentialId,
                    verified: true,
                    // JWTが発行された場合は含める
                    ...(jwtResult?.success ? {
                        walletRegisterJWT: jwtResult.token,
                        walletRegisterJWTExpiresAt: jwtResult.expiresAt,
                        jwtRemainingQuota: jwtResult.remainingQuota
                    } : {})
                });
            } catch (error) {
                this.logger.error("Recovery authentication failed:", error);
                res.status(500).json({ 
                    error: "Recovery authentication failed",
                    details: error.message 
                });
            }
        });

        // MPC Recovery API - Guardian統合版
        this.app.post(`/mpcapi/mpc/recovery`, async (req, res) => {
            try {
                const { 
                    masterId, 
                    recoveryType, 
                    webauthnCredential, 
                    emailVerified,
                    guardianJWT,
                    context 
                } = req.body;

                if (!masterId || !recoveryType) {
                    return res
                        .status(400)
                        .json({ error: "Missing masterId or recovery type" });
                }

                let recoveryResult;

                switch (recoveryType) {
                    case 'guardian':
                        // Guardian認証ベースの復旧
                        if (!guardianJWT) {
                            return res.status(400).json({ 
                                error: "Guardian JWT required for guardian recovery" 
                            });
                        }

                        // Guardian認証確認
                        const guardianAuth = await this.guardianService.verifyGuardianAccess(
                            masterId, 
                            guardianJWT, 
                            context
                        );

                        if (!guardianAuth.verified) {
                            return res.status(401).json({ 
                                error: "Guardian authentication failed" 
                            });
                        }

                        // 新規MPC鍵生成
                        recoveryResult = await this.mpcService.generateNewKeysForRecovery(masterId);
                        break;

                    case 'email':
                        // Email認証ベースの復旧
                        // メール認証が提供されている場合は検証、提供されていない場合はスキップ
                        if (emailVerified !== undefined && !emailVerified) {
                            return res.status(401).json({ 
                                error: "Email verification required for email recovery" 
                            });
                        }

                        // パスキー認証確認
                        if (webauthnCredential) {
                            const authResult = await this.webauthnService.verifyCredential(
                                masterId, 
                                webauthnCredential
                            );
                            if (!authResult.verified) {
                                return res.status(401).json({ 
                                    error: "Passkey authentication failed" 
                                });
                            }
                        }

                        // 新規MPC鍵生成
                        recoveryResult = await this.mpcService.generateNewKeysForRecovery(masterId);
                        break;

                    default:
                        return res.status(400).json({ 
                            error: "Invalid recovery type. Use 'guardian' or 'email'" 
                        });
                }

                if (recoveryResult.success) {
                    // Guardian Networkに新規Share C配布
                    const distributeResult = await this.guardianService.distributeShareC(
                        masterId,
                        recoveryResult.shareC
                    );

                    // Guardianノードの自動割り当てを実行
                    this.logger.info(`🔄 Auto-assigning Guardian nodes for recovery: ${masterId}`);
                    const assignmentResult = await this.guardianService.saveGuardianAssignment(masterId, {
                        primaryNodes: distributeResult.assignedGuardians.slice(0, 2),
                        backupNodes: distributeResult.assignedGuardians.slice(2),
                        distributedAt: Date.now(),
                        autoAssigned: true,
                        assignedBy: 'recovery_flow'
                    });

                    this.logger.info(`✅ Guardian node auto-assignment completed for recovery: ${masterId}`);

                    res.json({
                        success: true,
                        message: "MPC recovery successful",
                        recoveryType: recoveryType,
                        newPublicKey: recoveryResult.publicKey,
                        guardianNodes: recoveryResult.guardianNodes,
                        timestamp: Date.now()
                    });
                } else {
                    res.status(500).json({
                        error: "MPC recovery failed",
                        details: recoveryResult.error
                    });
                }
            } catch (error) {
                this.logger.error("MPC recovery failed:", error);
                res.status(500).json({
                    error: "MPC recovery failed",
                    details: error.message
                });
            }
        });
    }

    /**
     * Wallet API
     */
    setupWalletRoutes() {
        // 認証ミドルウェアをインポート
        const authMiddleware = require('./server/api/middleware/auth');

        // ウォレット登録（BitVoy.js用）- 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/wallet/register`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Wallet registration request received`);
                this.logger.info(`📋 Request headers:`, {
                    contentType: req.headers['content-type'],
                    userAgent: req.headers['user-agent'],
                    authorization: req.headers.authorization ? 'Bearer [JWT]' : 'Missing',
                    timestamp: new Date().toISOString()
                });

                const { masterId, productId, address, publicKey, derivePath } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet'; // クエリパラメータまたはリクエストボディから取得

                this.logger.info(`📊 Request body:`, {
                    masterId: masterId,
                    productId: productId,
                    address: address,
                    publicKeyLength: publicKey ? publicKey.length : 0,
                    derivePath: derivePath,
                    network: network,
                    timestamp: new Date().toISOString()
                });

                // 基本バリデーション
                if (!masterId || !productId || !address || !publicKey) {
                    this.logger.warn(`❌ Missing required fields:`, {
                        hasMasterId: !!masterId,
                        hasProductId: !!productId,
                        hasAddress: !!address,
                        hasPublicKey: !!publicKey
                    });
                    return res.status(400).json({
                        status: "ERROR",
                        message: "Missing required fields",
                    });
                }

                // アドレス形式の検証
                if (!this.isValidAddress(address, productId, network)) {
                    this.logger.warn(`❌ Invalid address format for ${productId} (${network}):`, address);
                    return res.status(400).json({
                        status: "ERROR",
                        message: `Invalid address format for ${productId}`,
                    });
                }

                // 公開鍵形式の検証
                if (!this.isValidPublicKey(publicKey, productId, network)) {
                    this.logger.warn(`❌ Invalid public key format for ${productId} (${network}):`, publicKey.substring(0, 20) + "...");
                    return res.status(400).json({
                        status: "ERROR",
                        message: `Invalid public key format for ${productId}`,
                    });
                }

                // 派生パスの検証
                if (derivePath && !this.isValidDerivePath(derivePath, productId, network)) {
                    this.logger.warn(`❌ Invalid derive path for ${productId} (${network}):`, derivePath);
                    return res.status(400).json({
                        status: "ERROR",
                        message: `Invalid derive path for ${productId}`,
                    });
                }

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    this.logger.warn(`❌ MasterId mismatch:`, {
                        authenticatedUser: req.user.sub,
                        requestMasterId: masterId
                    });
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                this.logger.info(`💾 Saving wallet to database: ${productId} for ${masterId}`);

                // データベースにウォレット情報を保存
                const insertQuery = `
                    INSERT INTO mpc_wallets (id, master_id, product_id, address, public_key, derive_path, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, NOW())
                    ON DUPLICATE KEY UPDATE 
                        address = VALUES(address),
                        public_key = VALUES(public_key),
                        derive_path = VALUES(derive_path),
                        updated_at = NOW()
                `;
                
                // UUIDを生成
                const crypto = require('crypto');
                const walletId = crypto.randomUUID();
                
                this.logger.info(`📝 Executing database query for wallet registration`);
                await this.db.query(insertQuery, [
                    walletId,
                    masterId,
                    productId,
                    address,
                    publicKey,
                    derivePath,
                ]);

                this.logger.info(`✅ Wallet registered successfully: ${productId} for ${masterId}`, {
                    masterId: masterId,
                    productId: productId,
                    address: address,
                    derivePath: derivePath,
                    timestamp: new Date().toISOString()
                });

                res.json({
                    status: "OK",
                    message: "Wallet registered successfully",
                });
            } catch (error) {
                this.logger.error(`❌ Wallet registration failed:`, {
                    error: error.message,
                    stack: error.stack,
                    masterId: req.body?.masterId,
                    productId: req.body?.productId,
                    timestamp: new Date().toISOString()
                });
                res.status(500).json({
                    status: "ERROR",
                    message: "Wallet registration failed",
                });
            }
        });

        // ウォレット一覧取得 - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/wallet/list`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`📋 Wallet list request received`);

                const { masterId } = req.body;

                // 基本バリデーション
                if (!masterId) {
                    this.logger.warn(`❌ Missing masterId`);
                    return res.status(400).json({
                        status: "ERROR",
                        message: "Missing required field: masterId",
                    });
                }

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    this.logger.warn(`❌ MasterId mismatch:`, {
                        authenticatedUser: req.user.sub,
                        requestMasterId: masterId
                    });
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                this.logger.info(`💾 Fetching wallets from database for masterId: ${masterId}`);

                // データベースからウォレット一覧を取得
                const selectQuery = `
                    SELECT 
                        id,
                        master_id,
                        product_id,
                        address,
                        public_key,
                        derive_path,
                        created_at,
                        updated_at
                    FROM mpc_wallets
                    WHERE master_id = ?
                    ORDER BY created_at ASC
                `;

                const [rows] = await this.db.query(selectQuery, [masterId]);

                // レスポンス形式に整形
                const wallets = (rows || []).map(row => ({
                    productId: row.product_id,
                    address: row.address,
                    publicKey: row.public_key,
                    derivePath: row.derive_path || null,
                    addressindex: "0", // デフォルト値（HDWallet廃止により固定）
                    id: row.id,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                }));

                this.logger.info(`✅ Found ${wallets.length} wallets for masterId: ${masterId}`);

                res.json({
                    status: "OK",
                    wallets: wallets
                });
            } catch (error) {
                this.logger.error(`❌ Wallet list fetch failed:`, {
                    error: error.message,
                    stack: error.stack,
                    masterId: req.body?.masterId,
                    timestamp: new Date().toISOString()
                });
                res.status(500).json({
                    status: "ERROR",
                    message: "Failed to fetch wallet list",
                });
            }
        });

        // ウォレット残高取得 - 認証必須（BitVoy Server用JWT）
        this.app.post(
            `/walletapi/wallet/:masterId/balances`,
            authMiddleware,
            async (req, res) => {
                try {
                    const { masterId } = req.params;

                    // 認証されたユーザーのmasterIdと一致することを確認
                    if (req.user && req.user.sub && req.user.sub !== masterId) {
                        return res.status(403).json({
                            status: "ERROR",
                            message: "MasterId mismatch with authenticated user",
                        });
                    }
                    const balances =
                        await this.walletService.getAllBalances(masterId);
                    res.json({ status: "OK", data: balances });
                } catch (error) {
                    this.logger.error("Failed to get wallet balances:", error);
                    res.status(500).json({
                        status: "ERROR",
                        message: "Failed to get balances",
                    });
                }
            },
        );
        // トランザクション履歴取得 - 認証必須（BitVoy Server用JWT）
        this.app.post(
            `/walletapi/wallet/:masterId/transactions`,
            authMiddleware,
            async (req, res) => {
                try {
                    const { masterId } = req.params;
                    const { page = 1, limit = 25, blockchain } = req.query;
                    // 認証されたユーザーのmasterIdと一致することを確認
                    if (req.user && req.user.sub && req.user.sub !== masterId) {
                        return res.status(403).json({
                            status: "ERROR",
                            message: "MasterId mismatch with authenticated user",
                        });
                    }

                    const transactions =
                        await this.walletService.getTransactionHistory(
                            masterId,
                            parseInt(page),
                            parseInt(limit),
                            blockchain,
                        );
                    res.json({ status: "OK", data: transactions });
                } catch (error) {
                    this.logger.error(
                        "Failed to get transaction history:",
                        error,
                    );
                    res.status(500).json({
                        status: "ERROR",
                        message: "Failed to get transactions",
                    });
                }
            },
        );

        // 手数料見積もり取得エンドポイント（認証不要）
        this.app.post(`/walletapi/fee/estimate`, async (req, res) => {
            try {
                const { productId, network = 'mainnet', protocol } = req.body;
                const reqId = req.body.reqId || `${Date.now()}.1`;

                this.logger.info(`💰 Fee estimate request:`, {
                    productId,
                    network,
                    protocol,
                    reqId
                });

                // バリデーション
                if (!productId) {
                    return res.status(400).json({
                        reqId,
                        status: 'NG',
                        message: 'productId is required'
                    });
                }

                // プロダクト情報を取得
                const product = WalletService.PRODUCTS[productId];
                if (!product) {
                    return res.status(400).json({
                        reqId,
                        status: 'NG',
                        message: `Unsupported coin type: ${productId}`
                    });
                }

                const chain = product.chain === 'bitcoin' ? 'BTC' :
                             product.chain === 'ethereum' ? 'ETH' :
                             product.chain === 'polygon' ? 'POL' :
                             product.chain === 'avalanche' ? 'AVAX' :
                             product.chain === 'solana' ? 'SOL' :
                             product.chain === 'ton' ? 'TON' : product.chain.toUpperCase();

                let feerates = {};
                let baseValue = '';
                let usdrate = '1.0';
                let status = 'OK';

                try {
                    // チェーン別の処理
                    if (chain === 'BTC') {
                        feerates = await WalletService.getEstimateFees(productId, network, this.db);
                        usdrate = await WalletService.getUSDExchangeRate('bitcoin', this.db);
                    } else if (chain === 'ETH') {
                        feerates = await WalletService.getEstimateFees(productId, network, this.db);
                        baseValue = protocol === 'ERC721' ? '100000' : '21000'; // ETH_GAS_LIMIT_ERC721 or ETH_GAS_LIMIT
                        usdrate = await WalletService.getUSDExchangeRate('ethereum', this.db);
                    } else if (chain === 'POL') {
                        feerates = await WalletService.getEstimateFees(productId, network, this.db);
                        baseValue = protocol === 'ERC721' ? '100000' : '21000'; // ETH_GAS_LIMIT_ERC721 or ETH_GAS_LIMIT
                        usdrate = await WalletService.getUSDExchangeRate('matic-network', this.db);
                    } else if (chain === 'AVAX') {
                        feerates = await WalletService.getEstimateFees(productId, network, this.db);
                        baseValue = '21000'; // ETH_GAS_LIMIT (EVM互換)
                        usdrate = await WalletService.getUSDExchangeRate('avalanche-2', this.db);
                    } else if (chain === 'SOL') {
                        // Solanaは固定手数料（5000 lamports）
                        feerates = {
                            fastestFee: '5000',
                            halfHourFee: '5000',
                            hourFee: '5000'
                        };
                        usdrate = await WalletService.getUSDExchangeRate('solana', this.db);
                    } else if (chain === 'TON') {
                        // TONは固定手数料（0.05 TON）
                        feerates = {
                            fastestFee: '0.05',
                            halfHourFee: '0.05',
                            hourFee: '0.05'
                        };
                        usdrate = await WalletService.getUSDExchangeRate('the-open-network', this.db);
                    } else {
                        status = 'NG';
                    }

                    // feeratesが空の場合、testnetの場合はデフォルト値を設定
                    if (Object.keys(feerates).length === 0 && status === 'OK' && network === 'testnet') {
                        if (chain === 'POL') {
                            feerates = {
                                fastestFee: '20',
                                halfHourFee: '15',
                                hourFee: '10'
                            };
                            this.logger.info('Using default Polygon testnet fees');
                        } else if (chain === 'ETH') {
                            feerates = {
                                fastestFee: '20',
                                halfHourFee: '15',
                                hourFee: '10'
                            };
                            this.logger.info('Using default Ethereum testnet fees');
                        } else if (chain === 'AVAX') {
                            feerates = {
                                fastestFee: '25',
                                halfHourFee: '25',
                                hourFee: '25'
                            };
                            this.logger.info('Using default Avalanche testnet fees');
                        }
                    }

                } catch (error) {
                    this.logger.error(`getEstimateFee error: ${error.message}`);
                    status = 'NG';
                    feerates = {};
                }

                const retData = {
                    reqId,
                    status,
                    feerate: feerates,
                    baseValue,
                    usdrate
                };

                this.logger.info(`✅ Fee estimate response:`, {
                    reqId,
                    status,
                    productId,
                    network,
                    hasFeerate: Object.keys(feerates).length > 0
                });

                res.json(retData);
            } catch (error) {
                this.logger.error(`❌ Fee estimate endpoint error:`, {
                    error: error.message,
                    stack: error.stack
                });
                res.status(500).json({
                    reqId: req.body?.reqId || `${Date.now()}.1`,
                    status: 'NG',
                    message: 'Internal server error'
                });
            }
        });

        // カスタムトークン追加エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/custom-token/add`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Custom token add request received`);
                
                const { 
                    reqId, 
                    masterId, 
                    productId, 
                    network, 
                    contractAddress, 
                    name, 
                    symbol, 
                    decimals, 
                    tokenAddress 
                } = req.body;

                // 基本バリデーション
                if (!reqId || !masterId || !productId || !network || !contractAddress || !name || !symbol || !decimals) {
                    this.logger.warn(`❌ Missing required fields`);
                    return res.status(400).json({
                        reqId: reqId || `${Date.now()}.1`,
                        status: "NG",
                        message: "Required parameters are missing"
                    });
                }

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    this.logger.warn(`❌ MasterId mismatch:`, {
                        authenticatedUser: req.user.sub,
                        requestMasterId: masterId
                    });
                    return res.status(403).json({
                        reqId,
                        status: "NG",
                        message: "MasterId mismatch with authenticated user"
                    });
                }

                // ネットワークに基づいてコインタイプを設定（小文字のネットワーク名のみ対応）
                const coinTypeMap = {
                    'bitcoin': '0',
                    'ethereum': '60',
                    'polygon': '137',
                    'solana': '501',
                    'ton': '607',
                    'bsc': '56',
                    'avalanche': '43114',
                    'arbitrum': '42161',
                    'base': '8453',
                    'optimism': '10'
                };
                const networkLower = network.toLowerCase();
                const coinType = coinTypeMap[networkLower] || '0';

                // カスタムトークン用のwallet_idを生成
                const crypto = require('crypto');
                const walletId = `custom_${masterId}_${productId}_${Date.now()}`;

                // ネイティブコインのアドレスを取得（元のネットワーク名を使用）
                let relWalletAddress = null;
                if (['ethereum', 'polygon', 'solana', 'ton'].includes(networkLower)) {
                    const [relWalletRows] = await this.db.query(
                        `SELECT wa.address 
                         FROM wallet_address wa 
                         JOIN wallet_info wi ON wa.wallet_id = wi.wallet_id 
                         WHERE wa.master_id = ? AND wi.product_id = ? 
                         AND wi.delete_flag = 0 
                         LIMIT 1`,
                        [masterId, network]
                    );
                    if (relWalletRows && relWalletRows.length > 0) {
                        relWalletAddress = relWalletRows[0].address;
                    }
                }

                // ウォレット名を生成
                const walletName = `Custom ${symbol} (${network})`;

                // 既存のカスタムトークンをチェック
                const [existingRows] = await this.db.query(
                    `SELECT COUNT(*) as count FROM wallet_info 
                     WHERE master_id = ? AND product_id = ? AND delete_flag = 0`,
                    [masterId, productId]
                );

                if (existingRows && existingRows.length > 0 && existingRows[0].count > 0) {
                    this.logger.warn(`❌ Custom token already exists: ${productId}`);
                    return res.json({
                        reqId,
                        status: "NG",
                        message: "Custom token already exists",
                        productId
                    });
                }

                // カスタムトークンをデータベースに登録
                await this.db.query(
                    `INSERT INTO wallet_info (
                        master_id, product_id, hd_pass, coin_type, token_symbol, 
                        contract_address, decimals, wallet_id, rel_wallet_address,
                        wallet_name, token_name, update_date, delete_flag
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0)`,
                    [
                        masterId, productId, 'm/44\'/60\'/0\'/0/0', coinType, symbol,
                        contractAddress, decimals, walletId, relWalletAddress,
                        walletName, name
                    ]
                );

                // トークンアドレスをwallet_addressテーブルに登録（既存の構造に合わせる）
                if (tokenAddress) {
                    await this.db.query(
                        `INSERT INTO wallet_address 
                         (master_id, product_id, coin_type, wallet_id, address, address_index, block_count, update_date) 
                         VALUES (?, ?, ?, ?, ?, 0, 0, NOW())`,
                        [masterId, productId, coinType, walletId, tokenAddress]
                    );
                }

                this.logger.info(`✅ Custom token added successfully: ${productId} for ${masterId}`);

                res.json({
                    reqId,
                    status: "OK",
                    message: "Custom token added successfully",
                    productId
                });
            } catch (error) {
                this.logger.error(`❌ Custom token add failed:`, {
                    error: error.message,
                    stack: error.stack,
                    reqId: req.body?.reqId
                });
                res.status(500).json({
                    reqId: req.body?.reqId || `${Date.now()}.1`,
                    status: "NG",
                    message: "Failed to add custom token"
                });
            }
        });

        // カスタムトークン取得エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/custom-token/get`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Custom token get request received`);
                
                const { reqId, masterId } = req.body;

                // 基本バリデーション
                if (!reqId || !masterId) {
                    this.logger.warn(`❌ Missing required fields`);
                    return res.status(400).json({
                        reqId: reqId || `${Date.now()}.1`,
                        status: "NG",
                        message: "Required parameters are missing"
                    });
                }

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    this.logger.warn(`❌ MasterId mismatch:`, {
                        authenticatedUser: req.user.sub,
                        requestMasterId: masterId
                    });
                    return res.status(403).json({
                        reqId,
                        status: "NG",
                        message: "MasterId mismatch with authenticated user"
                    });
                }

                // カスタムトークンを取得（TOKEN_INFO_BY_PRODUCTに含まれていないもの）
                // 標準トークンのproductIdリストを取得（WalletServiceから）
                const WalletService = require('./server/services/WalletService');
                const standardProductIds = Object.keys(WalletService.PRODUCTS || {});
                
                // wallet_infoテーブルからカスタムトークンを取得
                const [walletInfoRows] = await this.db.query(
                    `SELECT 
                        product_id, coin_type, token_symbol, wallet_id, 
                        contract_address, decimals, wallet_name, token_name, rel_wallet_address
                     FROM wallet_info 
                     WHERE master_id = ? AND delete_flag = 0
                     ORDER BY update_date ASC`,
                    [masterId]
                );

                const customTokens = [];
                
                // coin_typeからネットワーク名をマッピング
                const coinTypeToNetwork = {
                    '0': 'bitcoin',
                    '60': 'ethereum',
                    '137': 'polygon',
                    '966': 'polygon',
                    '501': 'solana',
                    '607': 'ton',
                    '56': 'bsc',
                    '43114': 'avalanche',
                    '42161': 'arbitrum',
                    '8453': 'base',
                    '10': 'optimism',
                    '195': 'tron'
                };
                
                if (walletInfoRows && walletInfoRows.length > 0) {
                    for (const walletInfo of walletInfoRows) {
                        const productId = walletInfo.product_id;
                        
                        // 標準トークンでない場合のみカスタムトークンとして扱う
                        if (!standardProductIds.includes(productId)) {
                            // アドレスをwallet_addressテーブルから取得
                            let address = null;
                            if (walletInfo.wallet_id) {
                                const [addressRows] = await this.db.query(
                                    `SELECT address FROM wallet_address 
                                     WHERE master_id = ? AND wallet_id = ? 
                                     LIMIT 1`,
                                    [masterId, walletInfo.wallet_id]
                                );
                                if (addressRows && addressRows.length > 0) {
                                    address = addressRows[0].address;
                                }
                            }
                            
                            // coin_typeからネットワークを推測
                            const network = coinTypeToNetwork[walletInfo.coin_type] || 'ethereum';
                            
                            customTokens.push({
                                productId: productId,
                                coinType: walletInfo.coin_type,
                                tokenSymbol: walletInfo.token_symbol,
                                walletId: walletInfo.wallet_id,
                                contractAddress: walletInfo.contract_address,
                                decimals: walletInfo.decimals,
                                walletName: walletInfo.wallet_name,
                                tokenName: walletInfo.token_name,
                                relWalletAddress: walletInfo.rel_wallet_address,
                                address: address,
                                network: network
                            });
                        }
                    }
                }

                this.logger.info(`✅ Custom tokens retrieved: ${customTokens.length} tokens for ${masterId}`);

                res.json({
                    reqId,
                    status: "OK",
                    message: "Custom tokens retrieved successfully",
                    customTokens: customTokens
                });
            } catch (error) {
                this.logger.error(`❌ Custom token get failed:`, {
                    error: error.message,
                    stack: error.stack,
                    reqId: req.body?.reqId
                });
                res.status(500).json({
                    reqId: req.body?.reqId || `${Date.now()}.1`,
                    status: "NG",
                    message: "Failed to get custom tokens"
                });
            }
        });

        // カスタムトークン削除エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/custom-token/remove`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Custom token remove request received`);
                
                const { reqId, masterId, productId } = req.body;

                // 基本バリデーション
                if (!reqId || !masterId || !productId) {
                    this.logger.warn(`❌ Missing required fields`);
                    return res.status(400).json({
                        reqId: reqId || `${Date.now()}.1`,
                        status: "NG",
                        message: "Required parameters are missing"
                    });
                }

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    this.logger.warn(`❌ MasterId mismatch:`, {
                        authenticatedUser: req.user.sub,
                        requestMasterId: masterId
                    });
                    return res.status(403).json({
                        reqId,
                        status: "NG",
                        message: "MasterId mismatch with authenticated user"
                    });
                }

                // カスタムトークンが存在するかチェック
                const [existingRows] = await this.db.query(
                    `SELECT COUNT(*) as count FROM wallet_info 
                     WHERE master_id = ? AND product_id = ? AND delete_flag = 0`,
                    [masterId, productId]
                );

                if (!existingRows || existingRows.length === 0 || existingRows[0].count === 0) {
                    this.logger.warn(`❌ Custom token not found: ${productId}`);
                    return res.json({
                        reqId,
                        status: "NG",
                        message: "Custom token not found",
                        productId
                    });
                }

                // カスタムトークンを論理削除
                await this.db.query(
                    `UPDATE wallet_info SET delete_flag = 1, update_date = NOW() 
                     WHERE master_id = ? AND product_id = ?`,
                    [masterId, productId]
                );

                // 関連するアドレスも削除
                await this.db.query(
                    `DELETE FROM wallet_address WHERE master_id = ? AND product_id = ?`,
                    [masterId, productId]
                );

                this.logger.info(`✅ Custom token removed successfully: ${productId} for ${masterId}`);

                res.json({
                    reqId,
                    status: "OK",
                    message: "Custom token removed successfully",
                    productId
                });
            } catch (error) {
                this.logger.error(`❌ Custom token remove failed:`, {
                    error: error.message,
                    stack: error.stack,
                    reqId: req.body?.reqId
                });
                res.status(500).json({
                    reqId: req.body?.reqId || `${Date.now()}.1`,
                    status: "NG",
                    message: "Failed to remove custom token"
                });
            }
        });
    }

    setupSmartAccountRoutes() {
        // 認証ミドルウェアをインポート
        const authMiddleware = require('./server/api/middleware/auth');

        // Smart Accountアドレス登録エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/aa/smart-account/register`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Smart Account registration request received`);
                
                const { chain, network, currency, owner_eoa, smart_account_address } = req.body;
                const masterId = req.user?.sub || req.body?.masterId;

                // 基本バリデーション
                if (!chain || !network || !currency || !owner_eoa || !smart_account_address) {
                    this.logger.warn(`❌ Missing required fields`);
                    return res.status(400).json({
                        status: "NG",
                        message: "Required parameters are missing: chain, network, currency, owner_eoa, smart_account_address"
                    });
                }
                
                // currencyを大文字に正規化
                const normalizedCurrency = currency.toUpperCase();

                if (!masterId) {
                    this.logger.warn(`❌ MasterId not found`);
                    return res.status(400).json({
                        status: "NG",
                        message: "MasterId is required"
                    });
                }

                // user_subject取得（masterIdから）
                const userSubject = masterId;

                // Salt計算（createSmartAccount.js / MPCAddressGenerator と同じ: keccak256(solidityPack(string, uint256, string))）
                const chainIdMap = {
                    'ethereum': { 'mainnet': 1, 'testnet': 5 },
                    'polygon': { 'mainnet': 137, 'testnet': 80002 },
                    'avalanche': { 'mainnet': 43114, 'testnet': 43113 }
                };
                const chainId = chainIdMap[chain]?.[network];
                if (!chainId) {
                    return res.status(400).json({
                        status: "NG",
                        message: `Unknown chain/network: ${chain}/${network}`
                    });
                }
                const saltVersion = "IBUO-v1";
                // tokenAddress を salt に含める（同一 Factory で USDC/JPYC 別 SA）
                const getTokenAddress = (chain, network, currency) => {
                    const saConfig = this.config.sa[chain]?.[network];
                    if (!saConfig || !saConfig.allowedTokens) return null;
                    const tokenConfig = saConfig.allowedTokens[currency];
                    return tokenConfig?.tokenAddress || null;
                };
                const tokenAddressForSalt = getTokenAddress(chain, network, normalizedCurrency);
                const salt = tokenAddressForSalt
                    ? ethers.utils.keccak256(
                        ethers.utils.solidityPack(["string", "uint256", "string", "address"], [userSubject, chainId, saltVersion, tokenAddressForSalt])
                    )
                    : ethers.utils.keccak256(
                        ethers.utils.solidityPack(["string", "uint256", "string"], [userSubject, chainId, saltVersion])
                    );

                // SA設定取得（configから取得）
                // V2 factory が設定されていれば { address, version:2 }、なければ V1 { address, version:1 }
                const getFactoryInfo = (chain, network, currency) => {
                    const saConfig = this.config.sa[chain]?.[network];
                    if (!saConfig) return { address: null, version: 1 };
                    if (saConfig.factoryV2Address) {
                        return { address: saConfig.factoryV2Address, version: 2 };
                    }
                    const tokenConfig = saConfig.allowedTokens?.[currency];
                    return { address: tokenConfig?.factoryAddress || null, version: 1 };
                };

                const getEntryPointAddress = (chain, network) => {
                    return this.config.sa[chain]?.[network]?.entryPointAddress || null;
                };

                const getOPSignerAddress = (chain, network) => {
                    return this.config.sa[chain]?.[network]?.opSignerAddress || null;
                };

                // データベースに保存（aa_smart_accountsテーブルが存在する場合）
                // 注意: factory_addressは通貨ごとに異なるため、ここではnullを保存
                // 実際のfactory_addressは通貨ごとのSmart Account登録時に設定される
                try {
                    // テーブルが存在するかチェック
                    const [tableCheck] = await this.db.query(
                        `SELECT COUNT(*) as count FROM information_schema.tables 
                         WHERE table_schema = DATABASE() AND table_name = 'aa_smart_accounts'`
                    );

                    if (tableCheck && tableCheck[0] && tableCheck[0].count > 0) {
                        // currencyからfactory_addressとsa_versionを取得
                        const { address: factoryAddress, version: saVersion } = getFactoryInfo(chain, network, normalizedCurrency);

                        // 既存のSmartAccountアドレスを確認（新しいSmartAccountインスタンスかどうかを判定）
                        const [existingRows] = await this.db.query(
                            `SELECT smart_account_address, factory_address FROM aa_smart_accounts
                             WHERE user_subject = ? AND chain = ? AND network = ? AND currency = ?`,
                            [userSubject, chain, network, normalizedCurrency]
                        );

                        const existingSmartAccount = existingRows && existingRows[0];
                        const isNewSmartAccountInstance = existingSmartAccount &&
                            (existingSmartAccount.smart_account_address !== smart_account_address ||
                             existingSmartAccount.factory_address !== factoryAddress);

                        await this.db.query(
                            `INSERT INTO aa_smart_accounts
                             (user_subject, chain, network, currency, owner_eoa, smart_account_address,
                              factory_address, entry_point, op_signer, salt, intent_nonce_counter, sa_version)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                             smart_account_address = VALUES(smart_account_address),
                             owner_eoa = VALUES(owner_eoa),
                             factory_address = VALUES(factory_address),
                             sa_version = VALUES(sa_version),
                             salt = VALUES(salt),
                             intent_nonce_counter = CASE
                                 WHEN smart_account_address != VALUES(smart_account_address) OR
                                      factory_address != VALUES(factory_address)
                                 THEN 0
                                 ELSE intent_nonce_counter
                             END,
                             updated_at = CURRENT_TIMESTAMP(3)`,
                            [
                                userSubject,
                                chain,
                                network,
                                normalizedCurrency,
                                owner_eoa,
                                smart_account_address,
                                factoryAddress,
                                getEntryPointAddress(chain, network),
                                getOPSignerAddress(chain, network),
                                salt,
                                0,  // 新規作成時は0
                                saVersion
                            ]
                        );
                        
                        if (isNewSmartAccountInstance) {
                            this.logger.info(`[AA] New SmartAccount instance detected: resetting intent_nonce_counter to 0`, {
                                userSubject,
                                chain,
                                network,
                                currency: normalizedCurrency,
                                oldAddress: existingSmartAccount?.smart_account_address,
                                newAddress: smart_account_address,
                                oldFactory: existingSmartAccount?.factory_address,
                                newFactory: factoryAddress
                            });
                        }

                        this.logger.info(`[SA] Smart Account registered:`, {
                            userSubject,
                            chain,
                            network,
                            currency: normalizedCurrency,
                            smart_account_address,
                            sa_version: saVersion,
                            factory_address: factoryAddress
                        });
                    } else {
                        this.logger.warn(`[SA] aa_smart_accounts table does not exist, skipping database save`);
                    }
                } catch (dbError) {
                    this.logger.error(`[SA] Database error:`, dbError);
                    // データベースエラーは警告のみ（既存フローは継続）
                }

                res.json({
                    status: "OK",
                    success: true,
                    smart_account_address,
                    chain,
                    network
                });

            } catch (error) {
                this.logger.error('[SA] Registration error:', error);
                res.status(500).json({
                    status: "NG",
                    error: 'server_error',
                    message: error.message
                });
            }
        });

        // Smart Accountアドレス取得エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.get(`/walletapi/aa/smart-account/get`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Smart Account get request received`);
                
                const { chain, network, currency } = req.query;
                const masterId = req.user?.sub;

                if (!masterId) {
                    this.logger.warn(`❌ MasterId not found`);
                    return res.status(400).json({
                        status: "NG",
                        message: "MasterId is required"
                    });
                }

                const userSubject = masterId;

                let query = `SELECT * FROM aa_smart_accounts WHERE user_subject = ?`;
                const params = [userSubject];

                if (chain) {
                    query += ` AND chain = ?`;
                    params.push(chain);
                }
                if (network) {
                    query += ` AND network = ?`;
                    params.push(network);
                }
                if (currency) {
                    query += ` AND currency = ?`;
                    params.push(currency.toUpperCase());
                }

                // テーブルが存在するかチェック
                const [tableCheck] = await this.db.query(
                    `SELECT COUNT(*) as count FROM information_schema.tables 
                     WHERE table_schema = DATABASE() AND table_name = 'aa_smart_accounts'`
                );

                if (!tableCheck || !tableCheck[0] || tableCheck[0].count === 0) {
                    return res.json({
                        status: "OK",
                        success: true,
                        smart_accounts: []
                    });
                }

                const [rows] = await this.db.query(query, params);

                res.json({
                    status: "OK",
                    success: true,
                    smart_accounts: rows
                });

            } catch (error) {
                this.logger.error('[SA] Get error:', error);
                res.status(500).json({
                    status: "NG",
                    error: 'server_error',
                    message: error.message
                });
            }
        });

        // UserOperation構築エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/aa/build-userop`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Build UserOperation request received`);
                
                const { intent_id } = req.body;
                const masterId = req.user?.sub;

                if (!intent_id) {
                    return res.status(400).json({
                        status: "NG",
                        message: "intent_id is required"
                    });
                }

                if (!masterId) {
                    return res.status(400).json({
                        status: "NG",
                        message: "MasterId is required"
                    });
                }

                // Intent取得（oidc_payment_intentsテーブルから）
                const [intentRows] = await this.db.query(
                    `SELECT * FROM oidc_payment_intents WHERE intent_id = ?`,
                    [intent_id]
                );

                if (!intentRows || intentRows.length === 0) {
                    return res.status(404).json({
                        status: "NG",
                        message: "Intent not found"
                    });
                }

                const intent = intentRows[0];

                // execution_modeがAAでない場合はエラー
                if (intent.execution_mode !== 'AA') {
                    return res.status(400).json({
                        status: "NG",
                        message: "Intent is not in AA execution mode"
                    });
                }

                // Smart Accountアドレス取得
                const userSubject = masterId;
                // chainとnetworkを小文字に正規化（データベースやconfigのキーと一致させるため）
                const chain = intent.chain ? intent.chain.toLowerCase() : null;
                const network = intent.network ? intent.network.toLowerCase() : null;

                if (!chain || !network) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Chain and network are required in intent"
                    });
                }

                // currencyも正規化
                const currency = intent.currency ? intent.currency.toUpperCase() : null;

                if (!currency) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Currency is required in intent"
                    });
                }

                const [saRows] = await this.db.query(
                    `SELECT * FROM aa_smart_accounts 
                     WHERE user_subject = ? AND chain = ? AND network = ? AND currency = ?`,
                    [userSubject, chain, network, currency]
                );

                if (!saRows || saRows.length === 0) {
                    return res.status(404).json({
                        status: "NG",
                        message: `Smart Account not found. Please register first. (chain: ${chain}, network: ${network}, currency: ${currency})`
                    });
                }

                const smartAccount = saRows[0];
                let smartAccountAddress = smartAccount.smart_account_address; // letに変更（Factoryが計算したアドレスで更新する可能性があるため）
                const entryPointAddress = smartAccount.entry_point;
                const saVersion = parseInt(smartAccount.sa_version || 2);
                if (saVersion !== 2) {
                    return res.status(400).json({ status: "NG", message: `sa_version=${saVersion} is not supported. Only V2 Smart Accounts (sa_version=2) are allowed.` });
                }

                // smartAccountAddressの検証
                if (!smartAccountAddress) {
                    return res.status(500).json({
                        status: "NG",
                        message: "Smart Account address is not set in database"
                    });
                }

                // intent_nonceが存在しない場合、Smart Accountから取得
                if (!intent.intent_nonce) {
                    const connection = await this.db.getConnection();
                    try {
                        await connection.beginTransaction();
                        
                        // intent_nonce_counterを取得して+1
                        let intentNonceCounter = parseInt(smartAccount.intent_nonce_counter || 0);
                        
                        await connection.query(
                            `UPDATE aa_smart_accounts 
                             SET intent_nonce_counter = intent_nonce_counter + 1, updated_at = NOW()
                             WHERE user_subject = ? AND chain = ? AND network = ? AND currency = ?`,
                            [userSubject, chain, network, currency]
                        );
                        
                        // 更新後の値を取得
                        const [updatedRows] = await connection.query(
                            `SELECT intent_nonce_counter FROM aa_smart_accounts 
                             WHERE user_subject = ? AND chain = ? AND network = ? AND currency = ?`,
                            [userSubject, chain, network, currency]
                        );
                        
                        intentNonceCounter = parseInt(updatedRows[0]?.intent_nonce_counter || 0) - 1; // 更新前の値
                        
                        // Intentのintent_nonceを更新
                        await connection.query(
                            `UPDATE oidc_payment_intents 
                             SET intent_nonce = ? 
                             WHERE intent_id = ?`,
                            [intentNonceCounter.toString(), intent_id]
                        );
                        
                        await connection.commit();
                        
                        // intentオブジェクトにintent_nonceを設定
                        intent.intent_nonce = intentNonceCounter.toString();
                    } catch (error) {
                        await connection.rollback();
                        this.logger.error(`[AA] Failed to get intent_nonce_counter:`, error);
                        // エラーが発生しても続行（フォールバック処理を使用）
                    } finally {
                        connection.release();
                    }
                }

                // aa-utilsをインポート
                const aaUtils = require('./server/utils/aa-utils');
                const { ethers } = require('ethers');

                // Chain ID取得
                const chainIdMap = {
                    'ethereum': { 'mainnet': 1, 'testnet': 5 },
                    'polygon': { 'mainnet': 137, 'testnet': 80002 },
                    'avalanche': { 'mainnet': 43114, 'testnet': 43113 }
                };
                const chainId = chainIdMap[chain]?.[network];
                if (!chainId) {
                    return res.status(400).json({
                        status: "NG",
                        message: `Unknown chain/network: ${chain}/${network}`
                    });
                }

                // トークンアドレス取得（currencyから判定、WalletService.CONTRACTSから取得）
                // AAサポート対象トークンのチェック
                // currencyは既に取得済み（上記で取得）
                const supportedTokens = WalletService.AA_SUPPORTED_TOKENS[chain]?.[network];
                
                if (!currency || !supportedTokens || !supportedTokens.includes(currency)) {
                    const supportedList = supportedTokens ? supportedTokens.join(', ') : 'none';
                    return res.status(400).json({
                        status: "NG",
                        message: `Unsupported currency: ${currency}. Supported tokens for ${chain}/${network}: ${supportedList}`
                    });
                }

                // WalletService.CONTRACTSから取得
                const contracts = WalletService.CONTRACTS;
                const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet';
                const chainKey = chain.toLowerCase(); // 'polygon'
                
                if (!contracts[networkKey] || !contracts[networkKey][currency] || !contracts[networkKey][currency][chainKey]) {
                    return res.status(400).json({
                        status: "NG",
                        message: `Token contract not found for ${currency} on ${chain}/${network}`
                    });
                }

                const tokenContract = contracts[networkKey][currency][chainKey];
                const tokenAddress = tokenContract.address || null;
                
                if (!tokenAddress) {
                    return res.status(400).json({
                        status: "NG",
                        message: `Token address not configured for ${currency} on ${chain}/${network}`
                    });
                }

                // IntentPayloadV1作成
                const intentPayload = aaUtils.createIntentPayloadV1(
                    {
                        intent_id: intent.intent_id,
                        rp_client_id: intent.rp_client_id,
                        order_ref: intent.order_ref,
                        amount: intent.amount.toString(),
                        payee_address: intent.payee_address,
                        created_at: intent.created_at,
                        expires_at: intent.expires_at,
                        nonce: intent.nonce,
                        intent_nonce: intent.intent_nonce // intent_nonceカウンタを追加
                    },
                    tokenAddress,
                    chainId
                );

                // IntentPayloadの検証
                if (!intentPayload) {
                    return res.status(500).json({
                        status: "NG",
                        message: "Failed to create intent payload"
                    });
                }

                // ---- Intent Hash + callData (V2 only) ----
                // V2 path: compact callData (228 bytes), non-EIP-712 hash, opSig appended in send-userop
                const intentNonceV2 = parseInt(intentPayload.intent_nonce) || 0;
                const intentHash = aaUtils.computeIntentHashV2(
                    tokenAddress,
                    intentPayload.payee,
                    intentPayload.amount.toString(),
                    intentPayload.valid_after,
                    intentPayload.valid_until,
                    intentNonceV2,
                    chainId,
                    intent.rp_client_id,
                    intent.order_ref,
                    intent.intent_id
                );

                // Persist V2 intentHash so send-userop can retrieve it for opSig
                await this.db.query(
                    `UPDATE oidc_payment_intents SET intent_hash = ? WHERE intent_id = ?`,
                    [intentHash, intent_id]
                );

                const saABI_V2 = ["function executeIntentV2(address,address,uint256,bytes32,uint48,uint48,uint32)"];
                const callData = new ethers.utils.Interface(saABI_V2).encodeFunctionData('executeIntentV2', [
                    tokenAddress,
                    intentPayload.payee,
                    intentPayload.amount.toString(),
                    intentHash,
                    intentPayload.valid_after,
                    intentPayload.valid_until,
                    intentNonceV2
                ]);
                this.logger.info(`[AA] V2 callData built: intentHash=${intentHash} callDataLen=${(callData.length-2)/2}B`);

                // EntryPointからnonce取得（configから取得）
                const rpcUrl = this.config.sa[chain]?.[network]?.rpcUrl;
                if (!rpcUrl) {
                    return res.status(400).json({
                        status: "NG",
                        message: "RPC URL not configured"
                    });
                }

                const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
                const entryPointABI = [
                    "function getNonce(address sender, uint192 key) external view returns (uint256 nonce)",
                    "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
                ];
                const entryPointContract = new ethers.Contract(entryPointAddress, entryPointABI, provider);
                const nonce = await entryPointContract.getNonce(smartAccountAddress, 0);

                // まず、ecdsa_tss公開鍵から正しいownerAddressを計算（initCode生成とownerAddress返却の両方で使用）
                let computedOwnerAddress = null;
                try {
                    const [walletRows] = await this.db.query(
                        `SELECT public_key FROM p2_mpc_wallets 
                         WHERE master_id = ? AND curve_type = 'ecdsa_tss' 
                         LIMIT 1`,
                        [masterId]
                    );
                    
                    if (walletRows && walletRows.length > 0) {
                        const ecdsaTssPublicKey = walletRows[0].public_key;
                        
                        // ecdsa_tss公開鍵を正規化
                        let publicKeyHex = ecdsaTssPublicKey;
                        if (!publicKeyHex.startsWith('0x')) {
                            publicKeyHex = '0x' + publicKeyHex;
                        }
                        
                        // 65バイト非圧縮形式（0x04で始まる）に正規化
                        const publicKeyWithout0x = publicKeyHex.substring(2);
                        if (publicKeyWithout0x.length === 128 && !publicKeyWithout0x.startsWith('04')) {
                            publicKeyHex = '0x04' + publicKeyWithout0x;
                            this.logger.info(`[AA] Normalized ecdsa_tss public key to uncompressed format (added 0x04 prefix)`);
                        }
                        
                        // 公開鍵からEOAアドレスを計算
                        computedOwnerAddress = ethers.utils.computeAddress(publicKeyHex);
                        this.logger.info(`[AA] Computed ownerAddress from ecdsa_tss public key: ${computedOwnerAddress}`);
                    }
                } catch (e) {
                    this.logger.warn(`[AA] Failed to compute ownerAddress from ecdsa_tss public key:`, e);
                }

                // Smart Accountのデプロイ状態を確認
                let saCode = await provider.getCode(smartAccountAddress);
                let isDeployed = saCode && saCode !== "0x" && saCode !== "0x0";

                // initCode生成（Smart Accountがデプロイされていない場合）
                let initCode = "0x";
                if (!isDeployed) {
                    // Smart Account情報を取得（currencyも考慮）
                    const currency = intent.currency ? intent.currency.toUpperCase() : null;
                    let query = `SELECT factory_address, owner_eoa, salt FROM aa_smart_accounts 
                                 WHERE user_subject = ? AND chain = ? AND network = ?`;
                    let queryParams = [masterId, chain, network];
                    
                    if (currency) {
                        query += ` AND currency = ?`;
                        queryParams.push(currency);
                    }
                    
                    query += ` LIMIT 1`;
                    
                    const [saInfoRows] = await this.db.query(query, queryParams);

                    if (saInfoRows && saInfoRows.length > 0) {
                        const saInfo = saInfoRows[0];
                        const factoryAddress = saInfo.factory_address;
                        const dbOwnerEOA = saInfo.owner_eoa;
                        // 計算されたownerAddressを使用（なければDBの値を使用）
                        const ownerEOA = computedOwnerAddress || dbOwnerEOA;
                        const salt = saInfo.salt;
                        
                        // 計算されたownerAddressとDBの値が異なる場合、警告を出力
                        if (computedOwnerAddress && dbOwnerEOA && computedOwnerAddress.toLowerCase() !== dbOwnerEOA.toLowerCase()) {
                            this.logger.warn(`[AA] ⚠️ Using computed ownerAddress (${computedOwnerAddress}) instead of DB owner_eoa (${dbOwnerEOA}) for initCode generation.`);
                        }

                        if (factoryAddress && ownerEOA && salt) {
                            // saltをbytes32形式に正規化
                            let saltBytes32 = salt;
                            if (!salt.startsWith('0x')) {
                                // hex文字列の場合、0xを追加してbytes32に変換
                                saltBytes32 = '0x' + salt.padStart(64, '0');
                            } else if (salt.length !== 66) {
                                // 0xプレフィックスがあるが、長さが66文字（0x + 64文字）でない場合
                                saltBytes32 = ethers.utils.hexZeroPad(salt, 32);
                            }
                            
                            // FactoryのgetAddress関数を呼び出して、計算されたアドレスを取得
                            // 同一FactoryでUSDC/JPYC等トークン別SA: getAddress(ownerEOA, salt, allowedToken)。tokenAddressはintent.currencyから取得済み。
                            const tokenAddressForInit = tokenAddress;
                            try {
                                const factoryABI = [
                                    "function getAddress(address ownerEOA, bytes32 salt, address allowedToken) public view returns (address)"
                                ];
                                const factoryContract = new ethers.Contract(factoryAddress, factoryABI, provider);
                                const computedAddress = await factoryContract.getAddress(ownerEOA, saltBytes32, tokenAddressForInit);
                                const computedAddressLower = computedAddress.toLowerCase();
                                const senderLower = smartAccountAddress.toLowerCase();
                                
                                this.logger.info(`[AA] Factory computed address: ${computedAddress}, UserOperation sender: ${smartAccountAddress}, ownerEOA: ${ownerEOA}, salt: ${saltBytes32}`);
                                
                                if (computedAddressLower !== senderLower) {
                                    // Factoryが計算したアドレスとDBのアドレスが不一致（Factory再デプロイなどが原因）
                                    // 自動的にFactoryの計算結果を使用して修正
                                    this.logger.info(`[AA] Address mismatch detected (likely due to Factory redeployment). Factory computed: ${computedAddress}, DB stored: ${smartAccountAddress}. Auto-correcting to Factory computed address.`);
                                    
                                    // Factoryが計算したアドレスをsenderとして使用（initCodeが返すアドレスと一致させるため）
                                    smartAccountAddress = computedAddress;
                                    
                                    // アドレス更新後、再度デプロイ状態をチェック
                                    saCode = await provider.getCode(smartAccountAddress);
                                    isDeployed = saCode && saCode !== "0x" && saCode !== "0x0";
                                    
                                    if (isDeployed) {
                                        this.logger.info(`[AA] ✅ Updated SmartAccount address is already deployed at ${smartAccountAddress}. Skipping initCode generation.`);
                                        // initCodeは生成しない（既にデプロイ済み）
                                        // この後、initCode生成のブロックをスキップするためにフラグを設定済み
                                    }
                                    
                                    // DBのsmart_account_addressも更新（次回のリクエストで正しいアドレスを使用するため）
                                    try {
                                        const currency = intent.currency ? intent.currency.toUpperCase() : null;
                                        let updateQuery = `UPDATE aa_smart_accounts 
                                                          SET smart_account_address = ?, updated_at = CURRENT_TIMESTAMP(3)
                                                          WHERE user_subject = ? AND chain = ? AND network = ?`;
                                        let updateParams = [smartAccountAddress, masterId, chain, network];
                                        
                                        if (currency) {
                                            updateQuery += ` AND currency = ?`;
                                            updateParams.push(currency);
                                        }
                                        
                                        await this.db.query(updateQuery, updateParams);
                                        this.logger.info(`[AA] ✅ Auto-corrected and updated smart_account_address in DB: ${smartAccountAddress}`);
                                    } catch (dbError) {
                                        this.logger.error(`[AA] Failed to update smart_account_address in DB:`, dbError);
                                        // DB更新に失敗した場合は警告を出す（次回も同じ問題が発生する可能性がある）
                                        this.logger.warn(`[AA] ⚠️ Address mismatch persists. DB update failed. Factory computed: ${computedAddress}, DB stored: ${smartAccountAddress}. This may cause AA14 error.`);
                                    }
                                } else {
                                    this.logger.info(`[AA] ✅ Address match confirmed: ${computedAddress}`);
                                }
                            } catch (error) {
                                this.logger.error(`[AA] Failed to get address from Factory:`, error);
                                this.logger.error(`[AA] Factory address: ${factoryAddress}, ownerEOA: ${ownerEOA}, salt: ${saltBytes32}`);
                                // エラーが発生した場合は、元のアドレスを使用（後でエラーになる可能性がある）
                            }
                            
                            this.logger.info(`[AA] Creating initCode with factory=${factoryAddress}, ownerEOA=${ownerEOA}, salt=${saltBytes32}, token=${tokenAddressForInit}`);
                            
                            // Factory ABI（同一Factoryでトークン別SA: createAccount(ownerEOA, salt, allowedToken)）
                            const factoryABI = [
                                "function createAccount(address ownerEOA, bytes32 salt, address allowedToken) external returns (address sa)"
                            ];
                            const factoryInterface = new ethers.utils.Interface(factoryABI);
                            
                            // createAccountのcalldataを生成（allowedToken = このintentの通貨のトークンアドレス）
                            const createAccountCalldata = factoryInterface.encodeFunctionData('createAccount', [
                                ownerEOA,
                                saltBytes32,
                                tokenAddressForInit
                            ]);
                            
                            this.logger.info(`[AA] initCode calldata generated: ownerEOA=${ownerEOA}, salt=${saltBytes32}, calldata length=${createAccountCalldata.length}`);

                            // initCode = factoryAddress + createAccountCalldata
                            initCode = ethers.utils.hexConcat([
                                factoryAddress,
                                createAccountCalldata
                            ]);

                            this.logger.info(`[AA] Smart Account not deployed, initCode generated: ${initCode.substring(0, 100)}... (length: ${initCode.length} chars, factory: ${factoryAddress}, calldata length: ${createAccountCalldata.length} chars)`);
                        } else {
                            this.logger.warn(`[AA] Smart Account not deployed but missing factory info: factory=${!!factoryAddress}, ownerEOA=${!!ownerEOA}, salt=${!!salt}`);
                        }
                    } else {
                        this.logger.warn(`[AA] Smart Account not deployed and no DB record found for user_subject=${masterId}, chain=${chain}, network=${network}, currency=${currency || 'null'}`);
                    }
                } else {
                    this.logger.info(`[AA] Smart Account already deployed at ${smartAccountAddress}`);
                }

                // UserOperation構築（部分）
                // 注意: paymasterAndDataは後でgetPaymasterSponsorで設定されるため、"0x"で初期化
                // ERC-4337推奨フロー: userOpPartial作成 → paymasterAndData取得 → ガス見積り → userOpHash計算
                const userOpPartial = aaUtils.buildUserOperation(
                    smartAccountAddress,
                    callData,
                    nonce.toString(),
                    "0x", // paymasterAndDataは後でgetPaymasterSponsorで設定
                    initCode // initCodeを設定
                );

                // Paymaster Sponsor処理は send-userop で行う（userOp.signature確定後）
                // build-userop では paymasterAndData を空で返す
                // 理由: userOp.signature が確定する前に Paymaster署名を作成すると、
                //       signature が入った後の userOpHashNoPM が変わり、Paymaster署名が無効化される
                let paymasterAndData = "0x";

                this.logger.info(`[AA] Skipping Paymaster sponsor in build-userop (will be generated in send-userop after signature is set)`);

                // paymasterAndDataは空のまま設定
                userOpPartial.paymasterAndData = paymasterAndData;
                
                // Gas preset selection (fixed presets, no estimation round-trip)
                const hasInitCode = userOpPartial.initCode && userOpPartial.initCode !== "0x" && userOpPartial.initCode !== "";
                let gasMode;
                if (hasInitCode) {
                    gasMode = 'B';
                } else {
                    gasMode = 'A_V2';
                }
                const preset = this.GAS_PRESET[gasMode];
                userOpPartial.verificationGasLimit = preset.vgl;
                userOpPartial.callGasLimit = preset.cgl;
                userOpPartial.preVerificationGas = preset.pvg;
                this.logger.info(`[AA] Gas preset applied: mode=${gasMode} vgl=${preset.vgl} cgl=${preset.cgl} pvg=${preset.pvg}`);
                
                // maxFeePerGasとmaxPriorityFeePerGasをPimlicoから取得して確定（署名前に確定する必要がある）
                // 重要: ガス価格は署名前に確定し、署名後は変更しない
                const bundlerRpcUrl = this.config.sa[chain]?.[network]?.bundlerRpcUrl;
                let maxFeePerGas = "0x3b9aca00"; // デフォルト値
                let maxPriorityFeePerGas = "0x3b9aca00"; // デフォルト値
                
                if (bundlerRpcUrl) {
                    try {
                        // Pimlicoのpimlico_getUserOperationGasPriceを試行
                        this.logger.info(`[AA] Fetching gas prices from Pimlico Bundler...`);
                        const gasPriceResponse = await fetch(bundlerRpcUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jsonrpc: '2.0',
                                id: 1,
                                method: 'pimlico_getUserOperationGasPrice',
                                params: []
                            })
                        });
                        
                        const gasPriceResult = await gasPriceResponse.json();
                        this.logger.info(`[AA] Pimlico gas price response:`, JSON.stringify(gasPriceResult));
                        
                        if (gasPriceResult.result) {
                            // 構造1: { result: { slow: {...}, standard: {...}, fast: {...} } }
                            if (gasPriceResult.result.standard) {
                                maxFeePerGas = gasPriceResult.result.standard.maxFeePerGas;
                                maxPriorityFeePerGas = gasPriceResult.result.standard.maxPriorityFeePerGas;
                            } else if (gasPriceResult.result.fast) {
                                maxFeePerGas = gasPriceResult.result.fast.maxFeePerGas;
                                maxPriorityFeePerGas = gasPriceResult.result.fast.maxPriorityFeePerGas;
                            } else if (gasPriceResult.result.slow) {
                                maxFeePerGas = gasPriceResult.result.slow.maxFeePerGas;
                                maxPriorityFeePerGas = gasPriceResult.result.slow.maxPriorityFeePerGas;
                            }
                            // 構造2: { result: { maxFeePerGas, maxPriorityFeePerGas } }
                            else if (gasPriceResult.result.maxFeePerGas && gasPriceResult.result.maxPriorityFeePerGas) {
                                maxFeePerGas = gasPriceResult.result.maxFeePerGas;
                                maxPriorityFeePerGas = gasPriceResult.result.maxPriorityFeePerGas;
                            }
                            
                            // hex形式に変換（文字列の場合はそのまま、数値の場合はhex形式に）
                            if (typeof maxFeePerGas === 'string') {
                                if (!maxFeePerGas.startsWith('0x')) {
                                    maxFeePerGas = ethers.utils.hexValue(BigInt(maxFeePerGas));
                                }
                            } else {
                                maxFeePerGas = ethers.utils.hexValue(maxFeePerGas);
                            }
                            
                            if (typeof maxPriorityFeePerGas === 'string') {
                                if (!maxPriorityFeePerGas.startsWith('0x')) {
                                    maxPriorityFeePerGas = ethers.utils.hexValue(BigInt(maxPriorityFeePerGas));
                                }
                            } else {
                                maxPriorityFeePerGas = ethers.utils.hexValue(maxPriorityFeePerGas);
                            }
                            
                            this.logger.info(`[AA] Gas prices fetched from Pimlico: maxFeePerGas=${maxFeePerGas}, maxPriorityFeePerGas=${maxPriorityFeePerGas}`);
                        } else {
                            this.logger.warn(`[AA] Pimlico gas price response has no result, using default values`);
                        }
                    } catch (gasPriceError) {
                        this.logger.warn(`[AA] Failed to get gas prices from Pimlico, using default values:`, gasPriceError.message);
                    }
                } else {
                    this.logger.warn(`[AA] Bundler RPC URL not configured, using default gas prices`);
                }
                
                // ガス価格を確定（署名前に確定）
                userOpPartial.maxFeePerGas = maxFeePerGas;
                userOpPartial.maxPriorityFeePerGas = maxPriorityFeePerGas;
                this.logger.info(`[AA] Gas prices finalized (before signing): maxFeePerGas=${maxFeePerGas}, maxPriorityFeePerGas=${maxPriorityFeePerGas}`);

                // userOpFinal(unsigned)確定（paymasterAndData/gasセット、signatureは空）
                const hasInitCodeFinal = userOpPartial.initCode && userOpPartial.initCode !== "0x" && userOpPartial.initCode !== "";
                this.logger.info(`[AA] UserOperation final(unsigned) built:`, {
                    sender: userOpPartial.sender,
                    hasInitCode: hasInitCodeFinal,
                    initCodeLength: hasInitCodeFinal ? userOpPartial.initCode.length : 0,
                    verificationGasLimit: userOpPartial.verificationGasLimit,
                    callGasLimit: userOpPartial.callGasLimit,
                    preVerificationGas: userOpPartial.preVerificationGas,
                    paymasterAndDataLength: userOpPartial.paymasterAndData ? userOpPartial.paymasterAndData.length : 0
                });
                
                const userOpFinal = {
                    ...userOpPartial,
                    signature: "0x" // signatureは空のまま
                };

                // hashToSignを計算（paymasterAndDataとsignatureは空として扱う）
                // ローカル計算を使用（RPC呼び出しなし）
                const hashToSign = this.getHashToSign(userOpFinal, entryPointAddress, chainId);
                this.logger.info(`[AA] hashToSign computed: ${hashToSign}, initCode length: ${userOpFinal.initCode ? userOpFinal.initCode.length : 0}, hasInitCode: ${!!userOpFinal.initCode && userOpFinal.initCode !== "0x"}`);
                
                // レスポンスにhashToSignを返す（userOpHashは後方互換性のため残す）
                const userOpHash = hashToSign; // 後方互換性のため

                // ownerAddress（MPC公開鍵のEOA）を取得
                // 既にinitCode生成時に計算済みの場合はそれを使用、なければ再計算
                let ownerAddress = computedOwnerAddress;
                
                if (!ownerAddress) {
                    // 計算されていない場合は、DBのowner_eoaを使用（フォールバック）
                    if (smartAccount.owner_eoa) {
                        ownerAddress = smartAccount.owner_eoa;
                        this.logger.warn(`[AA] ⚠️ ecdsa_tss public key not found, using DB owner_eoa: ${ownerAddress}`);
                        this.logger.warn(`[AA] ⚠️ This value may be incorrect if computed from verifying_key (compressed).`);
                    } else {
                        this.logger.error('[AA] Failed to get ownerAddress: ecdsa_tss public key not found and owner_eoa not found in Smart Account');
                        return res.status(400).json({
                            status: "NG",
                            message: `Failed to get ownerAddress: ecdsa_tss public key not found and owner_eoa not found in Smart Account`
                        });
                    }
                } else {
                    // 計算されたownerAddressとDBのowner_eoaを比較
                    if (smartAccount.owner_eoa) {
                        const dbOwnerEOA = smartAccount.owner_eoa;
                        if (dbOwnerEOA.toLowerCase() !== ownerAddress.toLowerCase()) {
                            this.logger.warn(`[AA] ⚠️ DB owner_eoa (${dbOwnerEOA}) differs from computed ownerAddress (${ownerAddress}). Using computed value.`);
                            this.logger.warn(`[AA] ⚠️ This may indicate that DB owner_eoa was computed from verifying_key (compressed).`);
                        } else {
                            this.logger.info(`[AA] ✅ DB owner_eoa matches computed ownerAddress: ${ownerAddress}`);
                        }
                    }
                }

                this.logger.info(`[AA] UserOperation final(unsigned) built successfully for intent: ${intent_id}`);

                res.json({
                    status: "OK",
                    success: true,
                    userOpFinal: userOpFinal, // userOpFinal(unsigned)（paymasterAndData/gas込み、signatureは空）
                    userOpHash: hashToSign, // hashToSignを返す（後方互換性のため）
                    hashToSign: hashToSign, // 明示的にhashToSignも返す
                    ownerAddress: ownerAddress, // MPC公開鍵のEOA
                    entryPoint: entryPointAddress, // デバッグ用
                    chainId: chainId, // デバッグ用
                    intentHash,
                    saVersion,  // always 2
                    gasMode     // 'A_V2' or 'B'
                });

            } catch (error) {
                this.logger.error('[AA] Build UserOperation error:', error);
                res.status(500).json({
                    status: "NG",
                    error: 'server_error',
                    message: error.message
                });
            }
        });

        // UserOperation送信エンドポイント - 認証必須（BitVoy Server用JWT）
        this.app.post(`/walletapi/aa/send-userop`, authMiddleware, async (req, res) => {
            try {
                this.logger.info(`💼 Send UserOperation request received`);
                
                const { intent_id, user_op } = req.body;
                const masterId = req.user?.sub;

                if (!intent_id || !user_op) {
                    return res.status(400).json({
                        status: "NG",
                        message: "intent_id and user_op are required"
                    });
                }

                if (!masterId) {
                    return res.status(400).json({
                        status: "NG",
                        message: "MasterId is required"
                    });
                }

                // Intent取得
                const [intentRows] = await this.db.query(
                    `SELECT * FROM oidc_payment_intents WHERE intent_id = ?`,
                    [intent_id]
                );

                if (!intentRows || intentRows.length === 0) {
                    return res.status(404).json({
                        status: "NG",
                        message: "Intent not found"
                    });
                }

                const intent = intentRows[0];
                
                // chainとnetworkを取得（intentから、または小文字に正規化）
                // 完全ダンプログで使用するため、早期に定義
                const chain = intent.chain ? intent.chain.toLowerCase() : null;
                const network = intent.network ? intent.network.toLowerCase() : null;

                // execution_modeがAAでない場合はエラー
                if (intent.execution_mode !== 'AA') {
                    return res.status(400).json({
                        status: "NG",
                        message: "Intent is not in AA execution mode"
                    });
                }

                // UserOperation検証（基本的な検証）
                if (!user_op.sender || !user_op.callData || !user_op.signature) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Invalid UserOperation: missing required fields"
                    });
                }

                // UserOperationのフィールドをhex形式に正規化（Bundler RPCの要求に合わせる）
                const normalizeHex = (value) => {
                    if (!value) return "0x0";
                    if (typeof value === 'string') {
                        if (value.startsWith('0x')) {
                            return value;
                        } else {
                            // 数値文字列をhex形式に変換
                            const num = BigInt(value);
                            return '0x' + num.toString(16);
                        }
                    } else {
                        // 数値をhex形式に変換
                        const num = BigInt(value);
                        return '0x' + num.toString(16);
                    }
                };

                // nonceとgas関連フィールドをhex形式に正規化
                const normalizedUserOp = {
                    ...user_op,
                    nonce: normalizeHex(user_op.nonce),
                    callGasLimit: normalizeHex(user_op.callGasLimit),
                    verificationGasLimit: normalizeHex(user_op.verificationGasLimit),
                    preVerificationGas: normalizeHex(user_op.preVerificationGas),
                    maxFeePerGas: normalizeHex(user_op.maxFeePerGas),
                    maxPriorityFeePerGas: normalizeHex(user_op.maxPriorityFeePerGas)
                };

                // UserOperationの完全ダンプログ（送信直前、差分検知用）
                const hasInitCode = normalizedUserOp.initCode && normalizedUserOp.initCode !== "0x" && normalizedUserOp.initCode !== "";
                this.logger.info(`[AA] ========== UserOperation FULL DUMP (before sending to Bundler) ==========`, {
                    timestamp: new Date().toISOString(),
                    intent_id: intent_id,
                    chain: chain,
                    network: network,
                    userOp: {
                        sender: normalizedUserOp.sender,
                        nonce: normalizedUserOp.nonce,
                        initCode: normalizedUserOp.initCode || "0x",
                        initCodeLength: normalizedUserOp.initCode ? normalizedUserOp.initCode.length : 0,
                        callData: normalizedUserOp.callData || "0x",
                        callDataLength: normalizedUserOp.callData ? normalizedUserOp.callData.length : 0,
                        callGasLimit: normalizedUserOp.callGasLimit || "0x0",
                        verificationGasLimit: normalizedUserOp.verificationGasLimit || "0x0",
                        preVerificationGas: normalizedUserOp.preVerificationGas || "0x0",
                        maxFeePerGas: normalizedUserOp.maxFeePerGas || "0x0",
                        maxPriorityFeePerGas: normalizedUserOp.maxPriorityFeePerGas || "0x0",
                        paymasterAndData: normalizedUserOp.paymasterAndData || "0x",
                        paymasterAndDataLength: normalizedUserOp.paymasterAndData ? normalizedUserOp.paymasterAndData.length : 0,
                        signature: normalizedUserOp.signature || "0x",
                        signatureLength: normalizedUserOp.signature ? normalizedUserOp.signature.length : 0
                    },
                    metadata: {
                        hasInitCode: hasInitCode,
                        hasPaymaster: normalizedUserOp.paymasterAndData && normalizedUserOp.paymasterAndData !== "0x",
                        hasSignature: normalizedUserOp.signature && normalizedUserOp.signature !== "0x"
                    }
                });
                
                // 署名の詳細情報（デバッグ用）
                // signature = 0x + authType(1byte) + r(32bytes) + s(32bytes) + v(1byte)
                // hex文字列では: 0x + 2hex + 64hex + 64hex + 2hex = 134文字
                // 0x除いて: 2hex + 64hex + 64hex + 2hex = 132hex (=66 bytes)
                if (normalizedUserOp.signature && normalizedUserOp.signature !== "0x") {
                    const sig = normalizedUserOp.signature;
                    const sigWithoutPrefix = sig.startsWith('0x') ? sig.substring(2) : sig; // 0xを除く
                    this.logger.info(`[AA] Signature details:`, {
                        signature: sig,
                        signatureLength: sig.length,
                        signatureHexLength: sigWithoutPrefix.length, // 0xを除いたhex文字数
                        signatureBytes: sigWithoutPrefix.length / 2, // バイト数
                        authType: sigWithoutPrefix.length >= 2 ? '0x' + sigWithoutPrefix.slice(0, 2) : "N/A",
                        r: sigWithoutPrefix.length >= 66 ? '0x' + sigWithoutPrefix.slice(2, 2 + 64) : "N/A",
                        s: sigWithoutPrefix.length >= 130 ? '0x' + sigWithoutPrefix.slice(66, 66 + 64) : "N/A",
                        v: sigWithoutPrefix.length >= 132 ? '0x' + sigWithoutPrefix.slice(130, 130 + 2) : "N/A"
                    });
                }
                
                // paymasterAndDataの詳細情報（デバッグ用）
                if (normalizedUserOp.paymasterAndData && normalizedUserOp.paymasterAndData !== "0x") {
                    const pmd = normalizedUserOp.paymasterAndData;
                    // paymasterAndData構造: [0:42) = paymaster (20 bytes), [42:54) = validUntil (6 bytes), [54:66) = validAfter (6 bytes), [66:196) = signature (65 bytes)
                    this.logger.info(`[AA] PaymasterAndData details:`, {
                        paymasterAndData: pmd,
                        paymasterAndDataLength: pmd.length,
                        paymasterAddress: pmd.length >= 42 ? pmd.substring(0, 42) : "N/A",
                        validUntilHex: pmd.length >= 54 ? pmd.substring(42, 54) : "N/A", // 6 bytes = 12 hex chars
                        validAfterHex: pmd.length >= 66 ? pmd.substring(54, 66) : "N/A", // 6 bytes = 12 hex chars
                        signatureStart: pmd.length >= 68 ? pmd.substring(66, 68) : "N/A"
                    });
                }
                
                // initCodeの詳細情報（デバッグ用）
                if (normalizedUserOp.initCode && normalizedUserOp.initCode !== "0x") {
                    const initCode = normalizedUserOp.initCode;
                    this.logger.info(`[AA] InitCode details:`, {
                        initCode: initCode,
                        initCodeLength: initCode.length,
                        factoryAddress: initCode.length >= 42 ? initCode.substring(0, 42) : "N/A",
                        calldataStart: initCode.length >= 44 ? initCode.substring(42, 44) : "N/A"
                    });
                }
                
                this.logger.info(`[AA] ========== End of UserOperation FULL DUMP ==========`);
                
                // Paymaster Sponsor処理（userOp.signature確定後）
                // userOp.signatureが確定した後にpaymasterAndDataを生成することで、
                // Paymaster署名が有効なuserOpHashNoPMで計算される
                let finalUserOp = { ...normalizedUserOp };
                
                // paymasterAndDataが空または未設定の場合、生成する
                if (!finalUserOp.paymasterAndData || finalUserOp.paymasterAndData === "0x") {
                    this.logger.info(`[AA] Generating paymasterAndData in send-userop (userOp.signature is now set)`);
                    
                    try {
                        // chainIdをchainIdMapから取得
                        const chainIdMap = {
                            'ethereum': { 'mainnet': 1, 'testnet': 5 },
                            'polygon': { 'mainnet': 137, 'testnet': 80002 },
                            'avalanche': { 'mainnet': 43114, 'testnet': 43113 }
                        };
                        const chainId = chainIdMap[chain]?.[network];
                        const entryPointAddress = this.config.sa[chain]?.[network]?.entryPointAddress;
                        
                        this.logger.info(`[AA] Paymaster sponsor config check: chain=${chain}, network=${network}, chainId=${chainId}, entryPointAddress=${entryPointAddress}`);
                        
                        if (chainId && entryPointAddress) {
                            // userOpPartialを作成（signatureは既に設定されている）
                            const userOpPartial = {
                                sender: finalUserOp.sender,
                                nonce: finalUserOp.nonce,
                                initCode: finalUserOp.initCode || "0x",
                                callData: finalUserOp.callData || "0x",
                                callGasLimit: finalUserOp.callGasLimit || "0x0",
                                verificationGasLimit: finalUserOp.verificationGasLimit || "0x0",
                                preVerificationGas: finalUserOp.preVerificationGas || "0x0",
                                maxFeePerGas: finalUserOp.maxFeePerGas || "0x0",
                                maxPriorityFeePerGas: finalUserOp.maxPriorityFeePerGas || "0x0",
                                paymasterAndData: "0x", // 一時的に空
                                signature: "0x" // Paymaster署名計算時は空（userOpHashNoPM計算用）
                            };
                            
                            // Paymaster Sponsor取得
                            const sponsorResult = await this.getPaymasterSponsor(intent, chainId, chain, network, userOpPartial);
                            
                            if (sponsorResult && sponsorResult.paymasterAndData) {
                                finalUserOp.paymasterAndData = sponsorResult.paymasterAndData;
                                this.logger.info(`[AA] Paymaster sponsor obtained in send-userop: paymasterAndData length=${(finalUserOp.paymasterAndData.length - 2) / 2} bytes`);
                            } else {
                                this.logger.warn(`[AA] Paymaster sponsor returned null or empty, continuing without paymaster`);
                            }
                        } else {
                            this.logger.warn(`[AA] ChainId or EntryPoint address not configured, skipping Paymaster sponsor`);
                        }
                    } catch (sponsorError) {
                        this.logger.error(`[AA] Paymaster sponsor failed in send-userop:`, sponsorError);
                        // Paymasterが利用できない場合は、paymasterAndDataを空にして続行
                        // ユーザーがガス代を負担する形で処理を継続
                    }
                } else {
                    this.logger.info(`[AA] paymasterAndData already set, skipping generation`);
                }
                
                // Bundler RPC URL取得（configから取得）- ガス見積もりに必要
                const bundlerRpcUrl = this.config.sa[chain]?.[network]?.bundlerRpcUrl;
                
                if (!bundlerRpcUrl) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Bundler RPC URL not configured"
                    });
                }

                // EntryPointアドレスとSAバージョン取得
                const [saRows] = await this.db.query(
                    `SELECT entry_point, sa_version FROM aa_smart_accounts
                     WHERE user_subject = ? AND chain = ? AND network = ?`,
                    [masterId, chain, network]
                );

                if (!saRows || saRows.length === 0) {
                    return res.status(404).json({
                        status: "NG",
                        message: "Smart Account not found"
                    });
                }

                // EntryPointアドレス取得（Smart Accountから、またはconfigから）
                const entryPointAddress = saRows[0].entry_point ||
                                        this.config.sa[chain]?.[network]?.entryPointAddress;
                if (!entryPointAddress) {
                    return res.status(400).json({
                        status: "NG",
                        message: "EntryPoint address not configured"
                    });
                }
                const saVersionSend = parseInt(saRows[0].sa_version || 2);
                if (saVersionSend !== 2) {
                    return res.status(400).json({ status: "NG", message: `sa_version=${saVersionSend} is not supported. Only V2 Smart Accounts (sa_version=2) are allowed.` });
                }

                // Append opSig (65 bytes) to existing 66-byte userSig (authType+r+s+v) → 131-byte total
                const opSignerPrivateKeyEnvKey = `${chain.toUpperCase()}_${network.toUpperCase()}_OP_SIGNER_PRIVATE_KEY`;
                const opSignerPrivateKey = process.env[opSignerPrivateKeyEnvKey];
                if (!opSignerPrivateKey) {
                    return res.status(500).json({ status: "NG", message: "OP signer private key not configured" });
                }
                // Retrieve V2 intentHash stored in build-userop
                const [intentHashRow] = await this.db.query(
                    `SELECT intent_hash FROM oidc_payment_intents WHERE intent_id = ?`, [intent_id]
                );
                const v2IntentHash = intentHashRow?.[0]?.intent_hash;
                if (!v2IntentHash) {
                    return res.status(500).json({ status: "NG", message: "V2 intentHash not found in DB (run build-userop first)" });
                }
                const { ethers: _eth } = require('ethers');
                const aaUtils = require('./server/utils/aa-utils');
                const opSig = await aaUtils.signIntentWithOP(v2IntentHash, opSignerPrivateKey);
                // opSig is 0x + 65 bytes (130 hex chars). Strip 0x and append to userSig.
                const opSigHex = opSig.startsWith('0x') ? opSig.substring(2) : opSig;
                finalUserOp.signature = finalUserOp.signature + opSigHex;
                this.logger.info(`[AA] V2 opSig appended: intentHash=${v2IntentHash} sigLen=${(finalUserOp.signature.length-2)/2}B`);

                // Determine gas mode for logging
                const gasModeLog = (finalUserOp.initCode && finalUserOp.initCode !== "0x") ? 'B' : 'A_V2';

                // 簡易ログ（既存の互換性のため）
                const hasInitCodeFinal = finalUserOp.initCode && finalUserOp.initCode !== "0x" && finalUserOp.initCode !== "";
                this.logger.info(`[AA] Sending UserOperation to Bundler (after gas estimation):`, {
                    sender: finalUserOp.sender,
                    hasInitCode: hasInitCodeFinal,
                    initCodeLength: hasInitCodeFinal ? finalUserOp.initCode.length : 0,
                    verificationGasLimit: finalUserOp.verificationGasLimit,
                    callGasLimit: finalUserOp.callGasLimit,
                    preVerificationGas: finalUserOp.preVerificationGas,
                    maxFeePerGas: finalUserOp.maxFeePerGas,
                    maxPriorityFeePerGas: finalUserOp.maxPriorityFeePerGas,
                    paymasterAndDataLength: finalUserOp.paymasterAndData ? (finalUserOp.paymasterAndData.length - 2) / 2 : 0
                });

                // chainIdを取得（hashToSign計算に必要）
                const chainIdMap = {
                    'ethereum': { 'mainnet': 1, 'testnet': 5 },
                    'polygon': { 'mainnet': 137, 'testnet': 80002 },
                    'avalanche': { 'mainnet': 43114, 'testnet': 43113 }
                };
                const chainId = chainIdMap[chain]?.[network];
                if (!chainId) {
                    return res.status(400).json({
                        status: "NG",
                        message: "ChainId not configured"
                    });
                }

                // hashToSignを計算（build-useropで確定したガス価格を使用）
                // 重要: ガス価格はbuild-useropで既に確定しているため、ここでは変更しない
                // 署名後にガス価格を変更すると、hashToSignが変わって署名が無効になる
                const hashToSign = this.getHashToSign(finalUserOp, entryPointAddress, chainId);
                this.logger.info(`[AA] hashToSign computed (using gas prices from build-userop): ${hashToSign}`);
                this.logger.info(`[AA] Gas prices (finalized in build-userop): maxFeePerGas=${finalUserOp.maxFeePerGas}, maxPriorityFeePerGas=${finalUserOp.maxPriorityFeePerGas}`);
                
                // 注意: ガス価格はbuild-useropで既に確定しているため、ここでは更新しない
                // build-useropでPimlicoから取得したガス価格が使用される

                // Bundler RPC呼び出し
                const response = await fetch(bundlerRpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'eth_sendUserOperation',
                        params: [finalUserOp, entryPointAddress]
                    })
                });

                const result = await response.json();

                if (result.error) {
                    this.logger.error('[AA] Bundler RPC error:', result.error);
                    
                    // AA23エラーなどの場合、EntryPoint.simulateValidationで詳細な診断を実行
                    if (result.error.code === -32500 || result.error.message?.includes('AA23') || result.error.message?.includes('reverted')) {
                        try {
                            this.logger.info('[AA] Running EntryPoint.simulateValidation for detailed error diagnosis...');
                            
                            // RPC URLを取得
                            const rpcUrl = this.config.sa[chain]?.[network]?.rpcUrl;
                            if (rpcUrl && entryPointAddress) {
                                const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
                                const userOpForSimulation = normalizeUserOpForSimulation(finalUserOp);
                                
                                const simulationResult = await simulateValidation(userOpForSimulation, entryPointAddress, provider);
                                
                                this.logger.error('[AA] EntryPoint.simulateValidation result:', {
                                    errorType: simulationResult.errorType,
                                    message: simulationResult.message,
                                    decoded: simulationResult.decoded,
                                    opIndex: simulationResult.opIndex,
                                    reason: simulationResult.reason,
                                    aggregator: simulationResult.aggregator,
                                    executionResult: simulationResult.executionResult
                                });
                                
                                // EntryPointが計算するuserOpHashと、build-useropで計算したuserOpHashが一致しているか確認
                                try {
                                    this.logger.info('[AA] Verifying userOpHash consistency...');
                                    
                                    const entryPointABI = [
                                        "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
                                    ];
                                    // hashToSignはbuild-useropで確定したガス価格を使用して計算
                                    // ガス価格は署名前に確定しているため、hashToSignは変わらない
                                    this.logger.info(`[AA] hashToSign used for signature verification: ${hashToSign} (computed with gas prices from build-userop)`);
                                    
                                    // 署名の復元を検証
                                    let signatureVerification = null;
                                    try {
                                        const sig = normalizedUserOp.signature;
                                        if (sig && sig.length >= 134) {
                                            const sigWithoutPrefix = sig.startsWith('0x') ? sig.substring(2) : sig;
                                            const authType = sigWithoutPrefix.slice(0, 2);
                                            const r = '0x' + sigWithoutPrefix.slice(2, 66);
                                            const s = '0x' + sigWithoutPrefix.slice(66, 130);
                                            const vHex = sigWithoutPrefix.slice(130, 132);
                                            const v = parseInt(vHex, 16);
                                            
                                            // 65バイトの署名を構築（r + s + v）
                                            // 注意: SmartAccountのvalidateUserOpでは、userOpHashを直接recoverする（EIP-191プレフィックスなし）
                                            // SolidityのECDSA.recover(bytes32 hash, bytes memory signature)は、hashを直接recoverする
                                            const vNormalized = v < 27 ? v + 27 : v;
                                            const sig65 = ethers.utils.concat([
                                                ethers.utils.hexZeroPad(r, 32),
                                                ethers.utils.hexZeroPad(s, 32),
                                                vNormalized
                                            ]);
                                            
                                            // hashToSignで署名検証（paymasterAndData追加後でもhashToSignは変わらない）
                                            // ローカル計算を使用（RPC呼び出しなし）
                                            // ethers.utils.recoverAddressは、hashとsignatureを受け取り、EIP-191プレフィックスなしで復元する
                                            const recoveredAddress = ethers.utils.recoverAddress(hashToSign, sig65);
                                            
                                            // ownerEOAを取得（SmartAccountのDBから、またはintentから）
                                            let ownerEOA = null;
                                            try {
                                                const [saRows] = await this.db.query(
                                                    `SELECT owner_eoa FROM aa_smart_accounts 
                                                     WHERE user_subject = ? AND chain = ? AND network = ?`,
                                                    [masterId, chain, network]
                                                );
                                                if (saRows && saRows.length > 0) {
                                                    ownerEOA = saRows[0].owner_eoa;
                                                }
                                            } catch (dbError) {
                                                this.logger.warn('[AA] Failed to get owner_eoa from DB:', dbError);
                                            }
                                            
                                            // フォールバック: intentから取得
                                            if (!ownerEOA) {
                                                ownerEOA = intent.owner_eoa || intent.ownerEOA;
                                            }
                                            
                                            signatureVerification = {
                                                hashToSign: hashToSign, // userOpHashからhashToSignに変更
                                                authType: '0x' + authType,
                                                r: r,
                                                s: s,
                                                v: '0x' + vHex,
                                                vDecimal: v,
                                                recoveredAddress: recoveredAddress,
                                                expectedOwnerEOA: ownerEOA,
                                                match: ownerEOA ? recoveredAddress.toLowerCase() === ownerEOA.toLowerCase() : null
                                            };
                                        }
                                    } catch (sigError) {
                                        this.logger.warn('[AA] Failed to verify signature:', sigError);
                                    }
                                    
                                    this.logger.error('[AA] hashToSign verification:', {
                                        hashToSign: hashToSign,
                                        signatureVerification: signatureVerification,
                                        userOpForSimulation: {
                                            sender: userOpForSimulation.sender,
                                            nonce: userOpForSimulation.nonce,
                                            initCodeLength: userOpForSimulation.initCode ? userOpForSimulation.initCode.length : 0,
                                            callDataLength: userOpForSimulation.callData ? userOpForSimulation.callData.length : 0,
                                            paymasterAndDataLength: userOpForSimulation.paymasterAndData ? userOpForSimulation.paymasterAndData.length : 0,
                                            signatureLength: userOpForSimulation.signature ? userOpForSimulation.signature.length : 0
                                        }
                                    });
                                } catch (hashError) {
                                    this.logger.warn('[AA] Failed to verify userOpHash:', hashError);
                                }
                                
                                // Paymasterの検証を診断（AA33エラーの原因特定）
                                let paymasterDiagnosis = null;
                                if (normalizedUserOp.paymasterAndData && normalizedUserOp.paymasterAndData !== "0x") {
                                    try {
                                        this.logger.info('[AA] Diagnosing Paymaster validation (AA33 error)...');
                                        
                                        const pmd = normalizedUserOp.paymasterAndData;
                                        const pmdBytes = ethers.utils.arrayify(pmd);
                                        
                                        // paymasterAndData構造: [0:20) = paymaster (20 bytes), [20:26) = validUntil (6 bytes), [26:32) = validAfter (6 bytes), [32:97) = signature (65 bytes)
                                        if (pmdBytes.length >= 97) {
                                            const paymasterAddr = ethers.utils.getAddress(ethers.utils.hexlify(pmdBytes.slice(0, 20)));
                                            const validUntilBytes = pmdBytes.slice(20, 26);
                                            const validAfterBytes = pmdBytes.slice(26, 32);
                                            const signatureBytes = pmdBytes.slice(32, 97);
                                            
                                            // uint48をbig-endianから数値に変換
                                            const parseUint48 = (bytes) => {
                                                let value = BigInt(0);
                                                for (let i = 0; i < 6; i++) {
                                                    value = (value << BigInt(8)) | BigInt(bytes[i]);
                                                }
                                                return value;
                                            };
                                            
                                            const validUntil = parseUint48(validUntilBytes);
                                            const validAfter = parseUint48(validAfterBytes);
                                            
                                            // PaymasterコントラクトからuserOpHashWithoutPaymasterを取得
                                            const paymasterABI = [
                                                "function getUserOpHashWithoutPaymaster((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) public view returns (bytes32)",
                                                "function getHash(bytes32 userOpHashNoPM, uint48 validUntil, uint48 validAfter) public view returns (bytes32)",
                                                "function verifyingSigner() public view returns (address)"
                                            ];
                                            const paymasterContract = new ethers.Contract(paymasterAddr, paymasterABI, provider);
                                            
                                            // userOpHashWithoutPaymasterを取得（コントラクト側）
                                            const userOpHashNoPMFromContract = await paymasterContract.getUserOpHashWithoutPaymaster(userOpForSimulation);
                                            
                                            // userOpHashWithoutPaymasterを再計算（サーバー側、比較用）
                                            const entryPointABI = [
                                                "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
                                            ];
                                            const entryPointContract = new ethers.Contract(entryPointAddress, entryPointABI, provider);
                                            const userOpForHashComparison = {
                                                ...userOpForSimulation,
                                                paymasterAndData: "0x",
                                                signature: "0x"
                                            };
                                            const userOpHashNoPMFromServer = await entryPointContract.getUserOpHash(userOpForHashComparison);
                                            
                                            // sponsorHashを計算（コントラクト側のuserOpHashNoPMを使用）
                                            const sponsorHash = await paymasterContract.getHash(userOpHashNoPMFromContract, validUntil, validAfter);
                                            
                                            // verifyingSignerを取得
                                            const verifyingSigner = await paymasterContract.verifyingSigner();
                                            
                                            // 署名からアドレスを復元（コントラクト側のtoEthSignedMessageHash()と同じ方法）
                                            // toEthSignedMessageHash()はEIP-191形式（\x19Ethereum Signed Message:\n32 + hash）を適用
                                            const messageHash = ethers.utils.hashMessage(ethers.utils.arrayify(sponsorHash));
                                            const recoveredAddress = ethers.utils.recoverAddress(messageHash, signatureBytes);
                                            
                                            // 現在時刻を取得
                                            const currentBlock = await provider.getBlock('latest');
                                            const currentTimestamp = BigInt(currentBlock.timestamp);
                                            
                                            paymasterDiagnosis = {
                                                paymasterAddress: paymasterAddr,
                                                validUntil: validUntil.toString(),
                                                validAfter: validAfter.toString(),
                                                validUntilHex: ethers.utils.hexlify(validUntilBytes),
                                                validAfterHex: ethers.utils.hexlify(validAfterBytes),
                                                currentTimestamp: currentTimestamp.toString(),
                                                isValidTimeWindow: currentTimestamp >= validAfter && currentTimestamp <= validUntil,
                                                userOpHashNoPMFromContract: userOpHashNoPMFromContract,
                                                userOpHashNoPMFromServer: userOpHashNoPMFromServer,
                                                userOpHashNoPMMatch: userOpHashNoPMFromContract.toLowerCase() === userOpHashNoPMFromServer.toLowerCase(),
                                                sponsorHash: sponsorHash,
                                                verifyingSigner: verifyingSigner,
                                                recoveredAddress: recoveredAddress,
                                                signatureMatch: recoveredAddress.toLowerCase() === verifyingSigner.toLowerCase(),
                                                signatureLength: signatureBytes.length
                                            };
                                            
                                            this.logger.error('[AA] Paymaster validation diagnosis:', paymasterDiagnosis);
                                        } else {
                                            paymasterDiagnosis = {
                                                error: "paymasterAndData too short",
                                                length: pmdBytes.length,
                                                expectedLength: 97
                                            };
                                        }
                                    } catch (pmError) {
                                        this.logger.warn('[AA] Failed to diagnose Paymaster validation:', pmError);
                                        paymasterDiagnosis = {
                                            error: pmError.message
                                        };
                                    }
                                }
                                
                                // SmartAccountのvalidateUserOpを直接呼び出して、実際のrevert reasonを取得
                                // 注意: initCodeが含まれている場合、SmartAccountはまだデプロイされていないため、
                                // 直接呼び出すとコントラクトが存在せず、revert dataが取得できない
                                let smartAccountResult = null;
                                const hasInitCode = normalizedUserOp.initCode && normalizedUserOp.initCode !== "0x" && normalizedUserOp.initCode !== "";
                                
                                if (!hasInitCode) {
                                    // SmartAccountがデプロイされている場合のみ、直接呼び出しを試行
                                    try {
                                        this.logger.info('[AA] Calling SmartAccount.validateUserOp directly for detailed error diagnosis...');
                                        
                                        // SmartAccountがデプロイされているかチェック
                                        const smartAccountCode = await provider.getCode(normalizedUserOp.sender);
                                        if (smartAccountCode === "0x" || smartAccountCode === "0x0") {
                                            this.logger.warn('[AA] SmartAccount not deployed, skipping direct validateUserOp call');
                                            smartAccountResult = {
                                                success: false,
                                                errorType: "not_deployed",
                                                message: "SmartAccount not deployed (initCode required)"
                                            };
                                        } else {
                                            // EntryPointコントラクトを取得してuserOpHashを計算
                                            const entryPointABI = [
                                                "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
                                            ];
                                            const entryPointContract = new ethers.Contract(entryPointAddress, entryPointABI, provider);
                                            const userOpHash = await entryPointContract.getUserOpHash(userOpForSimulation);
                                            
                                            // SmartAccountのvalidateUserOpを直接呼び出し
                                            smartAccountResult = await validateUserOpDirect(
                                                normalizedUserOp.sender,
                                                userOpForSimulation,
                                                userOpHash,
                                                provider
                                            );
                                            
                                            this.logger.error('[AA] SmartAccount.validateUserOp direct call result:', {
                                                success: smartAccountResult.success,
                                                errorType: smartAccountResult.errorType,
                                                customError: smartAccountResult.customError,
                                                errorSelector: smartAccountResult.errorSelector,
                                                message: smartAccountResult.message,
                                                details: smartAccountResult.details
                                            });
                                        }
                                    } catch (directError) {
                                        this.logger.warn('[AA] Failed to call SmartAccount.validateUserOp directly:', directError);
                                    }
                                } else {
                                    this.logger.info('[AA] Skipping SmartAccount.validateUserOp direct call (initCode present, SmartAccount not deployed yet)');
                                    
                                    // initCodeの内容を解析して診断情報を取得
                                    try {
                                        this.logger.info('[AA] Analyzing initCode for diagnosis...');
                                        
                                        const initCode = normalizedUserOp.initCode;
                                        if (initCode && initCode.length >= 42) {
                                            // initCode = factoryAddress (20 bytes) + calldata
                                            const factoryAddress = '0x' + initCode.substring(2, 42);
                                            
                                            // FactoryのgetAddressを呼び出して、予測されるSmartAccountアドレスを取得（3引数: ownerEOA, salt, allowedToken）
                                            const factoryABI = [
                                                "function getAddress(address ownerEOA, bytes32 salt, address allowedToken) public view returns (address)",
                                                "function createAccount(address ownerEOA, bytes32 salt, address allowedToken) external returns (address sa)",
                                                "error CREATE2_MISMATCH()",
                                                "error OWNER_0()"
                                            ];
                                            const factoryContract = new ethers.Contract(factoryAddress, factoryABI, provider);
                                            
                                            // initCodeのcalldataをデコード
                                            const factoryInterface = new ethers.utils.Interface(factoryABI);
                                            const calldata = '0x' + initCode.substring(42);
                                            
                                            try {
                                                const decoded = factoryInterface.decodeFunctionData('createAccount', calldata);
                                                const ownerEOA = decoded.ownerEOA;
                                                const salt = decoded.salt;
                                                const allowedToken = decoded.allowedToken;
                                                
                                                // Factoryから予測されるアドレスを取得（allowedToken込み）
                                                const predictedAddress = allowedToken != null
                                                    ? await factoryContract.getAddress(ownerEOA, salt, allowedToken)
                                                    : null;
                                                
                                                // 実際のsenderアドレスと比較
                                                const addressMatch = predictedAddress != null && predictedAddress.toLowerCase() === normalizedUserOp.sender.toLowerCase();
                                                
                                                // EntryPointがinitCodeを実行した後、SmartAccountのOWNER_EOAを確認
                                                // 注意: simulateValidationはeth_callなので、実際にはデプロイされない
                                                // しかし、実際のBundler送信前に、SmartAccountを手動でデプロイしてテストすることを推奨
                                                let smartAccountOwnerEOA = null;
                                                let smartAccountCode = null;
                                                try {
                                                    // SmartAccountがデプロイされているかチェック
                                                    smartAccountCode = await provider.getCode(normalizedUserOp.sender);
                                                    if (smartAccountCode && smartAccountCode !== "0x" && smartAccountCode !== "0x0") {
                                                        const smartAccountABI = [
                                                            "function OWNER_EOA() external view returns (address)"
                                                        ];
                                                        const smartAccountContract = new ethers.Contract(normalizedUserOp.sender, smartAccountABI, provider);
                                                        smartAccountOwnerEOA = await smartAccountContract.OWNER_EOA();
                                                        this.logger.info(`[AA] SmartAccount OWNER_EOA (already deployed): ${smartAccountOwnerEOA}, expected: ${ownerEOA}, match: ${smartAccountOwnerEOA?.toLowerCase() === ownerEOA.toLowerCase()}`);
                                                    } else {
                                                        this.logger.warn(`[AA] SmartAccount not deployed yet (code: ${smartAccountCode}). EntryPoint will deploy it via initCode.`);
                                                        this.logger.info(`[AA] Expected OWNER_EOA from initCode: ${ownerEOA}`);
                                                    }
                                                } catch (ownerError) {
                                                    this.logger.warn('[AA] Failed to get SmartAccount OWNER_EOA:', ownerError.message);
                                                }
                                                
                                                // FactoryのcreateAccountを直接呼び出して、実際のrevert reasonを取得
                                                let createAccountResult = null;
                                                try {
                                                    this.logger.info('[AA] Calling Factory.createAccount directly to diagnose deployment issues...');
                                                    
                                                    // createAccountをeth_callで実行（実際にはデプロイしない）
                                                    const createAccountResultRaw = allowedToken != null
                                                        ? await factoryContract.callStatic.createAccount(ownerEOA, salt, allowedToken)
                                                        : await factoryContract.callStatic.createAccount(ownerEOA, salt);
                                                    
                                                    createAccountResult = {
                                                        success: true,
                                                        deployedAddress: createAccountResultRaw.toString(),
                                                        message: "Factory.createAccount would succeed"
                                                    };
                                                } catch (createError) {
                                                    // revert dataをデコード
                                                    let revertData = null;
                                                    if (createError.data) {
                                                        revertData = createError.data;
                                                    } else if (createError.error && createError.error.data) {
                                                        revertData = createError.error.data;
                                                    }
                                                    
                                                    if (revertData && revertData.length >= 10) {
                                                        const errorSelector = revertData.substring(0, 10);
                                                        
                                                        // カスタムエラーを試行
                                                        const customErrors = ["CREATE2_MISMATCH", "OWNER_0"];
                                                        let decodedError = null;
                                                        
                                                        for (const errorName of customErrors) {
                                                            try {
                                                                const selector = factoryContract.interface.getSighash(errorName + "()");
                                                                if (errorSelector.toLowerCase() === selector.toLowerCase()) {
                                                                    decodedError = errorName;
                                                                    break;
                                                                }
                                                            } catch (e) {
                                                                continue;
                                                            }
                                                        }
                                                        
                                                        createAccountResult = {
                                                            success: false,
                                                            errorType: decodedError || "unknown_error",
                                                            errorSelector: errorSelector,
                                                            message: decodedError ? `Factory.createAccount would revert with ${decodedError}()` : `Factory.createAccount would revert with unknown error (selector: ${errorSelector})`,
                                                            rawError: createError.message
                                                        };
                                                    } else {
                                                        createAccountResult = {
                                                            success: false,
                                                            errorType: "unknown_error",
                                                            message: `Factory.createAccount would revert: ${createError.message}`,
                                                            rawError: createError.message
                                                        };
                                                    }
                                                }
                                                
                                                this.logger.error('[AA] initCode analysis:', {
                                                    factoryAddress: factoryAddress,
                                                    ownerEOA: ownerEOA,
                                                    salt: salt,
                                                    predictedAddress: predictedAddress,
                                                    actualSender: normalizedUserOp.sender,
                                                    addressMatch: addressMatch,
                                                    calldataLength: calldata.length - 2,
                                                    createAccountResult: createAccountResult
                                                });
                                                
                                                smartAccountResult = {
                                                    success: false,
                                                    errorType: "not_deployed",
                                                    message: "SmartAccount not deployed (initCode present in UserOperation)",
                                                    initCodeAnalysis: {
                                                        factoryAddress: factoryAddress,
                                                        ownerEOA: ownerEOA,
                                                        salt: salt,
                                                        predictedAddress: predictedAddress,
                                                        actualSender: normalizedUserOp.sender,
                                                        addressMatch: addressMatch,
                                                        createAccountResult: createAccountResult
                                                    }
                                                };
                                            } catch (decodeError) {
                                                this.logger.warn('[AA] Failed to decode initCode calldata:', decodeError);
                                                smartAccountResult = {
                                                    success: false,
                                                    errorType: "not_deployed",
                                                    message: "SmartAccount not deployed (initCode present in UserOperation)",
                                                    initCodeAnalysis: {
                                                        factoryAddress: factoryAddress,
                                                        decodeError: decodeError.message
                                                    }
                                                };
                                            }
                                        } else {
                                            smartAccountResult = {
                                                success: false,
                                                errorType: "not_deployed",
                                                message: "SmartAccount not deployed (initCode present in UserOperation)",
                                                initCodeAnalysis: {
                                                    error: "Invalid initCode format"
                                                }
                                            };
                                        }
                                    } catch (analysisError) {
                                        this.logger.warn('[AA] Failed to analyze initCode:', analysisError);
                                        smartAccountResult = {
                                            success: false,
                                            errorType: "not_deployed",
                                            message: "SmartAccount not deployed (initCode present in UserOperation)"
                                        };
                                    }
                                }
                                
                                return res.status(500).json({
                                    status: "NG",
                                    error: 'bundler_error',
                                    message: result.error.message || 'Failed to send UserOperation',
                                    diagnosis: {
                                        entryPoint: {
                                            errorType: simulationResult.errorType,
                                            message: simulationResult.message,
                                            opIndex: simulationResult.opIndex,
                                            reason: simulationResult.reason,
                                            customError: simulationResult.customError,
                                            errorSelector: simulationResult.errorSelector,
                                            possibleCause: simulationResult.possibleCause,
                                            suggestions: simulationResult.suggestions,
                                            aggregator: simulationResult.aggregator,
                                            executionResult: simulationResult.executionResult
                                        },
                                        smartAccount: smartAccountResult ? {
                                            success: smartAccountResult.success,
                                            errorType: smartAccountResult.errorType,
                                            customError: smartAccountResult.customError,
                                            errorSelector: smartAccountResult.errorSelector,
                                            message: smartAccountResult.message,
                                            details: smartAccountResult.details
                                        } : null
                                    }
                                });
                            }
                        } catch (simError) {
                            this.logger.warn('[AA] Failed to run simulateValidation diagnosis:', simError);
                            // 診断に失敗しても元のエラーを返す
                        }
                    }
                    
                    return res.status(500).json({
                        status: "NG",
                        error: 'bundler_error',
                        message: result.error.message || 'Failed to send UserOperation'
                    });
                }

                const userOpHash = result.result;

                // aa_user_op_hashをDBに保存
                await this.db.query(
                    `UPDATE oidc_payment_intents
                     SET aa_user_op_hash = ?, status = 'PROCESSING', updated_at = CURRENT_TIMESTAMP(3)
                     WHERE intent_id = ?`,
                    [userOpHash, intent_id]
                );

                this.logger.info(`[AA] UserOperation sent successfully: ${userOpHash} for intent: ${intent_id}`);

                res.json({
                    status: "OK",
                    success: true,
                    userOpHash,
                    intent_id
                });

                // Async receipt poll — schedule 15s after submission (non-blocking)
                const _bundlerRpcUrlPoll = bundlerRpcUrl;
                const _rpcUrlPoll = this.config.sa[chain]?.[network]?.rpcUrl;
                const _intentIdPoll = intent_id;
                const _gasModeLog = gasModeLog;
                const _dbPoll = this.db;
                const _loggerPoll = this.logger;
                setTimeout(async () => {
                    try {
                        const statusRes = await fetch(_bundlerRpcUrlPoll, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'pimlico_getUserOperationStatus', params: [userOpHash] })
                        });
                        const statusData = await statusRes.json();
                        const status = statusData?.result?.status;
                        if (status !== 'included') {
                            _loggerPoll.debug(`[AA] Receipt poll: UserOp ${userOpHash} status=${status}, skipping gas log`);
                            return;
                        }
                        const txHash = statusData.result.transactionHash;
                        const receiptRes = await fetch(_rpcUrlPoll, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] })
                        });
                        const receiptData = await receiptRes.json();
                        const receipt = receiptData?.result;
                        if (!receipt || receipt.status !== '0x1') return;

                        // Decode UserOperationEvent to get actualGasUsed
                        // UserOperationEvent: 0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f
                        const UOE_TOPIC = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
                        const uoeLog = (receipt.logs || []).find(
                            l => l.topics && l.topics[0] === UOE_TOPIC &&
                                 l.topics[1] && l.topics[1].toLowerCase().slice(-64) === userOpHash.replace(/^0x/, '').toLowerCase().padStart(64, '0')
                        );
                        if (!uoeLog) { _loggerPoll.debug(`[AA] Receipt poll: UserOperationEvent not found for ${userOpHash}`); return; }

                        // UserOperationEvent data: nonce(uint256), success(bool), actualGasCost(uint256), actualGasUsed(uint256)
                        const { ethers: _ethReceipt } = require('ethers');
                        const decoded = _ethReceipt.utils.defaultAbiCoder.decode(
                            ['uint256', 'bool', 'uint256', 'uint256'],
                            uoeLog.data
                        );
                        const actualGasUsed = decoded[3].toNumber();
                        const blockNumber = parseInt(receipt.blockNumber, 16);
                        await _dbPoll.query(
                            'INSERT INTO aa_userop_logs (intent_id, gas_mode, userop_hash, actual_gas_used, block_number) VALUES (?,?,?,?,?)',
                            [_intentIdPoll, _gasModeLog, userOpHash, actualGasUsed, blockNumber]
                        );
                        _loggerPoll.info(`[AA] Gas log: intentId=${_intentIdPoll} mode=${_gasModeLog} actualGasUsed=${actualGasUsed} block=${blockNumber}`);
                    } catch (pollErr) {
                        _loggerPoll.debug(`[AA] Receipt poll error for ${userOpHash}:`, pollErr.message);
                    }
                }, 15000);

            } catch (error) {
                this.logger.error('[AA] Send UserOperation error:', error);
                res.status(500).json({
                    status: "NG",
                    error: 'server_error',
                    message: error.message
                });
            }
        });
    }

    /**
     * Paymaster Sponsor処理（直接関数コール）
     * @param {Object} intent - Intent情報
     * @param {number} chainId - Chain ID
     * @param {string} chain - チェーン名
     * @param {string} network - ネットワーク名
     * @param {Object} userOpPartial - UserOperation部分構築
     * @returns {Promise<Object|null>} Paymaster Sponsor結果
     */
    /**
     * uint値をhex文字列に正規化（nonce/gas系の統一処理）
     * BigInt/BigNumber/string/numberを全てhex文字列に変換
     */
    _toHexUint(v) {
        if (v == null) return "0x00";
        if (typeof v === "bigint") {
            const hex = v.toString(16);
            // 偶数長にする（奇数長の場合は先頭に0を追加）
            return "0x" + (hex.length % 2 === 0 ? hex : "0" + hex);
        }
        if (typeof v === "number") {
            const hex = BigInt(v).toString(16);
            return "0x" + (hex.length % 2 === 0 ? hex : "0" + hex);
        }
        if (typeof v === "string") {
            if (v.startsWith("0x")) {
                // 奇数長の場合は先頭に0を追加して偶数長にする
                const hex = v.substring(2);
                if (hex.length === 0) return "0x00";
                return "0x" + (hex.length % 2 === 0 ? hex : "0" + hex);
            }
            const hex = BigInt(v).toString(16);
            return "0x" + (hex.length % 2 === 0 ? hex : "0" + hex);
        }
        // BigNumber (ethers.js)
        // toHexString()を使用してから偶数長に正規化
        let hex;
        if (v.toHexString) {
            hex = v.toHexString();
        } else if (v._hex) {
            hex = v._hex;
        } else {
            hex = v.toString(16);
        }
        const hexWithoutPrefix = hex.startsWith("0x") ? hex.substring(2) : hex;
        if (hexWithoutPrefix.length === 0) return "0x00";
        return "0x" + (hexWithoutPrefix.length % 2 === 0 ? hexWithoutPrefix : "0" + hexWithoutPrefix);
    }

    /**
     * SmartAccount署名対象のハッシュを計算
     * paymasterAndDataとsignatureは常に空（0x）として扱う
     * aa-utils.jsのgetHashToSignを使用（ローカル計算、RPC呼び出しなし）
     * 
     * 注意: パラメータの正規化（addressはチェックサム化、uintはhex化）を実施
     */
    getHashToSign(userOp, entryPointAddress, chainId) {
        // paymasterAndDataとsignatureを空として再構築
        // パラメータの正規化
        const userOpForHash = {
            sender: ethers.utils.getAddress(userOp.sender), // address: チェックサム化（ログの見やすさ・入力ミス検知）
            nonce: this._toHexUint(userOp.nonce),
            initCode: userOp.initCode || "0x",
            callData: userOp.callData || "0x",
            callGasLimit: this._toHexUint(userOp.callGasLimit),
            verificationGasLimit: this._toHexUint(userOp.verificationGasLimit),
            preVerificationGas: this._toHexUint(userOp.preVerificationGas),
            maxFeePerGas: this._toHexUint(userOp.maxFeePerGas),
            maxPriorityFeePerGas: this._toHexUint(userOp.maxPriorityFeePerGas),
            paymasterAndData: "0x", // 常に空
            signature: "0x" // 常に空
        };
        
        // aa-utils.jsのローカル計算を使用（RPC呼び出しなし）
        return getHashToSignUtil(userOpForHash, entryPointAddress, chainId);
    }

    async getPaymasterSponsor(intent, chainId, chain, network, userOpPartial) {
        try {
            this.logger.info(`[AA] getPaymasterSponsor called: chain=${chain}, network=${network}, chainId=${chainId}`);
            const { ethers } = require('ethers');
            const aaUtils = require('./server/utils/aa-utils');
            
            // Paymaster設定取得
            const paymasterConfig = await this.getPaymasterConfig(chainId, chain, network);
            if (!paymasterConfig || !paymasterConfig.is_active) {
                this.logger.warn(`[AA] Paymaster not available for ${chain}/${network}`);
                return null;
            }
            this.logger.info(`[AA] Paymaster config found: address=${paymasterConfig.paymaster_address}`);

            // EntryPointアドレス取得
            const entryPointAddress = this.config.sa[chain]?.[network]?.entryPointAddress;
            if (!entryPointAddress) {
                this.logger.warn(`[AA] EntryPoint address not configured for ${chain}/${network}`);
                return null;
            }

            // Paymaster署名対象のハッシュを計算（paymasterAndDataを除外）
            // EntryPoint.getUserOpHashを使用するが、paymasterAndData="0x"として計算
            // これにより、paymasterAndDataに依存しない固定ハッシュが得られる
            const rpcUrl = this.config.sa[chain]?.[network]?.rpcUrl;
            if (!rpcUrl) {
                this.logger.warn(`[AA] RPC URL not configured for ${chain}/${network}`);
                return null;
            }
            
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            const entryPointABI = [
                "function getUserOpHash((address sender, uint256 nonce, bytes initCode, bytes callData, uint256 callGasLimit, uint256 verificationGasLimit, uint256 preVerificationGas, uint256 maxFeePerGas, uint256 maxPriorityFeePerGas, bytes paymasterAndData, bytes signature) userOp) external view returns (bytes32)"
            ];
            const entryPointContract = new ethers.Contract(entryPointAddress, entryPointABI, provider);
            
            // paymasterAndDataを除外したuserOpHashを計算（Paymaster署名対象）
            const userOpForHash = {
                ...userOpPartial,
                paymasterAndData: "0x", // Paymaster署名対象ではpaymasterAndDataを除外
                signature: "0x" // signatureも空として計算
            };
            this.logger.info(`[AA] Computing userOpHash without paymasterAndData for Paymaster signature`);
            const userOpHashWithoutPaymaster = await entryPointContract.getUserOpHash(userOpForHash);
            this.logger.info(`[AA] userOpHash without paymasterAndData computed: ${userOpHashWithoutPaymaster}`);

            // PaymasterAndData生成（paymasterAndDataを除外したuserOpHashを使用）
            const paymasterAndData = await this.generatePaymasterAndData(
                paymasterConfig,
                userOpPartial,
                intent,
                userOpHashWithoutPaymaster, // paymasterAndDataを除外したハッシュを使用
                chainId,
                entryPointAddress
            );

            // ガス見積り
            const gasEstimate = await this.estimateGas(userOpPartial, paymasterAndData, chainId);

            return {
                paymasterAndData,
                gas: gasEstimate,
                valid_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5分
                valid_after: new Date().toISOString(),
                sponsor_id: paymasterConfig.config_id ? paymasterConfig.config_id.toString() : null
            };
        } catch (error) {
            this.logger.error('[AA] Paymaster sponsor error:', error);
            return null;
        }
    }

    /**
     * Paymaster設定取得
     */
    async getPaymasterConfig(chainId, chain, network) {
        try {
            // テーブルが存在するかチェック
            const [tableCheck] = await this.db.query(
                `SELECT COUNT(*) as count FROM information_schema.tables 
                 WHERE table_schema = DATABASE() AND table_name = 'aa_paymaster_configs'`
            );

            if (!tableCheck || !tableCheck[0] || tableCheck[0].count === 0) {
                this.logger.debug(`[AA] aa_paymaster_configs table does not exist`);
                return null;
            }

            const [rows] = await this.db.query(
                `SELECT * FROM aa_paymaster_configs 
                 WHERE chain = ? AND network = ? AND is_active = TRUE
                 LIMIT 1`,
                [chain, network]
            );

            return rows && rows.length > 0 ? rows[0] : null;
        } catch (error) {
            this.logger.error('[AA] Failed to get paymaster config:', error);
            return null;
        }
    }

    /**
     * PaymasterAndData生成
     * BitVoyPaymaster形式: paymasterAddress (20 bytes) + validUntil (6 bytes) + validAfter (6 bytes) + signature (65 bytes)
     * @param {Object} paymasterConfig - Paymaster設定
     * @param {Object} userOpPartial - UserOperation部分構築
     * @param {Object} intent - Intent情報
     * @param {string} userOpHashNoPM - UserOperation Hash（paymasterAndDataを除外、signatureも空）
     * @param {number} chainId - Chain ID
     * @param {string} entryPointAddress - EntryPointアドレス
     */
    async generatePaymasterAndData(paymasterConfig, userOpPartial, intent, userOpHashNoPM, chainId, entryPointAddress) {
        const { ethers } = require('ethers');
        
        // Paymasterアドレスを正規化
        let paymasterAddress = paymasterConfig.paymaster_address;
        if (!paymasterAddress.startsWith('0x')) {
            paymasterAddress = `0x${paymasterAddress}`;
        }
        
        // Paymasterアドレスのデプロイ状態を確認
        const chain = intent.chain ? intent.chain.toLowerCase() : null;
        const network = intent.network ? intent.network.toLowerCase() : null;
        const rpcUrl = this.config.sa[chain]?.[network]?.rpcUrl;
        
        if (rpcUrl) {
            try {
                const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
                const paymasterCode = await provider.getCode(paymasterAddress);
                const isDeployed = paymasterCode && paymasterCode !== "0x" && paymasterCode !== "0x0";
                
                if (!isDeployed) {
                    this.logger.error(`[AA] Paymaster not deployed at ${paymasterAddress} for ${chain}/${network}`);
                    throw new Error(`Paymaster not deployed at ${paymasterAddress}`);
                }
                this.logger.info(`[AA] Paymaster verified at ${paymasterAddress}`);
            } catch (error) {
                this.logger.error(`[AA] Failed to verify paymaster deployment:`, error);
                throw error;
            }
        }

        // 外部Paymaster APIが設定されている場合は呼び出し
        if (paymasterConfig.paymaster_url) {
            try {
                const response = await fetch(paymasterConfig.paymaster_url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userOp: userOpPartial,
                        intent: intent,
                        userOpHash: userOpHash
                    })
                });

                if (!response.ok) {
                    throw new Error(`Paymaster API returned ${response.status}`);
                }

                const result = await response.json();
                if (result.paymasterAndData && result.paymasterAndData.length >= 194) { // 97 bytes = 194 hex chars
                    return result.paymasterAndData;
                }
                // フォールバック: 内部実装を使用
            } catch (error) {
                this.logger.warn('[AA] Paymaster API call failed, using internal implementation:', error);
                // フォールバック: 内部実装を使用
            }
        }

        // 内部Paymaster実装: BitVoyPaymaster形式で生成
        // validUntil/validAfterを計算（5分の有効期限）
        const validAfter = Math.floor(Date.now() / 1000);
        const validUntil = validAfter + (5 * 60); // 5分後
        
        // sponsorHashを計算（BitVoyPaymasterのgetHash関数と同じロジック）
        // sponsorHash = keccak256(abi.encode(uint256(chainId), address(paymaster), bytes32(userOpHashNoPM), uint48(validUntil), uint48(validAfter)))
        // 注意: userOpHashNoPMはpaymasterAndDataを除外したハッシュ（循環依存を避けるため）
        // 型と順序を明示的に指定して、コントラクト側と完全一致させる
        const sponsorHash = ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'address', 'bytes32', 'uint48', 'uint48'],
                [
                    BigInt(chainId), // uint256(chainId)
                    paymasterAddress, // address(paymaster)
                    userOpHashNoPM, // bytes32(userOpHashNoPM)
                    BigInt(validUntil), // uint48(validUntil)
                    BigInt(validAfter)  // uint48(validAfter)
                ]
            )
        );
        
        this.logger.info(`[AA] Paymaster sponsorHash computation:`, {
            chainId: chainId.toString(),
            paymasterAddress,
            userOpHashNoPM,
            validUntil: validUntil.toString(),
            validAfter: validAfter.toString(),
            sponsorHash
        });
        
        // OP署名を生成
        const opPaymasterSignerPrivateKeyEnvKey = `${chain.toUpperCase()}_${network.toUpperCase()}_OP_PAYMASTER_SIGNER_PRIVATE_KEY`;
        const opPaymasterSignerPrivateKey = process.env[opPaymasterSignerPrivateKeyEnvKey];
        
        if (!opPaymasterSignerPrivateKey) {
            this.logger.error(`[AA] OP_PAYMASTER_SIGNER_PRIVATE_KEY not configured for ${chain}/${network}`);
            throw new Error(`OP_PAYMASTER_SIGNER_PRIVATE_KEY not configured`);
        }
        
        const wallet = new ethers.Wallet(opPaymasterSignerPrivateKey);
        const opSignerAddress = wallet.address;
        this.logger.info(`[AA] OP Paymaster signer address: ${opSignerAddress}`);
        
        // EIP-191形式で署名（BitVoyPaymasterのtoEthSignedMessageHash()と一致）
        // signMessageは既にEIP-191形式（\x19Ethereum Signed Message:\n32プレフィックス）で署名する
        const signature = await wallet.signMessage(ethers.utils.arrayify(sponsorHash));
        
        // 署名検証（デバッグ用）
        const recoveredAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(sponsorHash), signature);
        this.logger.info(`[AA] Paymaster signature verification:`, {
            opSignerAddress,
            recoveredAddress,
            match: opSignerAddress.toLowerCase() === recoveredAddress.toLowerCase()
        });
        
        // uint48を6バイトのbig-endian形式に変換
        const toUint48Hex = (value) => {
            const num = BigInt(value);
            const hex = num.toString(16).padStart(12, '0'); // uint48は最大12 hex digits (6 bytes)
            return hex;
        };
        
        const validUntilHex = toUint48Hex(validUntil);
        const validAfterHex = toUint48Hex(validAfter);
        
        // 署名からr, s, vを抽出（65バイト形式）
        const sigBytes = ethers.utils.arrayify(signature);
        if (sigBytes.length !== 65) {
            throw new Error(`Invalid signature length: expected 65 bytes, got ${sigBytes.length}`);
        }
        const signatureHex = ethers.utils.hexlify(sigBytes).slice(2); // 0xを除去
        
        // paymasterAndData = paymasterAddress (20 bytes) + validUntil (6 bytes) + validAfter (6 bytes) + signature (65 bytes)
        // 合計: 20 + 6 + 6 + 65 = 97 bytes = 194 hex chars
        const paymasterAndData = ethers.utils.hexConcat([
            paymasterAddress,
            '0x' + validUntilHex,
            '0x' + validAfterHex,
            signature
        ]);
        
        this.logger.info(`[AA] Generated paymasterAndData: length=${(paymasterAndData.length - 2) / 2} bytes, paymaster=${paymasterAddress.substring(0, 20)}...`);
        
        return paymasterAndData;
    }

    /**
     * ガス見積り
     */
    async estimateGas(userOpPartial, paymasterAndData, chainId) {
        // 簡易実装: デフォルト値を返す
        // 実際の実装では、Bundler RPCのestimateUserOperationGasを呼び出す
        return {
            callGasLimit: '0x100000', // 1M gas
            verificationGasLimit: '0x50000', // 320K gas
            preVerificationGas: '0x10000', // 64K gas
            maxFeePerGas: '0x3b9aca00', // 1 gwei (デフォルト)
            maxPriorityFeePerGas: '0x3b9aca00' // 1 gwei (デフォルト)
        };
    }

    setupNFTRoutes() {
        // 認証ミドルウェアをインポート
        const authMiddleware = require('./server/api/middleware/auth');

        this.app.post(
            `/walletapi/nft/:masterId/collections`,
            authMiddleware,
            async (req, res) => {
                try {
                    const { masterId } = req.params;
                    const { blockchain } = req.query;

                    // 認証されたユーザーのmasterIdと一致することを確認
                    if (req.user && req.user.sub && req.user.sub !== masterId) {
                        return res.status(403).json({
                            status: "ERROR",
                            message: "MasterId mismatch with authenticated user",
                        });
                    }

                    const nfts = await this.nftService.getUserNFTs(
                        masterId,
                        blockchain,
                    );
                    res.json({ status: "OK", data: nfts });
                } catch (error) {
                    this.logger.error("Failed to get NFT collections:", error);
                    res.status(500).json({
                        status: "ERROR",
                        message: "Failed to get NFTs",
                    });
                }
            },
        );
        // WalletConnect セッション作成API
        this.app.post(`/walletapi/walletconnect/create-session`, authMiddleware, async (req, res) => {
            try {
                const { masterId, wallet_address } = req.body;
                
                if (!masterId || !wallet_address) {
                    return res.status(400).json({
                        success: false,
                        message: 'masterId and wallet_address are required'
                    });
                }
                
                // Redisクライアントをインポート（動的インポート）
                const Redis = require('ioredis');
                const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
                
                // セッションIDを生成
                const sessionId = crypto.randomBytes(32).toString('hex');
                
                // セッションデータを保存（30分の有効期限）
                const sessionData = {
                    masterId: masterId,
                    wallet_address: wallet_address,
                    createdAt: Date.now()
                };
                
                await redis.setex(`walletconnect:session:${sessionId}`, 1800, JSON.stringify(sessionData));
                
                this.logger.info(`WalletConnect session created: ${sessionId.substring(0, 8)}...`);
                
                res.json({
                    success: true,
                    sessionId: sessionId
                });
            } catch (error) {
                this.logger.error('WalletConnect session creation failed:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to create session',
                    error: error.message
                });
            }
        });
        
        // WalletConnect セッション取得API
        this.app.get(`/walletapi/walletconnect/session`, async (req, res) => {
            try {
                const { sessionId } = req.query;
                
                if (!sessionId) {
                    return res.status(400).json({
                        success: false,
                        message: 'sessionId is required'
                    });
                }
                
                // Redisクライアントをインポート（動的インポート）
                const Redis = require('ioredis');
                const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
                
                // セッションデータを取得
                const sessionDataStr = await redis.get(`walletconnect:session:${sessionId}`);
                
                if (!sessionDataStr) {
                    return res.status(404).json({
                        success: false,
                        message: 'Session not found or expired'
                    });
                }
                
                const sessionData = JSON.parse(sessionDataStr);
                
                res.json({
                    success: true,
                    wallet_address: sessionData.wallet_address
                });
            } catch (error) {
                this.logger.error('WalletConnect session retrieval failed:', error);
                res.status(500).json({
                    success: false,
                    message: 'Failed to get session',
                    error: error.message
                });
            }
        });
        
        this.app.post(`/walletapi/nft/transfer`, authMiddleware, async (req, res) => {
            try {
                const {
                    masterId,
                    contractAddress,
                    tokenId,
                    toAddress,
                    blockchain,
                } = req.body;

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                const result = await this.nftService.transferNFT(
                    masterId,
                    contractAddress,
                    tokenId,
                    toAddress,
                    blockchain,
                );
                res.json({ status: "OK", data: result });
            } catch (error) {
                this.logger.error("NFT transfer failed:", error);
                res.status(500).json({
                    status: "ERROR",
                    message: "NFT transfer failed",
                });
            }
        });

        // NFTインポートエンドポイント
        this.app.post(`/walletapi/nft/import`, authMiddleware, async (req, res) => {
            try {
                const {
                    masterId,
                    productId,
                    contractAddress,
                    tokenId,
                    chain,
                    network,
                    relAddress
                } = req.body;

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                // 必須パラメータのチェック
                if (!masterId || !productId || !contractAddress || !tokenId || !chain || !relAddress) {
                    return res.status(400).json({
                        status: "ERROR",
                        message: "Missing required parameters",
                    });
                }

                const result = await this.nftService.importNFT(
                    masterId,
                    productId,
                    contractAddress,
                    tokenId,
                    chain,
                    network,
                    relAddress
                );

                res.json({ 
                    reqId: req.body.reqId || Date.now().toString(),
                    status: result.status,
                    message: result.message
                });
            } catch (error) {
                this.logger.error("NFT import failed:", error);
                res.status(500).json({
                    reqId: req.body.reqId || Date.now().toString(),
                    status: "NG",
                    message: error.message || "NFT import failed",
                });
            }
        });

        // NFT一覧取得エンドポイント
        this.app.post(`/walletapi/nft/list`, authMiddleware, async (req, res) => {
            try {
                const { masterId } = req.body;

                // 認証されたユーザーのmasterIdと一致することを確認
                if (req.user && req.user.sub && req.user.sub !== masterId) {
                    return res.status(403).json({
                        status: "ERROR",
                        message: "MasterId mismatch with authenticated user",
                    });
                }

                // 必須パラメータのチェック
                if (!masterId) {
                    return res.status(400).json({
                        reqId: req.body.reqId || Date.now().toString(),
                        status: "NG",
                        nfts: [],
                        message: "Missing required parameter: masterId",
                    });
                }

                const nfts = await this.nftService.getNftList(masterId);

                res.json({
                    reqId: req.body.reqId || Date.now().toString(),
                    status: "OK",
                    nfts: nfts
                });
            } catch (error) {
                this.logger.error("Get NFT list failed:", error);
                res.status(500).json({
                    reqId: req.body.reqId || Date.now().toString(),
                    status: "NG",
                    nfts: [],
                    message: error.message || "Failed to get NFT list",
                });
            }
        });
    }

    /**
     * Security API
     */
    setupSecurityRoutes() {
        this.app.post(`/walletapi/security/verify-email`, async (req, res) => {
            try {
                const { email, code } = req.body;
                const result = await this.securityService.verifyEmail(
                    email,
                    code,
                );
                res.json({ status: "OK", data: result });
            } catch (error) {
                this.logger.error("Email verification failed:", error);
                res.status(500).json({
                    status: "ERROR",
                    message: "Email verification failed",
                });
            }
        });
    }

    /**
     * Proxy API
     */
    setupProxyRoutes() {
        const WalletService = require('./server/services/WalletService');

        // プロキシルート用のミドルウェア: req.app.localsにmainAppとdbを設定
        this.app.use('/proxyapi/blockchain/*', (req, res, next) => {
            if (!req.app.locals.mainApp) {
                req.app.locals.mainApp = this;
            }
            if (!req.app.locals.db) {
                req.app.locals.db = this.db;
            }
            next();
        });

        // Bitcoinプロキシ（mainnet/testnet統一）
        this.app.all('/proxyapi/blockchain/bitcoin/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/bitcoin', '');
            let network = 'mainnet'; // デフォルト値
            
            // パスからnetworkを抽出: /mainnet/address/... または /testnet/address/...
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0 
                    ? '/' + pathParts.slice(1).join('/')  // 残りのパス部分がある場合
                    : '';  // パスがない場合は空文字列（JSON-RPCリクエスト用）
            } else {
                // 後方互換性: クエリパラメータまたはリクエストボディから取得
                network = req.query.network || req.body?.network || 'mainnet';
            }

            const result = await WalletService.proxyBitcoinRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        // Ethereumプロキシ（mainnet/testnet統一）
        this.app.post('/proxyapi/blockchain/ethereum', async (req, res) => {
            // networkパラメータからパス部分を除去
            let network = req.query.network || req.body?.network || 'mainnet';
            // networkパラメータにスラッシュが含まれている場合、最初の部分のみを使用
            if (network.includes('/')) {
                network = network.split('/')[0];
            }
            // 有効なネットワーク名のみを許可
            if (network !== 'mainnet' && network !== 'testnet') {
                network = 'mainnet'; // デフォルト値
            }

            const result = await WalletService.proxyEthereumRequest('', req.body, network, req);
            res.status(result.status).json(result);
        });

        this.app.all('/proxyapi/blockchain/ethereum/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/ethereum', '');
            let network = 'mainnet'; // デフォルト値
            
            // パスからnetworkを抽出: /mainnet/estimateGas または /testnet/estimateGas
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0 
                    ? '/' + pathParts.slice(1).join('/')  // 残りのパス部分がある場合
                    : '';  // パスがない場合は空文字列（JSON-RPCリクエスト用）
            } else {
                // 後方互換性: クエリパラメータまたはリクエストボディから取得
                network = req.query.network || req.body?.network || 'mainnet';
            }

            const result = await WalletService.proxyEthereumRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        // Polygonプロキシ（mainnet/testnet統一）
        this.app.post('/proxyapi/blockchain/polygon', async (req, res) => {
            const network = req.query.network || req.body?.network || 'mainnet'; // クエリパラメータまたはリクエストボディから取得

            const result = await WalletService.proxyPolygonRequest('', req.body, network, req);
            res.status(result.status).json(result);
        });

        this.app.all('/proxyapi/blockchain/polygon/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/polygon', '');
            let network = 'mainnet'; // デフォルト値
            
            // パスからnetworkを抽出: /mainnet/estimateGas または /testnet/estimateGas
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0 
                    ? '/' + pathParts.slice(1).join('/')  // 残りのパス部分がある場合
                    : '';  // パスがない場合は空文字列（JSON-RPCリクエスト用）
            } else {
                // 後方互換性: クエリパラメータまたはリクエストボディから取得
                network = req.query.network || req.body?.network || 'mainnet';
            }

            const result = await WalletService.proxyPolygonRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        // Avalancheプロキシ（mainnet/testnet。JPYC_AVAX 残高取得など eth_call 転送用）
        this.app.post('/proxyapi/blockchain/avalanche', async (req, res) => {
            const network = req.query.network || req.body?.network || 'mainnet';
            const result = await WalletService.proxyAvalancheRequest('', req.body, network, req);
            res.status(result.status).json(result);
        });

        this.app.all('/proxyapi/blockchain/avalanche/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/avalanche', '');
            let network = 'mainnet';
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0 ? '/' + pathParts.slice(1).join('/') : '';
            } else {
                network = req.query.network || req.body?.network || 'mainnet';
            }
            const result = await WalletService.proxyAvalancheRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        // Solanaプロキシ（mainnet/testnet統一）
        this.app.all('/proxyapi/blockchain/solana/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/solana', '');
            let network = 'mainnet'; // デフォルト値
            
            // パスからnetworkを抽出: /mainnet または /testnet
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0 
                    ? '/' + pathParts.slice(1).join('/')  // 残りのパス部分がある場合
                    : '';  // パスがない場合は空文字列（JSON-RPCリクエスト用）
            } else {
                // 後方互換性: クエリパラメータまたはリクエストボディから取得
                network = req.query.network || req.body?.network || 'mainnet';
            }

            const result = await WalletService.proxySolanaRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        this.app.post('/proxyapi/blockchain/solana', async (req, res) => {
            // networkパラメータからパス部分を除去
            let network = req.query.network || req.body?.network || 'mainnet';
            // networkパラメータにスラッシュが含まれている場合、最初の部分のみを使用
            if (network.includes('/')) {
                network = network.split('/')[0];
            }
            // 有効なネットワーク名のみを許可
            if (network !== 'mainnet' && network !== 'testnet') {
                network = 'mainnet'; // デフォルト値
            }

            const result = await WalletService.proxySolanaRequest('', req.body, network, req);
            res.status(result.status).json(result);
        });

        // TONプロキシ（mainnet/testnet統一）
        this.app.all('/proxyapi/blockchain/ton/*', async (req, res) => {
            let path = req.path.replace('/proxyapi/blockchain/ton', '');
            let network = 'mainnet'; // デフォルト値

            // パスからnetworkを抽出: /mainnet/getAddressBalance または /testnet/getAddressBalance
            const pathParts = path.split('/').filter(p => p);
            if (pathParts.length > 0 && (pathParts[0] === 'mainnet' || pathParts[0] === 'testnet')) {
                network = pathParts[0];
                path = pathParts.slice(1).length > 0
                    ? '/' + pathParts.slice(1).join('/')  // 残りのパス部分がある場合
                    : '';  // パスがない場合は空文字列
            } else {
                // 後方互換性: クエリパラメータまたはリクエストボディから取得
                network = req.query.network || req.body?.network || 'mainnet';
            }

            // 有効なネットワーク名のみを許可
            if (network !== 'mainnet' && network !== 'testnet') {
                network = 'mainnet'; // デフォルト値
            }

            const result = await WalletService.proxyTONRequest(path, req.body, network, req);
            res.status(result.status).json(result);
        });

        this.app.post('/proxyapi/blockchain/ton', async (req, res) => {
            // networkパラメータからパス部分を除去
            let network = req.query.network || req.body?.network || 'mainnet';
            // networkパラメータにスラッシュが含まれている場合、最初の部分のみを使用
            if (network.includes('/')) {
                network = network.split('/')[0];
            }
            // 有効なネットワーク名のみを許可
            if (network !== 'mainnet' && network !== 'testnet') {
                network = 'mainnet'; // デフォルト値
            }

            const result = await WalletService.proxyTONRequest('', req.body, network, req);
            res.status(result.status).json(result);
        });

        // トランザクション履歴取得エンドポイント
        this.app.post('/proxyapi/blockchain/:blockchain/address/:address/transactions', async (req, res) => {
            const { blockchain, address } = req.params;
            const network = req.query.network || 'mainnet';
            const productId = req.query.productId || blockchain;

            const result = await WalletService.getTransactionHistory(productId, address, network);
            res.status(result.status).json(result);
        });

        this.app.post('/proxyapi/blockchain/ton/getTransactions', async (req, res) => {
            const network = req.query.network || 'mainnet';
            const { address, limit } = req.body;

            const result = await WalletService.getTONTransactionHistory(address, network);
            res.status(result.status).json(result);
        });

        // Guardian API プロキシ
        const axios = require('axios');
        const guardianBaseUrl = process.env.GUARDIAN_URL || 'https://guardian01.bitvoy.net';
        
        // POST /guardianapi/shares
        this.app.post('/guardianapi/shares', async (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
                }

                const response = await axios.post(`${guardianBaseUrl}/guardianapi/shares`, req.body, {
                    headers: {
                        'Authorization': authHeader,
                        'Content-Type': 'application/json',
                        ...(req.headers['x-guardian-session'] && { 'X-Guardian-Session': req.headers['x-guardian-session'] })
                    }
                });

                res.status(response.status).json(response.data);
            } catch (error) {
                this.logger.error('Guardian API proxy error:', error);
                res.status(error.response?.status || 500).json({
                    error: 'Guardian API proxy failed',
                    details: error.response?.data || error.message
                });
            }
        });

        // GET /guardianapi/shares
        this.app.get('/guardianapi/shares', async (req, res) => {
            try {
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    return res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization header' });
                }

                const queryString = new URLSearchParams(req.query).toString();
                const response = await axios.get(`${guardianBaseUrl}/guardianapi/shares?${queryString}`, {
                    headers: {
                        'Authorization': authHeader,
                        ...(req.headers['x-guardian-session'] && { 'X-Guardian-Session': req.headers['x-guardian-session'] })
                    }
                });

                res.status(response.status).json(response.data);
            } catch (error) {
                this.logger.error('Guardian API proxy error:', error);
                res.status(error.response?.status || 500).json({
                    error: 'Guardian API proxy failed',
                    details: error.response?.data || error.message
                });
            }
        });

        // 画像プロキシエンドポイント（JWT認証不要）
        this.app.get('/walletapi/imageproxy', async (req, res) => {
            try {
                const url = req.query.url;
                
                if (!url) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Please specify the URL"
                    });
                }

                // ipfs://プロトコルをhttps://ipfs.io/ipfs/に変換
                let targetUrl = url;
                if (url.startsWith('ipfs://')) {
                    targetUrl = 'https://ipfs.io/ipfs/' + url.substring(7); // 'ipfs://'を除去
                }

                // URLの検証（基本的な検証のみ）
                try {
                    new URL(targetUrl);
                } catch (e) {
                    return res.status(400).json({
                        status: "NG",
                        message: "Invalid URL format"
                    });
                }

                // 外部URLから画像を取得
                const axios = require('axios');
                const response = await axios.get(targetUrl, {
                    responseType: 'stream',
                    timeout: 10000, // 10秒タイムアウト
                    maxRedirects: 5,
                    validateStatus: (status) => status < 500 // 4xxエラーも処理
                });

                // Content-Typeを設定（元のレスポンスから取得、デフォルトはimage/png）
                const contentType = response.headers['content-type'] || 'image/png';
                res.setHeader('Content-Type', contentType);
                
                // キャッシュヘッダーを設定（オプション）
                res.setHeader('Cache-Control', 'public, max-age=86400'); // 1日キャッシュ

                // ステータスコードを設定
                res.status(response.status);

                // ストリームを転送
                response.data.pipe(res);

            } catch (error) {
                this.logger.error(`❌ Image proxy failed:`, {
                    error: error.message,
                    url: req.query.url,
                    stack: error.stack
                });
                
                // エラーレスポンス
                if (!res.headersSent) {
                    res.status(500).json({
                        status: "NG",
                        message: "Failed to proxy image"
                    });
                }
            }
        });
    }

    /**
     * 復旧結果の構造を安全に処理
     */
    sanitizeRecoveryResult(recoveryResult) {
        try {
            this.logger.info("🔧 Sanitizing recovery result:", recoveryResult);
            
            // guardianShareの安全な処理
            let guardianShare = recoveryResult.guardianShare;
            if (!guardianShare) {
                this.logger.warn("⚠️ guardianShare is missing, using fallback");
                guardianShare = `fallback_guardian_share_${Date.now()}`;
            }
            
            // publicKeyPackagesの安全な処理（新しいbatch形式）
            let publicKeyPackages = recoveryResult.publicKeyPackages;
            if (!publicKeyPackages) {
                throw new Error('publicKeyPackages is missing from recovery result');
            }
            
            // 両方の公開鍵パッケージが必要
            if (!publicKeyPackages.secp256k1 || !publicKeyPackages.ed25519) {
                throw new Error('Both SECP256k1 and ED25519 public key packages are required');
            }
            
            // 各公開鍵パッケージの検証
            if (typeof publicKeyPackages.secp256k1 === 'string') {
                try {
                    publicKeyPackages.secp256k1 = JSON.parse(publicKeyPackages.secp256k1);
                } catch (parseError) {
                    throw new Error('Failed to parse SECP256k1 public key package');
                }
            }
            
            if (typeof publicKeyPackages.ed25519 === 'string') {
                try {
                    publicKeyPackages.ed25519 = JSON.parse(publicKeyPackages.ed25519);
                } catch (parseError) {
                    throw new Error('Failed to parse ED25519 public key package');
                }
            }
            
            // 公開鍵パッケージの内容検証
            if (!publicKeyPackages.secp256k1.verifying_key && !publicKeyPackages.secp256k1.public_key) {
                throw new Error('SECP256k1 public key package missing verifying_key or public_key');
            }
            
            if (!publicKeyPackages.ed25519.verifying_key && !publicKeyPackages.ed25519.public_key) {
                throw new Error('ED25519 public key package missing verifying_key or public_key');
            }
            
            // metadataの安全な処理
            let metadata = recoveryResult.metadata;
            if (!metadata) {
                this.logger.warn("⚠️ metadata is missing, creating fallback");
                metadata = {
                    masterId: recoveryResult.masterId || 'unknown',
                    keyGenerated: true,
                    recoveredAt: Date.now()
                };
            }
            
            // guardianNodesの安全な処理
            let guardianNodes = recoveryResult.guardianNodes;
            if (!guardianNodes || !Array.isArray(guardianNodes)) {
                this.logger.warn("⚠️ guardianNodes is missing or invalid, using fallback");
                guardianNodes = ['fallback_guardian_node_1', 'fallback_guardian_node_2'];
            }
            
            // バッチ復旧結果の安全な処理
            let secpRecoveredSecret = recoveryResult.secpRecoveredSecret;
            let edRecoveredSecret = recoveryResult.edRecoveredSecret;
            
            // Guardian Nodeは復元処理を実行せず、シェアと公開鍵パッケージのみを提供する設計
            // そのため、secpRecoveredSecretとedRecoveredSecretがnullなのは正常
            if (secpRecoveredSecret) {
                this.logger.info("✅ secpRecoveredSecret provided by Guardian (unexpected)");
            }
            
            if (edRecoveredSecret) {
                this.logger.info("✅ edRecoveredSecret provided by Guardian (unexpected)");
            }
            
            let secpKeyPackages = recoveryResult.secpKeyPackages;
            if (!secpKeyPackages || !Array.isArray(secpKeyPackages)) {
                this.logger.warn("⚠️ secpKeyPackages is missing or invalid, using empty array");
                secpKeyPackages = [];
            }
            
            let edKeyPackages = recoveryResult.edKeyPackages;
            if (!edKeyPackages || !Array.isArray(edKeyPackages)) {
                this.logger.warn("⚠️ edKeyPackages is missing or invalid, using empty array");
                edKeyPackages = [];
            }
            
            const sanitizedResult = {
                guardianShare: guardianShare,
                publicKeyPackages: publicKeyPackages,
                metadata: metadata,
                guardianNodes: guardianNodes,
                secpRecoveredSecret: secpRecoveredSecret,
                edRecoveredSecret: edRecoveredSecret,
                secpKeyPackages: secpKeyPackages,
                edKeyPackages: edKeyPackages
            };
            
            this.logger.info("✅ Sanitized recovery result:", sanitizedResult);
            return sanitizedResult;
            
        } catch (error) {
            this.logger.error("❌ Error sanitizing recovery result:", error);
            return {
                guardianShare: `error_guardian_share_${Date.now()}`,
                publicKeyPackages: {
                    secp256k1: {
                        verifying_key: `error_verifying_key_${Date.now()}`,
                        public_key: `error_public_key_${Date.now()}`
                    },
                    ed25519: {
                        verifying_key: `error_verifying_key_${Date.now()}`,
                        public_key: `error_public_key_${Date.now()}`
                    }
                },
                metadata: {
                    masterId: 'unknown',
                    keyGenerated: false,
                    recoveredAt: Date.now(),
                    error: error.message
                },
                guardianNodes: ['error_guardian_node'],
                secpRecoveredSecret: null,
                edRecoveredSecret: null,
                secpKeyPackages: [],
                edKeyPackages: []
            };
        }
    }

    /**
     * Guardian Network初期化
     */
    async initializeGuardianNetwork() {
        try {
            this.logger.info("🛡️ Initializing Guardian Network...");

            // Guardian Service でネットワーク状態確認
            const networkStatus =
                await this.guardianService.initializeNetwork();

            this.stats.guardiansConnected = networkStatus.connectedNodes;

            this.logger.info(
                `✅ Guardian Network initialized: ${networkStatus.connectedNodes}/${this.config.guardian.networkSize} nodes`,
            );
        } catch (error) {
            this.logger.error(
                "❌ Guardian Network initialization failed:",
                error,
            );
            throw error;
        }
    }

    /**
     * 定期タスク開始
     */
    /**
     * Load AA gas presets from DB (aa_gas_presets table).
     * Falls back to hardcoded values in this.GAS_PRESET if table doesn't exist yet.
     */
    async loadGasPresets() {
        try {
            const [rows] = await this.db.query('SELECT mode, vgl, cgl, pvg FROM aa_gas_presets');
            for (const row of rows) {
                if (this.GAS_PRESET[row.mode]) {
                    this.GAS_PRESET[row.mode] = { vgl: row.vgl, cgl: row.cgl, pvg: row.pvg };
                }
            }
            this.logger.info('[AA] Gas presets loaded from DB:', this.GAS_PRESET);
        } catch (err) {
            this.logger.warn('[AA] aa_gas_presets table not found, using hardcoded presets:', err.message);
        }
    }

    /**
     * Auto-tune gas presets from aa_userop_logs (p95 × 1.2).
     * Runs every 10 minutes. Skips modes with fewer than 10 data points.
     */
    async updateGasPresets() {
        for (const mode of ['A_V2', 'B']) {
            try {
                const [rows] = await this.db.query(
                    'SELECT actual_gas_used FROM aa_userop_logs WHERE gas_mode=? ORDER BY created_at DESC LIMIT 200',
                    [mode]
                );
                if (rows.length < 10) continue;
                const sorted = rows.map(r => Number(r.actual_gas_used)).sort((a, b) => a - b);
                const p95 = sorted[Math.floor(sorted.length * 0.95)];
                const target = Math.ceil(p95 * 1.2);
                // Ratio: pvg 20%, vgl 40%, cgl 40%
                // pvg has a minimum floor of 0x10000 (65536) to satisfy Avalanche's higher preVerificationGas requirement
                const PVG_FLOOR = 0x10000;
                const pvg = '0x' + Math.max(Math.ceil(target * 0.2), PVG_FLOOR).toString(16);
                const vgl = '0x' + Math.ceil(target * 0.4).toString(16);
                const cgl = '0x' + Math.ceil(target * 0.4).toString(16);
                await this.db.query(
                    'UPDATE aa_gas_presets SET vgl=?, cgl=?, pvg=?, updated_at=NOW() WHERE mode=?',
                    [vgl, cgl, pvg, mode]
                );
                this.GAS_PRESET[mode] = { vgl, cgl, pvg };
                this.logger.info(`[AA] Gas preset updated for mode=${mode}: vgl=${vgl} cgl=${cgl} pvg=${pvg} (p95=${p95} target=${target})`);
            } catch (err) {
                this.logger.warn(`[AA] updateGasPresets failed for mode=${mode}:`, err.message);
            }
        }
    }

    startPeriodicTasks() {
        // Guardian Network ヘルスチェック（30秒ごと）
        /*
        this.guardianHealthInterval = setInterval(async () => {
            try {
                const health = await this.guardianService.performHealthCheck();
                this.stats.guardiansConnected = health.healthyNodes;
            } catch (error) {
                this.logger.error("Guardian health check failed:", error);
            }
        }, this.config.guardian.healthCheckInterval);
        */

        // JWT クリーンアップ（1時間ごと）
        this.jwtCleanupInterval = setInterval(
            async () => {
                try {
                    await this.jwtService.cleanupExpiredTokens();
                } catch (error) {
                    this.logger.error("JWT cleanup failed:", error);
                }
            },
            60 * 60 * 1000,
        );

        // 統計更新（5分ごと）
        this.statsInterval = setInterval(
            () => {
                this.logger.info("Server Statistics", this.stats);
            },
            5 * 60 * 1000,
        );

        // AA gas preset auto-tuning (every 10 minutes)
        this.gasPresetInterval = setInterval(async () => {
            try {
                await this.updateGasPresets();
            } catch (error) {
                this.logger.error('[AA] Gas preset auto-tuning failed:', error);
            }
        }, 10 * 60 * 1000);

        this.logger.info("✅ Periodic tasks started");
    }

    /**
     * Graceful shutdown
     */
    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            this.logger.info(
                `Received ${signal}, starting graceful shutdown...`,
            );

            // 定期タスクの停止
            if (this.guardianHealthInterval) {
                clearInterval(this.guardianHealthInterval);
                this.logger.info("Guardian health check interval cleared");
            }
            if (this.jwtCleanupInterval) {
                clearInterval(this.jwtCleanupInterval);
                this.logger.info("JWT cleanup interval cleared");
            }
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
                this.logger.info("Stats interval cleared");
            }
            if (this.gasPresetInterval) {
                clearInterval(this.gasPresetInterval);
                this.logger.info("Gas preset interval cleared");
            }

            // HTTPサーバーの停止
            if (this.server) {
                this.server.close(() => {
                    this.logger.info("HTTP server closed");
                });
            }

            // データベース接続の終了
            if (this.db) {
                try {
                    await this.db.end();
                    this.logger.info("Database connection closed");
                } catch (error) {
                    this.logger.error(
                        "Error closing database connection:",
                        error,
                    );
                }
            }

            this.logger.info("BitVoy Server shutdown completed");

            // 強制終了（5秒後にタイムアウト）
            setTimeout(() => {
                this.logger.error("Forced shutdown after timeout");
                process.exit(1);
            }, 5000);

            process.exit(0);
        };

        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGQUIT", () => shutdown("SIGQUIT"));

        // 未処理の例外とPromise拒否のハンドリング
        process.on("uncaughtException", (error) => {
            this.logger.error("Uncaught Exception:", error);
            shutdown("uncaughtException");
        });

        process.on("unhandledRejection", (reason, promise) => {
            this.logger.error(
                "Unhandled Rejection at:",
                promise,
                "reason:",
                reason,
            );
            shutdown("unhandledRejection");
        });
    }

    /**
     * 詳細ヘルスチェック実行
     */
    async performDetailedHealthCheck() {
        try {
            const healthChecks = {
                database: await this.checkDatabaseHealth(),
                webauthn: await this.webauthnService.performHealthCheck(),
                email: await this.emailService.performHealthCheck(),
                jwt: await this.jwtService.performHealthCheck(),
                mpc: await this.mpcService.performHealthCheck(),
                guardian: await this.guardianService.performHealthCheck(),
                storage: await this.checkStorageHealth(),
                network: await this.checkNetworkHealth(),
            };

            const allHealthy = Object.values(healthChecks).every(
                (check) => check.healthy,
            );

            return {
                status: allHealthy ? "healthy" : "degraded",
                version: "2.1.0",
                uptime: Date.now() - this.stats.startTime,
                checks: healthChecks,
                timestamp: Date.now(),
            };
        } catch (error) {
            this.logger.error("Detailed health check failed:", error);
            return {
                status: "unhealthy",
                error: error.message,
                timestamp: Date.now(),
            };
        }
    }

    /**
     * データベースヘルスチェック
     */
    async checkDatabaseHealth() {
        try {
            await this.db.query("SELECT 1");

            return { healthy: true, message: "Database connection OK" };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    /**
     * ストレージヘルスチェック
     */
    async checkStorageHealth() {
        try {
            // ストレージの利用可能性確認
            const testKey = "health_check_" + Date.now();
            await this.storage.put("test", testKey, { test: true });
            await this.storage.delete("test", testKey);

            return { healthy: true, message: "Storage operations OK" };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    /**
     * ネットワークヘルスチェック
     */
    async checkNetworkHealth() {
        try {
            const guardianHealth =
                await this.guardianService.getNetworkHealth();

            return {
                healthy: guardianHealth.healthPercentage > 0.7,
                message: `Guardian Network: ${guardianHealth.healthyNodes}/${guardianHealth.totalNodes} nodes healthy`,
                guardianHealth: guardianHealth,
            };
        } catch (error) {
            return { healthy: false, error: error.message };
        }
    }

    /**
     * Guardian Node接続検証
     */
    async verifyGuardianConnections(masterId) {
        try {
            const guardianHealth =
                await this.guardianService.getNetworkHealth();
            const assignedGuardians =
                await this.guardianService.getAssignedGuardians(masterId);

            // 接続テスト
            const connectionTests = await Promise.allSettled(
                assignedGuardians.primary.map(async (guardian) => {
                    try {
                        const response = await fetch(
                            `${guardian.endpoint}/health`,
                            {
                                method: "POST",
                                timeout: 5000,
                            },
                        );
                        return { guardian, healthy: response.ok };
                    } catch (error) {
                        return {
                            guardian,
                            healthy: false,
                            error: error.message,
                        };
                    }
                }),
            );

            const healthyGuardians = connectionTests
                .filter(
                    (result) =>
                        result.status === "fulfilled" && result.value.healthy,
                )
                .map((result) => result.value.guardian);

            return {
                success: true,
                guardianNodes: healthyGuardians,
                status: {
                    total: assignedGuardians.primary.length,
                    healthy: healthyGuardians.length,
                    healthPercentage:
                        healthyGuardians.length /
                        assignedGuardians.primary.length,
                },
            };
        } catch (error) {
            this.logger.error(
                "Guardian connection verification failed:",
                error,
            );
            return { success: false, error: error.message };
        }
    }

    /**
     * Guardian Discovery Serviceルート
     */
    setupGuardianDiscoveryRoutes() {
        this.logger.info("🔧 Setting up Guardian Discovery Service routes...");
        
        // GuardianDiscoveryServiceは既にメインのExpressアプリを使用しているため、
        // ルートは既に設定済み
        this.logger.info("✅ Guardian Discovery Service routes already configured");
        this.logger.info("📋 Bootstrap endpoints available: /bootstrap/register, /bootstrap/debug, /bootstrap/select-guardian");

        // 追加の統計情報エンドポイント
        this.app.post(`/guardian/discovery/network-stats`, (req, res) => {
            try {
                const discoveryStats = this.guardianDiscoveryService.getStats();
                const guardianStats = this.guardianService.getStats();

                res.json({
                    success: true,
                    discovery: discoveryStats,
                    guardian: guardianStats,
                    combined: {
                        totalNodes: discoveryStats.registeredNodes,
                        healthyNodes: discoveryStats.healthyNodes,
                        bootstrapNodes: discoveryStats.bootstrapNodes.length,
                        lastSync: discoveryStats.lastSync,
                        environment: this.guardianService.currentEnvironment,
                    },
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Network stats failed:", error);
                res.status(500).json({
                    success: false,
                    error: "Failed to get network stats",
                });
            }
        });

        // Guardian Node登録（BitVoy Server経由）
        this.app.post(`/guardian/discovery/register-node`, async (req, res) => {
            try {
                const { nodeId, endpoint, region, capabilities } = req.body;

                if (!nodeId || !endpoint) {
                    return res.status(400).json({
                        success: false,
                        error: "Missing required fields: nodeId, endpoint",
                    });
                }

                const registrationResult =
                    await this.guardianDiscoveryService.registerGuardianNode({
                        nodeId,
                        endpoint,
                        region: region || "unknown",
                        capabilities: capabilities || [],
                    });

                if (registrationResult.success) {
                    res.json({
                        success: true,
                        message: "Guardian Node registered successfully",
                        nodeId: nodeId,
                        registeredWith: registrationResult.registeredNodes,
                        totalBootstrapNodes: registrationResult.totalNodes,
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: "Failed to register with bootstrap nodes",
                    });
                }
            } catch (error) {
                this.logger.error("Guardian Node registration failed:", error);
                res.status(500).json({
                    success: false,
                    error: "Registration failed",
                });
            }
        });

        // 利用可能なGuardian Node取得
        this.app.post(`/guardian/discovery/available-nodes`, (req, res) => {
            try {
                const { region, maxNodes } = req.query;
                const availableNodes =
                    this.guardianDiscoveryService.getAvailableNodes(
                        region || null,
                        parseInt(maxNodes) || 10,
                    );

                res.json({
                    success: true,
                    nodes: availableNodes,
                    total: availableNodes.length,
                    region: region || "all",
                    maxNodes: parseInt(maxNodes) || 10,
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error("Available nodes request failed:", error);
                res.status(500).json({
                    success: false,
                    error: "Failed to get available nodes",
                });
            }
        });

        // ==========================================
        // Swap API エンドポイント
        // ==========================================

        // Swap見積り取得
        this.app.post('/swapapi/swap/quote', async (req, res) => {
            try {
                const { chainId, fromToken, toToken, amountIn } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet'; // クエリパラメータまたはリクエストボディから取得

                if (!chainId || !fromToken || !toToken || !amountIn) {
                    return res.status(400).json({
                        error: 'Missing required fields: chainId, fromToken, toToken, amountIn'
                    });
                }

                this.logger.info(`📊 Swap quote request:`, { chainId, fromToken, toToken, amountIn, network });

                const quote = await this.swapService.getQuote(
                    parseInt(chainId),
                    fromToken,
                    toToken,
                    amountIn,
                    network
                );

                res.json(quote);
            } catch (error) {
                this.logger.error('Swap quote error:', error);
                res.status(500).json({
                    error: error.message || 'Failed to get swap quote'
                });
            }
        });

        // 1inch API approveトランザクション構築（後方互換性のためbuild-permitも残す）
        this.app.post('/swapapi/swap/build-approve', async (req, res) => {
            try {
                const { chainId, amountIn, userAddress, fromToken } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet';

                if (!chainId || !userAddress || !fromToken) {
                    return res.status(400).json({
                        error: 'Missing required fields: chainId, userAddress, fromToken'
                    });
                }

                this.logger.info(`🔐 Build approve request:`, { chainId, amountIn, userAddress, fromToken, network });

                const approveData = await this.swapService.buildPermit(
                    parseInt(chainId),
                    amountIn, // オプション、'unlimited'で無制限承認
                    userAddress,
                    fromToken,
                    network
                );

                res.json(approveData);
            } catch (error) {
                this.logger.error('Build approve error:', error);
                res.status(500).json({
                    error: error.message || 'Failed to build approve transaction'
                });
            }
        });

        // Permit2 EIP712ペイロード生成（後方互換性のため残す）
        this.app.post('/swapapi/swap/build-permit', async (req, res) => {
            try {
                const { chainId, amountIn, userAddress, fromToken } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet';

                if (!chainId || !userAddress || !fromToken) {
                    return res.status(400).json({
                        error: 'Missing required fields: chainId, userAddress, fromToken'
                    });
                }

                this.logger.info(`🔐 Build permit request (deprecated, use build-approve):`, { chainId, amountIn, userAddress, fromToken, network });

                const approveData = await this.swapService.buildPermit(
                    parseInt(chainId),
                    amountIn,
                    userAddress,
                    fromToken,
                    network
                );

                res.json(approveData);
            } catch (error) {
                this.logger.error('Build permit error:', error);
                res.status(500).json({
                    error: error.message || 'Failed to build approve transaction'
                });
            }
        });

        // Swap実行（1inch API使用）
        this.app.post('/swapapi/swap/execute', async (req, res) => {
            try {
                const { chainId, permit, signature, quote, fromToken, toToken, userAddress, amountIn } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet';

                if (!chainId || !quote || !fromToken || !toToken || !userAddress) {
                    return res.status(400).json({
                        error: 'Missing required fields: chainId, quote, fromToken, toToken, userAddress'
                    });
                }

                this.logger.info(`💳 Swap execute request:`, { chainId, fromToken, toToken, userAddress, network });

                // 1inch APIを使用するため、permitとsignatureは不要（後方互換性のためオプショナル）
                // ネイティブトークンとERC20トークンの両方で同じexecuteSwapメソッドを使用
                const result = await this.swapService.executeSwap(
                    parseInt(chainId),
                    permit || null, // 後方互換性のため
                    signature || null, // 後方互換性のため
                    quote,
                    fromToken,
                    toToken,
                    userAddress,
                    network
                );

                res.json(result);
            } catch (error) {
                this.logger.error('Swap execute error:', error);
                res.status(500).json({
                    error: error.message || 'Failed to execute swap'
                });
            }
        });

        // ==========================================
        // Cross-chain Swap API
        // ==========================================

        // Cross-chain Swap見積り取得
        this.app.post('/swapapi/ccswap/quote', async (req, res) => {
            try {
                const { fromChainId, fromToken, amount, toChainId, toToken } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet'; // クエリパラメータまたはリクエストボディから取得
                
                if (!fromChainId || !fromToken || !amount || !toChainId || !toToken) {
                    return res.status(400).json({
                        error: 'Missing required fields: fromChainId, fromToken, amount, toChainId, toToken'
                    });
                }

                this.logger.info(`📊 Cross-chain swap quote request:`, { fromChainId, fromToken, toChainId, toToken, amount, network });

                const quote = await this.crossChainSwapService.getQuote(
                    parseInt(fromChainId),
                    fromToken,
                    amount,
                    parseInt(toChainId),
                    toToken,
                    network
                );

                res.json(quote);
            } catch (error) {
                this.logger.error('❌ /swapapi/ccswap/quote error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Permit2 EIP712ペイロード生成
        this.app.post('/swapapi/ccswap/prepare', async (req, res) => {
            try {
                const { user, fromChainId, fromToken, amountInRaw, quoteId } = req.body;
                const network = req.query.network || req.body?.network || 'mainnet'; // クエリパラメータまたはリクエストボディから取得
                
                if (!user || !fromChainId || !fromToken || !amountInRaw || !quoteId) {
                    return res.status(400).json({
                        error: 'Missing required fields: user, fromChainId, fromToken, amountInRaw, quoteId'
                    });
                }

                this.logger.info(`🔐 Cross-chain swap prepare request:`, { fromChainId, fromToken, quoteId, network });

                const permitPayload = await this.crossChainSwapService.buildPermit(
                    parseInt(fromChainId),
                    amountInRaw,
                    user,
                    fromToken,
                    quoteId,
                    network
                );

                res.json(permitPayload);
            } catch (error) {
                this.logger.error('❌ /swapapi/ccswap/prepare error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Cross-chain Swap実行
        this.app.post('/swapapi/ccswap/execute', async (req, res) => {
            try {
                const { user, quoteId, permitSignature, authSessionId } = req.body;

                // セキュリティ: quoteIdとpermitSignature、userのみを受け取る
                // 実行パラメータ（fromChainId, fromToken, amount等）は全てquoteCacheから取得
                if (!user || !quoteId || !permitSignature) {
                    return res.status(400).json({
                        error: 'Missing required fields: user, quoteId, permitSignature'
                    });
                }

                this.logger.info(`💳 Cross-chain swap execute request:`, { quoteId, user });

                const result = await this.crossChainSwapService.executeSwap(
                    quoteId,
                    permitSignature,
                    user
                );

                res.json(result);
            } catch (error) {
                this.logger.error('Cross-chain swap execute error:', error);
                
                // エラーレスポンスの形式を統一（reasonコードを含める）
                const statusCode = error.reason === 'QUOTE_EXPIRED' || error.reason === 'QUOTE_NOT_FOUND' ? 400 : 500;
                const errorResponse = {
                    error: error.message || 'Failed to execute cross-chain swap',
                    reason: error.reason || 'UNKNOWN_ERROR'
                };

                // QUOTE_EXPIREDの場合は追加情報を含める
                if (error.reason === 'QUOTE_EXPIRED') {
                    errorResponse.expiresAt = error.expiresAt;
                    errorResponse.createdAt = error.createdAt;
                }

                res.status(statusCode).json(errorResponse);
            }
        });
    }

    /**
     * frost_wasmの動的読み込み（Node.js版対応）
     */
    async loadFrostWasm() {
        try {
            this.logger.info('🔄 Loading frost_wasm for Node.js environment...');
            
            // Node.js版のfrost_wasmモジュールを読み込み（正しい相対パス）
            let frostWasmPath = path.join(__dirname, this.config.mpc.frostWasmPath);
            const fs = require('fs');
            
            this.logger.info(`🔍 Looking for frost_wasm at: ${frostWasmPath}`);
            
            if (!fs.existsSync(frostWasmPath)) {
                this.logger.warn(`⚠️ frost_wasm.js not found at: ${frostWasmPath}`);
                this.logger.info('📋 Checking alternative paths...');
            
                // 代替パスの確認
                const alternativePaths = [
                    path.join(__dirname, './rust/frost-wasm/pkg-node/frost_wasm.js'),
                    path.join(__dirname, 'frost_wasm.js')
                ];
                
                for (const altPath of alternativePaths) {
                    if (fs.existsSync(altPath)) {
                        this.logger.info(`✅ Found frost_wasm.js at: ${altPath}`);
                        frostWasmPath = altPath;
                        break;
                    }
                }
                
                if (!fs.existsSync(frostWasmPath)) {
                    this.logger.warn('⚠️ Using fallback implementation due to missing frost_wasm.js');
                    this.frostWasm = null;
                    return;
                }
            } else {
                this.logger.info(`✅ frost_wasm.js found at: ${frostWasmPath}`);
            }
            
            // Node.js版のfrost_wasmをrequire()で読み込み
            // Node.js版では自動的にWASMファイルが初期化される
            this.logger.info('🔄 Loading frost_wasm module...');
            this.frostWasm = require(frostWasmPath);
            global.frost_wasm = this.frostWasm; // グローバルアクセス用
            
            // 初期化後の関数を確認
            if (
                this.frostWasm &&
                typeof this.frostWasm.secp_dkg_round1 === 'function' &&
                typeof this.frostWasm.secp_dkg_round2 === 'function' &&
                typeof this.frostWasm.secp_dkg_round3 === 'function'
            ) {
                this.logger.info('✅ frost_wasm loaded and initialized successfully for Node.js');
                const availableFunctions = Object.keys(this.frostWasm).filter(key => typeof this.frostWasm[key] === 'function');
                this.logger.info(`🔧 Available frost_wasm functions: ${availableFunctions.join(', ')}`);
                // 必要な関数の存在確認
                const requiredFunctions = ['secp_dkg_round1', 'secp_dkg_round2', 'secp_dkg_round3'];
                const missingFunctions = requiredFunctions.filter(func => !this.frostWasm[func]);
                if (missingFunctions.length > 0) {
                    this.logger.warn(`⚠️ Missing required functions: ${missingFunctions.join(', ')}`);
                } else {
                    this.logger.info('✅ All required frost_wasm DKG functions are available');
                }
            } else {
                this.logger.warn('⚠️ frost_wasm loaded but required DKG functions not available');
                this.logger.info(`📋 Module structure: ${Object.keys(this.frostWasm || {}).join(', ')}`);
                this.frostWasm = null;
            }
            
        } catch (error) {
            this.logger.warn('⚠️ frost_wasm not available, using fallback implementation:', error.message);
            this.logger.error('❌ frost_wasm loading error details:', error);
            this.frostWasm = null;
        }
    }

    /**
     * アドレス形式の検証
     * @param {string} address - 検証するアドレス
     * @param {string} productId - プロダクトID（mainnet/testnetで同じproductIdを使用）
     * @param {string} network - ネットワーク ('mainnet' または 'testnet')
     */
    isValidAddress(address, productId, network = 'mainnet') {
        if (!address || typeof address !== 'string') {
            return false;
        }

        switch (productId) {
            case 'BTC':
                // Bitcoinアドレス形式の検証（networkに基づいて判定）
                if (network === 'testnet') {
                // Testnet:
                //   - Legacy: P2PKH (m/nで始まる), P2SH (2で始まる)
                //   - Bech32: SegWit v0 (tb1で始まる)
                //   - Bech32m: Taproot (tb1pで始まる)
                return /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ||
                       /^tb1[a-z0-9]{39,59}$/.test(address) ||
                       /^tb1p[a-z0-9]{58}$/.test(address);
                } else {
                    // Mainnet:
                    //   - Legacy: P2PKH (1で始まる), P2SH (3で始まる)
                    //   - Bech32: SegWit v0 (bc1で始まる)
                    //   - Bech32m: Taproot (bc1pで始まる)
                    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || 
                           /^bc1[a-z0-9]{39,59}$/.test(address) ||
                           /^bc1p[a-z0-9]{58}$/.test(address);
                }
            
            case 'ETH':
            case 'POL':
            case 'USDC_ERC20':
            case 'USDC_POL':
            case 'USDT_ERC20':
            case 'USDT_POL':
            case 'USDT_ARB':
            case 'USDT_AVAX':
            case 'USDT_BNB':
            case 'USDT_TRON':
            case 'JPYC_ERC20':
            case 'JPYC_POL':
            case 'JPYC_AVAX':
            case 'BVT_ERC20':
            case 'BVT_POL':
            case 'LINK_ERC20':
            case 'ONDO_ERC20':
            case 'UNI_ERC20':
            case 'AAVE_ERC20':
            case 'AAVE_POL':
            case 'ARB_ARB':
            case 'OP_OPT':
            case 'WETH_ERC20':
            case 'WBTC_ERC20':
            case 'XAUT_ERC20':
            case 'PAXG_ERC20':
                // Ethereum/Polygon系アドレス形式の検証（mainnet/testnetで同じ形式）
                return /^0x[a-fA-F0-9]{40}$/.test(address);
            
            case 'SOL':
            case 'USDC_SOL':
            case 'USDT_SOL':
            case 'JUP_SOL':
            case 'BONK_SOL':
            case 'WIF_SOL':
            case 'PYTH_SOL':
            case 'RNDR_SOL':
            case 'BVT_SOL':
                // Solanaアドレス形式の検証（mainnet/testnetで同じ形式）
                return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
            
            case 'TON':
            case 'USDT_TON':
            case 'BVT_TON':
                // TONアドレス形式の検証（mainnet/testnetで同じ形式）
                return /^[0-9a-zA-Z_-]{48}$/.test(address);
            
            case 'BNB':
            case 'AVAX':
            case 'TRX':
                // その他のEVM系アドレス形式の検証
                return /^0x[a-fA-F0-9]{40}$/.test(address);
            
            default:
                return false;
        }
    }

    /**
     * 公開鍵形式の検証
     * @param {string} publicKey - 検証する公開鍵
     * @param {string} productId - プロダクトID（mainnet/testnetで同じproductIdを使用）
     * @param {string} network - ネットワーク ('mainnet' または 'testnet')
     */
    isValidPublicKey(publicKey, productId, network = 'mainnet') {
        if (!publicKey || typeof publicKey !== 'string') {
            return false;
        }

        switch (productId) {
            case 'BTC':
            case 'ETH':
            case 'POL':
            case 'BNB':
            case 'AVAX':
            case 'USDC_ERC20':
            case 'USDC_POL':
            case 'USDC_ARB':
            case 'USDC_BASE':
            case 'USDC_OPT':
            case 'USDC_AVAX':
            case 'USDT_ERC20':
            case 'USDT_POL':
            case 'USDT_ARB':
            case 'USDT_AVAX':
            case 'USDT_BNB':
            case 'USDT_TRON':
            case 'JPYC_ERC20':
            case 'JPYC_POL':
            case 'JPYC_AVAX':
            case 'BVT_ERC20':
            case 'BVT_POL':
            case 'LINK_ERC20':
            case 'ONDO_ERC20':
            case 'UNI_ERC20':
            case 'AAVE_ERC20':
            case 'AAVE_POL':
            case 'ARB_ARB':
            case 'OP_OPT':
            case 'WETH_ERC20':
            case 'WBTC_ERC20':
            case 'XAUT_ERC20':
            case 'PAXG_ERC20':
                // SECP256k1公開鍵形式の検証（mainnet/testnetで同じ形式）
                // - 圧縮形式: 0x02 or 0x03 + 64 hex chars
                // - 非圧縮形式: 0x04 + 128 hex chars（P1 KeyGen結果を許容）
                return /^0[23][a-fA-F0-9]{64}$/.test(publicKey) || /^04[a-fA-F0-9]{128}$/.test(publicKey);
            
            case 'SOL':
            case 'USDC_SOL':
            case 'USDT_SOL':
            case 'JUP_SOL':
            case 'BONK_SOL':
            case 'WIF_SOL':
            case 'PYTH_SOL':
            case 'RNDR_SOL':
            case 'BVT_SOL':
            case 'TON':
            case 'USDT_TON':
            case 'BVT_TON':
                // ED25519公開鍵形式の検証（64文字のhex、mainnet/testnetで同じ形式）
                return /^[a-fA-F0-9]{64}$/.test(publicKey);
            
            default:
                return false;
        }
    }

    /**
     * 派生パス形式の検証（MPC-HD形式）
     * MPC-HD形式: /{chain}/{account}/{addressIndex} または /bitcoin/segwit/{account}/{addressIndex}
     * 
     * 注意: SolanaとTONはEd25519なので、MPC-HD派生は使用しない
     * パスは保存されるが、実際のアドレス生成では使用されない
     * 
     * @param {string} derivePath - 検証する派生パス
     * @param {string} productId - プロダクトID（mainnet/testnetで同じproductIdを使用）
     * @param {string} network - ネットワーク ('mainnet' または 'testnet')
     */
    isValidDerivePath(derivePath, productId, network = 'mainnet') {
        if (!derivePath || typeof derivePath !== 'string') {
            return false;
        }

        // MPC-HD派生パス形式の検証
        // 形式1: /{chain}/{account}/{addressIndex} (例: /ethereum/0/0, /polygon/0/0)
        // 形式2: /bitcoin/segwit/{account}/{addressIndex} または /bitcoin/taproot/{account}/{addressIndex}
        const mpcHdPathRegex = /^\/(bitcoin\/(segwit|taproot)|ethereum|polygon|solana|ton|tron|bsc|avalanche|arbitrum|base|optimism)\/[0-9]+\/[0-9]+$/;
        if (!mpcHdPathRegex.test(derivePath)) {
            return false;
        }

        // productIdから期待されるチェーン名を取得（WalletService.PRODUCTSから取得）
        const PRODUCTS = WalletService.PRODUCTS;
        if (!PRODUCTS || !PRODUCTS[productId]) {
            // 未知のproductIdの場合は、パス形式のみ検証
            return true;
        }

        const product = PRODUCTS[productId];
        let expectedChain = product.chain ? product.chain.toLowerCase() : null;
        
        if (!expectedChain) {
            // chain情報がない場合は、パス形式のみ検証
            return true;
        }

        // CHAINオブジェクトから期待されるhdPathを取得
        const CHAIN = WalletService.CHAIN;
        const normalizedNetwork = network === 'testnet' ? 'testnet' : 'mainnet';
        
        // CHAINオブジェクトからhdPathを取得
        let expectedHdPath = null;
        if (CHAIN && CHAIN[normalizedNetwork] && CHAIN[normalizedNetwork][expectedChain]) {
            expectedHdPath = CHAIN[normalizedNetwork][expectedChain].hdPath;
        }

        // Bitcoinの場合はsegwitまたはtaprootを含む
        if (expectedChain === 'bitcoin') {
            return derivePath.startsWith('/bitcoin/segwit/') || derivePath.startsWith('/bitcoin/taproot/');
        }

        // SolanaとTONはEd25519なので、MPC-HD派生は使用しない
        // パス形式のみ検証（実際のアドレス生成では使用されない）
        if (expectedChain === 'solana' || expectedChain === 'ton') {
            return derivePath.startsWith(`/${expectedChain}/`);
        }

        // EVM系チェーン（ethereum、polygon、arbitrum、base、optimism、bsc、avalanche）は同一hdPath（/ethereum/0/0）を使用
        const evmChains = ['ethereum', 'polygon', 'arbitrum', 'base', 'optimism', 'bsc', 'avalanche'];
        if (evmChains.includes(expectedChain)) {
            // EVM系チェーンの場合は/ethereum/0/0を許可
            return derivePath.startsWith('/ethereum/');
        }

        // その他のチェーン（tronなど）の場合は、CHAINオブジェクトのhdPathに基づいて検証
        if (expectedHdPath) {
            // hdPathの形式: /{chain}/{account}/{addressIndex}
            // accountとaddressIndexを無視してチェーン名のみで検証
            const hdPathChain = expectedHdPath.split('/')[1];
            return derivePath.startsWith(`/${hdPathChain}/`);
        }

        // フォールバック: チェーン名で検証
        return derivePath.startsWith(`/${expectedChain}/`);
    }
}

// 単体実行
if (require.main === module) {
    const config = {
        port: process.env.PORT_BITVOY_MPC_SERVER || 4000,
        host: process.env.HOST || "0.0.0.0",
        dbHost: process.env.DB_HOST || "localhost",
        dbPort: process.env.DB_PORT || 5432,
        dbName: process.env.DB_NAME || "bitvoy",
        dbUser: process.env.DB_USER || "bitvoy",
        dbPassword: process.env.DB_PASSWORD,
        jwtPrivateKey:
            process.env.JWT_PRIVATE_KEY_PATH || "./keys/jwt-private.pem",
        jwtPublicKey:
            process.env.JWT_PUBLIC_KEY_PATH || "./keys/jwt-public.pem",
        sessionSecret: process.env.SESSION_SECRET,
        encryptionKey: process.env.ENCRYPTION_KEY,

        // Bootstrap Node configuration
        isBootstrapNode: process.env.IS_BOOTSTRAP_NODE === "true",
        bootstrapNodeId: process.env.BOOTSTRAP_NODE_ID,
        bootstrapEndpoint: process.env.BOOTSTRAP_ENDPOINT,
        region: process.env.BOOTSTRAP_REGION || "unknown",
    };

    const server = new BitVoyMPCServer(config);
    server.start().catch(console.error);
}

module.exports = BitVoyMPCServer;
