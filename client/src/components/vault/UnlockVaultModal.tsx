'use client';

import { useState } from 'react';
import PasswordInput from '@/components/PasswordInput';
import Modal from '@/components/Modal';

interface UnlockVaultModalProps {
    isOpen: boolean;
    vaultName: string;
    isProcessing: boolean;
    error: string;
    progress: string;
    onUnlock: (e: React.FormEvent) => Promise<void>;
    onMasterKeyChange: (value: string) => void;
    masterKey: string;
}

export default function UnlockVaultModal({
    isOpen,
    vaultName,
    isProcessing,
    error,
    progress,
    onUnlock,
    onMasterKeyChange,
    masterKey
}: UnlockVaultModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {}} // No close option for unlock modal
            title="Unlock Vault"
            showCloseButton={false}
        >
            {vaultName && (
                <p className="text-gray-900 text-center mb-6">{vaultName}</p>
            )}
            {progress && (
                <div className="mb-4 text-sm text-indigo-600 bg-indigo-50 p-3 rounded flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-indigo-600 mr-2"></div>
                    {progress}
                </div>
            )}
            {error && (
                <div className="mb-4 text-sm text-red-600 bg-red-100 p-3 rounded">
                    {error}
                </div>
            )}
            <form onSubmit={onUnlock}>
                <div className="mb-6">
                    <label className="block text-gray-900 text-sm font-bold mb-2">
                        Master Password
                    </label>
                    <PasswordInput
                        value={masterKey}
                        onChange={(e) => onMasterKeyChange(e.target.value)}
                        className="mb-3"
                        required
                        disabled={isProcessing}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
                >
                    {isProcessing ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                            Unlocking...
                        </>
                    ) : (
                        'Unlock'
                    )}
                </button>
            </form>
        </Modal>
    );
}
