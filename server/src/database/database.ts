import { readFileSync } from "fs";
import { Pool } from "pg";
import { join } from "path";

export class Database {
    private host: string;
    private port: number;
    private user: string;
    private password: string;
    private database: string;

    private pool?: Pool;

    constructor(
        host: string,
        port: number,
        user: string,
        password: string,
        database: string
    ) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.database = database;
    }

    public connect() {
        this.pool = new Pool({
            host: this.host,
            port: this.port,
            user: this.user,
            password: this.password,
            database: this.database
        })

        this.pool.query('SELECT NOW()', (err) => {
            if (err) {
                console.error('Database connection error:', err);
                process.exit(1);
            }
            console.log('Database connected successfully');
        });
    }

    public async initDatabase() {
        try {
            const initSqlPath = join(process.cwd(), 'init.sql');
            const query = readFileSync(initSqlPath, "utf-8");
            console.log('Running database initialization script...');
            await this.pool?.query(query);
            console.log('Database initialization complete');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Check database health by querying current timestamp
     * @returns Current timestamp from database
     */
    public async healthCheck(): Promise<Date> {
        const result = await this.pool?.query('SELECT NOW()');
        if (!result) {
            throw new Error('Database connection failed');
        }
        return result.rows[0].now;
    }

    /** User Methods */

    public async createUser(userData: CreateUser): Promise<User> {
        const query = `
            INSERT INTO users (username, srp_salt, srp_verifier)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const result = await this.pool?.query(query, [
            userData.username,
            userData.srp_salt,
            userData.srp_verifier,
        ]);
        if (!result?.rows[0]) {
            throw new Error('Failed to create user');
        }
        return result.rows[0];
    }

    public async getUserByUsername(username: string): Promise<User | undefined> {
        const query = "SELECT * FROM users WHERE username = $1";
        const result = await this.pool?.query(query, [username]);
        return result?.rows[0];
    }

    public async getUser(id: number): Promise<User | undefined> {
        const query = "SELECT * FROM users WHERE id = $1";
        const result = await this.pool?.query(query, [id]);
        return result?.rows[0];
    }

    public async updateUsername(userId: number, username: string): Promise<User> {
        // Check if username already exists
        const existingUser = await this.getUserByUsername(username);
        if (existingUser && existingUser.id !== userId) {
            throw new Error('Username already exists');
        }

        const query = `
            UPDATE users
            SET username = $1
            WHERE id = $2
            RETURNING *
        `;
        const result = await this.pool?.query(query, [username, userId]);
        if (!result?.rows[0]) {
            throw new Error('Failed to update username');
        }
        return result.rows[0];
    }

    public async updateSrpCredentials(userId: number, srpSalt: string, srpVerifier: string): Promise<User> {
        const query = `
            UPDATE users
            SET srp_salt = $1, srp_verifier = $2
            WHERE id = $3
            RETURNING *
        `;
        const result = await this.pool?.query(query, [srpSalt, srpVerifier, userId]);
        if (!result?.rows[0]) {
            throw new Error('Failed to update SRP credentials');
        }
        return result.rows[0];
    }

    public async setTotpSecret(userId: number, totpSecret: string): Promise<User> {
        const query = `
            UPDATE users
            SET totp_secret = $1
            WHERE id = $2
            RETURNING *
        `;
        const result = await this.pool?.query(query, [totpSecret, userId]);
        if (!result?.rows[0]) {
            throw new Error('Failed to set TOTP secret');
        }
        return result.rows[0];
    }

    public async removeTotpSecret(userId: number): Promise<User> {
        const query = `
            UPDATE users
            SET totp_secret = NULL
            WHERE id = $1
            RETURNING *
        `;
        const result = await this.pool?.query(query, [userId]);
        if (!result?.rows[0]) {
            throw new Error('Failed to remove TOTP secret');
        }
        return result.rows[0];
    }

    /** Session Methods */

    public async getUserSession(token: string): Promise<Session | undefined> {
        const query = `
            SELECT s.*, u.username
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = $1 AND s.expires_at > NOW()
        `;
        const result = await this.pool?.query(query, [token]);
        return result?.rows[0];
    }

    public async createSession(userId: number, token: string): Promise<Session> {
        const query = `
            INSERT INTO user_sessions (user_id, token, expires_at)
            VALUES ($1, $2, NOW() + INTERVAL '2 weeks')
            RETURNING *
        `;
        const result = await this.pool?.query(query, [userId, token]);
        if (!result?.rows[0]) {
            throw new Error('Failed to create session');
        }
        return result.rows[0];
    }

    public async cleanupExpiredSessions(): Promise<number> {
        const query = "DELETE FROM user_sessions WHERE expires_at < NOW() RETURNING id";
        const result = await this.pool?.query(query);
        return result?.rowCount || 0;
    }

    /** Vault Methods */

    public async createVault(data: CreateVault): Promise<Vault> {
        const client = await this.pool?.connect();
        try {
            await client?.query('BEGIN');

            // Create vault
            const vaultQuery = `
                INSERT INTO vaults (name, master_password_salt, encrypted_user_id)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const vaultResult = await client?.query(vaultQuery, [
                data.name,
                data.master_password_salt,
                data.encrypted_user_id,
            ]);

            // Create vault access
            const accessQuery = `
                INSERT INTO vault_access (vault_id, user_id, role)
                VALUES ($1, $2, $3)
            `;
            await client?.query(accessQuery, [
                vaultResult?.rows[0].id,
                data.user_id,
                data.role,
            ]);

            await client?.query('COMMIT');
            return vaultResult?.rows[0];
        } catch (error) {
            await client?.query('ROLLBACK');
            throw error;
        } finally {
            client?.release();
        }
    }

    public async updateVault(id: number, data: UpdateVault): Promise<Vault> {
        const sets: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.name !== undefined) {
            sets.push(`name = $${paramIndex}`);
            values.push(data.name);
            paramIndex++;
        }
        if (data.encrypted_user_id !== undefined) {
            sets.push(`encrypted_user_id = $${paramIndex}`);
            values.push(data.encrypted_user_id);
            paramIndex++;
        }

        if (sets.length === 0) {
            throw new Error('No fields to update');
        }

        const query = `
            UPDATE vaults 
            SET ${sets.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `;
        values.push(id);

        const result = await this.pool?.query(query, values);
        if (!result?.rows[0]) {
            throw new Error('Failed to update vault');
        }
        return result.rows[0];
    }

    public async getVault(id: number): Promise<Vault | undefined> {
        const query = "SELECT * FROM vaults WHERE id = $1";
        const result = await this.pool?.query(query, [id]);
        return result?.rows[0];
    }

    public async getVaultAccess(vaultId: number, userId: number): Promise<VaultAccess | undefined> {
        const query = "SELECT * FROM vault_access WHERE vault_id = $1 AND user_id = $2";
        const result = await this.pool?.query(query, [vaultId, userId]);
        return result?.rows[0];
    }

    public async getUserVaults(userId: number): Promise<(Vault & VaultAccess)[]> {
        const query = `
            SELECT v.*, va.role
            FROM vaults v
            JOIN vault_access va ON v.id = va.vault_id
            WHERE va.user_id = $1
        `;
        const result = await this.pool?.query(query, [userId]);
        return result?.rows || [];
    }

    /** Password Methods */

    public async createPassword(data: CreatePassword): Promise<Password> {
        const query = `
            INSERT INTO passwords (vault_id, data, iv)
            VALUES ($1, $2, $3)
            RETURNING *
        `;
        const result = await this.pool?.query(query, [
            data.vault_id,
            data.data,
            data.iv,
        ]);
        if (!result?.rows[0]) {
            throw new Error('Failed to create password');
        }
        return result.rows[0];
    }

    public async getVaultPasswords(vaultId: number): Promise<Password[]> {
        const query = "SELECT * FROM passwords WHERE vault_id = $1";
        const result = await this.pool?.query(query, [vaultId]);
        return result?.rows || [];
    }

    public async deletePassword(id: number, vaultId: number): Promise<boolean> {
        const query = "DELETE FROM passwords WHERE id = $1 AND vault_id = $2 RETURNING id";
        const result = await this.pool?.query(query, [id, vaultId]);
        return result?.rowCount === 1;
    }

    public async updatePassword(id: number, vaultId: number, data: {
        data: Buffer;
        iv: string;
    }): Promise<boolean> {
        const query = `
            UPDATE passwords 
            SET data = $1, iv = $2 
            WHERE id = $3 AND vault_id = $4
            RETURNING id
        `;
        const result = await this.pool?.query(query, [
            data.data,
            data.iv,
            id,
            vaultId
        ]);
        return result?.rowCount === 1;
    }

    public async updateMasterPassword(vaultId: number, userId: number, data: {
        encryptedUserId: string;
        passwords: Array<{
            id: number;
            encryptedData: string;
            iv: string;
        }>;
    }): Promise<void> {
        const client = await this.pool?.connect();
        try {
            // Check if user is the owner of the vault
            const accessQuery = "SELECT * FROM vault_access WHERE vault_id = $1 AND user_id = $2 AND role = 'OWNER'";
            const accessResult = await client?.query(accessQuery, [vaultId, userId]);
            
            if (!accessResult?.rows.length) {
                throw new Error('Only the owner can update master password');
            }

            await client?.query('BEGIN');

            // Update vault with new encrypted user ID
            await client?.query(
                'UPDATE vaults SET encrypted_user_id = $1 WHERE id = $2',
                [data.encryptedUserId, vaultId]
            );

            // Update each password
            for (const password of data.passwords) {
                await client?.query(
                    'UPDATE passwords SET data = $1, iv = $2 WHERE id = $3 AND vault_id = $4',
                    [Buffer.from(password.encryptedData, 'hex'), password.iv, password.id, vaultId]
                );
            }

            await client?.query('COMMIT');
        } catch (error) {
            await client?.query('ROLLBACK');
            throw error;
        } finally {
            client?.release();
        }
    }

    public async deleteVault(id: number, userId: number): Promise<boolean> {
        // Check if user is the owner of the vault
        const accessQuery = "SELECT * FROM vault_access WHERE vault_id = $1 AND user_id = $2 AND role = 'OWNER'";
        const accessResult = await this.pool?.query(accessQuery, [id, userId]);
        
        if (!accessResult?.rows.length) {
            throw new Error('Only the owner can delete a vault');
        }
        
        // Delete the vault (cascade will handle related records)
        const vaultQuery = "DELETE FROM vaults WHERE id = $1 RETURNING id";
        const vaultResult = await this.pool?.query(vaultQuery, [id]);
        
        return vaultResult?.rowCount === 1;
    }

    /**
     * Closes the database connection
     */
    public async close() {
        await this.pool?.end();
    }
}

export interface CreateUser {
    username: string;
    srp_salt: string;
    srp_verifier: string;
}

export interface User {
    id: number;
    username: string;
    srp_salt: string;
    srp_verifier: string;
    totp_secret?: string;
    created_at: Date;
}

export interface Session {
    id: number;
    user_id: number;
    token: string;
    created_at: Date;
    expires_at: Date;
}

export interface CreateVault {
    name: string;
    master_password_salt: string;
    encrypted_user_id: string;
    user_id: number;
    role: "OWNER" | "MEMBER";
}

export interface UpdateVault {
    name?: string;
    encrypted_user_id?: string;
}

export interface Vault {
    id: number;
    name: string;
    master_password_salt: string;
    encrypted_user_id: string;
    created_at: Date;
}

export interface VaultAccess {
    vault_id: number;
    user_id: number;
    role: "OWNER" | "MEMBER";
}

export interface CreatePassword {
    vault_id: number;
    data: Buffer;
    iv: string;
}

export interface Password {
    id: number;
    vault_id: number;
    data: Buffer;
    iv: string;
    created_at: Date;
}
