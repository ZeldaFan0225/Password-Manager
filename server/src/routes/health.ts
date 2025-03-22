import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';

export async function healthRoutes(server: FastifyInstance) {
    server.get('/', {
        schema: {
            response: {
                200: Type.Object({
                    status: Type.String(),
                    time: Type.String(),
                }),
            },
        },
    }, async () => {
        try {
            const result = await server.db.healthCheck();
            return {
                status: 'ok',
                time: result.toISOString(),
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'Database connection failed',
            };
        }
    });
}
