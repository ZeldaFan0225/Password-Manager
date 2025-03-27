'use client';

import { FormEvent, useState } from 'react';
import Disclaimer from '@/components/Disclaimer';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setIsLoading(false);
      return;
    }

    try {
      // Generate SRP salt
      const salt = srp.generateSalt();
      
      // Strengthen password with PBKDF2
      const strengthenedPassword = await pbkdf2Derive(password, salt);
      
      // Generate SRP verifier
      const verifier = srp.deriveVerifier(strengthenedPassword);
      
      // Register user with SRP credentials
      const response = await fetch(`${await getApiBaseUrl()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username, 
          srp_salt: salt,
          srp_verifier: verifier
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Store the token in localStorage
      localStorage.setItem('token', data.token);
      
      // Dispatch auth-change event to update the navbar
      window.dispatchEvent(new Event('auth-change'));
      
      // Redirect to vaults page
      router.push('/vaults');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Create an account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
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
            <div className="rounded-none overflow-hidden">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                disabled={isLoading}
                className="rounded-none border-t-0"
              />
            </div>
            <div className="rounded-b-md overflow-hidden">
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm Password"
                required
                disabled={isLoading}
                className="rounded-none rounded-b-md border-t-0"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={isLoading}
            >
              {isLoading ? 'Registering...' : 'Register'}
            </button>
          </div>
          <div className="text-sm text-center">
            <Link href="/login" className="text-indigo-600 hover:text-indigo-500">
              Already have an account? Sign in
            </Link>
          </div>
        </form>
        <Disclaimer />
      </div>
    </div>
  );
}
