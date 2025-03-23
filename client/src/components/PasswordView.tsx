'use client';

import { useState } from 'react';
import PasswordInput from './PasswordInput';
import TotpCode from './TotpCode';
import { DecryptedPassword } from '@/types/password';
import { getApiBaseUrl } from '@/lib/config';

interface PasswordViewProps {
    data: DecryptedPassword;
    onEdit: () => void;
    onDelete: () => void;
}

interface CopyState {
    [key: string]: boolean;
}

export default function PasswordView({ data, onEdit, onDelete }: PasswordViewProps) {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [copiedStates, setCopiedStates] = useState<CopyState>({});

    const copyToClipboard = async (text: string, fieldId: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedStates(prev => ({ ...prev, [fieldId]: true }));
            setTimeout(() => {
                setCopiedStates(prev => ({ ...prev, [fieldId]: false }));
            }, 5000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    return (
        <div className="space-y-6">
            {/* Title and Action buttons */}
            <div className="flex justify-between items-center">
                {data.siteMeta?.title && (
                    <div className="flex items-center gap-2">
                        {data.siteMeta.iconPath ? (
                            <div className="w-5 h-5 flex-shrink-0">
                                <img 
                                    src={`${getApiBaseUrl()}${data.siteMeta.iconPath}`}
                                    alt="" 
                                    className="w-5 h-5"
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
                                        globeIcon.className = 'w-5 h-5';
                                        parent?.appendChild(globeIcon);
                                    }}
                                />
                            </div>
                        ) : (
                            <img 
                                src="/globe.svg" 
                                alt="" 
                                className="w-5 h-5"
                            />
                        )}
                        <h3 className="text-lg font-medium text-gray-900">
                            {data.siteMeta?.title}
                        </h3>
                    </div>
                )}
                <div className="flex items-center space-x-2">
                    <button
                        onClick={onEdit}
                        className="p-2 text-indigo-600 hover:text-indigo-900"
                        title="Edit"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15.1l-3.6.9.9-3.6 8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-2 text-red-600 hover:text-red-900"
                        title="Delete"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Username/Email */}
            <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                    Username/Email
                </label>
                <div className="flex items-center justify-between group bg-gray-50 px-3 py-2 rounded-md">
                    <span className="text-gray-900">{data.username}</span>
                    <button
                        onClick={() => copyToClipboard(data.username || '', 'username')}
                        className="text-indigo-600 hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        {copiedStates['username'] ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>

            {/* Password */}
            <PasswordInput
                label="Password"
                value={data.password}
                readOnly
                showCopyButton
                onCopy={text => copyToClipboard(text, 'password')}
                className="font-mono"
            />

            {/* Website */}
            {data.website && (
                <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                        Website
                    </label>
                    <div className="group bg-gray-50 px-3 py-2 rounded-md flex items-center justify-between">
                        <a 
                            href={data.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-900"
                        >
                            {data.website}
                        </a>
                        <button
                            onClick={() => copyToClipboard(data.website || '', 'website')}
                            className="text-indigo-600 hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            {copiedStates['website'] ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>
            )}

            {/* TOTP */}
            {data.totpSecret && (
                <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                        Two-Factor Authentication
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md">
                        <div>
                            <span className="font-medium text-gray-900">Current Code:</span>
                            <div className="mt-1">
                                <TotpCode 
                                    secret={data.totpSecret} 
                                    onCopy={(text) => copyToClipboard(text, 'totp')}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes */}
            {data.notes && (
                <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                        Notes
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md">
                        <div className="text-gray-900 whitespace-pre-wrap">{data.notes}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
