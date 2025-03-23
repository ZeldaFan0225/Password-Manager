'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBaseUrl } from '@/lib/config';

interface VaultSettingsProps {
    vaultName: string;
    onDeleteVault: () => Promise<void>;
    onChangeMasterPassword: () => void;
    onExportVault: () => void;
    canExport: boolean;
}

export default function VaultSettings({ 
    vaultName,
    onDeleteVault,
    onChangeMasterPassword,
    onExportVault,
    canExport
}: VaultSettingsProps) {
    return (
        <div className="border-l border-gray-200">
            <div className="px-6 py-5">
                <h2 className="text-lg font-medium text-gray-900">Vault Settings</h2>
            </div>
            <div className="divide-y divide-gray-200">
                {/* Master password */}
                <div className="px-6 py-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Master Password</h3>
                    <p className="text-sm text-gray-500 mb-3">
                        Change the master password used to encrypt your vault data.
                    </p>
                    <button
                        onClick={onChangeMasterPassword}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                        Change Master Password
                    </button>
                </div>
                
                {/* Export vault */}
                <div className="px-6 py-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Export Vault</h3>
                    <p className="text-sm text-gray-500 mb-3">
                        Export your vault data as a decrypted JSON file.
                    </p>
                    <button
                        onClick={onExportVault}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                        disabled={!canExport}
                    >
                        Export Vault
                    </button>
                </div>

                {/* Delete vault */}
                <div className="px-6 py-4">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Vault</h3>
                    <p className="text-sm text-gray-500 mb-3">
                        Permanently delete this vault and all its passwords. This action cannot be undone.
                    </p>
                    <button
                        onClick={onDeleteVault}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                    >
                        Delete Vault
                    </button>
                </div>
            </div>
        </div>
    );
}
