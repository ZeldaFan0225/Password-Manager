'use client';

import { useState } from 'react';
import { DecryptedPassword } from './PasswordForm';
import { getApiBaseUrl } from '@/lib/config';

interface PasswordViewProps {
    data: DecryptedPassword;
    onEdit: () => void;
    onDelete: () => void;
}

export default function PasswordView({ data, onEdit, onDelete }: PasswordViewProps) {
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
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
                            <img 
                                src={`${getApiBaseUrl()}${data.siteMeta.iconPath}`}
                                alt="" 
                                className="w-5 h-5"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    // Try to show the default globe icon
                                    const globeIcon = document.createElement('img');
                                    globeIcon.src = '/globe.svg';
                                    globeIcon.className = 'w-5 h-5';
                                    e.currentTarget.parentNode?.insertBefore(globeIcon, e.currentTarget);
                                }}
                            />
                        ) : (
                            <img 
                                src="/globe.svg" 
                                alt="" 
                                className="w-5 h-5"
                            />
                        )}
                        <h3 className="text-lg font-medium text-gray-900">
                            {data.siteMeta.title}
                        </h3>
                    </div>
                )}
                <div className="flex space-x-3">
                    <button
                        onClick={onEdit}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                    >
                        Edit
                    </button>
                    <button
                        onClick={onDelete}
                        className="text-red-600 hover:text-red-900 text-sm font-medium"
                    >
                        Delete
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
                        onClick={() => copyToClipboard(data.username)}
                        className="text-indigo-600 hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Copy
                    </button>
                </div>
            </div>

            {/* Password */}
            <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                    Password
                </label>
                <div className="flex items-center justify-between group bg-gray-50 px-3 py-2 rounded-md">
                    <span className="text-gray-900 font-mono">
                        {isPasswordVisible ? data.password : '••••••••••••'}
                    </span>
                    <div className="space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                            className="text-indigo-600 hover:text-indigo-900"
                        >
                            {isPasswordVisible ? 'Hide' : 'Show'}
                        </button>
                        <button
                            onClick={() => copyToClipboard(data.password)}
                            className="text-indigo-600 hover:text-indigo-900"
                        >
                            Copy
                        </button>
                    </div>
                </div>
            </div>

            {/* Base Domain (non-editable) */}
            {data.siteMeta?.baseDomain && (
                <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                        Base Domain
                    </label>
                    <div className="flex items-center justify-between group bg-gray-50 px-3 py-2 rounded-md">
                        <span className="text-gray-900">{data.siteMeta.baseDomain}</span>
                        <button
                            onClick={() => copyToClipboard(data.siteMeta?.baseDomain || '')}
                            className="text-indigo-600 hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            Copy
                        </button>
                    </div>
                </div>
            )}

            {/* Website */}
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
                        onClick={() => copyToClipboard(data.website)}
                        className="text-indigo-600 hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        Copy
                    </button>
                </div>
            </div>

            {/* TOTP */}
            {data.totpSecret && (
                <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                        Two-Factor Authentication
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md">
                        <div className="text-gray-900">TOTP Secret: {data.totpSecret}</div>
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
