'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '../context/ApiAppContext';
import { useLanguage } from '../context/LanguageContext';


import { SearchIcon, MenuIcon, XIcon } from '../components/Icons';
import { SearchResult } from '../types';


const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const router = useRouter();
    const { language, translations, setLanguage } = useLanguage();
    // Updated context usage
    const { logout, companies, selectedCompanyId, selectCompany, auth, companyData, isLoading } = useApi();
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

    // Placeholder for notification message until fully migrated
    const notificationMessage = 'Database integration in progress. Some features may be disabled.';

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const term = e.target.value;
        setSearchTerm(term);
        if (term.length < 2 || isLoading || !companyData) {
            setSearchResults([]);
            return;
        }

        const results: SearchResult[] = [];

        // Search direct customers
        companyData.customers.forEach(c => {
            if (!c.distributorId && (c.name.toLowerCase().includes(term.toLowerCase()) || c.phone.includes(term))) {
                results.push({ type: 'customer', id: c.id, name: c.name, details: c.phone });
            }
        });

        // Search distributors and their customers
        companyData.distributors.forEach(d => {
            if (d.name.toLowerCase().includes(term.toLowerCase()) || d.phone.includes(term)) {
                results.push({ type: 'distributor', id: d.id, name: d.name, details: d.phone });
            }
            // Search customers of this distributor
            const distributorCustomers = companyData.customers.filter(c => c.distributorId === d.id);
            distributorCustomers.forEach(c => {
                 if (c.name.toLowerCase().includes(term.toLowerCase()) || c.phone.includes(term)) {
                    results.push({ type: 'distributor_customer', id: c.id, name: c.name, details: `${c.phone} (${translations.distributors}: ${d.name})`, distributorId: d.id });
                }
            });
        });

        // Search inventory
        companyData.availableLines.forEach(l => {
            if (l.phone.includes(term)) {
                results.push({ type: 'inventory', id: l.id, name: l.phone, details: translations.inventory });
            }
        });

        setSearchResults(results);
    };
    
    const handleResultClick = (result: SearchResult) => {
        setSearchTerm('');
        setSearchResults([]);
        if (result.type === 'customer') {
            router.push(`/customers?highlight=${result.id}&search=${result.name}`);
        } else if (result.type === 'distributor') {
            router.push(`/distributors?highlight=${result.id}&search=${result.name}`);
        } else if (result.type === 'inventory') {
            router.push(`/inventory?highlight=${result.id}&search=${result.name}`);
        } else if (result.type === 'distributor_customer') {
            router.push(`/distributors?highlight=${result.distributorId}&search=${result.name}`);
        }
    };


    const handleLogout = () => {
        logout();
        router.push('/login');
    };
    
    const handleSwitchCompany = (companyId: string) => {
        selectCompany(companyId);
    };

    const NavLinkComponent: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => {
        const pathname = usePathname();
        const isActive = pathname === to || (to === "/dashboard" && pathname === "/");
        return (
            <Link href={to} className={`flex items-center p-2 rounded-lg hover:bg-gray-700 ${isActive ? 'bg-gray-700' : ''}`} onClick={() => setSidebarOpen(false)}>
                {children}
            </Link>
        );
    };
    
    const selectedCompany = companies.find(c => c.id === selectedCompanyId);
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    // 1. Show loading screen while data is being fetched, but only if we are not on the login page.
    if (isLoading && !isLoginPage) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <p className="text-xl text-gray-800 dark:text-gray-200">Loading application data...</p>
            </div>
        );
    }

    // 2. Redirect to login if not authenticated and not on the login page
    if (!auth && !isLoginPage) {
        // This should be handled by the login page redirect, but as a fallback:
        if (typeof window !== 'undefined') {
            router.push('/login');
        }
        return null;
    }

    // 3. If we are on the login page, we should not render the MainLayout chrome (sidebar, header, etc.)
    if (isLoginPage) {
        return <>{children}</>;
    }

    // 4. Handle case where there are no companies (e.g., API failure or empty database)
    if (companies.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <p className="text-xl text-red-500">Error: No companies found. Please check the database and API.</p>
            </div>
        );
    }

    // 5. Handle case where a company is selected but data is not loaded yet (should be covered by isLoading, but for safety)
    if (selectedCompanyId && !companyData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <p className="text-xl text-gray-800 dark:text-gray-200">Loading company data...</p>
            </div>
        );
    }


    return (
        <div className={`min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 ${language === 'ar' ? 'font-cairo' : 'font-sans'}`}>
            <div 
                className={`fixed top-0 bottom-0 bg-gray-800 text-white w-64 p-4 transition-transform duration-300 ease-in-out z-40 ${
                    language === 'ar' 
                    ? (isSidebarOpen ? 'translate-x-0' : 'translate-x-full right-0') 
                    : (isSidebarOpen ? 'translate-x-0' : '-translate-x-full left-0')
                } md:translate-x-0`}
            >
                <h1 className="text-2xl font-bold mb-8 text-center">{selectedCompany?.name || 'Dashboard'}</h1>
                <nav className="space-y-2">
                    <NavLinkComponent to="/dashboard">{translations.dashboard}</NavLinkComponent>
                    <NavLinkComponent to="/customers">{translations.directCustomers}</NavLinkComponent>
                    <NavLinkComponent to="/distributors">{translations.distributors}</NavLinkComponent>
                    <NavLinkComponent to="/add-customer">{translations.addNewCustomer}</NavLinkComponent>
                    <NavLinkComponent to="/plans">{translations.pricePlans}</NavLinkComponent>
                    <NavLinkComponent to="/inventory">{translations.inventory}</NavLinkComponent>
                    <NavLinkComponent to="/financials">{translations.financials}</NavLinkComponent>
                </nav>
            </div>

            <div className={`transition-all duration-300 ease-in-out ${language === 'ar' ? 'md:mr-64' : 'md:ml-64'}`}>
                <header className="bg-white dark:bg-gray-800 shadow-md p-4 flex items-center justify-between sticky top-0 z-30">
                     <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-gray-500 focus:outline-none md:hidden">
                        {isSidebarOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
                    </button>
                    
                    <div className="relative flex-1 max-w-xl mx-4">
                        <SearchIcon className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder={translations.globalSearchPlaceholder}
                            value={searchTerm}
                            onChange={handleSearch}
                            className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {searchResults.length > 0 && (
                            <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto">
                                {searchResults.map((result, index) => (
                                     <li 
                                        key={`${result.type}-${result.id}-${index}`} 
                                        className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                        onClick={() => handleResultClick(result)}
                                    >
                                        <p className="font-semibold">{result.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{result.details}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex items-center space-x-4">
                         <select value={selectedCompanyId || ''} onChange={(e) => handleSwitchCompany(e.target.value)} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2">
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2">
                            <option value="en">EN</option>
                            <option value="ar">AR</option>
                        </select>
                        <button onClick={() => router.push('/companies')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{translations.companies}</button>
                        <button onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{translations.logout}</button>
                    </div>
                </header>
                 {notificationMessage && (
                    <div className="bg-blue-500 text-white text-center p-2 overflow-hidden">
                        <div className="animate-marquee">
                            <span>{notificationMessage}</span>
                        </div>
                    </div>
                )}
                <main className="p-6">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
