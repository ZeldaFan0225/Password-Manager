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
    } catch (error) {
        return false;
    }
}

export default function TotpCode({ secret, onCopy }: TotpCodeProps) {
    const [code, setCode] = useState<string>('');
    const [timeRemaining, setTimeRemaining] = useState<number>(30);
    const [isValid, setIsValid] = useState<boolean>(false);
    
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
                onClick={copyToClipboard}
                className="text-indigo-600 hover:text-indigo-900 text-sm"
            >
                Copy
            </button>
        </div>
    );
}