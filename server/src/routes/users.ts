import { Type } from '@sinclair/typebox';
import { FastifyInstance } from 'fastify';
import * as srpServer from 'secure-remote-password/server';
import { User } from '../database/database';
import { generateSessionToken } from '../middleware/auth';

// SRP session storage (in-memory for simplicity)
// In production, this should be stored in Redis or another distributed cache
const srpSessions: Record<string, {
    serverPublicKey: string;
    serverPrivateKey: string;
    userId: number;
}> = {};

interface RegisterBody {
    username: string;
    srp_salt: string;
    srp_verifier: string;
}

interface SrpChallengeBody {
    username: string;
}

interface SrpChallengeResponse {
    salt: string;
    server_public_key: string;
}

interface LoginBody {
    username: string;
    client_public_key: string;
    client_proof: string;
}

interface LoginResponse {
    server_proof: string;
    token: string;
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
            // Get user
            const user = await server.db.getUserByUsername(username);
            if (!user) {
                return reply.code(401).send({ error: 'Invalid credentials' });
            }

            // Generate server SRP values
            const serverEphemeral = srpServer.generateEphemeral(user.srp_verifier);

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
                    token: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { username, client_public_key, client_proof } = request.body;

        try {
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
                // Verify client proof
                const serverSession = srpServer.deriveSession(
                    session.serverPrivateKey,
                    client_public_key,
                    user.srp_salt,
                    username,
                    user.srp_verifier,
                    client_proof
                );

                // Generate and store session token
                const token = generateSessionToken();
                await server.db.createSession(user.id, token);

                // Clean up SRP session
                delete srpSessions[username];

                // Return server proof and token
                // The token will be used for subsequent authenticated requests
                // Client should include it in the Authorization header as "Bearer <token>"
                return {
                    server_proof: serverSession.proof,
                    token
                };
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

    server.get('/me', {
        schema: {
            security: [{ bearerAuth: [] }],
            response: {
                200: Type.Object({
                    id: Type.Number(),
                    username: Type.String(),
                }),
            },
        },
    }, async (request) => {
        const user = request.user as User;
        return {
            id: user.id,
            username: user.username,
        };
    });
}
