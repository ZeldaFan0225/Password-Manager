'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getApiBaseUrl } from '@/lib/config';

interface User {
  id: number;
  username: string;
}

export function TopNav() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser(token);
    }
    
    // Listen for storage events (when token is added/removed in another tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token') {
        if (e.newValue) {
          fetchUser(e.newValue);
        } else {
          setUser(null);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  
  // Add a function to refresh the user data that can be called after login/registration
  useEffect(() => {
    // Create a custom event that components can dispatch after login/registration
    const handleAuthChange = () => {
      const token = localStorage.getItem('token');
      if (token) {
        fetchUser(token);
      } else {
        setUser(null);
      }
    };
    
    window.addEventListener('auth-change', handleAuthChange);
    
    // Initial check
    handleAuthChange();
    
    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
    };
  }, []);

  async function fetchUser(token: string) {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          "Content-Type": "application/json"
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('token');
          return;
        }
        throw new Error('Failed to fetch user');
      }

      const data = await response.json();
      setUser(data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setUser(null);
    router.push('/login');
  }

  return (
    <nav className="bg-indigo-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-white font-bold text-xl">
              Password Manager
            </Link>
          </div>
          <div>
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-white">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className="text-white hover:text-gray-200 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="space-x-4">
                <Link
                  href="/login"
                  className="text-white hover:text-gray-200 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="bg-indigo-500 text-white hover:bg-indigo-400 px-3 py-2 rounded-md text-sm font-medium"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
