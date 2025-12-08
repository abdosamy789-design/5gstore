'use client';
import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
// FIX: Corrected import path to be relative and removed file extension.
import { locales } from '../constants/locales';

interface LanguageContextType {
    language: 'en' | 'ar';
    setLanguage: (language: 'en' | 'ar') => void;
    translations: typeof locales.en;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Set Arabic as the default language
    const [language, setLanguage] = useState<'en' | 'ar'>('ar');

    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
            document.documentElement.lang = language;
            document.body.className = language === 'ar' ? 'font-cairo' : 'font-sans';
        }
    }, [language]);

    const translations = locales[language];

    return (
        <LanguageContext.Provider value={{ language, setLanguage, translations }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = (): LanguageContextType => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
