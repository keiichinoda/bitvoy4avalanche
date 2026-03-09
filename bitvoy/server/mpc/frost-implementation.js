/**
 * FROST Implementation - Flexible Round-Optimized Schnorr Threshold Signatures
 * Implements the FROST protocol for secure threshold signatures
 * Based on the FROST paper: https://eprint.iacr.org/2020/852.pdf
 */

const crypto = require('crypto');
const { secp256k1 } = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha256');
const { mod, invert } = require('@noble/secp256k1/utils');
const { logger } = require('../utils/logger');

class FrostImplementation {
    constructor(config = {}) {
        this.config = {
            threshold: config.threshold || 2,           // t
            totalParties: config.totalParties || 3,     // n
            fieldOrder: secp256k1.CURVE.n,              // Field order
            generator: secp256k1.Point.BASE,            // Generator point G
            ...config
        };

        // Validate threshold parameters
        if (this.config.threshold > this.config.totalParties) {
            throw new Error('Threshold cannot exceed total parties');
        }
        if (this.config.threshold < 2) {
            throw new Error('Threshold must be at least 2');
        }

        this.polynomials = new Map();
        this.commitments = new Map();
        this.shares = new Map();
        
        logger.info('FROST implementation initialized', {
            threshold: this.config.threshold,
            totalParties: this.config.totalParties
        });
    }

    /**
     * Phase 1: Distributed Key Generation - Generate polynomial and commitments
     */
    async keyGenPhase1(sessionId) {
        try {
            logger.debug('FROST Key Generation Phase 1', { sessionId });

            // Generate random polynomial coefficients
            const coefficients = [];
            for (let i = 0; i < this.config.threshold; i++) {
                coefficients.push(this.generateSecureScalar());
            }

            // The secret key is the constant term (a0)
            const secretKey = coefficients[0];

            // Generate commitments to polynomial coefficients
            const commitments = coefficients.map(coeff => 
                secp256k1.Point.BASE.multiply(coeff)
            );

            // Public key is commitment to constant term
            const publicKey = commitments[0];

            // Store for later phases
            this.polynomials.set(sessionId, { coefficients, secretKey });
            this.commitments.set(sessionId, { commitments, publicKey });

            logger.debug('Phase 1 completed', { sessionId, publicKey: publicKey.toHex() });

            return {
                sessionId,
                coefficients: coefficients.map(c => c.toString(16)),
                commitments: commitments.map(c => c.toHex()),
                publicKey: publicKey.toHex(),
                secretKey: secretKey.toString(16) // Only for local storage
            };

        } catch (error) {
            logger.error('FROST Phase 1 failed', { sessionId, error: error.message });
            throw error;
        }
    }

