'use client';

import { getApiBaseUrl } from '@/lib/config';
import { DecryptedPassword } from '@/components/PasswordForm';

interface PasswordListProps {
    passwords: Array<{ id: number; iv: string; encryptedData: string }>;
    decryptedData: { [id: number]: DecryptedPassword };
    selectedPassword: number | null;
    searchQuery: string;
    onDecryptPassword: (password: { id: number; iv: string; encryptedData: string }) => void;
    onSearchChange: (query: string) => void;
    onCreate: () => void;
}

export default function PasswordList({
    passwords,
    decryptedData,
    selectedPassword,
    searchQuery,
    onDecryptPassword,
    onSearchChange,
    onCreate
}: PasswordListProps) {
    // Cleanup function for globe icons
    const cleanupGlobeIcons = () => {
        // Find all containers that might have globe icons
        const containers = document.querySelectorAll('.w-4.h-4.flex-shrink-0');
        containers.forEach(container => {
            const globeIcons = container.querySelectorAll('img[src="/globe.svg"]');
            globeIcons.forEach(icon => icon.remove());
        });
    };

    const filteredPasswords = passwords.filter(password => {
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
    });

    return (
        <div className="w-1/4 border-r border-gray-200">
            <div className="px-4 pt-5 pb-3">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-medium text-gray-900">Passwords</h2>
                    <button
                        onClick={onCreate}
                        className="text-gray-600 hover:text-indigo-600"
                        title="Add Password"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
                        </svg>
                    </button>
                </div>
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search passwords..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="block w-full border border-gray-300 rounded-md py-2 pl-3 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                </div>
            </div>
            <ul className="divide-y divide-gray-200 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {filteredPasswords.map((password) => (
                    <li 
                        key={password.id}
                        className={`px-6 py-4 cursor-pointer hover:bg-gray-50 ${
                            selectedPassword === password.id ? 'bg-indigo-50' : ''
                        }`}
                        onClick={() => {
                            // Clean up any existing globe icons before decrypting
                            cleanupGlobeIcons();
                            onDecryptPassword(password);
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
    );
}
