import { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { config } from './env';
import { authMiddleware, generateSessionToken, validateSessionToken } from '../middleware/auth';
import { healthRoutes } from '../routes/health';
import { userRoutes } from '../routes/users';
import { vaultRoutes } from '../routes/vaults';
import { metadataRoutes } from '../routes/metadata';

export async function configureServer(server: FastifyInstance) {
    // Security plugins
    await server.register(fastifyHelmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", ...config.corsOrigin], // Only allow images from our app
                connectSrc: ["'self'"],
            },
        },
    });

    await server.register(fastifyCors, {
        origin: config.corsOrigin,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Type', 'Content-Length', 'Content-Disposition'],
    });

    await server.register(fastifyRateLimit, {
        max: 100,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
            return request.headers['x-real-ip'] as string || request.ip;
        },
    });

    // Session management
    await server.register(fastifyCookie, {
        secret: config.cookieSecret,
        parseOptions: {
            httpOnly: true,
            secure: config.isProduction,
            path: '/',
            sameSite: 'strict',
        },
    });

    await server.register(fastifyJwt, {
        secret: config.jwtSecret,
        sign: {
            expiresIn: '14d', // 2 week expiration
        },
        cookie: {
            cookieName: 'session',
            signed: true,
        },
    });

    // Documentation
    await server.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'Password Manager API',
                description: 'API for secure password management',
                version: '1.0.0',
            },
            servers: [
                {
                    url: 'http://127.0.0.1:3000',
                    description: 'Development server',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
        },
    });

    await server.register(fastifySwaggerUi, {
        routePrefix: '/documentation',
    });

    // Register authentication hook
    server.addHook('onRequest', authMiddleware);

    // Add utility functions to server instance
    server.decorate('generateSessionToken', generateSessionToken);
    server.decorate('validateSessionToken', validateSessionToken);

    // Register routes
    await server.register(healthRoutes, { prefix: '/health' });
    await server.register(userRoutes, { prefix: '/auth' });
    await server.register(vaultRoutes, { prefix: '/vaults' });
    await server.register(metadataRoutes, { prefix: '/api' });
}

// Cleanup expired sessions periodically
export function setupSessionCleanup(server: FastifyInstance) {
    async function cleanupExpiredSessions() {
        try {
            const cleanedCount = await server.db.cleanupExpiredSessions();
            if (cleanedCount > 0) {
                server.log.info(`Cleaned up ${cleanedCount} expired sessions`);
            }
        } catch (error) {
            server.log.error('Failed to clean up expired sessions:', error);
        }
    }

    const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);

    // Run initial cleanup
    cleanupExpiredSessions();
}
