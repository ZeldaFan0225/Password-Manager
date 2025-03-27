'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import crypto from 'crypto';
import PasswordInput from '@/components/PasswordInput';
import Modal from '@/components/Modal';

interface Vault {
    id: number;
    name: string;
    salt: string;
    role: 'OWNER' | 'MEMBER';
}

interface CreateVaultModal {
    isOpen: boolean;
    name: string;
    masterPassword: string;
    isCreating: boolean;
}

export default function VaultsPage() {
    const [vaults, setVaults] = useState<Vault[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [progress, setProgress] = useState<string>('');
    const router = useRouter();

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        fetchVaults(token);
    }, [router]);

    async function fetchVaults(token: string) {
        try {
            const response = await fetch(`${getApiBaseUrl()}/vaults`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('token');
                    router.push('/login');
                    return;
                }
                throw new Error('Failed to fetch vaults');
            }

            const data = await response.json();
            setVaults(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch vaults');
        } finally {
            setLoading(false);
        }
    }

    const [modal, setModal] = useState<CreateVaultModal>({
        isOpen: false,
        name: '',
        masterPassword: '',
        isCreating: false
    });

    function deriveKey(password: string, salt: string): Buffer {
        setProgress('Deriving encryption key...');
        return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha512');
    }

    function encryptUserId(userId: string, key: Buffer): string {
        setProgress('Encrypting verification data...');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(userId, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        console.log(iv.toString('hex') + ':' + encrypted);
        return iv.toString('hex') + ':' + encrypted;
    }

    function handleCreateVault() {
        setModal(prev => ({ ...prev, isOpen: true }));
    }

    function handleCloseModal() {
        setModal({ isOpen: false, name: '', masterPassword: '', isCreating: false });
        setProgress('');
        setError('');
    }

    async function handleSubmitVault(e: React.FormEvent) {
        e.preventDefault();
        setModal(prev => ({ ...prev, isCreating: true }));
        setError('');

        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        try {
            setProgress('Generating salt...');
            // Generate client-side salt for master password
            const salt = crypto.randomBytes(16).toString('hex');
            await new Promise(resolve => setTimeout(resolve, 100)); // allow updating
            const key = deriveKey(modal.masterPassword, salt);

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
            const encryptedUserId = encryptUserId(userData.id.toString(), key);

            setProgress('Creating vault...');
            const response = await fetch(`${getApiBaseUrl()}/vaults`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: modal.name,
                    salt,
                    encryptedUserId,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to create vault');
            }

            const newVault = await response.json();
            setVaults(prevVaults => [...prevVaults, newVault]);

            setProgress('Storing encryption data...');
            // Reset modal and redirect to new vault
            handleCloseModal();
            //router.push(`/vaults/${newVault.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create vault');
        } finally {
            setModal(prev => ({ ...prev, isCreating: false }));
            setProgress('');
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">Your Vaults</h1>
                        <button
                            onClick={handleCreateVault}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Create New Vault
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-md bg-red-50 p-4 mb-6">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}

                    {modal.isOpen && (
                        <Modal
                            isOpen={modal.isOpen}
                            onClose={handleCloseModal}
                            title="Create New Vault"
                        >
                                {progress && (
                                    <div className="mb-4 text-sm text-indigo-600 bg-indigo-50 p-3 rounded flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 mr-2"></div>
                                        {progress}
                                    </div>
                                )}
                                {error && (
                                    <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">
                                        {error}
                                    </div>
                                )}
                                <form onSubmit={handleSubmitVault}>
                                    <div className="mb-4">
                                        <label className="block text-gray-700 text-sm font-bold mb-2">
                                            Vault Name
                                        </label>
                                        <input
                                            type="text"
                                            value={modal.name}
                                            onChange={(e) => setModal({ ...modal, name: e.target.value })}
                                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                            placeholder="My Vault"
                                            required
                                            disabled={modal.isCreating}
                                        />
                                    </div>
                                    <div className="mb-6">
                                        <label className="block text-gray-700 text-sm font-bold mb-2">
                                            Master Password
                                        </label>
                                        <PasswordInput
                                            value={modal.masterPassword}
                                            onChange={(e) => setModal({ ...modal, masterPassword: e.target.value })}
                                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                                            required
                                            disabled={modal.isCreating}
                                            />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            onClick={handleCloseModal}
                                            disabled={modal.isCreating}
                                            className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={modal.isCreating}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                                        >
                                            {modal.isCreating ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                                    Creating...
                                                </>
                                            ) : (
                                                'Create Vault'
                                            )}
                                        </button>
                                    </div>
                                </form>
                        </Modal>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {vaults.map((vault) => (
                            <div
                                key={vault.id}
                                className="bg-white overflow-hidden shadow rounded-lg"
                            >
                                <div className="px-4 py-5 sm:p-6">
                                    <h3 className="text-lg font-medium text-gray-900">
                                        {vault.name}
                                    </h3>
                                    <p className="mt-1 text-sm text-gray-500">
                                        Role: {vault.role}
                                    </p>
                                </div>
                                <div className="bg-gray-50 px-4 py-4 sm:px-6">
                                    <button
                                        onClick={() => router.push(`/vaults/${vault.id}`)}
                                        className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                                    >
                                        View Passwords →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {vaults.length === 0 && !error && (
                        <div className="text-center py-12">
                            <h3 className="text-lg font-medium text-gray-900">No vaults yet</h3>
                            <p className="mt-1 text-sm text-gray-500">
                                Get started by creating your first vault
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
