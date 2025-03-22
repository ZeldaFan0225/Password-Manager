import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import crypto from 'crypto';
import { generateSessionToken } from '../middleware/auth';
import { CreateUser, User } from '../database/database';

interface RegisterBody {
    username: string;
    password: string;
}

interface LoginBody {
    username: string;
    password: string;
}

interface RouteGenericRegister {
    Body: RegisterBody;
}

interface RouteGenericLogin {
    Body: LoginBody;
}

export async function userRoutes(server: FastifyInstance) {
    server.post<RouteGenericRegister>('/register', {
        schema: {
            body: Type.Object({
                username: Type.String({ minLength: 3 }),
                password: Type.String({ minLength: 8 }),
            }),
            response: {
                200: Type.Object({
                    message: Type.String(),
                    token: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { username, password } = request.body;

        try {
            // Check if user exists
            const existingUser = await server.db.getUserByUsername(username);
            if (existingUser) {
                return reply.code(400).send({ error: 'Username already exists' });
            }

            // Generate salt and hash password
            const salt = crypto.randomBytes(16).toString('hex');
            const hash = crypto
                .pbkdf2Sync(password, salt, 10000, 64, 'sha512')
                .toString('hex');

            // Create user
            const user = await server.db.createUser({
                username,
                account_password_hash: hash,
                account_password_salt: salt,
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

    server.post<RouteGenericLogin>('/login', {
        schema: {
            body: Type.Object({
                username: Type.String(),
                password: Type.String(),
            }),
            response: {
                200: Type.Object({
                    token: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { username, password } = request.body;

        try {
            // Get user
            const user = await server.db.getUserByUsername(username);
            if (!user) {
                return reply.code(401).send({ error: 'Invalid credentials' });
            }

            // Verify password
            const hash = crypto
                .pbkdf2Sync(password, user.account_password_salt, 10000, 64, 'sha512')
                .toString('hex');

            if (hash !== user.account_password_hash) {
                return reply.code(401).send({ error: 'Invalid credentials' });
            }

            // Generate and store session token
            const token = generateSessionToken();
            await server.db.createSession(user.id, token);

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
