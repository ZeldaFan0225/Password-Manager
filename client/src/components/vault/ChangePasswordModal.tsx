'use client';

import { useRef } from 'react';
import PasswordInput from '@/components/PasswordInput';
import PasswordGenerator from '@/components/PasswordGenerator';
import Modal from '@/components/Modal';

interface ChangePasswordModalProps {
    isOpen: boolean;
    isProcessing: boolean;
    error: string;
    progress: string;
    formData: {
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
    };
    onClose: () => void;
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
    onChange: (field: 'currentPassword' | 'newPassword' | 'confirmPassword', value: string) => void;
}

export default function ChangePasswordModal({
    isOpen,
    isProcessing,
    error,
    progress,
    formData,
    onClose,
    onSubmit,
    onChange
}: ChangePasswordModalProps) {
    const formRef = useRef<HTMLFormElement>(null);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Change Master Password"
        >
                <form ref={formRef} onSubmit={onSubmit}>
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
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Current Password
                            </label>
                            <PasswordInput
                                value={formData.currentPassword}
                                onChange={(e) => onChange('currentPassword', e.target.value)}
                                required
                                disabled={isProcessing}
                                className="mt-1"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                                New Password
                            </label>
                            <PasswordInput
                                value={formData.newPassword}
                                onChange={(e) => onChange('newPassword', e.target.value)}
                                required
                                disabled={isProcessing}
                                className="mt-1"
                            />
                            <div className="mt-1">
                                <PasswordGenerator 
                                    onGenerate={(password) => {
                                        onChange('newPassword', password);
                                        onChange('confirmPassword', password);
                                    }}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                Confirm New Password
                            </label>
                            <PasswordInput
                                value={formData.confirmPassword}
                                onChange={(e) => onChange('confirmPassword', e.target.value)}
                                required
                                disabled={isProcessing}
                                className="mt-1"
                            />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                            disabled={isProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                    Updating...
                                </div>
                            ) : (
                                'Update Password'
                            )}
                        </button>
                    </div>
                </form>
        </Modal>
    );
}
