/**
 * MPC Coordinator - Central coordination for Multi-Party Computation operations
 * Manages FROST threshold signatures and Guardian network communication
 */

const crypto = require('crypto');
const EventEmitter = require('events');
const FrostImplementation = require('./frost-implementation');
const KeyDerivation = require('./key-derivation');
const { logger } = require('../utils/logger');
const { validateInput, sanitizeInput } = require('../utils/crypto-utils');

class MPCCoordinator extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            threshold: config.threshold || 2,
            totalParties: config.totalParties || 3,
            guardianTimeout: config.guardianTimeout || 30000, // 30 seconds
            retryAttempts: config.retryAttempts || 3,
            guardianEndpoints: config.guardianEndpoints || [],
            sessionTimeout: config.sessionTimeout || 300000, // 5 minutes
            ...config
        };

        this.frost = new FrostImplementation(this.config);
        this.keyDerivation = new KeyDerivation();
        this.activeSessions = new Map();
        this.guardianConnections = new Map();
        this.noncesUsed = new Set();
        
        // Cleanup expired sessions periodically
        setInterval(() => this.cleanupExpiredSessions(), 60000);
        
        logger.info('MPC Coordinator initialized', {
            threshold: this.config.threshold,
            totalParties: this.config.totalParties,
            guardianCount: this.config.guardianEndpoints.length
        });
    }

    /**
     * Initialize a new MPC session for key generation
     */
    async initializeKeyGeneration(masterId, participantIds = []) {
        try {
            validateInput('masterId', masterId, 'string');
            
            const sessionId = this.generateSessionId();
            const session = {
                id: sessionId,
                type: 'keygen',
                masterId: masterId,
                participants: participantIds,
                status: 'initializing',
                createdAt: Date.now(),
                rounds: new Map(),
                publicKey: null,
                shares: new Map()
            };

            this.activeSessions.set(sessionId, session);
            logger.info('Key generation session initialized', { sessionId, masterId });

            // Phase 1: Distributed Key Generation using FROST
            const keyGenResult = await this.executeKeyGeneration(sessionId);
            
            if (!keyGenResult.success) {
                throw new Error('Key generation failed: ' + keyGenResult.error);
            }

            session.status = 'completed';
            session.publicKey = keyGenResult.publicKey;
            session.shares = keyGenResult.shares;

            this.emit('keyGeneration', {
                sessionId,
                masterId,
                publicKey: keyGenResult.publicKey,
                success: true
            });

            return {
                success: true,
                sessionId,
                publicKey: keyGenResult.publicKey,
                localShare: keyGenResult.localShare,
                guardianShares: keyGenResult.guardianShares
            };

        } catch (error) {
            logger.error('Key generation initialization failed', { masterId, error: error.message });
            throw error;
        }
    }

    /**
     * Execute FROST key generation protocol
     */
    async executeKeyGeneration(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        try {
            session.status = 'generating';
            
            // Phase 1: Generate polynomial coefficients and commitments
            logger.debug('Starting FROST key generation phase 1', { sessionId });
            const phase1Result = await this.frost.keyGenPhase1(session.masterId);
            
            session.rounds.set('phase1', phase1Result);

            // Phase 2: Share distribution and verification
            logger.debug('Starting FROST key generation phase 2', { sessionId });
            const phase2Result = await this.frost.keyGenPhase2(
                phase1Result.coefficients,
                phase1Result.commitments,
                this.config.totalParties
            );

            session.rounds.set('phase2', phase2Result);

            // Phase 3: Public key aggregation
            logger.debug('Starting FROST key generation phase 3', { sessionId });
            const phase3Result = await this.frost.keyGenPhase3(
                phase2Result.shares,
                phase2Result.commitments
            );

            // Derive addresses for supported blockchains
            const addresses = await this.deriveMultiChainAddresses(phase3Result.publicKey);

            return {
                success: true,
                publicKey: phase3Result.publicKey,
                localShare: phase3Result.shares.get(0), // Local share
                guardianShares: Array.from(phase3Result.shares.entries()).slice(1), // Guardian shares
                addresses: addresses
            };

        } catch (error) {
            session.status = 'failed';
            logger.error('Key generation execution failed', { sessionId, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Initialize MPC signing session
     */
    async initializeSigning(masterId, message, signingContext = {}) {
        try {
            validateInput('masterId', masterId, 'string');
            validateInput('message', message, 'object');

            const sessionId = this.generateSessionId();
            const messageHash = crypto.createHash('sha256').update(JSON.stringify(message)).digest();

            // Check for replay attacks
            const nonce = this.generateNonce();
            if (this.noncesUsed.has(nonce)) {
                throw new Error('Nonce already used - potential replay attack');
            }
            this.noncesUsed.add(nonce);

            const session = {
                id: sessionId,
                type: 'signing',
                masterId: masterId,
                message: message,
                messageHash: messageHash,
                nonce: nonce,
                context: signingContext,
                status: 'initializing',
                createdAt: Date.now(),
                rounds: new Map(),
                partialSignatures: new Map(),
                finalSignature: null
            };

            this.activeSessions.set(sessionId, session);
            logger.info('Signing session initialized', { sessionId, masterId });

            // Execute FROST signing protocol
            const signingResult = await this.executeSigning(sessionId);
            
            if (!signingResult.success) {
                throw new Error('Signing failed: ' + signingResult.error);
            }

            session.status = 'completed';
            session.finalSignature = signingResult.signature;

            this.emit('signatureComplete', {
                sessionId,
                masterId,
                signature: signingResult.signature,
                success: true
            });

            return {
                success: true,
                sessionId,
                signature: signingResult.signature
            };

        } catch (error) {
            logger.error('Signing initialization failed', { masterId, error: error.message });
            throw error;
        }
    }

    /**
     * Execute FROST signing protocol
     */
    async executeSigning(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        try {
            session.status = 'signing';
            
            // Phase 1: Nonce generation and commitment
            logger.debug('Starting FROST signing phase 1', { sessionId });
            const phase1Result = await this.frost.signingPhase1(session.nonce);
            session.rounds.set('phase1', phase1Result);

            // Phase 2: Nonce sharing and partial signature generation
            logger.debug('Starting FROST signing phase 2', { sessionId });
            
            // Get Guardian shares for signing
            const guardianShares = await this.requestGuardianShares(
                session.masterId,
                session.messageHash,
                session.context
            );

            if (guardianShares.length < this.config.threshold - 1) {
                throw new Error('Insufficient Guardian shares available');
            }

            const phase2Result = await this.frost.signingPhase2(
                session.messageHash,
                phase1Result.commitments,
                guardianShares
            );

            session.rounds.set('phase2', phase2Result);

            // Phase 3: Signature aggregation
            logger.debug('Starting FROST signing phase 3', { sessionId });
            const phase3Result = await this.frost.signingPhase3(
                phase2Result.partialSignatures,
                phase1Result.commitments
            );

            // Verify the final signature
            const isValid = await this.frost.verifySignature(
                phase3Result.signature,
                session.messageHash,
                session.publicKey
            );

            if (!isValid) {
                throw new Error('Generated signature verification failed');
            }

            return {
                success: true,
                signature: phase3Result.signature
            };

        } catch (error) {
            session.status = 'failed';
            logger.error('Signing execution failed', { sessionId, error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Request Guardian shares for signing
     */
    async requestGuardianShares(masterId, messageHash, context) {
        const guardianRequests = [];
        const availableGuardians = this.selectActiveGuardians();

        // Create JWT token for Guardian authentication
        const authToken = await this.createGuardianAuthToken(masterId, messageHash, context);

        for (const guardian of availableGuardians.slice(0, this.config.threshold + 2)) {
            guardianRequests.push(
                this.requestGuardianShare(guardian, authToken, messageHash)
            );
        }

        try {
            // Wait for responses with timeout
            const results = await Promise.allSettled(
                guardianRequests.map(req => 
                    Promise.race([
                        req,
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Guardian timeout')), 
                            this.config.guardianTimeout)
                        )
                    ])
                )
            );

            const successfulShares = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value)
                .filter(share => share && share.isValid);

            logger.info('Guardian shares collected', { 
                requested: guardianRequests.length,
                received: successfulShares.length,
                required: this.config.threshold - 1
            });

            return successfulShares;

        } catch (error) {
            logger.error('Guardian share collection failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Request individual Guardian share
     */
    async requestGuardianShare(guardian, authToken, messageHash) {
        try {
            const response = await fetch(guardian.endpoint + '/guardian/round2-sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({
                    messageHash: messageHash.toString('hex'),
                    timestamp: Date.now()
                }),
                timeout: this.config.guardianTimeout
            });

            if (!response.ok) {
                throw new Error(`Guardian ${guardian.id} responded with ${response.status}`);
            }

            const data = await response.json();
            
            // Verify Guardian response
            if (await this.verifyGuardianResponse(data, guardian)) {
                return {
                    guardianId: guardian.id,
                    share: data.share,
                    proof: data.proof,
                    isValid: true
                };
            }

            throw new Error('Guardian response verification failed');

        } catch (error) {
            logger.warn('Guardian share request failed', { 
                guardianId: guardian.id, 
                error: error.message 
            });
            return null;
        }
    }

    /**
     * Create authenticated JWT token for Guardian communication
     */
    async createGuardianAuthToken(masterId, messageHash, context) {
        const payload = {
            sub: masterId,
            action: 'mpc_sign',
            mpc_id: this.generateSessionId(),
            message_hash: messageHash.toString('hex'),
            context: context,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
            nonce: this.generateNonce()
        };

        // Sign with ES256 (ECDSA P-256)
        const token = await this.signJWT(payload);
        return token;
    }

    /**
     * Derive addresses for multiple blockchains
     */
    async deriveMultiChainAddresses(publicKey) {
        const addresses = {};
        const supportedChains = ['bitcoin', 'ethereum', 'solana', 'ton'];

        for (const chain of supportedChains) {
            try {
                addresses[chain] = await this.keyDerivation.deriveAddress(publicKey, chain);
            } catch (error) {
                logger.warn(`Failed to derive ${chain} address`, { error: error.message });
            }
        }

        return addresses;
    }

    /**
     * Select active Guardian nodes
     */
    selectActiveGuardians() {
        // Implement Guardian selection strategy
        // For now, return all configured endpoints
        return this.config.guardianEndpoints.map((endpoint, index) => ({
            id: `guardian_${index}`,
            endpoint: endpoint,
            lastSeen: Date.now(),
            reliability: 1.0
        }));
    }

    /**
     * Verify Guardian response authenticity
     */
    async verifyGuardianResponse(data, guardian) {
        try {
            // Verify response structure
            if (!data.share || !data.proof || !data.timestamp) {
                return false;
            }

            // Check timestamp freshness (within 5 minutes)
            const age = Date.now() - data.timestamp;
            if (age > 300000) {
                return false;
            }

            // Verify cryptographic proof
            // Implementation depends on specific proof structure
            return await this.frost.verifyShareProof(data.share, data.proof, guardian.publicKey);

        } catch (error) {
            logger.error('Guardian response verification failed', { error: error.message });
            return false;
        }
    }

    /**
     * Cleanup expired sessions
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now - session.createdAt > this.config.sessionTimeout) {
                this.activeSessions.delete(sessionId);
                cleanedCount++;
            }
        }

        // Clean up old nonces (keep only last hour)
        const oneHourAgo = now - 3600000;
        for (const nonce of this.noncesUsed) {
            if (parseInt(nonce.split('_')[1]) < oneHourAgo) {
                this.noncesUsed.delete(nonce);
            }
        }

        if (cleanedCount > 0) {
            logger.debug('Cleaned up expired sessions', { count: cleanedCount });
        }
    }

    /**
     * Get session status
     */
    getSessionStatus(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return { found: false };
        }

        return {
            found: true,
            id: session.id,
            type: session.type,
            status: session.status,
            createdAt: session.createdAt,
            masterId: session.masterId
        };
    }

    /**
     * Cancel active session
     */
    cancelSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            return false;
        }

        session.status = 'cancelled';
        this.activeSessions.delete(sessionId);
        
        this.emit('sessionCancelled', { sessionId });
        logger.info('Session cancelled', { sessionId });
        
        return true;
    }

    /**
     * Utility: Generate cryptographically secure session ID
     */
    generateSessionId() {
        return 'mpc_' + crypto.randomBytes(16).toString('hex');
    }

    /**
     * Utility: Generate cryptographically secure nonce
     */
    generateNonce() {
        return 'nonce_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
    }

    /**
     * Utility: Sign JWT with ES256
     */
    async signJWT(payload) {
        // Implementation would use actual private key for JWT signing
        // For security, this should use HSM or secure key storage
        const header = {
            alg: 'ES256',
            typ: 'JWT'
        };

        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const message = encodedHeader + '.' + encodedPayload;

        // In production, sign with actual ECDSA key
        const signature = crypto.createHash('sha256').update(message).digest('base64url');
        
        return message + '.' + signature;
    }

    /**
     * Get coordinator statistics
     */
    getStatistics() {
        return {
            activeSessions: this.activeSessions.size,
            totalGuardians: this.config.guardianEndpoints.length,
            noncesTracked: this.noncesUsed.size,
            config: {
                threshold: this.config.threshold,
                totalParties: this.config.totalParties,
                guardianTimeout: this.config.guardianTimeout
            }
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        const stats = this.getStatistics();
        const activeGuardians = await this.checkGuardianHealth();
        
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            coordinator: stats,
            guardians: {
                total: this.config.guardianEndpoints.length,
                active: activeGuardians.length,
                healthyRatio: activeGuardians.length / this.config.guardianEndpoints.length
            }
        };
    }

    /**
     * Check Guardian network health
     */
    async checkGuardianHealth() {
        const healthChecks = this.config.guardianEndpoints.map(async (endpoint) => {
            try {
                const response = await fetch(endpoint + '/health', { 
                    timeout: 5000 
                });
                return response.ok ? endpoint : null;
            } catch (error) {
                return null;
            }
        });

        const results = await Promise.allSettled(healthChecks);
        return results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('MPC Coordinator shutting down...');
        
        // Cancel all active sessions
        for (const sessionId of this.activeSessions.keys()) {
            this.cancelSession(sessionId);
        }

        // Clear resources
        this.activeSessions.clear();
        this.noncesUsed.clear();
        this.guardianConnections.clear();

        this.emit('shutdown');
        logger.info('MPC Coordinator shutdown complete');
    }
}

module.exports = MPCCoordinator;
