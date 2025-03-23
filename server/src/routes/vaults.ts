import { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { User } from '../database/database';
import { promisify } from 'util';

// Constants for parameter validation
const MAX_NAME_LENGTH = 255;
const MAX_STR_LENGTH = 1000;
const MAX_DATA_SIZE = 10 * 1024 * 1024; // 10MB limit for encrypted data

// Convert Buffer operations to async
const bufferFromAsync = promisify((data: string, encoding: BufferEncoding, cb: (err: Error | null, buffer: Buffer) => void) => {
    try {
        const buffer = Buffer.from(data, encoding);
        cb(null, buffer);
    } catch (err) {
        cb(err as Error, Buffer.alloc(0));
    }
});

// Validation functions
function isValidLength(str: string, maxLength: number): boolean {
    const byteLength = Buffer.from(str).length;
    return byteLength <= maxLength;
}

interface CreateVaultBody {
    name?: string;
    salt: string;
    encryptedUserId: string;
}

interface UpdateVaultBody {
    name?: string;
    encryptedUserId?: string;
}

interface StorePasswordBody {
    encryptedData: string;
    iv: string;
}

interface RouteGenericCreateVault {
    Body: CreateVaultBody;
}

interface RouteGenericUpdateVault {
    Body: UpdateVaultBody;
    Params: { id: string };
}

interface UpdateMasterPasswordBody {
    encryptedUserId: string;
    passwords: Array<{
        id: number;
        encryptedData: string;
        iv: string;
    }>;
}

interface RouteGenericUpdateMasterPassword {
    Body: UpdateMasterPasswordBody;
    Params: { id: string };
}

interface RouteGenericStorePassword {
    Body: StorePasswordBody;
    Params: { id: string };
}

interface RouteGenericAccess {
    Params: { id: string };
}

interface RouteGenericDeletePassword {
    Params: { id: string; passwordId: string };
}

interface RouteGenericUpdatePassword {
    Body: StorePasswordBody;
    Params: { id: string; passwordId: string };
}

export async function vaultRoutes(server: FastifyInstance) {
    server.post<RouteGenericCreateVault>('/', {
        schema: {
            security: [{ bearerAuth: [] }],
            body: Type.Object({
                name: Type.Optional(Type.String()),
                salt: Type.String(),
                encryptedUserId: Type.String(),
            }),
            response: {
                200: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    salt: Type.String(),
                    encryptedUserId: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const { salt, encryptedUserId } = request.body;
        const name = request.body.name || `${(request.user as User).username}'s Vault`;
        const user = request.user as User;

        try {
            // Validate input lengths
            if (!isValidLength(name, MAX_NAME_LENGTH)) {
                return reply.code(400).send({ error: 'Name too long' });
            }
            if (!isValidLength(salt, MAX_STR_LENGTH)) {
                return reply.code(400).send({ error: 'Salt too long' });
            }
            if (!isValidLength(encryptedUserId, MAX_STR_LENGTH)) {
                return reply.code(400).send({ error: 'Encrypted user ID too long' });
            }

            // Create vault with provided name or default
            const vault = await server.db.createVault({
                name: request.body.name || `${user.username}'s Vault`,
                master_password_salt: salt,
                encrypted_user_id: request.body.encryptedUserId,
                user_id: user.id,
                role: 'OWNER',
            });

            return {
                id: vault.id,
                name: vault.name,
                salt: vault.master_password_salt,
                encryptedUserId: vault.encrypted_user_id,
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    server.patch<RouteGenericUpdateVault>('/:id', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            body: Type.Object({
                name: Type.Optional(Type.String()),
                encryptedUserId: Type.Optional(Type.String()),
            }),
            response: {
                200: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    salt: Type.String(),
                    encryptedUserId: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            // Verify vault access and ownership
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access || access.role !== 'OWNER') {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Update vault
            const vault = await server.db.updateVault(vaultId, {
                name: request.body.name,
                encrypted_user_id: request.body.encryptedUserId,
            });

            return {
                id: vault.id,
                name: vault.name,
                salt: vault.master_password_salt,
                encryptedUserId: vault.encrypted_user_id,
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    server.post<RouteGenericStorePassword>('/:id/passwords', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            body: Type.Object({
                encryptedData: Type.String(),
                iv: Type.String(),
            }),
            response: {
                200: Type.Object({
                    id: Type.Number(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const { encryptedData, iv } = request.body;
        const user = request.user as User;

        try {
            // Validate input lengths
            if (!isValidLength(iv, MAX_STR_LENGTH)) {
                return reply.code(400).send({ error: 'IV too long' });
            }
            
            // Validate encrypted data size
            const dataSize = Buffer.from(encryptedData, 'hex').length;
            if (dataSize > MAX_DATA_SIZE) {
                return reply.code(400).send({ error: 'Encrypted data too large' });
            }

            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Convert hex string to buffer asynchronously
            const data = await bufferFromAsync(encryptedData, 'hex');

            // Store encrypted password
            const storedPassword = await server.db.createPassword({
                vault_id: vaultId,
                data,
                iv,
            });

            return { id: storedPassword.id };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    server.get<{ Params: { id: string } }>('/:id', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            response: {
                200: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    salt: Type.String(),
                    encryptedUserId: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Get vault
            const vault = await server.db.getVault(vaultId);
            if (!vault) {
                return reply.code(404).send({ error: 'Vault not found' });
            }

            return {
                id: vault.id,
                name: vault.name,
                salt: vault.master_password_salt,
                encryptedUserId: vault.encrypted_user_id,
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    server.get('/', {
        schema: {
            security: [{ bearerAuth: [] }],
            response: {
                200: Type.Array(Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    salt: Type.String(),
                    encryptedUserId: Type.String(),
                    role: Type.Union([Type.Literal('OWNER'), Type.Literal('MEMBER')]),
                })),
            },
        },
    }, async (request) => {
        const user = request.user as User;
        
        // Get all vaults user has access to
        const vaults = await server.db.getUserVaults(user.id);
        return vaults.map(v => ({
            id: v.id,
            name: v.name,
            salt: v.master_password_salt,
            encryptedUserId: v.encrypted_user_id,
            role: v.role,
        }));
    });

    // Get vault's encrypted user ID for verification
    server.get<RouteGenericAccess>('/:id/verify', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            response: {
                200: Type.Object({
                    encryptedUserId: Type.String(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            const vault = await server.db.getVault(vaultId);
            if (!vault) {
                return reply.code(404).send({ error: 'Vault not found' });
            }

            return {
                encryptedUserId: vault.encrypted_user_id,
            };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Access vault passwords after client-side verification
    server.get<RouteGenericAccess>('/:id/passwords', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            response: {
                200: Type.Array(Type.Object({
                    id: Type.Number(),
                    encryptedData: Type.String(),
                    iv: Type.String(),
                })),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Get encrypted passwords
            const passwords = await server.db.getVaultPasswords(vaultId);
            return passwords.map(p => ({
                id: p.id,
                encryptedData: p.data.toString('hex'),
                iv: p.iv,
            }));
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Delete a password
    server.delete<RouteGenericDeletePassword>('/:id/passwords/:passwordId', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
                passwordId: Type.String(),
            }),
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const passwordId = Number(request.params.passwordId);
        const user = request.user as User;

        try {
            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Delete the password
            const success = await server.db.deletePassword(passwordId, vaultId);
            
            if (!success) {
                return reply.code(404).send({ error: 'Password not found' });
            }

            return { success: true };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Update master password and re-encrypted passwords
    server.post<RouteGenericUpdateMasterPassword>('/:id/update-master-password', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            body: Type.Object({
                encryptedUserId: Type.String(),
                passwords: Type.Array(Type.Object({
                    id: Type.Number(),
                    encryptedData: Type.String(),
                    iv: Type.String(),
                })),
            }),
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            await server.db.updateMasterPassword(vaultId, user.id, request.body);
            return { success: true };
        } catch (error) {
            server.log.error(error);
            if (error instanceof Error && error.message === 'Only the owner can update master password') {
                return reply.code(403).send({ error: error.message });
            }
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Update an existing password
    server.put<RouteGenericUpdatePassword>('/:id/passwords/:passwordId', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
                passwordId: Type.String(),
            }),
            body: Type.Object({
                encryptedData: Type.String(),
                iv: Type.String(),
            }),
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const passwordId = Number(request.params.passwordId);
        const { encryptedData, iv } = request.body;
        const user = request.user as User;

        try {
            // Validate input lengths
            if (!isValidLength(iv, MAX_STR_LENGTH)) {
                return reply.code(400).send({ error: 'IV too long' });
            }
            
            // Validate encrypted data size
            const dataSize = Buffer.from(encryptedData, 'hex').length;
            if (dataSize > MAX_DATA_SIZE) {
                return reply.code(400).send({ error: 'Encrypted data too large' });
            }

            // Verify vault access
            const access = await server.db.getVaultAccess(vaultId, user.id);
            if (!access) {
                return reply.code(403).send({ error: 'Access denied' });
            }

            // Check if password exists and belongs to this vault
            const passwords = await server.db.getVaultPasswords(vaultId);
            const passwordExists = passwords.some(p => p.id === passwordId);
            
            if (!passwordExists) {
                return reply.code(404).send({ error: 'Password not found' });
            }

            // Convert hex string to buffer asynchronously
            const data = await bufferFromAsync(encryptedData, 'hex');

            // Update the password
            await server.db.updatePassword(passwordId, vaultId, {
                data,
                iv,
            });

            return { success: true };
        } catch (error) {
            server.log.error(error);
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });

    // Delete a vault
    server.delete<RouteGenericAccess>('/:id', {
        schema: {
            security: [{ bearerAuth: [] }],
            params: Type.Object({
                id: Type.String(),
            }),
            response: {
                200: Type.Object({
                    success: Type.Boolean(),
                }),
            },
        },
    }, async (request, reply) => {
        const vaultId = Number(request.params.id);
        const user = request.user as User;

        try {
            // Delete the vault (the database method checks ownership)
            const success = await server.db.deleteVault(vaultId, user.id);
            
            if (!success) {
                return reply.code(404).send({ error: 'Vault not found' });
            }

            return { success: true };
        } catch (error) {
            server.log.error(error);
            if (error instanceof Error && error.message === 'Only the owner can delete a vault') {
                return reply.code(403).send({ error: error.message });
            }
            return reply.code(500).send({ error: 'Internal Server Error' });
        }
    });
}
