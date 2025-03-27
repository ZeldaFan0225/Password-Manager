import crypto from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// Authentication middleware
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
    try {
        // Skip auth for public routes
        if (
            request.routeOptions.url?.includes('/auth/login') ||
            request.routeOptions.url?.includes('/auth/register') ||
            request.routeOptions.url?.includes('/auth/verify-2fa') ||
            request.routeOptions.url?.includes('/auth/srp-challenge') ||
            request.routeOptions.url?.includes('/documentation') ||
            request.routeOptions.url === '/' ||
            request.routeOptions.url?.includes('/health') ||
            request.routeOptions.url?.includes('/api/metadata/icon')
        ) {
            return;
        }

        // Verify authentication
        const token = request.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            throw new Error('Missing authentication token');
        }

        const isValid = await request.server.validateSessionToken(token);

        if (!isValid) {
            throw new Error('Invalid or expired session');
        }

        // Get user from session
        const session = await request.server.db.getUserSession(token);
        
        if (!session) {
            throw new Error('Session not found');
        }

        // Get user data
        const user = await request.server.db.getUser(session.user_id);
        
        if (!user) {
            throw new Error('User not found');
        }

        // Attach user to request
        request.user = {
            id: user.id,
            username: user.username,
        };
    } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' });
    }
}

// Helper functions
export function generateSessionToken(): string {
    return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Create a proper function type that matches FastifyInstance decoration
export async function validateSessionToken(this: FastifyInstance, token: string): Promise<boolean> {
    try {
        return !!(await this.db.getUserSession(token));
    } catch (error) {
        console.error('Session validation error:', error);
        return false;
    }
}