    /**
     * Phase 2: Share generation and distribution
     */
    async keyGenPhase2(coefficients, commitments, participantCount) {
        try {
            logger.debug('FROST Key Generation Phase 2');

            // Convert string coefficients back to numbers
            const polyCoeffs = coefficients.map(c => BigInt('0x' + c));
            const polyCommitments = commitments.map(c => secp256k1.Point.fromHex(c));

            const shares = new Map();
            const shareCommitments = new Map();

            // Generate shares for each participant (including self)
            for (let i = 1; i <= participantCount; i++) {
                const participantId = BigInt(i);
                
                // Evaluate polynomial at participant ID
                const share = this.evaluatePolynomial(polyCoeffs, participantId);
                shares.set(i, share);

                // Generate commitment to share for verification
                const shareCommitment = this.generateShareCommitment(polyCommitments, participantId);
                shareCommitments.set(i, shareCommitment);
            }

            logger.debug('Phase 2 completed', { sharesGenerated: shares.size });

            return {
                shares: shares,
                shareCommitments: shareCommitments,
                commitments: polyCommitments
            };

        } catch (error) {
            logger.error('FROST Phase 2 failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Phase 3: Share verification and public key aggregation
     */
    async keyGenPhase3(shares, commitments) {
        try {
            logger.debug('FROST Key Generation Phase 3');

            // Verify all shares against commitments
            for (const [participantId, share] of shares.entries()) {
                const isValid = this.verifyShare(share, participantId, commitments);
                if (!isValid) {
                    throw new Error(`Invalid share for participant ${participantId}`);
                }
            }

            // The public key is the first commitment (commitment to constant term)
            const publicKey = commitments[0];

            logger.debug('Phase 3 completed', { 
                publicKey: publicKey.toHex(),
                totalShares: shares.size 
            });

            return {
                publicKey: publicKey.toHex(),
                shares: shares,
                commitments: commitments
            };

        } catch (error) {
            logger.error('FROST Phase 3 failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Signing Phase 1: Nonce generation and commitment
     */
    async signingPhase1(sessionNonce) {
        try {
            logger.debug('FROST Signing Phase 1');

            // Generate signing nonces (hiding and binding)
            const hidingNonce = this.generateSecureScalar();
            const bindingNonce = this.generateSecureScalar();

            // Generate nonce commitments
            const hidingCommitment = secp256k1.Point.BASE.multiply(hidingNonce);
            const bindingCommitment = secp256k1.Point.BASE.multiply(bindingNonce);

            // Combine commitments
            const nonceCommitment = hidingCommitment.add(bindingCommitment);

            const result = {
                sessionNonce,
                hidingNonce: hidingNonce.toString(16),
                bindingNonce: bindingNonce.toString(16),
                hidingCommitment: hidingCommitment.toHex(),
                bindingCommitment: bindingCommitment.toHex(),
                nonceCommitment: nonceCommitment.toHex(),
                timestamp: Date.now()
            };

            logger.debug('Signing Phase 1 completed');
            return result;

        } catch (error) {
            logger.error('FROST Signing Phase 1 failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Signing Phase 2: Partial signature generation
     */
    async signingPhase2(messageHash, nonceCommitments, participantShares) {
        try {
            logger.debug('FROST Signing Phase 2', { 
                messageSize: messageHash.length,
                commitments: nonceCommitments.length,
                shares: participantShares.length 
            });

            // Convert message hash to scalar
            const message = this.hashToScalar(messageHash);

            // Aggregate nonce commitments
            const aggregateCommitment = this.aggregateCommitments(nonceCommitments);

            // Generate binding factor
            const bindingFactor = this.generateBindingFactor(
                aggregateCommitment,
                messageHash,
                nonceCommitments
            );

            const partialSignatures = new Map();

            // Generate partial signature for each participant
            for (const shareData of participantShares) {
                const participantId = BigInt(shareData.participantId || 1);
                const share = BigInt('0x' + shareData.share);
                const hidingNonce = BigInt('0x' + shareData.hidingNonce);
                const bindingNonce = BigInt('0x' + shareData.bindingNonce);

                // Calculate Lagrange coefficient
                const lagrangeCoeff = this.calculateLagrangeCoefficient(
                    participantId,
                    participantShares.map(s => BigInt(s.participantId || 1))
                );

                // Generate partial signature: z_i = r_i + λ_i * s_i * c
                const challenge = this.generateChallenge(aggregateCommitment, message);
                const partialSig = mod(
                    hidingNonce + bindingFactor * bindingNonce + 
                    lagrangeCoeff * share * challenge,
                    this.config.fieldOrder
                );

                partialSignatures.set(participantId, {
                    signature: partialSig.toString(16),
                    participantId: participantId.toString(),
                    challenge: challenge.toString(16),
                    lagrangeCoeff: lagrangeCoeff.toString(16)
                });
            }

            logger.debug('Signing Phase 2 completed', { 
                partialSignatures: partialSignatures.size 
            });

            return {
                partialSignatures,
                aggregateCommitment: aggregateCommitment.toHex(),
                bindingFactor: bindingFactor.toString(16),
                challenge: this.generateChallenge(aggregateCommitment, message).toString(16)
            };

        } catch (error) {
            logger.error('FROST Signing Phase 2 failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Signing Phase 3: Signature aggregation
     */
    async signingPhase3(partialSignatures, nonceCommitments) {
        try {
            logger.debug('FROST Signing Phase 3', { 
                partialSigs: partialSignatures.size 
            });

            if (partialSignatures.size < this.config.threshold) {
                throw new Error('Insufficient partial signatures for threshold');
            }

            // Aggregate partial signatures
            let aggregateSignature = BigInt(0);
            for (const [participantId, sigData] of partialSignatures.entries()) {
                const partialSig = BigInt('0x' + sigData.signature);
                aggregateSignature = mod(
                    aggregateSignature + partialSig,
                    this.config.fieldOrder
                );
            }

            // Aggregate nonce commitments
            const aggregateCommitment = this.aggregateCommitments(
                Object.values(nonceCommitments)
            );

            // Final signature is (R, s) where R is aggregate commitment
            const signature = {
                r: aggregateCommitment.x.toString(16),
                s: aggregateSignature.toString(16),
                recovery: this.calculateRecoveryId(aggregateCommitment)
            };

            logger.debug('Signing Phase 3 completed', {
                signatureR: signature.r.substring(0, 16) + '...',
                signatureS: signature.s.substring(0, 16) + '...'
            });

            return {
                signature,
                aggregateCommitment: aggregateCommitment.toHex()
            };

        } catch (error) {
            logger.error('FROST Signing Phase 3 failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Verify FROST signature
     */
    async verifySignature(signature, messageHash, publicKey) {
        try {
            const pubKey = secp256k1.Point.fromHex(publicKey);
            const message = this.hashToScalar(messageHash);
            
            const r = BigInt('0x' + signature.r);
            const s = BigInt('0x' + signature.s);

            // Verify signature equation: s*G = R + c*Y
            // where c is the challenge and Y is the public key
            const R = secp256k1.Point.fromPrivateKey(r);
            const challenge = this.generateChallenge(R, message);
            
            const leftSide = secp256k1.Point.BASE.multiply(s);
            const rightSide = R.add(pubKey.multiply(challenge));

            return leftSide.equals(rightSide);

        } catch (error) {
            logger.error('Signature verification failed', { error: error.message });
            return false;
        }
    }

    /**
     * Verify individual share against commitment
     */
    verifyShare(share, participantId, commitments) {
        try {
            const shareCommitment = this.generateShareCommitment(commitments, BigInt(participantId));
            const sharePoint = secp256k1.Point.BASE.multiply(share);
            
            return sharePoint.equals(shareCommitment);
        } catch (error) {
            logger.error('Share verification failed', { participantId, error: error.message });
            return false;
        }
    }

    /**
     * Verify share proof from Guardian
     */
    async verifyShareProof(share, proof, guardianPublicKey) {
        try {
            // Implement zero-knowledge proof verification
            // This is a simplified version - production should use proper ZK proofs
            const shareHash = sha256(Buffer.from(share, 'hex'));
            const expectedProof = sha256(Buffer.concat([
                shareHash,
                Buffer.from(guardianPublicKey, 'hex')
            ]));

            return proof === expectedProof.toString('hex');
        } catch (error) {
            logger.error('Share proof verification failed', { error: error.message });
            return false;
        }
    }

    /**
     * Generate commitment to share for verification
     */
    generateShareCommitment(commitments, participantId) {
        let shareCommitment = secp256k1.Point.ZERO;
        
        // Evaluate commitment polynomial at participant ID
        for (let j = 0; j < commitments.length; j++) {
            const power = this.modPow(participantId, BigInt(j), this.config.fieldOrder);
            const term = commitments[j].multiply(power);
            shareCommitment = shareCommitment.add(term);
        }
        
        return shareCommitment;
    }

    /**
     * Evaluate polynomial at given point
     */
    evaluatePolynomial(coefficients, x) {
        let result = BigInt(0);
        let xPower = BigInt(1);
        
        for (const coeff of coefficients) {
            result = mod(result + coeff * xPower, this.config.fieldOrder);
            xPower = mod(xPower * x, this.config.fieldOrder);
        }
        
        return result;
    }

    /**
     * Calculate Lagrange coefficient for interpolation
     */
    calculateLagrangeCoefficient(participantId, participantIds) {
        let numerator = BigInt(1);
        let denominator = BigInt(1);
        
        for (const otherId of participantIds) {
            if (otherId !== participantId) {
                numerator = mod(numerator * (BigInt(0) - otherId), this.config.fieldOrder);
                denominator = mod(denominator * (participantId - otherId), this.config.fieldOrder);
            }
        }
        
        // Calculate modular inverse
        const denomInverse = invert(denominator, this.config.fieldOrder);
        return mod(numerator * denomInverse, this.config.fieldOrder);
    }

    /**
     * Generate binding factor for FROST signatures
     */
    generateBindingFactor(aggregateCommitment, messageHash, nonceCommitments) {
        const commitmentList = nonceCommitments.map(c => c.nonceCommitment).join('');
        const input = Buffer.concat([
            Buffer.from(aggregateCommitment.toHex(), 'hex'),
            messageHash,
            Buffer.from(commitmentList, 'hex')
        ]);
        
        return this.hashToScalar(sha256(input));
    }

    /**
     * Generate challenge for signature
     */
    generateChallenge(commitment, message) {
        const input = Buffer.concat([
            Buffer.from(commitment.toHex(), 'hex'),
            Buffer.from(message.toString(16).padStart(64, '0'), 'hex')
        ]);
        
        return this.hashToScalar(sha256(input));
    }

    /**
     * Aggregate multiple commitments
     */
    aggregateCommitments(commitments) {
        let aggregate = secp256k1.Point.ZERO;
        
        for (const commitment of commitments) {
            if (typeof commitment === 'string') {
                aggregate = aggregate.add(secp256k1.Point.fromHex(commitment));
            } else if (commitment.nonceCommitment) {
                aggregate = aggregate.add(secp256k1.Point.fromHex(commitment.nonceCommitment));
            } else {
                aggregate = aggregate.add(commitment);
            }
        }
        
        return aggregate;
    }

    /**
     * Calculate recovery ID for signature
     */
    calculateRecoveryId(point) {
        return (point.y % BigInt(2) === BigInt(0)) ? 0 : 1;
    }

    /**
     * Convert hash to scalar in field
     */
    hashToScalar(hash) {
        const hashBuffer = Buffer.isBuffer(hash) ? hash : Buffer.from(hash, 'hex');
        const scalar = BigInt('0x' + hashBuffer.toString('hex'));
        return mod(scalar, this.config.fieldOrder);
    }

    /**
     * Generate cryptographically secure scalar
     */
    generateSecureScalar() {
        let scalar;
        do {
            const bytes = crypto.randomBytes(32);
            scalar = BigInt('0x' + bytes.toString('hex'));
        } while (scalar >= this.config.fieldOrder || scalar === BigInt(0));
        
        return scalar;
    }

    /**
     * Modular exponentiation
     */
    modPow(base, exponent, modulus) {
        let result = BigInt(1);
        base = mod(base, modulus);
        
        while (exponent > BigInt(0)) {
            if (exponent % BigInt(2) === BigInt(1)) {
                result = mod(result * base, modulus);
            }
            exponent = exponent >> BigInt(1);
            base = mod(base * base, modulus);
        }
        
        return result;
    }

    /**
     * Get FROST implementation statistics
     */
    getStatistics() {
        return {
            config: {
                threshold: this.config.threshold,
                totalParties: this.config.totalParties,
                fieldOrder: this.config.fieldOrder.toString(16)
            },
            activeSessions: {
                polynomials: this.polynomials.size,
                commitments: this.commitments.size,
                shares: this.shares.size
            }
        };
    }

    /**
     * Clear session data
     */
    clearSession(sessionId) {
        this.polynomials.delete(sessionId);
        this.commitments.delete(sessionId);
        this.shares.delete(sessionId);
        
        logger.debug('FROST session cleared', { sessionId });
    }

    /**
     * Health check for FROST implementation
     */
    async healthCheck() {
        try {
            // Perform basic cryptographic operations test
            const testScalar = this.generateSecureScalar();
            const testPoint = secp256k1.Point.BASE.multiply(testScalar);
            
            if (!testPoint || testPoint.equals(secp256k1.Point.ZERO)) {
                throw new Error('Cryptographic operations test failed');
            }
            
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                statistics: this.getStatistics()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = FrostImplementation;
