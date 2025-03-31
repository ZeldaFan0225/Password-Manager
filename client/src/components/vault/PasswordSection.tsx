'use client';

import { DecryptedPassword } from '@/components/PasswordForm';
import PasswordForm from '@/components/PasswordForm';
import PasswordView from '@/components/PasswordView';

interface PasswordSectionProps {
    selectedPassword: number | null;
    selectedDecryptedData: DecryptedPassword | null;
    isCreating: boolean;
    isEditing: boolean;
    passwords: Array<{ id: number }>;
    onCancel: () => void;
    onSave: (data: DecryptedPassword) => Promise<void>;
    onEdit: () => void;
    onDelete: (id: number) => Promise<void>;
}

export default function PasswordSection({
    selectedPassword,
    selectedDecryptedData,
    isCreating,
    isEditing,
    passwords,
    onCancel,
    onSave,
    onEdit,
    onDelete
}: PasswordSectionProps) {
    return (
        <div className="lg:w-3/4 w-full">
            <div className="px-4 lg:px-6 py-5 border-t lg:border-t-0">
                <h2 className="text-lg font-medium text-gray-900">
                    {isCreating ? 'New Password' : 
                     selectedPassword ? (isEditing ? 'Edit Password' : 'Password Details') : 
                     'Select a password'}
                </h2>
            </div>
            <div className="px-4 lg:px-6 py-5">
                {isCreating || isEditing ? (
                    <PasswordForm
                        initialData={selectedDecryptedData || undefined}
                        onSave={onSave}
                        onCancel={onCancel}
                    />
                ) : selectedDecryptedData ? (
                    <PasswordView
                        data={selectedDecryptedData!}
                        onEdit={onEdit}
                        onDelete={() => selectedDecryptedData.id && onDelete(selectedDecryptedData.id)}
                    />
                ) : (
                    <div className="text-center py-12 text-gray-900">
                        {passwords.length > 0 
                            ? 'Select a password to view its details'
                            : 'Add your first password to get started'}
                    </div>
                )}
            </div>
        </div>
    );
}
