'use client';

import { useState } from 'react';
import PasswordInput from './PasswordInput';
import { validateTotpSecret } from './TotpCode';
import { getApiBaseUrl } from '@/lib/config';

interface SiteMeta {
    title: string;
    iconPath: string | null;
    baseDomain: string;
}

export interface DecryptedPassword {
    id?: number;
    username: string;
    website: string;
    password: string;
    totpSecret?: string;
    notes?: string;
    siteMeta?: SiteMeta;
}

// Extract domain from URL
function extractDomain(url: string): string {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (err) {
        console.error('Failed to extract domain:', err);
        return url;
    }
}

// Extract title from domain (e.g., "google.com" -> "Google")
function extractTitleFromDomain(domain: string): string {
    // Remove TLD and split by dots or dashes
    const parts = domain.split('.')[0].split(/[-_.]/);
    
    // Capitalize first letter of each part
    return parts.map(part => 
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join(' ');
}

async function fetchSiteMeta(url: string): Promise<SiteMeta | undefined> {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBaseUrl()}/api/metadata/fetch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new Error('Failed to fetch metadata');
        }

        const data = await response.json();
        return data.meta;
    } catch (err) {
        console.error('Failed to fetch site metadata:', err);
        
        // Create fallback metadata with domain and extracted title
        const domain = extractDomain(url);
        return {
            title: extractTitleFromDomain(domain),
            iconPath: null,
            baseDomain: domain
        };
    }
}

interface PasswordFormProps {
    initialData?: DecryptedPassword;
    onSave: (data: DecryptedPassword) => void;
    onCancel: () => void;
}

export default function PasswordForm({ initialData, onSave, onCancel }: PasswordFormProps) {
    const [formData, setFormData] = useState<DecryptedPassword>(
        initialData || {
            username: '',
            website: '',
            password: '',
            totpSecret: '',
            notes: '',
        }
    );
    
    const [isTotpValid, setIsTotpValid] = useState<boolean | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            // Ensure website is not empty
            if (!formData.website.trim()) {
                alert('Website URL is required');
                return;
            }
            
            // Validate TOTP secret if provided
            if (formData.totpSecret?.trim()) {
                const isValid = validateTotpSecret(formData.totpSecret);
                setIsTotpValid(isValid);
                
                if (!isValid) {
                    alert('The TOTP secret is invalid. Please enter a valid Base32 secret or leave it empty.');
                    return;
                }
            }
            
            // Prepare clean data
            const cleanData = { ...formData };

            // Fetch site metadata if website changed or no metadata exists
            if (!formData.siteMeta || formData.website !== initialData?.website) {
                const siteMeta = await fetchSiteMeta(formData.website);
                if (siteMeta) {
                    cleanData.siteMeta = siteMeta;
                }
            }

            onSave(cleanData);
        } catch (err) {
            console.error('Error in form submission:', err);
            onSave(formData);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="block text-sm font-medium text-gray-900">
                    Username/Email
                </label>
                <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-900">
                    Website URL
                </label>
                <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="https://example.com"
                    required
                />
            </div>

            <PasswordInput
                label="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
            />

            <div>
                <label className="block text-sm font-medium text-gray-900">
                    TOTP Secret (Optional)
                </label>
                <input
                    type="text"
                    value={formData.totpSecret || ''}
                    onChange={(e) => {
                        const newValue = e.target.value;
                        setFormData({ ...formData, totpSecret: newValue });
                        
                        // Validate TOTP secret if not empty
                        if (newValue.trim()) {
                            setIsTotpValid(validateTotpSecret(newValue));
                        } else {
                            setIsTotpValid(null);
                        }
                    }}
                    className={`mt-1 block w-full rounded-md border ${
                        isTotpValid === false 
                            ? 'border-red-500' 
                            : isTotpValid === true 
                                ? 'border-green-500' 
                                : 'border-gray-300'
                    } py-2 px-3 text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
                        isTotpValid === false 
                            ? 'focus:ring-red-500 focus:border-red-500' 
                            : isTotpValid === true 
                                ? 'focus:ring-green-500 focus:border-green-500' 
                                : 'focus:ring-indigo-500 focus:border-indigo-500'
                    }`}
                    placeholder="Enter TOTP secret for 2FA"
                />
                {formData.totpSecret && isTotpValid === false && (
                    <p className="mt-1 text-sm text-red-600">
                        Invalid TOTP secret. Please enter a valid Base32 secret.
                    </p>
                )}
                {formData.totpSecret && isTotpValid === true && (
                    <p className="mt-1 text-sm text-green-600">
                        Valid TOTP secret
                    </p>
                )}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-900">
                    Notes (Optional)
                </label>
                <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-gray-300 py-2 px-3 text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Add any additional notes here"
                />
            </div>

            <div className="flex justify-end space-x-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex justify-center rounded-md border border-gray-300 py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Save
                </button>
            </div>
        </form>
    );
}
