'use client';

import { useState, useEffect, useRef } from 'react';
import { authenticator } from 'otplib';

interface TotpCodeProps {
    secret: string;
    onCopy?: (code: string) => void;
}

export function validateTotpSecret(secret: string): boolean {
    try {
        // Remove spaces and convert to uppercase
        const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
        
        // Try to generate a TOTP code with the secret
        // If the secret is invalid, this will throw an error
        authenticator.generate(cleanSecret);
        return true;
    } catch {
        return false;
    }
}

export default function TotpCode({ secret, onCopy }: TotpCodeProps) {
    const [code, setCode] = useState<string>('');
    const [, setTimeRemaining] = useState<number>(30);
    const [isValid, setIsValid] = useState<boolean>(false);
    const [isCopied, setIsCopied] = useState(false);
    
    // Use a ref for direct DOM manipulation for smooth animation
    const circleRef = useRef<SVGCircleElement>(null);
    // Circle circumference (2πr where r=10)
    const circumference = 2 * Math.PI * 10; 

    useEffect(() => {
        // Clean the secret (remove spaces, convert to uppercase)
        const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
        
        try {
            // Check if the secret is valid
            const isValidSecret = validateTotpSecret(cleanSecret);
            setIsValid(isValidSecret);
            
            if (!isValidSecret) {
                return;
            }

            // Generate initial code
            const initialCode = authenticator.generate(cleanSecret);
            setCode(initialCode);
            
            let animationFrameId: number;
            let lastCodeUpdateTime = Math.floor(Date.now() / 30000);
            let lastDisplayedSecond = -1;
            
            const updateAnimation = () => {
                const now = Date.now() / 1000;
                const secondsInPeriod = now % 30;
                const newTimeRemaining = Math.ceil(30 - secondsInPeriod);
                
                // Only update the displayed time when the second changes
                // This reduces unnecessary React re-renders
                if (newTimeRemaining !== lastDisplayedSecond) {
                    setTimeRemaining(newTimeRemaining);
                    lastDisplayedSecond = newTimeRemaining;
                }
                
                // Calculate the stroke dash offset based on time progression
                const progress = secondsInPeriod / 30;
                const newOffset = progress * circumference;
                
                // Directly update the DOM for smoother animation
                // This avoids going through React's reconciliation for every frame
                if (circleRef.current) {
                    circleRef.current.style.strokeDashoffset = `${newOffset}`;
                }
                
                // Generate new code when period changes
                const currentPeriod = Math.floor(now / 30);
                if (currentPeriod > lastCodeUpdateTime) {
                    const newCode = authenticator.generate(cleanSecret);
                    setCode(newCode);
                    lastCodeUpdateTime = currentPeriod;
                }
                
                animationFrameId = requestAnimationFrame(updateAnimation);
            };
            
            // Start the animation loop
            animationFrameId = requestAnimationFrame(updateAnimation);
            
            return () => {
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                }
            };
        } catch (error) {
            console.error('Error generating TOTP code:', error);
            setIsValid(false);
        }
    }, [secret]);

    const copyToClipboard = async () => {
        if (!code) return;
        
        try {
            await navigator.clipboard.writeText(code);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 5000);
            if (onCopy) {
                onCopy(code);
            }
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    if (!isValid) {
        return (
            <div className="text-red-500 text-sm mt-1">
                Invalid TOTP secret
            </div>
        );
    }

    return (
        <div className="flex items-center space-x-4">
            <div className="font-mono text-xl text-gray-900">{code}</div>
            <div className="relative h-6 w-6">
                <svg viewBox="0 0 24 24" className="h-6 w-6">
                    <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="2"
                    />
                    <circle
                        ref={circleRef}
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="2"
                        strokeDasharray={circumference}
                        strokeDashoffset="0"
                        transform="rotate(-90 12 12)"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
            <button
                type="button"
                onClick={copyToClipboard}
                className={`focus:outline-none transition-colors ${isCopied ? 'text-green-500' : 'text-gray-400 hover:text-gray-600'}`}
                aria-label={isCopied ? "Copied!" : "Copy code"}
            >
                {isCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                        <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                    </svg>
                )}
            </button>
        </div>
    );
}
