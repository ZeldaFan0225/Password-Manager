import { Database, User } from '../database/database';

declare module 'fastify' {
    interface FastifyInstance {
        db: Database;
        generateSessionToken: () => string;
        validateSessionToken: (token: string) => Promise<boolean>;
    }

    interface FastifyRequest {
        user: User;
    }
}
