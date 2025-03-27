'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import TotpCode from '@/components/TotpCode';
import PasswordInput from '@/components/PasswordInput';
import * as srp from 'secure-remote-password/client';
import { QRCodeSVG } from 'qrcode.react';

// Helper function to perform PBKDF2 derivation
async function pbkdf2Derive(password: string, salt: string): Promise<string> {
    // Use the Web Crypto API for PBKDF2
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const saltBuffer = encoder.encode(salt);
    
    // Import the password as a key
    const baseKey = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    
    // Derive bits using PBKDF2
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: 10000,
            hash: 'SHA-256'
        },
        baseKey,
        256 // 32 bytes (256 bits)
    );
    
    // Convert to hex string
    const derivedKey = Array.from(new Uint8Array(derivedBits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    
    return derivedKey;
}

interface User {
    id: number;
    username: string;
    has_2fa: boolean;
}

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Username update state
    const [newUsername, setNewUsername] = useState('');
    const [updatingUsername, setUpdatingUsername] = useState(false);

    // Password update state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);

    // 2FA state
    const [totpSecret, setTotpSecret] = useState<string | null>(null);
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [verificationCode, setVerificationCode] = useState('');
    const [setting2FA, setSetting2FA] = useState(false);
    const [removing2FA, setRemoving2FA] = useState(false);
    const [disableCode, setDisableCode] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
            return;
        }

        fetchUser(token);
    }, [router]);

    async function fetchUser(token: string) {
        try {
            setLoading(true);
            const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('token');
                    router.push('/login');
                    return;
                }
                throw new Error('Failed to fetch user');
            }

            const data = await response.json();
            setUser(data);
            setNewUsername(data.username);
        } catch (error) {
            console.error('Failed to fetch user:', error);
            setError('Failed to load user data');
        } finally {
            setLoading(false);
        }
    }

    async function handleUsernameUpdate(e: React.FormEvent) {
        e.preventDefault();
        if (!newUsername.trim() || newUsername.trim().length < 3) {
            setError('Username must be at least 3 characters');
            return;
        }

        try {
            setUpdatingUsername(true);
            setError(null);
            setSuccessMessage(null);

            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }

            const response = await fetch(`${getApiBaseUrl()}/auth/username`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: newUsername })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update username');
            }

            setSuccessMessage('Username updated successfully');
            fetchUser(token); // Refresh user data
        } catch (error) {
            console.error('Error updating username:', error);
            setError((error as Error).message || 'Failed to update username');
        } finally {
            setUpdatingUsername(false);
        }
    }

    async function handlePasswordUpdate(e: React.FormEvent) {
        e.preventDefault();
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('All password fields are required');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters');
            return;
        }

        try {
            setUpdatingPassword(true);
            setError(null);
            setSuccessMessage(null);

            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }

            // Generate new SRP salt and verifier for the new password
            const salt = srp.generateSalt(); // Generate a cryptographically secure salt
            const verifier = await generateSrpVerifier(newPassword, salt);

            const response = await fetch(`${getApiBaseUrl()}/auth/password`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    srp_salt: salt,
                    srp_verifier: verifier
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update password');
            }

            setSuccessMessage('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Error updating password:', error);
            setError((error as Error).message || 'Failed to update password');
        } finally {
            setUpdatingPassword(false);
        }
    }

    // Generate SRP verifier from password and salt
    async function generateSrpVerifier(password: string, salt: string): Promise<string> {
        // Strengthen password with PBKDF2
        const strengthenedPassword = await pbkdf2Derive(password, salt);
        
        // Generate SRP verifier
        return srp.deriveVerifier(strengthenedPassword);
    }

    async function setup2FA() {
        try {
            setSetting2FA(true);
            setError(null);
            setSuccessMessage(null);

            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }

            const response = await fetch(`${getApiBaseUrl()}/auth/2fa/setup`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to setup 2FA');
            }

            const data = await response.json();
            setTotpSecret(data.secret);
            setQrCodeUrl(data.qr_code_url);
        } catch (error) {
            console.error('Error setting up 2FA:', error);
            setError((error as Error).message || 'Failed to setup 2FA');
        } finally {
            setSetting2FA(false);
        }
    }

    async function enable2FA(e: React.FormEvent) {
        e.preventDefault();
        if (!verificationCode || !totpSecret) {
            setError('Verification code is required');
            return;
        }

        try {
            setSetting2FA(true);
            setError(null);
            setSuccessMessage(null);

            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }

            const response = await fetch(`${getApiBaseUrl()}/auth/2fa/enable`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    secret: totpSecret,
                    token: verificationCode
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to enable 2FA');
            }

            setSuccessMessage('2FA enabled successfully');
            setTotpSecret(null);
            setQrCodeUrl(null);
            setVerificationCode('');
            fetchUser(token); // Refresh user data
        } catch (error) {
            console.error('Error enabling 2FA:', error);
            setError((error as Error).message || 'Failed to enable 2FA');
        } finally {
            setSetting2FA(false);
        }
    }

    async function disable2FA(e: React.FormEvent) {
        e.preventDefault();
        if (!disableCode) {
            setError('Verification code is required to disable 2FA');
            return;
        }

        try {
            setRemoving2FA(true);
            setError(null);
            setSuccessMessage(null);

            const token = localStorage.getItem('token');
            if (!token) {
                router.push('/login');
                return;
            }

            const response = await fetch(`${getApiBaseUrl()}/auth/2fa/disable`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    token: disableCode
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to disable 2FA');
            }

            setSuccessMessage('2FA disabled successfully');
            setDisableCode('');
            fetchUser(token); // Refresh user data
        } catch (error) {
            console.error('Error disabling 2FA:', error);
            setError((error as Error).message || 'Failed to disable 2FA');
        } finally {
            setRemoving2FA(false);
        }
    }

    function cancelSetup() {
        setTotpSecret(null);
        setQrCodeUrl(null);
        setVerificationCode('');
        setError(null);
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md mx-auto">
                    <div className="text-center">
                        <h2 className="text-3xl font-extrabold text-gray-900">Loading...</h2>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md mx-auto">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-900">Account Settings</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Manage your account settings and security
                    </p>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded sticky top-3" role="alert">
                        <span className="block sm:inline">{successMessage}</span>
                    </div>
                )}

                <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
                    {/* Username Section */}
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Username</h3>
                        <div className="mt-2 max-w-xl text-sm text-gray-500">
                            <p>Change your username</p>
                        </div>
                        <form className="mt-5" onSubmit={handleUsernameUpdate}>
                            <div className="flex flex-col space-y-4">
                                <div>
                                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                                        New Username
                                    </label>
                                    <input
                                        type="text"
                                        name="username"
                                        id="username"
                                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                        value={newUsername}
                                        onChange={(e) => setNewUsername(e.target.value)}
                                        required
                                        minLength={3}
                                    />
                                </div>
                                <div>
                                    <button
                                        type="submit"
                                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        disabled={updatingUsername}
                                    >
                                        {updatingUsername ? 'Updating...' : 'Update Username'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Password Section */}
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Password</h3>
                        <div className="mt-2 max-w-xl text-sm text-gray-500">
                            <p>Update your password</p>
                        </div>
                        <form className="mt-5" onSubmit={handlePasswordUpdate}>
                            <div className="flex flex-col space-y-4">
                                <div>
                                    <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
                                        Current Password
                                    </label>
                                    <PasswordInput
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        placeholder="Enter current password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                                        New Password
                                    </label>
                                    <PasswordInput
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        placeholder="Enter new password"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                                        Confirm New Password
                                    </label>
                                    <PasswordInput
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        placeholder="Confirm new password"
                                    />
                                </div>
                                <div>
                                    <button
                                        type="submit"
                                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        disabled={updatingPassword}
                                    >
                                        {updatingPassword ? 'Updating...' : 'Update Password'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* 2FA Section */}
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg leading-6 font-medium text-gray-900">Two-Factor Authentication</h3>
                        <div className="mt-2 max-w-xl text-sm text-gray-500">
                            <p>Add an extra layer of security to your account</p>
                        </div>

                        {user?.has_2fa ? (
                            <div className="mt-5">
                                <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div className="ml-3">
                                            <p className="text-sm font-medium text-green-800">
                                                Two-factor authentication is enabled
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setRemoving2FA(true)}
                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                >
                                    Disable 2FA
                                </button>

                                {removing2FA && (
                                    <form onSubmit={disable2FA} className="mt-4">
                                        <div className="flex flex-col space-y-4">
                                            <div>
                                                <label htmlFor="disable-code" className="block text-sm font-medium text-gray-700">
                                                    Verification Code
                                                </label>
                                                <input
                                                    type="text"
                                                    name="disable-code"
                                                    id="disable-code"
                                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                                    value={disableCode}
                                                    onChange={(e) => setDisableCode(e.target.value)}
                                                    required
                                                    pattern="[0-9]{6}"
                                                    maxLength={6}
                                                    placeholder="Enter 6-digit code"
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex space-x-3">
                                                <button
                                                    type="submit"
                                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                                >
                                                    Confirm Disable
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRemoving2FA(false);
                                                        setDisableCode('');
                                                    }}
                                                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                )}
                            </div>
                        ) : totpSecret ? (
                            <div className="mt-5">
                                <div className="mb-4">
                                    <h4 className="text-md font-medium text-gray-900">1. Scan this QR code with your authenticator app</h4>
                                    <div className="mt-2 bg-white p-4 inline-block rounded-md border">
                                        <QRCodeSVG value={qrCodeUrl || ''} size={200} />
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <h4 className="text-md font-medium text-gray-900">2. Or enter this code manually</h4>
                                    <div className="mt-2 font-mono text-sm bg-gray-100 text-gray-900 p-2 rounded break-all">
                                        {totpSecret}
                                    </div>
                                </div>

                                <div className="mb-4">
                                    <h4 className="text-md font-medium text-gray-900">3. Verify setup with code from app</h4>
                                    <form className="mt-3" onSubmit={enable2FA}>
                                        <div className="flex flex-col space-y-4">
                                            <div>
                                                <label htmlFor="verification-code" className="block text-sm font-medium text-gray-700">
                                                    Verification Code
                                                </label>
                                                <input
                                                    type="text"
                                                    name="verification-code"
                                                    id="verification-code"
                                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                                    value={verificationCode}
                                                    onChange={(e) => setVerificationCode(e.target.value)}
                                                    required
                                                    pattern="[0-9]{6}"
                                                    maxLength={6}
                                                    placeholder="Enter 6-digit code"
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="flex space-x-3">
                                                <button
                                                    type="submit"
                                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                    disabled={setting2FA}
                                                >
                                                    {setting2FA ? 'Enabling...' : 'Enable 2FA'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelSetup}
                                                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-5">
                                <button
                                    type="button"
                                    onClick={setup2FA}
                                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                    disabled={setting2FA}
                                >
                                    {setting2FA ? 'Setting up...' : 'Setup 2FA'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
