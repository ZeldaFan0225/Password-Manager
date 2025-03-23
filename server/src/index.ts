import fastify from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Database } from './database/database';
import { config } from './config/env';
import { configureServer, setupSessionCleanup } from './config/server';

// Wrap the entire startup in a try-catch to catch any initialization errors
async function main() {
    try {
        console.log('Creating database connection...');
        // Create instance of Database class
        const database = new Database(
            config.dbIp,
            config.dbPort,
            config.dbUsername,
            config.dbPassword,
            config.dbName
        );

        console.log('Creating Fastify server...');
        // Create Fastify server
        const server = fastify({
            logger: {
                transport: {
                    target: 'pino-pretty',
                    options: {
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                    },
                },
            },
        }).withTypeProvider<TypeBoxTypeProvider>();

        // Attach database to server
        server.decorate('db', database);

        // Graceful shutdown handler
        async function closeGracefully(signal: string) {
            console.log(`Received signal to terminate: ${signal}`);

            await server.close();
            await database.close();
            process.exit(0);
        }

        process.on('SIGINT', () => closeGracefully('SIGINT'));
        process.on('SIGTERM', () => closeGracefully('SIGTERM'));

        // Server startup
        try {
            console.log('Connecting to database...');
            // Connect and initialize database
            database.connect();
            await database.initDatabase();

            console.log('Configuring server...');
            // Configure server with plugins and routes
            await configureServer(server);

            console.log('Setting up session cleanup...');
            // Setup session cleanup
            setupSessionCleanup(server);

            console.log('Starting server...');
            // Start listening
            const address = await server.listen({ 
                port: config.port, 
                host: '127.0.0.1' 
            });
            
            console.log(`Server listening at ${address}`);
        } catch (err) {
            console.error('Error during server startup:', err);
            await database.close();
            process.exit(1);
        }
    } catch (err) {
        console.error('Fatal error during initialization:', err);
        process.exit(1);
    }
}

// Start the server
main().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
