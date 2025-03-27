import { Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';
import * as srpServer from 'secure-remote-password/server';
import { User } from '../database/database';
import { generateSessionToken } from '../middleware/auth';
import { authenticator } from 'otplib';
import crypto from 'crypto';

// Constants for parameter validation
const MAX_USERNAME_LENGTH = 255;
const MAX_SALT_LENGTH = 1000;
const MAX_VERIFIER_LENGTH = 1000;

// SRP session storage (in-memory for simplicity)
// In production, this should be stored in Redis or another distributed cache
const srpSessions: Record<string, {
    serverPublicKey: string;
    serverPrivateKey: string;
    userId: number;
}> = {};

// Temporary tokens for 2FA verification (in-memory for simplicity)
// In production, this should be stored in Redis or another distributed cache
const tempTokens: Record<string, {
    userId: number;
    expires: Date;
}> = {};

// Generate a temporary token for 2FA verification
function generateTempToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

// Clean up expired temporary tokens
function cleanupTempTokens() {
    const now = new Date();
    for (const token in tempTokens) {
        if (Object.prototype.hasOwnProperty.call(tempTokens, token)) {
            const entry = tempTokens[token];
            if (entry && entry.expires < now) {
                delete tempTokens[token];
            }
        }
    }
}

// Schedule cleanup every 5 minutes
setInterval(cleanupTempTokens, 5 * 60 * 1000);

// Schema validation functions
function isValidLength(str: string, maxLength: number): boolean {
    const byteLength = Buffer.from(str).length;
    return byteLength <= maxLength;
}

interface RegisterBody {
    username: string;
    srp_salt: string;
    srp_verifier: string;
}

interface SrpChallengeBody {
    username: string;
}

interface LoginBody {
    username: string;
    client_public_key: string;
    client_proof: string;
}

interface RouteGenericRegister {
    Body: RegisterBody;
}

interface RouteGenericSrpChallenge {
    Body: SrpChallengeBody;
}

interface RouteGenericLogin {
    Body: LoginBody;
}

export async function userRoutes(server: FastifyInstance) {
    // Register a new user
    server.post<RouteGenericRegister>('/register', {
        schema: {
            body: Type.Object({
                username: Type.String({ minLength: 3 }),
                srp_salt: Type.String(),
                srp_verifier: Type.String(),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                    token: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { username, srp_salt, srp_verifier } = request.body;

        try {
            // Validate input lengths
            if (!isValidLength(username, MAX_USERNAME_LENGTH)) {
                return reply.code(400).send({ error: 'Username too long' });
            }
            if (!isValidLength(srp_salt, MAX_SALT_LENGTH)) {
                return reply.code(400).send({ error: 'Salt too long' });
            }
            if (!isValidLength(srp_verifier, MAX_VERIFIER_LENGTH)) {
                return reply.code(400).send({ error: 'Verifier too long' });
            }

            // Check if user exists
            const existingUser = await server.db.getUserByUsername(username);
            if (existingUser) {
                return reply.code(400).send({ error: 'Username already exists' });
            }

            // Create user with SRP verifier
            const user = await server.db.createUser({
                username,
                srp_salt,
                srp_verifier,
            });

            // Generate and store session token
            const token = generateSessionToken();
            await server.db.createSession(user.id, token);

            return { 
                message: 'User registered successfully',
                token
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Step 1 of SRP authentication: Client requests challenge
    server.post<RouteGenericSrpChallenge>('/srp-challenge', {
        schema: {
            body: Type.Object({
                username: Type.String(),
            }),
            response: {
                200: Type.Object({
                    salt: Type.String(),
                    server_public_key: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { username } = request.body;

        try {
            // Validate input length
            if (!isValidLength(username, MAX_USERNAME_LENGTH)) {
                return reply.code(400).send({ error: 'Username too long' });
            }

            // Get user
            const user = await server.db.getUserByUsername(username);
            if (!user) {
                return reply.code(401).send({ error: 'Invalid credentials' });
            }

            // Generate server SRP values asynchronously
            const serverEphemeral = await Promise.resolve(srpServer.generateEphemeral(user.srp_verifier));

            // Store server values for the second step
            srpSessions[username] = {
                serverPublicKey: serverEphemeral.public,
                serverPrivateKey: serverEphemeral.secret,
                userId: user.id
            };

            // Return challenge to client
            return {
                salt: user.srp_salt,
                server_public_key: serverEphemeral.public
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Step 2 of SRP authentication: Client sends proof
    server.post<RouteGenericLogin>('/login', {
        schema: {
            body: Type.Object({
                username: Type.String(),
                client_public_key: Type.String(),
                client_proof: Type.String(),
            }),
            response: {
                200: Type.Object({
                    server_proof: Type.String(),
                    token: Type.Optional(Type.String()),
                    requires_2fa: Type.Optional(Type.Boolean()),
                    temp_token: Type.Optional(Type.String()),
                }),
            },
        },
    }, async (request, reply) => {
        const { username, client_public_key, client_proof } = request.body;

        try {
            // Validate input lengths
            if (!isValidLength(username, MAX_USERNAME_LENGTH)) {
                return reply.code(400).send({ error: 'Username too long' });
            }
            if (!isValidLength(client_public_key, MAX_VERIFIER_LENGTH)) {
                return reply.code(400).send({ error: 'Client public key too long' });
            }
            if (!isValidLength(client_proof, MAX_VERIFIER_LENGTH)) {
                return reply.code(400).send({ error: 'Client proof too long' });
            }

            // Get user
            const user = await server.db.getUserByUsername(username);
            if (!user) {
                return reply.code(401).send({ error: 'Invalid credentials' });
            }

            // Get server SRP session
            const session = srpSessions[username];
            if (!session) {
                return reply.code(401).send({ error: 'No active SRP challenge' });
            }

            try {
                // Verify client proof asynchronously
                const serverSession = await Promise.resolve(srpServer.deriveSession(
                    session.serverPrivateKey,
                    client_public_key,
                    user.srp_salt,
                    username,
                    user.srp_verifier,
                    client_proof
                ));

                // Clean up SRP session
                delete srpSessions[username];

                // Check if 2FA is enabled
                const has2FA = !!user.totp_secret;

                if (has2FA) {
                    // Generate temporary token for 2FA verification
                    const tempToken = generateTempToken();
                    
                    // Store temporary token with expiration (5 minutes)
                    const expiresAt = new Date();
                    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
                    
                    tempTokens[tempToken] = {
                        userId: user.id,
                        expires: expiresAt
                    };
                    
                    // Return server proof and temporary token
                    return {
                        server_proof: serverSession.proof,
                        requires_2fa: true,
                        temp_token: tempToken
                    };
                } else {
                    // Generate and store session token
                    const token = generateSessionToken();
                    await server.db.createSession(user.id, token);

                    // Return server proof and token
                    return {
                        server_proof: serverSession.proof,
                        token
                    };
                }
            } catch (error) {
                // Authentication failed
                delete srpSessions[username];
                return reply.code(401).send({ error: 'Invalid credentials' });
            }
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Verify 2FA code and complete login
    server.post('/verify-2fa', {
        schema: {
            body: Type.Object({
                temp_token: Type.String(),
                totp_code: Type.String(),
            }),
            response: {
                200: Type.Object({
                    token: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { temp_token, totp_code } = request.body as { temp_token: string, totp_code: string };

        try {
            // Check if temporary token exists and is valid
            const tempTokenData = tempTokens[temp_token];
            if (!tempTokenData) {
                return reply.code(401).send({ error: 'Invalid or expired token' });
            }

            // Check if token is expired
            if (tempTokenData.expires < new Date()) {
                delete tempTokens[temp_token];
                return reply.code(401).send({ error: 'Token expired' });
            }

            // Get user
            const user = await server.db.getUser(tempTokenData.userId);
            if (!user) {
                delete tempTokens[temp_token];
                return reply.code(401).send({ error: 'User not found' });
            }

            // Verify TOTP code
            if (!user.totp_secret) {
                delete tempTokens[temp_token];
                return reply.code(400).send({ error: '2FA is not enabled for this user' });
            }

            const isValid = authenticator.verify({
                token: totp_code,
                secret: user.totp_secret
            });

            if (!isValid) {
                return reply.code(401).send({ error: 'Invalid verification code' });
            }

            // Clean up temporary token
            delete tempTokens[temp_token];

            // Generate and store session token
            const token = generateSessionToken();
            await server.db.createSession(user.id, token);

            // Return token
            return { token };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    server.get('/me', {
        schema: {
            security: [{ bearerAuth: [] }],
            response: {
                200: Type.Object({
                    id: Type.Number(),
                    username: Type.String(),
                    has_2fa: Type.Boolean(),
                }),
            },
        },
    }, async (request) => {
        const user = request.user as User;
        const fullUser = await server.db.getUser(user.id);
        
        return {
            id: user.id,
            username: user.username,
            has_2fa: !!fullUser?.totp_secret,
        };
    });

    // Update username
    server.put('/username', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                username: Type.String({ minLength: 3 }),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const user = request.user as User;
        const { username } = request.body as { username: string };

        try {
            // Validate input length
            if (!isValidLength(username, MAX_USERNAME_LENGTH)) {
                return reply.code(400).send({ error: 'Username too long' });
            }

            await server.db.updateUsername(user.id, username);
            return { message: 'Username updated successfully' };
        } catch (error) {
            if ((error as Error).message === 'Username already exists') {
                return reply.code(400).send({ error: 'Username already exists' });
            }
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Update password (SRP credentials)
    server.put('/password', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                srp_salt: Type.String(),
                srp_verifier: Type.String(),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const user = request.user as User;
        const { srp_salt, srp_verifier } = request.body as { srp_salt: string, srp_verifier: string };

        try {
            // Validate input lengths
            if (!isValidLength(srp_salt, MAX_SALT_LENGTH)) {
                return reply.code(400).send({ error: 'Salt too long' });
            }
            if (!isValidLength(srp_verifier, MAX_VERIFIER_LENGTH)) {
                return reply.code(400).send({ error: 'Verifier too long' });
            }

            await server.db.updateSrpCredentials(user.id, srp_salt, srp_verifier);
            return { message: 'Password updated successfully' };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Generate new TOTP secret
    server.post('/2fa/setup', {
        schema: {
            security: [{ bearerAuth: [] }],
            response: {
                200: Type.Object({
                    secret: Type.String(),
                    qr_code_url: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const user = request.user as User;

        try {
            // Generate a new TOTP secret
            const secret = authenticator.generateSecret();
            
            // Create a QR code URL for easy setup
            const otpauth = authenticator.keyuri(user.username, 'Password Manager', secret);
            
            // Return the secret and QR code URL (don't save yet until verified)
            return {
                secret,
                qr_code_url: otpauth,
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Verify and enable TOTP
    server.post('/2fa/enable', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                secret: Type.String(),
                token: Type.String(),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const user = request.user as User;
        const { secret, token } = request.body as { secret: string, token: string };

        try {
            // Verify the token
            const isValid = authenticator.verify({ token, secret });
            
            if (!isValid) {
                return reply.code(400).send({ error: 'Invalid verification code' });
            }
            
            // Save the TOTP secret
            await server.db.setTotpSecret(user.id, secret);
            
            return { message: '2FA enabled successfully' };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Disable TOTP
    server.post('/2fa/disable', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                token: Type.String(),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const user = request.user as User;
        const { token } = request.body as { token: string };

        try {
            // Get the user's TOTP secret
            const fullUser = await server.db.getUser(user.id);
            
            if (!fullUser?.totp_secret) {
                return reply.code(400).send({ error: '2FA is not enabled' });
            }
            
            // Verify the token
            const isValid = authenticator.verify({ token, secret: fullUser.totp_secret });
            
            if (!isValid) {
                return reply.code(400).send({ error: 'Invalid verification code' });
            }
            
            // Remove the TOTP secret
            await server.db.removeTotpSecret(user.id);
            
            return { message: '2FA disabled successfully' };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
