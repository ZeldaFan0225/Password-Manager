'use client';

import { FormEvent, useState } from 'react';
import Disclaimer from '@/components/Disclaimer';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';
import * as srp from 'secure-remote-password/client';
import PasswordInput from '@/components/PasswordInput';
// Note: We don't need to import crypto in the browser as it's available globally

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

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [requires2FA, setRequires2FA] = useState(false);
    const [totpCode, setTotpCode] = useState('');
    const [tempToken, setTempToken] = useState('');
    const router = useRouter();

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        
        if (requires2FA) {
            await handle2FAVerification(e);
            return;
        }
        
        setError('');
        setIsLoading(true);

        try {
            // Step 1: Request SRP challenge from server
            const challengeResponse = await fetch(`${await getApiBaseUrl()}/auth/srp-challenge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username }),
            });

            const challengeData = await challengeResponse.json();

            if (!challengeResponse.ok) {
                throw new Error(challengeData.error || 'Authentication failed');
            }

            const { salt, server_public_key } = challengeData;

            // Step 2: Strengthen password with PBKDF2
            const strengthenedPassword = await pbkdf2Derive(password, salt);
            
            // Step 3: Generate client SRP values
            const clientEphemeral = srp.generateEphemeral();
            const clientSession = srp.deriveSession(
                clientEphemeral.secret,
                server_public_key,
                salt,
                username,
                strengthenedPassword
            );

            // Step 4: Send proof to server
            const loginResponse = await fetch(`${await getApiBaseUrl()}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    client_public_key: clientEphemeral.public,
                    client_proof: clientSession.proof,
                }),
            });

            const loginData = await loginResponse.json();

            if (!loginResponse.ok) {
                throw new Error(loginData.error || 'Authentication failed');
            }

            // Step 5: Verify server proof
            try {
                srp.verifySession(clientEphemeral.public, clientSession, loginData.server_proof);
                
                // Check if 2FA is required
                if (loginData.requires_2fa) {
                    // Save temporary token for 2FA verification
                    setTempToken(loginData.temp_token);
                    setRequires2FA(true);
                    setIsLoading(false);
                    return;
                }
                
                // Authentication successful
                localStorage.setItem('token', loginData.token);
                
                // Dispatch auth-change event to update the navbar
                window.dispatchEvent(new Event('auth-change'));
                
                router.push('/vaults');
            } catch {
                throw new Error('Server verification failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setIsLoading(false);
        }
    }

    async function handle2FAVerification(e: FormEvent) {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            if (!totpCode || totpCode.length !== 6) {
                throw new Error('Please enter a valid 6-digit verification code');
            }

            const response = await fetch(`${await getApiBaseUrl()}/auth/verify-2fa`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    temp_token: tempToken,
                    totp_code: totpCode
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            // 2FA verification successful
            localStorage.setItem('token', data.token);
            
            // Dispatch auth-change event to update the navbar
            window.dispatchEvent(new Event('auth-change'));
            
            router.push('/vaults');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Verification failed');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-100">
            <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
                <div>
                    <h2 className="text-center text-3xl font-bold text-gray-900">
                        {requires2FA ? 'Two-Factor Authentication' : 'Sign in to your account'}
                    </h2>
                    {requires2FA && (
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Please enter the verification code from your authenticator app
                        </p>
                    )}
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    {error && (
                        <div className="rounded-md bg-red-50 p-4">
                            <div className="text-sm text-red-700">{error}</div>
                        </div>
                    )}
                    
                    {!requires2FA ? (
                        <div className="rounded-md shadow-sm -space-y-px">
                            <div>
                                <label htmlFor="username" className="sr-only">
                                    Username
                                </label>
                                <input
                                    id="username"
                                    name="username"
                                    type="text"
                                    required
                                    className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                    placeholder="Username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="rounded-b-md overflow-hidden">
                                <PasswordInput
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    required
                                    disabled={isLoading}
                                    className="border-t-0 rounded-none rounded-b-md"
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700">
                                Verification Code
                            </label>
                            <input
                                id="totp-code"
                                name="totp-code"
                                type="text"
                                required
                                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                                placeholder="Enter 6-digit code"
                                value={totpCode}
                                onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                                disabled={isLoading}
                                autoFocus
                                pattern="[0-9]{6}"
                                maxLength={6}
                            />
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            disabled={isLoading}
                        >
                            {isLoading 
                                ? (requires2FA ? 'Verifying...' : 'Signing in...') 
                                : (requires2FA ? 'Verify' : 'Sign in')}
                        </button>
                    </div>
                    
                    {requires2FA && (
                        <div className="text-center">
                            <button
                                type="button"
                                className="text-sm text-indigo-600 hover:text-indigo-500"
                                onClick={() => {
                                    setRequires2FA(false);
                                    setTotpCode('');
                                    setTempToken('');
                                    setPassword('');
                                }}
                                disabled={isLoading}
                            >
                                Back to login
                            </button>
                        </div>
                    )}
                </form>
                <Disclaimer />
            </div>
        </div>
    );
}
