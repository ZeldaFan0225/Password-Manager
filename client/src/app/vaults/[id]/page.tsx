'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import crypto from 'crypto';
import PasswordInput from '@/components/PasswordInput';
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

interface ChangePasswordFormData {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}

export default function VaultPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();

    // State hooks
    const [masterKey, setMasterKey] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [vault, setVault] = useState<Vault | null>(null);
    const [passwords, setPasswords] = useState<EncryptedPassword[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPassword, setSelectedPassword] = useState<number | null>(null);
    const [decryptedData, setDecryptedData] = useState<{ [id: number]: DecryptedPassword }>({});
    const [selectedDecryptedData, setSelectedDecryptedData] = useState<DecryptedPassword | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');
    // Store the encryption key in memory only
    const [encryptionKey, setEncryptionKey] = useState<Buffer | null>(null);
    // Auto-lock settings
    const [autoLockTimeout, setAutoLockTimeout] = useState(5); // Default 5 minutes
    const [autoLockProgress, setAutoLockProgress] = useState(100); // Progress percentage
    const autoLockTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [changePasswordFormData, setChangePasswordFormData] = useState<ChangePasswordFormData>({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    // Form references
    const changePasswordFormRef = useRef<HTMLFormElement>(null);

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

    function encryptUserId(userId: string, key: Buffer): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(userId);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
    }

    // Cleanup function for globe icons
    const cleanupGlobeIcons = () => {
        // Find all containers that might have globe icons
        const containers = document.querySelectorAll('.w-4.h-4.flex-shrink-0');
        containers.forEach(container => {
            const globeIcons = container.querySelectorAll('img[src="/globe.svg"]');
            globeIcons.forEach(icon => icon.remove());
        });
    };

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
            // Clean up any existing globe icons before switching passwords
            cleanupGlobeIcons();

            if (!encryptionKey) {
                throw new Error('Encryption key not available');
            }

            // Clear any previous errors
            setError('');

            const iv = Buffer.from(password.iv, 'hex');
            const encryptedData = Buffer.from(password.encryptedData, 'hex');
            
            try {
                const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
                let decrypted = decipher.update(encryptedData);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                
                const data: DecryptedPassword = JSON.parse(decrypted.toString());
                const newData = { ...data, id: password.id };
                
                // Update the state only after successful decryption
                setDecryptedData(prev => ({ ...prev, [password.id]: newData }));
                setSelectedDecryptedData(newData);
                setSelectedPassword(password.id);
            } catch (decryptErr) {
                console.error('Decryption failed:', decryptErr);
                throw new Error(`Could not decrypt password. The encryption key may have changed.`);
            }
        } catch (err) {
            console.error('Failed to decrypt password:', err);
            setError(err instanceof Error ? err.message : 'Failed to decrypt password');
            
            // Clear the selected password when decryption fails
            setSelectedPassword(null);
            setSelectedDecryptedData(null);
        }
    }, [encryptionKey]);

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

    const handleLockVault = useCallback(() => {
        // Clear sensitive data from memory
        setEncryptionKey(null);
        setDecryptedData({});
        setSelectedDecryptedData(null);
        setSelectedPassword(null);
        setPasswords([]);
        setIsUnlocking(true);
        setError('');
    }, []);

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
            if (!encryptionKey) {
                throw new Error('Encryption key not available');
            }

            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
            
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
                const newPasswords = await passwordsResponse.json();
                setPasswords(newPasswords);

                // Update the decrypted data with the newly saved password
                const decryptedPasswords: { [id: number]: DecryptedPassword } = {};
                
                for (const password of newPasswords) {
                    try {
                        const iv = Buffer.from(password.iv, 'hex');
                        const encryptedData = Buffer.from(password.encryptedData, 'hex');
                        
                        const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
                        let decrypted = decipher.update(encryptedData);
                        decrypted = Buffer.concat([decrypted, decipher.final()]);
                        
                        const passwordData: DecryptedPassword = JSON.parse(decrypted.toString());
                        decryptedPasswords[password.id] = { ...passwordData, id: password.id };
                    } catch (err) {
                        console.error('Failed to decrypt password:', err);
                    }
                }
                setDecryptedData(decryptedPasswords);
                
                // If we were editing, select the updated password
                if (isEditing && data.id) {
                    // Find the updated password in the new passwords list
                    const updatedPassword = newPasswords.find((p: any) => p.id === data.id);
                    if (updatedPassword) {
                        decryptPassword(updatedPassword);
                    }
                }
                
                setIsCreating(false);
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Failed to save password:', err);
            setError('Failed to save password');
        }
    }, [id, isEditing, decryptPassword, encryptionKey]);

    const handleChangeMasterPassword = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!vault) return;

        const { currentPassword, newPassword, confirmPassword } = changePasswordFormData;

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        setIsProcessing(true);
        setError('');
        setProgress('');

        try {
            // 1. Verify current password
            setProgress('Verifying current password...');
            const currentKey = deriveKey(currentPassword, vault.salt);
            const token = localStorage.getItem('token');
            
            const userResponse = await fetch(`${getApiBaseUrl()}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!userResponse.ok) {
                throw new Error('Failed to get user ID');
            }

            const userData = await userResponse.json();
            if (!verifyEncryptedUserId(vault.encryptedUserId, userData.id.toString(), currentKey)) {
                throw new Error('Current password is incorrect');
            }

            // 2. Generate new key
            setProgress('Generating new encryption key...');
            const newKey = deriveKey(newPassword, vault.salt);

            // 3. Re-encrypt userId
            setProgress('Re-encrypting vault data...');
            const newEncryptedUserId = encryptUserId(userData.id.toString(), newKey);

            // 4. Re-encrypt all passwords
            const updatedPasswords = await Promise.all(passwords.map(async (password) => {
                // Decrypt with old key
                const iv = Buffer.from(password.iv, 'hex');
                const encryptedData = Buffer.from(password.encryptedData, 'hex');
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', currentKey, iv);
                let decrypted = decipher.update(encryptedData);
                decrypted = Buffer.concat([decrypted, decipher.final()]);

                // Re-encrypt with new key
                const newIv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', newKey, newIv);
                let reEncrypted = cipher.update(decrypted);
                reEncrypted = Buffer.concat([reEncrypted, cipher.final()]);

                return {
                    id: password.id,
                    encryptedData: reEncrypted.toString('hex'),
                    iv: newIv.toString('hex'),
                };
            }));

            // 5. Save all changes
            setProgress('Saving changes...');
            
            // Update vault and passwords in a single request
            const response = await fetch(`${getApiBaseUrl()}/vaults/${id}/update-master-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    encryptedUserId: newEncryptedUserId,
                    passwords: updatedPasswords,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to update master password');
            }

            // 6. Update state with new data
            setPasswords(updatedPasswords);
            setEncryptionKey(newKey);
            
            // Re-decrypt all passwords with new key
            const decryptedPasswords: { [id: number]: DecryptedPassword } = {};
            let selectedDecryptedPassword: DecryptedPassword | null = null;
            
            for (const password of updatedPasswords) {
                try {
                    const iv = Buffer.from(password.iv, 'hex');
                    const encryptedData = Buffer.from(password.encryptedData, 'hex');
                    
                    const decipher = crypto.createDecipheriv('aes-256-cbc', newKey, iv);
                    let decrypted = decipher.update(encryptedData);
                    decrypted = Buffer.concat([decrypted, decipher.final()]);
                    
                    const passwordData: DecryptedPassword = JSON.parse(decrypted.toString());
                    const newData = { ...passwordData, id: password.id };
                    decryptedPasswords[password.id] = newData;
                    
                    // Update selected password if it matches
                    if (selectedPassword === password.id) {
                        selectedDecryptedPassword = newData;
                    }
                } catch (err) {
                    console.error('Failed to decrypt password:', err);
                }
            }
            
            setDecryptedData(decryptedPasswords);
            setSelectedDecryptedData(selectedDecryptedPassword);

            // 7. Reset form and close modal
            setChangePasswordFormData({
                currentPassword: '',
                newPassword: '',
                confirmPassword: '',
            });
            setIsChangingPassword(false);

            // Clear the form
            if (changePasswordFormRef.current) {
                changePasswordFormRef.current.reset();
            }

        } catch (err) {
            console.error('Failed to change master password:', err);
            setError(err instanceof Error ? err.message : 'Failed to change master password');
        } finally {
            setIsProcessing(false);
            setProgress('');
        }
    }, [vault, id, passwords, changePasswordFormData]);

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

            // Store the encryption key in memory
            setEncryptionKey(derivedKey);

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

        await new Promise<void>((resolve) => setTimeout(resolve, 100)); // allow page to display "Unlocking..." message

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

    // Auto-lock timer setup
    const setupAutoLockTimer = useCallback(() => {
        // Clear any existing timer
        if (autoLockTimerRef.current) {
            clearTimeout(autoLockTimerRef.current);
        }
        
        // Set a new timer
        autoLockTimerRef.current = setTimeout(() => {
            if (!isUnlocking) {
                handleLockVault();
            }
        }, autoLockTimeout * 60 * 1000); // Convert minutes to milliseconds
    }, [autoLockTimeout, isUnlocking, handleLockVault]);
    
    // Reset timer on user activity
    const resetAutoLockTimer = useCallback(() => {
        setupAutoLockTimer();
        setAutoLockProgress(100); // Reset progress bar on user activity
    }, [setupAutoLockTimer]);
    
    // Effect to update progress countdown
    useEffect(() => {
        if (!isUnlocking && encryptionKey) {
            const interval = setInterval(() => {
                setAutoLockProgress(prev => {
                    // Calculate new progress based on auto lock timeout
                    const decrement = 100 / (autoLockTimeout * 60); // Convert minutes to seconds
                    return Math.max(0, prev - decrement);
                });
            }, 1000); // Update every second

            return () => clearInterval(interval);
        }
    }, [isUnlocking, encryptionKey, autoLockTimeout]);

    // Effect hooks
    useEffect(() => {
        if (!vault && !isProcessing) {
            loadVault();
        }
    }, [vault, isProcessing, loadVault]);
    
    // Set up auto-lock timer when vault is unlocked
    useEffect(() => {
        if (!isUnlocking && encryptionKey) {
        setupAutoLockTimer();
        setAutoLockProgress(100); // Reset progress on user activity
            
            // Set up event listeners for user activity
            const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
            const handleUserActivity = () => resetAutoLockTimer();
            
            activityEvents.forEach(event => {
                window.addEventListener(event, handleUserActivity);
            });
            
            return () => {
                // Clean up event listeners and timer
                activityEvents.forEach(event => {
                    window.removeEventListener(event, handleUserActivity);
                });
                
                if (autoLockTimerRef.current) {
                    clearTimeout(autoLockTimerRef.current);
                }
            };
        }
    }, [isUnlocking, encryptionKey, setupAutoLockTimer, resetAutoLockTimer]);

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
                                <PasswordInput
                                    value={masterKey}
                                    onChange={(e) => setMasterKey(e.target.value)}
                                    className="mb-3"
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
                                onClick={() => setIsSettingsOpen(true)}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                            >
                                Settings
                            </button>
                            <div className="relative">
                                <button
                                    onClick={handleLockVault}
                                    className="relative inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-yellow-600 z-0"></div>
                                    <div 
                                        className="absolute inset-0 bg-yellow-700 transition-all duration-1000 ease-linear origin-right z-1"
                                        style={{ transform: `scaleX(${1 - autoLockProgress / 100})`, transformOrigin: 'right' }}
                                    ></div>
                                    <span className="relative z-2">
                                        Lock Vault ({Math.ceil((autoLockProgress / 100) * autoLockTimeout)}m)
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    {error && (
                        <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                            {error}
                        </div>
                    )}

                    {/* Settings Modal */}
                    {isSettingsOpen && (
                        <div className="fixed inset-0 backdrop-blur-sm bg-gray-500/50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-semibold text-gray-900">Vault Settings</h2>
                                    <button 
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="text-gray-400 hover:text-gray-500"
                                    >
                                        <span className="sr-only">Close</span>
                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                
                                <div className="space-y-6">
                                    <div className="divide-y divide-gray-200">
                                        {/* Auto-lock settings */}
                                        <div className="py-4">
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">Auto-Lock</h3>
                                            <div className="flex items-center">
                                                <label className="mr-3 text-sm text-gray-700">Lock vault after</label>
                                                <select 
                                                    value={autoLockTimeout}
                                                    onChange={(e) => setAutoLockTimeout(parseInt(e.target.value))}
                                                    className="block w-24 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-gray-900"
                                                >
                                                    <option value={1}>1 min</option>
                                                    <option value={5}>5 min</option>
                                                    <option value={15}>15 min</option>
                                                    <option value={30}>30 min</option>
                                                    <option value={60}>1 hour</option>
                                                </select>
                                                <span className="ml-3 text-sm text-gray-700">of inactivity</span>
                                            </div>
                                        </div>
                                        
                                        {/* Master password */}
                                        <div className="py-4">
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">Master Password</h3>
                                            <p className="text-sm text-gray-500 mb-3">
                                                Change the master password used to encrypt your vault data.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setIsSettingsOpen(false);
                                                    setIsChangingPassword(true);
                                                }}
                                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                                            >
                                                Change Master Password
                                            </button>
                                        </div>
                                        
                                        {/* Export vault */}
                                        <div className="py-4">
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">Export Vault</h3>
                                            <p className="text-sm text-gray-500 mb-3">
                                                Export your vault data as a decrypted JSON file.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    if (!encryptionKey || !vault) return;
                                                    
                                                    // Create export data with decrypted passwords
                                                    const exportData = {
                                                        vault: {
                                                            name: vault.name
                                                        },
                                                        passwords: Object.values(decryptedData)
                                                    };
                                                    
                                                    // Create download link
                                                    const dataStr = JSON.stringify(exportData, null, 2);
                                                    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
                                                    
                                                    const exportFileDefaultName = `${vault.name}-export.json`;
                                                    
                                                    const linkElement = document.createElement('a');
                                                    linkElement.setAttribute('href', dataUri);
                                                    linkElement.setAttribute('download', exportFileDefaultName);
                                                    linkElement.click();
                                                }}
                                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                                                disabled={!encryptionKey}
                                            >
                                                Export Vault
                                            </button>
                                        </div>

                                        {/* Delete vault */}
                                        <div className="py-4">
                                            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Vault</h3>
                                            <p className="text-sm text-gray-500 mb-3">
                                                Permanently delete this vault and all its passwords. This action cannot be undone.
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setIsSettingsOpen(false);
                                                    handleDeleteVault();
                                                }}
                                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                                            >
                                                Delete Vault
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Change Password Modal */}
                    {isChangingPassword && (
                        <div className="fixed inset-0 backdrop-blur-sm bg-gray-500/50 flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                                <h2 className="text-xl font-semibold mb-4 text-gray-900">Change Master Password</h2>
                                <form ref={changePasswordFormRef} onSubmit={handleChangeMasterPassword}>
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
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">
                                                Current Password
                                            </label>
                                            <PasswordInput
                                                value={changePasswordFormData.currentPassword}
                                                onChange={(e) => setChangePasswordFormData(prev => ({
                                                    ...prev,
                                                    currentPassword: e.target.value
                                                }))}
                                                required
                                                disabled={isProcessing}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">
                                                New Password
                                            </label>
                                            <PasswordInput
                                                value={changePasswordFormData.newPassword}
                                                onChange={(e) => setChangePasswordFormData(prev => ({
                                                    ...prev,
                                                    newPassword: e.target.value
                                                }))}
                                                required
                                                disabled={isProcessing}
                                                className="mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">
                                                Confirm New Password
                                            </label>
                                            <PasswordInput
                                                value={changePasswordFormData.confirmPassword}
                                                onChange={(e) => setChangePasswordFormData(prev => ({
                                                    ...prev,
                                                    confirmPassword: e.target.value
                                                }))}
                                                required
                                                disabled={isProcessing}
                                                className="mt-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-end space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsChangingPassword(false);
                                                setChangePasswordFormData({
                                                    currentPassword: '',
                                                    newPassword: '',
                                                    confirmPassword: '',
                                                });
                                                setError('');
                                            }}
                                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                            disabled={isProcessing}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                            disabled={isProcessing}
                                        >
                                            {isProcessing ? (
                                                <div className="flex items-center">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                                    Updating...
                                                </div>
                                            ) : (
                                                'Update Password'
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    <div className="flex bg-white shadow-sm rounded-lg overflow-hidden">
                        {/* Password List - 1/3 width */}
                        <div className="w-1/4 border-r border-gray-200">
                            <div className="px-4 py-5">
                                <h2 className="text-lg font-medium text-gray-900">Passwords</h2>
                                <div className="mt-2">
                                    <div className="relative rounded-md shadow-sm">
                                        <input
                                            type="text"
                                            placeholder="Search passwords..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="block w-full border border-gray-300 rounded-md py-2 pl-3 pr-10 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                        />
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <ul className="divide-y divide-gray-200 max-h-[calc(100vh-16rem)] overflow-y-auto">
                                {passwords.filter(password => {
                                    if (!searchQuery) return true;
                                    const query = searchQuery.toLowerCase();
                                    const data = decryptedData[password.id];
                                    if (!data) return false;
                                    
                                    // Search in title, username, notes
                                    return (
                                        (data.siteMeta?.title || '').toLowerCase().includes(query) ||
                                        (data.username || '').toLowerCase().includes(query) ||
                                        (data.notes || '').toLowerCase().includes(query)
                                    );
                                }).map((password) => (
                                    <li 
                                        key={password.id}
                                        className={`px-6 py-4 cursor-pointer hover:bg-gray-50 ${
                                            selectedPassword === password.id ? 'bg-indigo-50' : ''
                                        }`}
                                        onClick={() => {
                                            // Clean up any existing globe icons before decrypting
                                            cleanupGlobeIcons();
                                            decryptPassword(password);
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-grow min-w-0">
                                                {decryptedData[password.id] ? (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-4 h-4 flex-shrink-0">
                                                                {decryptedData[password.id]?.siteMeta?.iconPath ? (
                                                                    <img 
                                                                        src={`${getApiBaseUrl()}${decryptedData[password.id]?.siteMeta?.iconPath}`}
                                                                        alt=""
                                                                        className="w-4 h-4"
                                                                        onLoad={(e) => {
                                                                            // Remove any existing globe icons when the actual icon loads
                                                                            const parent = e.currentTarget.parentNode;
                                                                            if (parent) {
                                                                                const existingGlobeIcons = parent.querySelectorAll('img[src="/globe.svg"]');
                                                                                existingGlobeIcons.forEach(icon => icon.remove());
                                                                            }
                                                                            e.currentTarget.style.display = 'block';
                                                                        }}
                                                                        onError={(e) => {
                                                                            // Remove any existing globe icons
                                                                            const parent = e.currentTarget.parentNode;
                                                                            if (parent) {
                                                                                const existingGlobeIcons = parent.querySelectorAll('img[src="/globe.svg"]');
                                                                                existingGlobeIcons.forEach(icon => icon.remove());
                                                                            }
                                                                            e.currentTarget.style.display = 'none';
                                                                            // Add new globe icon
                                                                            const globeIcon = document.createElement('img');
                                                                            globeIcon.src = '/globe.svg';
                                                                            globeIcon.className = 'w-4 h-4';
                                                                            parent?.appendChild(globeIcon);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <img 
                                                                        src="/globe.svg" 
                                                                        alt="" 
                                                                        className="w-4 h-4"
                                                                    />
                                                                )}
                                                            </div>
                                                            <span className="font-medium truncate text-gray-900">
                                                                {decryptedData[password.id]?.siteMeta?.title || "Unknown website"}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm text-gray-600 truncate pl-6">
                                                            {decryptedData[password.id]?.username}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <div className="animate-pulse flex space-x-2 items-center w-full">
                                                            <div className="rounded-full bg-gray-200 h-4 w-4"></div>
                                                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                                        </div>
                                                    </div>
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
