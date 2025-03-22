import { readFileSync } from 'fs';

// Load environment variables from .env file
function loadEnvFile() {
    try {
        const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/;
        for (const line of readFileSync(`${process.cwd()}/.env`, 'utf8').split(/[\r\n]/)) {
            const [, key, value] = line.match(RE_INI_KEY_VAL) || [];
            if (!key) continue;
            process.env[key] = value?.trim();
        }
    } catch (error) {
        console.error('Failed to load .env file:', error);
        process.exit(1);
    }
}

// Load env variables immediately
loadEnvFile();

// Environment variables configuration
function getRequiredEnvVar(name: string): string {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
    return value;
}

// Export the configuration
export const config = {
    port: parseInt(process.env["PORT"] || "3000", 10),
    jwtSecret: getRequiredEnvVar("JWT_SECRET"),
    cookieSecret: getRequiredEnvVar("COOKIE_SECRET"),
    corsOrigin: process.env["CORS_ORIGIN"]?.split(',') || ['http://localhost:3000'],
    isProduction: process.env["NODE_ENV"] === 'production',
    // Database config
    dbIp: getRequiredEnvVar("DB_IP"),
    dbPort: parseInt(getRequiredEnvVar("DB_PORT"), 10),
    dbUsername: getRequiredEnvVar("DB_USERNAME"),
    dbPassword: getRequiredEnvVar("DB_PASSWORD"),
    dbName: getRequiredEnvVar("DB_NAME"),
};
