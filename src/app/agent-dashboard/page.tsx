'use client';
import React, { useMemo } from 'react';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { UsersIcon, DollarSignIcon, TrendingDownIcon } from '../../components/Icons';
import { useRouter } from 'next/navigation';

const AgentDashboardPageComponent: React.FC = () => {
    const { auth, companyData, logout } = useApi();
    const { translations, language, setLanguage } = useLanguage();
    const router = useRouter();

    const agentData = useMemo(() => {
        if (!auth || !companyData || auth.role !== 'agent') return null;

        const distributor = companyData.distributors.find(d => d.id === auth.distributorId);
        if (!distributor) return null;

        const customers = companyData.customers.filter(c => c.distributorId === distributor.id);
        const customerIds = customers.map(c => c.id);
        const invoices = companyData.invoices.filter(i => customerIds.includes(i.customerId));
        
        const totalInvoicesValue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
        const totalCollectedFromCustomers = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
        const totalDeliveredToCompany = distributor.payments.reduce((sum, p) => sum + p.amount, 0);
        
        return {
            distributorName: distributor.name,
            customers,
            customerCount: customers.length,
            totalDues: totalInvoicesValue - totalCollectedFromCustomers,
            balance: totalCollectedFromCustomers - totalDeliveredToCompany,
        };
    }, [auth, companyData]);
    
    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    if (!agentData) {
        return (
            <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                <p>Error: Could not load agent data.</p>
                <button onClick={handleLogout} className="ml-4 bg-red-500 text-white p-2 rounded">Logout</button>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
             <header className="bg-white dark:bg-gray-800 shadow-md p-4 flex items-center justify-between sticky top-0 z-30">
                <h1 className="text-2xl font-bold">{translations.welcome}, {auth?.username}</h1>
                 <div className="flex items-center space-x-4">
                     <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')} className="bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md p-2">
                         <option value="en">EN</option>
                         <option value="ar">AR</option>
                     </select>
                     <button onClick={handleLogout} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">{translations.logout}</button>
                 </div>
            </header>
            
            <main className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <StatCard title={translations.customerCount} value={agentData.customerCount} icon={<UsersIcon className="w-6 h-6"/>} />
                    <StatCard title={translations.totalDues} value={agentData.totalDues.toFixed(2)} icon={<TrendingDownIcon className="w-6 h-6"/>} />
                    <StatCard title={translations.distributorBalance} value={agentData.balance.toFixed(2)} icon={<DollarSignIcon className="w-6 h-6"/>} />
                </div>
                
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold mb-4">{translations.yourCustomers}</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="p-3">{translations.customerName}</th>
                                    <th className="p-3">{translations.phone}</th>
                                    <th className="p-3">{translations.plan}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agentData.customers.map(customer => {
                                    const plan = companyData?.plans.find(p => p.id === customer.planId);
                                    return (
                                        <tr key={customer.id} className="border-b dark:border-gray-700">
                                            <td className="p-3 font-semibold">{customer.name}</td>
                                            <td className="p-3">{customer.phone}</td>
                                            <td className="p-3">{plan?.name || 'N/A'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: number | string; icon: React.ReactNode; }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center space-x-4 rtl:space-x-reverse">
        <div className="bg-blue-500 text-white p-3 rounded-full">
            {icon}
        </div>
        <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
        </div>
    </div>
);


export default function AgentDashboardPage() { return <AgentDashboardPageComponent />; }
