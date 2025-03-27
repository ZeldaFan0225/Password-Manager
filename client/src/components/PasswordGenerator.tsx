'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PasswordGeneratorProps {
    onGenerate: (password: string) => void;
}

export default function PasswordGenerator({ onGenerate }: PasswordGeneratorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [popoutPosition, setPopoutPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [options, setOptions] = useState({
        length: 18,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        appleFormat: false
    });

    // Ensure length is a multiple of 6 when Apple format is enabled
    useEffect(() => {
        if (options.appleFormat) {
            // Round to nearest multiple of 6, minimum 12
            const newLength = Math.max(12, Math.round(options.length / 6) * 6);
            if (newLength !== options.length) {
                setOptions({...options, length: newLength, symbols: false});
            } else if (options.symbols) {
                setOptions({...options, symbols: false});
            }
        }
    }, [options.appleFormat, options.length]);

    const generatePassword = () => {
        const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
        const numberChars = '0123456789';
        const symbolChars = '!@#$%^&*()_+~`|}{[]:;?><,./-=';
        
        let chars = '';
        if (options.uppercase) chars += uppercaseChars;
        if (options.lowercase) chars += lowercaseChars;
        if (options.numbers) chars += numberChars;
        if (!options.appleFormat && options.symbols) chars += symbolChars;
        
        // Fallback to ensure we have some characters
        if (chars.length === 0) {
            chars = lowercaseChars + numberChars;
        }
        
        let password = '';
        const array = new Uint32Array(options.length);
        window.crypto.getRandomValues(array);
        
        for (let i = 0; i < options.length; i++) {
            password += chars[array[i] % chars.length];
        }
        
        // Ensure at least one character from each selected type
        let finalPassword = password;
        
        if (options.uppercase && !/[A-Z]/.test(finalPassword)) {
            const pos = Math.floor(Math.random() * finalPassword.length);
            const char = uppercaseChars.charAt(Math.floor(Math.random() * uppercaseChars.length));
            finalPassword = finalPassword.substring(0, pos) + char + finalPassword.substring(pos + 1);
        }
        
        if (options.lowercase && !/[a-z]/.test(finalPassword)) {
            const pos = Math.floor(Math.random() * finalPassword.length);
            const char = lowercaseChars.charAt(Math.floor(Math.random() * lowercaseChars.length));
            finalPassword = finalPassword.substring(0, pos) + char + finalPassword.substring(pos + 1);
        }
        
        if (options.numbers && !/[0-9]/.test(finalPassword)) {
            const pos = Math.floor(Math.random() * finalPassword.length);
            const char = numberChars.charAt(Math.floor(Math.random() * numberChars.length));
            finalPassword = finalPassword.substring(0, pos) + char + finalPassword.substring(pos + 1);
        }
        
        if (!options.appleFormat && options.symbols && !/[!@#$%^&*()_+~`|}{[\]:;?><,./-=]/.test(finalPassword)) {
            const pos = Math.floor(Math.random() * finalPassword.length);
            const char = symbolChars.charAt(Math.floor(Math.random() * symbolChars.length));
            finalPassword = finalPassword.substring(0, pos) + char + finalPassword.substring(pos + 1);
        }
        
        // Format in blocks of 6 characters for Apple format
        if (options.appleFormat) {
            let formattedPassword = '';
            for (let i = 0; i < finalPassword.length; i += 6) {
                formattedPassword += finalPassword.substring(i, i + 6);
                if (i + 6 < finalPassword.length) {
                    formattedPassword += '-';
                }
            }
            finalPassword = formattedPassword;
        }
        
        onGenerate(finalPassword);
    };

    const handleGenerateClick = () => {
        generatePassword();
        if (!isOpen) {
            // If options are closed, just generate with current settings
            generatePassword();
        }
    };

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

    // Update popout position when the button is clicked
    useEffect(() => {
        if (isOpen && buttonRef.current && !isMobile) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopoutPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX
            });
        }
    }, [isOpen, isMobile]);

    // Handle close button click
    const handleClose = () => {
        setIsOpen(false);
    };

    // Handle save button click
    const handleSave = () => {
        generatePassword();
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={buttonRef}>
            <div className="flex space-x-2">
                <button
                    type="button"
                    onClick={handleGenerateClick}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
                >
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-4 w-4 mr-2" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Generate Password
                </button>
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`inline-flex items-center justify-center p-2 border ${isOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-300 bg-white text-gray-700'} rounded-md shadow-sm text-sm leading-4 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200`}
                    aria-expanded={isOpen}
                >
                    <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                        viewBox="0 0 20 20" 
                        fill="currentColor"
                    >
                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
            
            {isOpen && isMobile && (
                <div 
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
                    onClick={handleClose}
                    aria-hidden="true"
                />
            )}
            
            {isOpen && (
                <div 
                    className={`fixed z-50 bg-white ring-1 ring-black ring-opacity-5 p-4 space-y-4 ${
                        isMobile 
                            ? 'inset-x-0 bottom-0 rounded-t-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] w-full h-4/5' 
                            : 'rounded-md shadow-lg w-80'
                    }`} 
                    style={isMobile ? {} : { top: `${popoutPosition.top + 10}px`, left: `${popoutPosition.left}px` }}
                >
                    {isMobile && (
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">Password Options</h3>
                            <button 
                                type="button" 
                                onClick={handleClose}
                                className="text-gray-400 hover:text-gray-500"
                            >
                                <span className="sr-only">Close</span>
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-gray-700">
                                Password Length
                            </label>
                            <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                                {options.length}
                            </span>
                        </div>
                        <div className="mt-4 mb-2">
                            <input
                                type="range"
                                min={options.appleFormat ? "12" : "8"}
                                max={options.appleFormat ? "132" : "128"}
                                step={options.appleFormat ? "6" : "1"}
                                value={options.length}
                                onChange={(e) => {
                                    const newLength = parseInt(e.target.value);
                                    setOptions({...options, length: newLength});
                                }}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>{options.appleFormat ? "12" : "8"}</span>
                            <span>{options.appleFormat ? "132" : "128"}</span>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex items-center">
                            <div className="relative inline-block w-10 mr-2 align-middle select-none">
                                <input 
                                    id="uppercase" 
                                    type="checkbox"
                                    checked={options.uppercase}
                                    onChange={(e) => setOptions({...options, uppercase: e.target.checked})}
                                    className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer focus:outline-none checked:right-0 checked:border-indigo-600 transition-all duration-200 ease-in-out"
                                />
                                <label 
                                    htmlFor="uppercase"
                                    className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer checked:bg-indigo-600"
                                ></label>
                            </div>
                            <label htmlFor="uppercase" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Include Uppercase <span className="text-indigo-600 font-mono">A-Z</span>
                            </label>
                        </div>
                        
                        <div className="flex items-center">
                            <div className="relative inline-block w-10 mr-2 align-middle select-none">
                                <input 
                                    id="lowercase" 
                                    type="checkbox"
                                    checked={options.lowercase}
                                    onChange={(e) => setOptions({...options, lowercase: e.target.checked})}
                                    className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer focus:outline-none checked:right-0 checked:border-indigo-600 transition-all duration-200 ease-in-out"
                                />
                                <label 
                                    htmlFor="lowercase"
                                    className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer checked:bg-indigo-600"
                                ></label>
                            </div>
                            <label htmlFor="lowercase" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Include Lowercase <span className="text-indigo-600 font-mono">a-z</span>
                            </label>
                        </div>
                        
                        <div className="flex items-center">
                            <div className="relative inline-block w-10 mr-2 align-middle select-none">
                                <input 
                                    id="numbers" 
                                    type="checkbox"
                                    checked={options.numbers}
                                    onChange={(e) => setOptions({...options, numbers: e.target.checked})}
                                    className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer focus:outline-none checked:right-0 checked:border-indigo-600 transition-all duration-200 ease-in-out"
                                />
                                <label 
                                    htmlFor="numbers"
                                    className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer checked:bg-indigo-600"
                                ></label>
                            </div>
                            <label htmlFor="numbers" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Include Numbers <span className="text-indigo-600 font-mono">0-9</span>
                            </label>
                        </div>
                        
                        <div className="flex items-center">
                            <div className="relative inline-block w-10 mr-2 align-middle select-none">
                                <input 
                                    id="symbols" 
                                    type="checkbox"
                                    checked={options.symbols}
                                    onChange={(e) => setOptions({...options, symbols: e.target.checked})}
                                    disabled={options.appleFormat}
                                    className={`absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer focus:outline-none checked:right-0 checked:border-indigo-600 transition-all duration-200 ease-in-out ${options.appleFormat ? 'opacity-50' : ''}`}
                                />
                                <label 
                                    htmlFor="symbols"
                                    className={`block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer checked:bg-indigo-600 ${options.appleFormat ? 'opacity-50' : ''}`}
                                ></label>
                            </div>
                            <label htmlFor="symbols" className={`text-sm font-medium cursor-pointer ${options.appleFormat ? 'text-gray-500' : 'text-gray-900'}`}>
                                Include Symbols <span className={`font-mono ${options.appleFormat ? 'text-gray-500' : 'text-indigo-600'}`}>!@#$%^&*</span>
                            </label>
                        </div>
                        
                        <div className="flex items-center pt-2 mt-2 border-t border-gray-200">
                            <div className="relative inline-block w-10 mr-2 align-middle select-none">
                                <input 
                                    id="appleFormat" 
                                    type="checkbox"
                                    checked={options.appleFormat}
                                    onChange={(e) => setOptions({...options, appleFormat: e.target.checked})}
                                    className="absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer focus:outline-none checked:right-0 checked:border-indigo-600 transition-all duration-200 ease-in-out"
                                />
                                <label 
                                    htmlFor="appleFormat"
                                    className="block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer checked:bg-indigo-600"
                                ></label>
                            </div>
                            <label htmlFor="appleFormat" className="text-sm font-medium text-gray-900 cursor-pointer">
                                Apple Format <span className="ml-1 text-xs text-gray-500">(blocks of 6)</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
