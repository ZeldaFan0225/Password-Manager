'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    showCloseButton?: boolean;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    showCloseButton = true
}: ModalProps) {
    const [isMobile, setIsMobile] = useState(false);

    // Check if the user is on a mobile device
    const checkIfMobile = useCallback(() => {
        setIsMobile(window.innerWidth < 768);
    }, []);

    // Initialize mobile detection and add resize listener
    useEffect(() => {
        checkIfMobile();
        window.addEventListener('resize', checkIfMobile);
        return () => window.removeEventListener('resize', checkIfMobile);
    }, [checkIfMobile]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop overlay */}
            <div 
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                onClick={onClose}
                aria-hidden="true"
            />
            
            {/* Modal content */}
            <div 
                className={`fixed z-50 bg-white shadow-xl ${
                    isMobile 
                        ? 'inset-x-0 bottom-0 rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] w-full h-4/5 overflow-y-auto' 
                        : 'rounded-lg max-w-md w-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                }`}
            >
                {/* Header with title and close button */}
                {(title || showCloseButton) && (
                    <div className="flex justify-between items-center p-4 border-b border-gray-200">
                        {title && <h2 className="text-xl font-semibold text-gray-900">{title}</h2>}
                        {showCloseButton && (
                            <button 
                                type="button" 
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-500"
                            >
                                <span className="sr-only">Close</span>
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
                
                {/* Modal body */}
                <div className="p-4">
                    {children}
                </div>
            </div>
        </>
    );
}
