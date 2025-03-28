'use client';

import { use, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import crypto from 'crypto';
import PasswordInput from '@/components/PasswordInput';
import { DecryptedPassword } from '@/components/PasswordForm';
import PasswordList from '@/components/vault/PasswordList';
import PasswordSection from '@/components/vault/PasswordSection';
import VaultSettings from '@/components/vault/VaultSettings';
import ChangePasswordModal from '@/components/vault/ChangePasswordModal';
import UnlockVaultModal from '@/components/vault/UnlockVaultModal';

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
    const [vault, setVault] = useState<Vault | null>(null);
    const [passwords, setPasswords] = useState<EncryptedPassword[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [selectedPassword, setSelectedPassword] = useState<number | null>(null);
    const [decryptedData, setDecryptedData] = useState<{ [id: number]: DecryptedPassword }>({});
    const [selectedDecryptedData, setSelectedDecryptedData] = useState<DecryptedPassword | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');
    // Store the encryption key in memory only
    const [encryptionKey, setEncryptionKey] = useState<Buffer | null>(null);
    const [changePasswordFormData, setChangePasswordFormData] = useState<ChangePasswordFormData>({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

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
            
            try {
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
                return decrypted.toString('utf8') === userId;
            } catch (err) {
                // Silently return false for decryption failures
                return false;
            }
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
            if (!encryptionKey) {
                throw new Error('Encryption key not available');
            }

            setError('');

            const iv = Buffer.from(password.iv, 'hex');
            const encryptedData = Buffer.from(password.encryptedData, 'hex');
            
            try {
                const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
                let decrypted = decipher.update(encryptedData);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                
                const data: DecryptedPassword = JSON.parse(decrypted.toString());
                const newData = { ...data, id: password.id };
                
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

            const passwordsResponse = await fetch(`${getApiBaseUrl()}/vaults/${id}/passwords`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (passwordsResponse.ok) {
                const newPasswords = await passwordsResponse.json();
                setPasswords(newPasswords);

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
                
                if (isEditing && data.id) {
                    const updatedPassword = newPasswords.find((p: {id: number}) => p.id === data.id);
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

    // Automatic vault locking
    const TIMEOUT_MINUTES = 5;
    const [timeLeft, setTimeLeft] = useState<number>(TIMEOUT_MINUTES * 60);
    const lastActivityRef = useRef<number>(Date.now());

    function resetAutoLockTimer() {
        const now = Date.now();
        lastActivityRef.current = now;
        localStorage.setItem('lastActivity', now.toString());
        setTimeLeft(TIMEOUT_MINUTES * 60);
    }

    function checkAutoLock() {
        const now = Date.now();
        const elapsed = Math.floor((now - lastActivityRef.current) / 1000);
        const remaining = TIMEOUT_MINUTES * 60 - elapsed;

        if (remaining <= 0) {
            handleLockVault();
        } else {
            setTimeLeft(remaining);
        }

        // Force a re-render to update the progress bar
        if (!isUnlocking) {
            setTimeLeft(prev => Math.min(prev, remaining));
        }
    }

    // Effect hooks
    useEffect(() => {
        if (!vault && !isProcessing) {
            loadVault();
        }
    }, [vault, isProcessing, loadVault]);

    useEffect(() => {
        if (!isUnlocking && !isSettingsOpen) {
            // Set up activity monitoring
            const events = ['mousedown', 'keydown', 'scroll'];
            const handleActivity = () => resetAutoLockTimer();
            events.forEach(event => document.addEventListener(event, handleActivity));

            // Update timer more frequently for smoother countdown
            const interval = setInterval(checkAutoLock, 1000); // Check every second
            resetAutoLockTimer(); // Initialize timer

            return () => {
                events.forEach(event => document.removeEventListener(event, handleActivity));
                clearInterval(interval);
            };
        }
    }, [isUnlocking, isSettingsOpen, handleLockVault]);

    return (
        <div className={`min-h-[calc(100vh-64px)] ${isUnlocking ? 'bg-gray-100' : ''}`}>
            <UnlockVaultModal
                isOpen={isUnlocking}
                vaultName={vault?.name || ''}
                isProcessing={isProcessing}
                error={error}
                progress={progress}
                onUnlock={handleUnlock}
                onMasterKeyChange={setMasterKey}
                masterKey={masterKey}
            />
            
            {!isUnlocking && (
                <div className="min-h-[calc(100vh-64px)] bg-gray-100">
                    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                        <div className="px-4 py-6 sm:px-0">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h1 className="text-3xl font-bold text-gray-900">
                                        {vault?.name}
                                    </h1>
                                </div>
                                <div className="flex items-center space-x-3">
                                    {!isSettingsOpen ? (
                                        <button
                                            onClick={() => setIsSettingsOpen(true)}
                                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                                        >
                                            Settings
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setIsSettingsOpen(false)}
                                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600"
                                        >
                                            Back to Passwords
                                        </button>
                                    )}
                                    <div className="relative">
                                        <button
                                            onClick={handleLockVault}
                                            className="relative inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white overflow-hidden w-38"
                                        >
                                            <div className="absolute inset-0 bg-yellow-600" style={{ zIndex: 0 }}></div>
                                            <div 
                                                className="absolute inset-0 bg-yellow-700 transition-transform duration-1000 ease-linear"
                                                style={{ 
                                                    transform: `scaleX(${1 - timeLeft / (TIMEOUT_MINUTES * 60)})`,
                                                    transformOrigin: 'right',
                                                    zIndex: 1
                                                }}
                                            ></div>
                                            <span className="relative" style={{ zIndex: 2 }}>
                                                Lock Vault ({Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')})
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

                            {isSettingsOpen ? (
                                <div className="bg-white shadow-sm rounded-lg overflow-hidden">
                                    <VaultSettings
                                        vaultName={vault?.name || ''}
                                        onDeleteVault={handleDeleteVault}
                                        onChangeMasterPassword={() => setIsChangingPassword(true)}
                                        onExportVault={() => {
                                            if (!encryptionKey || !vault) return;
                                            
                                            const exportData = {
                                                vault: {
                                                    name: vault.name
                                                },
                                                passwords: Object.values(decryptedData)
                                            };
                                            
                                            const dataStr = JSON.stringify(exportData, null, 2);
                                            const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
                                            const exportFileDefaultName = `${vault.name}-export.json`;
                                            
                                            const linkElement = document.createElement('a');
                                            linkElement.setAttribute('href', dataUri);
                                            linkElement.setAttribute('download', exportFileDefaultName);
                                            linkElement.click();
                                        }}
                                        canExport={!!encryptionKey}
                                    />
                                </div>
                            ) : (
                                <div className="flex bg-white shadow-sm rounded-lg overflow-hidden">
                                    <PasswordList 
                                        passwords={passwords}
                                        decryptedData={decryptedData}
                                        selectedPassword={selectedPassword}
                                        searchQuery={searchQuery}
                                        onSearchChange={setSearchQuery}
                                        onDecryptPassword={decryptPassword}
                                        onCreate={() => {
                                            setIsCreating(true);
                                            setIsEditing(false);
                                            setSelectedPassword(null);
                                            setSelectedDecryptedData(null);
                                        }}
                                    />
                                    <PasswordSection
                                        selectedPassword={selectedPassword}
                                        selectedDecryptedData={selectedDecryptedData}
                                        isCreating={isCreating}
                                        isEditing={isEditing}
                                        passwords={passwords}
                                        onCancel={() => {
                                            setIsCreating(false);
                                            setIsEditing(false);
                                            if (!selectedDecryptedData) {
                                                setSelectedPassword(null);
                                            }
                                        }}
                                        onSave={handleSavePassword}
                                        onEdit={() => setIsEditing(true)}
                                        onDelete={handleDeletePassword}
                                    />
                                </div>
                            )}

                            <ChangePasswordModal 
                                isOpen={isChangingPassword}
                                isProcessing={isProcessing}
                                error={error}
                                progress={progress}
                                formData={changePasswordFormData}
                                onClose={() => {
                                    setIsChangingPassword(false);
                                    setChangePasswordFormData({
                                        currentPassword: '',
                                        newPassword: '',
                                        confirmPassword: '',
                                    });
                                    setError('');
                                }}
                                onSubmit={handleChangeMasterPassword}
                                onChange={(field, value) => 
                                    setChangePasswordFormData(prev => ({
                                        ...prev,
                                        [field]: value
                                    }))
                                }
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
