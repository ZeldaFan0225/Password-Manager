'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import crypto from 'crypto';
import PasswordForm, { DecryptedPassword } from '@/components/PasswordForm';
import PasswordView from '@/components/PasswordView';
import { resolve } from 'path';

interface EncryptedPassword {
    id: number;
    encryptedData: string;
    iv: string;
}

interface Vault {
    id: number;
    name: string;
    salt: string;
    encryptedUserId: string;
}

export default function VaultPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    // State hooks
    const [masterKey, setMasterKey] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [vault, setVault] = useState<Vault | null>(null);
    const [passwords, setPasswords] = useState<EncryptedPassword[]>([]);
    const [selectedPassword, setSelectedPassword] = useState<number | null>(null);
    const [decryptedData, setDecryptedData] = useState<{ [id: number]: DecryptedPassword }>({});
    const [selectedDecryptedData, setSelectedDecryptedData] = useState<DecryptedPassword | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');

    // Utility functions
    function deriveKey(password: string, salt: string): Buffer {
        setProgress('Deriving encryption key...');
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    }

    function verifyEncryptedUserId(encryptedUserId: string, userId: string, key: Buffer): boolean {
        try {
            setProgress('Verifying master key...');
            const [ivHex, encryptedHex] = encryptedUserId.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            const encrypted = Buffer.from(encryptedHex, 'hex');
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            return decrypted.toString('utf8') === userId;
        } catch (err) {
            console.error('Error verifying user ID:', err);
            return false;
        }
    }

    // Callback hooks
    const loadVault = useCallback(async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        setProgress('Loading vault data...');
        try {
            const response = await fetch(`${getApiBaseUrl()}/vaults/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    router.push('/vaults');
                    return;
                }
                throw new Error('Failed to load vault');
            }

            const data = await response.json();
            setVault(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load vault');
        } finally {
            setProgress('');
        }
    }, [id, router]);

    const decryptPassword = useCallback(async (password: EncryptedPassword) => {
        try {
            const key = Buffer.from(sessionStorage.getItem(`vault_${id}_key`) || '', 'hex');
            const iv = Buffer.from(password.iv, 'hex');
            const encryptedData = Buffer.from(password.encryptedData, 'hex');
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encryptedData);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            const data: DecryptedPassword = JSON.parse(decrypted.toString());
            const newData = { ...data, id: password.id };
            setDecryptedData(prev => ({ ...prev, [password.id]: newData }));
            setSelectedDecryptedData(newData);
            setSelectedPassword(password.id);
        } catch (err) {
            console.error('Failed to decrypt password:', err);
            setError('Failed to decrypt password');
        }
    }, [id]);

    const handleDeletePassword = useCallback(async (passwordId: number) => {
        if (!confirm('Are you sure you want to delete this password?')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiBaseUrl()}/vaults/${id}/passwords/${passwordId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to delete password');
            }

            // Remove from state
            setPasswords(prev => prev.filter(p => p.id !== passwordId));
            setDecryptedData(prev => {
                const newData = { ...prev };
                delete newData[passwordId];
                return newData;
            });
            setSelectedPassword(null);
            setSelectedDecryptedData(null);
        } catch (err) {
            console.error('Failed to delete password:', err);
            setError('Failed to delete password');
        }
    }, [id]);

    const handleDeleteVault = useCallback(async () => {
        if (!confirm('Are you sure you want to delete this vault? This action cannot be undone.')) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${getApiBaseUrl()}/vaults/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to delete vault');
            }

            // Redirect to vaults page
            router.push('/vaults');
        } catch (err) {
            console.error('Failed to delete vault:', err);
            setError('Failed to delete vault');
        }
    }, [id, router]);

    const handleSavePassword = useCallback(async (data: DecryptedPassword) => {
        try {
            const key = Buffer.from(sessionStorage.getItem(`vault_${id}_key`) || '', 'hex');
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            
            let encrypted = cipher.update(JSON.stringify(data));
            encrypted = Buffer.concat([encrypted, cipher.final()]);

            const token = localStorage.getItem('token');
            const endpoint = data.id 
                ? `${getApiBaseUrl()}/vaults/${id}/passwords/${data.id}`
                : `${getApiBaseUrl()}/vaults/${id}/passwords`;
            
            const response = await fetch(endpoint, {
                method: data.id ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    encryptedData: encrypted.toString('hex'),
                    iv: iv.toString('hex'),
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save password');
            }

            // Refresh password list
            const passwordsResponse = await fetch(`${getApiBaseUrl()}/vaults/${id}/passwords`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (passwordsResponse.ok) {
                const passwords = await passwordsResponse.json();
                setPasswords(passwords);
            }

            setIsCreating(false);
            setIsEditing(false);
            setSelectedPassword(null);
            setSelectedDecryptedData(null);
            setDecryptedData({});
        } catch (err) {
            console.error('Failed to save password:', err);
            setError('Failed to save password');
        }
    }, [id]);

    const verifyAndLoadPasswords = useCallback(async (derivedKey: Buffer) => {
        const token = localStorage.getItem('token');
        if (!token || !vault) return false;

        try {
            // Get user ID from auth endpoint
            setProgress('Getting user ID...');
            const userResponse = await fetch(`${getApiBaseUrl()}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!userResponse.ok) {
                throw new Error('Failed to get user ID');
            }

            const userData = await userResponse.json();
            if (!verifyEncryptedUserId(vault.encryptedUserId, userData.id.toString(), derivedKey)) {
                throw new Error('Invalid master password');
            }

            // Load passwords
            setProgress('Loading passwords...');
            const response = await fetch(`${getApiBaseUrl()}/vaults/${id}/passwords`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load passwords');
            }

            const data = await response.json();
            setPasswords(data);
            setIsUnlocking(false);

            // Store the encryption key for password operations
            sessionStorage.setItem(`vault_${id}_key`, derivedKey.toString('hex'));

            // Decrypt all passwords immediately
            const decryptedPasswords: { [id: number]: DecryptedPassword } = {};
            for (const password of data) {
                try {
                    const iv = Buffer.from(password.iv, 'hex');
                    const encryptedData = Buffer.from(password.encryptedData, 'hex');
                    
                    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
                    let decrypted = decipher.update(encryptedData);
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    
                    const passwordData: DecryptedPassword = JSON.parse(decrypted.toString());
                    decryptedPasswords[password.id] = { ...passwordData, id: password.id };
                } catch (err) {
                    console.error('Failed to decrypt password:', err);
                }
            }
            setDecryptedData(decryptedPasswords);

            return true;
        } catch (err) {
            throw err;
        }
    }, [vault, id]);

    const handleUnlock = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!vault) return;

        setIsProcessing(true);
        setError('');
        setProgress('');

        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100)); // allow page to display "Unlocking..." message

        try {
            // Derive key and verify
            const key = deriveKey(masterKey, vault.salt);
            await verifyAndLoadPasswords(key);
            setMasterKey(''); // Clear from memory
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to unlock vault');
        } finally {
            setIsProcessing(false);
            setProgress('');
        }
    }, [vault, verifyAndLoadPasswords, masterKey, router]);

    // Effect hooks
    useEffect(() => {
        if (!vault && !isProcessing) {
            loadVault();
        }
    }, [vault, isProcessing, loadVault]);

    if (isUnlocking) {
        return (
            <div className="min-h-screen bg-gray-100 py-12">
                <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="px-6 py-8">
                        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Unlock Vault</h2>
                        {vault && (
                            <p className="text-gray-900 text-center mb-6">{vault.name}</p>
                        )}
                        {progress && (
                            <div className="mb-4 text-sm text-indigo-600 bg-indigo-50 p-3 rounded flex items-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 mr-2"></div>
                                {progress}
                            </div>
                        )}
                        {error && (
                            <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                                {error}
                            </div>
                        )}
                        <form onSubmit={handleUnlock}>
                            <div className="mb-6">
                                <label className="block text-gray-900 text-sm font-bold mb-2">
                                    Master Password
                                </label>
                                <input
                                    type="password"
                                    value={masterKey}
                                    onChange={(e) => setMasterKey(e.target.value)}
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-900 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                                    required
                                    disabled={isProcessing}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isProcessing || !vault}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                        Unlocking...
                                    </>
                                ) : (
                                    'Unlock'
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-64px)] bg-gray-100">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {vault?.name}
                            </h1>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    setIsCreating(true);
                                    setIsEditing(false);
                                    setSelectedPassword(null);
                                    setSelectedDecryptedData(null);
                                }}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                            >
                                Add Password
                            </button>
                            <button
                                onClick={handleDeleteVault}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                            >
                                Delete Vault
                            </button>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                            {error}
                        </div>
                    )}

                    <div className="flex bg-white shadow-sm rounded-lg overflow-hidden">
                        {/* Password List - 1/3 width */}
                        <div className="w-1/4 border-r border-gray-200">
                            <div className="px-4 py-5">
                                <h2 className="text-lg font-medium text-gray-900">Passwords</h2>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-[calc(100vh-12rem)] overflow-y-auto">
                                {passwords.map((password) => (
                                    <li 
                                        key={password.id}
                                        className={`px-6 py-4 cursor-pointer hover:bg-gray-50 ${
                                            selectedPassword === password.id ? 'bg-indigo-50' : ''
                                        }`}
                                        onClick={() => decryptPassword(password)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-grow min-w-0">
                                                {decryptedData[password.id] ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            {decryptedData[password.id]?.siteMeta?.iconPath ? (
                                                                <img 
                                                                    src={`${getApiBaseUrl()}${decryptedData[password.id]?.siteMeta?.iconPath}`}
                                                                    alt=""
                                                                    className="w-4 h-4 flex-shrink-0"
                                                                    onError={(e) => {
                                                                        e.currentTarget.style.display = 'none';
                                                                        // Try to show the default globe icon
                                                                        const globeIcon = document.createElement('img');
                                                                        globeIcon.src = '/globe.svg';
                                                                        globeIcon.className = 'w-4 h-4 flex-shrink-0';
                                                                        e.currentTarget.parentNode?.insertBefore(globeIcon, e.currentTarget);
                                                                    }}
                                                                />
                                                            ) : (
                                                                <img 
                                                                    src="/globe.svg" 
                                                                    alt="" 
                                                                    className="w-4 h-4 flex-shrink-0"
                                                                />
                                                            )}
                                                            <span className="font-medium truncate text-gray-900">
                                                                {decryptedData[password.id]?.siteMeta?.title || "Unknown website"}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-gray-600 truncate pl-6">
                                                            {decryptedData[password.id]?.username}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    `Password ${password.id}`
                                                )}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {passwords.length === 0 && (
                                <div className="text-center py-12">
                                    <h3 className="text-lg font-medium text-gray-900">No passwords yet</h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Add your first password to get started
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Password Details/Form - 2/3 width */}
                        <div className="w-3/4">
                            <div className="px-6 py-5">
                                <h2 className="text-lg font-medium text-gray-900">
                                    {isCreating ? 'New Password' : 
                                     selectedPassword ? (isEditing ? 'Edit Password' : 'Password Details') : 
                                     'Select a password'}
                                </h2>
                            </div>
                            <div className="px-6 py-5">
                                {isCreating || isEditing ? (
                                    <PasswordForm
                                        initialData={selectedDecryptedData || undefined}
                                        onSave={handleSavePassword}
                                        onCancel={() => {
                                            setIsCreating(false);
                                            setIsEditing(false);
                                            if (!selectedDecryptedData) {
                                                setSelectedPassword(null);
                                            }
                                        }}
                                    />
                                ) : selectedDecryptedData ? (
                                    <PasswordView
                                        data={selectedDecryptedData}
                                        onEdit={() => setIsEditing(true)}
                                        onDelete={() => handleDeletePassword(selectedDecryptedData.id!)}
                                    />
                                ) : (
                                    <div className="text-center py-12 text-gray-900">
                                        {passwords.length > 0 
                                            ? 'Select a password to view its details'
                                            : 'Add your first password to get started'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
