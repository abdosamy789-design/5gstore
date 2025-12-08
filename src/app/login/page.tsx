'use client';

import React, { useState } from 'react';
import { useApi } from '../../context/ApiAppContext'; // Use the new API context
import { useRouter } from 'next/navigation';
import { useLanguage } from '../../context/LanguageContext';
import { ShieldCheckIcon, KeyIcon, StoreLogoIcon } from '../../components/Icons';

const LoginPageComponent: React.FC = () => {
    const { login, companies, isLoading } = useApi(); // Use useApi
    const { translations } = useLanguage();
    const router = useRouter();
    
    const [activeTab, setActiveTab] = useState<'admin' | 'agent'>('admin');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    // Placeholder for appSettings until we fetch it
    const appSettings = { loginWelcomeMessage: 'Welcome to the Mobile Line Manager!' };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        
        // Determine if we should pass a password (only for admin)
        const loginPassword = activeTab === 'admin' ? password : undefined;

        const user = await login(username, loginPassword);
        
        if (user) {
            if (user.role === 'admin') {
                // Admin should be redirected to companies page to select one
                router.push('/companies');
            } else {
                // Agent is automatically assigned a company
                router.push('/dashboard');
            }
        } else {
            setError(translations.loginError);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-500 to-indigo-600">
            <div className="text-center mb-8 text-white">
                <div className="flex items-center justify-center gap-4">
                     <StoreLogoIcon className="w-16 h-16 text-white"/>
                    <h1 className="text-5xl font-bold">{translations.siteName}</h1>
                </div>
                <p className="mt-4 text-lg">{appSettings.loginWelcomeMessage}</p>
            </div>

            <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden">
                <div className="flex">
                    <button 
                        onClick={() => setActiveTab('admin')} 
                        className={`w-1/2 p-4 font-semibold flex items-center justify-center gap-2 ${activeTab === 'admin' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                    >
                        <ShieldCheckIcon className="w-5 h-5"/> {translations.adminLogin}
                    </button>
                    <button 
                        onClick={() => setActiveTab('agent')} 
                        className={`w-1/2 p-4 font-semibold flex items-center justify-center gap-2 ${activeTab === 'agent' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                    >
                        <KeyIcon className="w-5 h-5"/> {translations.agentLogin}
                    </button>
                </div>

                <div className="p-8">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block font-semibold mb-2">{translations.username}</label>
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700" required />
                        </div>
                        {activeTab === 'admin' && (
                            <div>
                                <label className="block font-semibold mb-2">{translations.password}</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700" required />
                            </div>
                        )}
                        {error && <p className="text-red-500 text-center">{error}</p>}
                        <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-lg font-bold text-lg hover:bg-blue-600 transition-colors" disabled={isLoading}>{translations.login}</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default function LoginPage() { return <LoginPageComponent />; }
