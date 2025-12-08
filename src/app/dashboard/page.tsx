'use client';

import React, { useState, useMemo } from 'react';
import { useApi } from '../../context/ApiAppContext'; // Use the new API context
import { useLanguage } from '../../context/LanguageContext';
import { UsersIcon, PhoneIcon, ArchiveIcon, ExclamationCircleIcon, CheckCircleIcon, PackageIcon, ClockIcon } from '../../components/Icons';
import { Plan } from '../../types';

const DashboardPageComponent: React.FC = () => {
    const { companyData } = useApi(); // Use useApi
    const { translations } = useLanguage();
    const [isPlanDetailsModalOpen, setPlanDetailsModalOpen] = useState(false);

    const stats = useMemo(() => {
        if (!companyData) return null;

        const directCustomers = companyData.customers.filter(c => !c.distributorId);
        
        let directCustomersWithDues = 0;
        directCustomers.forEach(customer => {
            // Check if any invoice for this customer has an outstanding balance
            const hasDueInvoice = companyData.invoices.some(invoice => 
                invoice.customerId === customer.id && 
                invoice.status !== 'paid' && 
                (invoice.totalAmount - invoice.paidAmount > 0)
            );
            if(hasDueInvoice) {
                directCustomersWithDues++;
            }
        });

        // Calculate days until next billing (assuming billing day is 11th of the month)
        const billingDay = 11;
        const today = new Date();
        let nextBillingDate = new Date(today.getFullYear(), today.getMonth(), billingDay);
        if (today.getDate() >= billingDay) {
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }
        const daysUntilBilling = Math.ceil((nextBillingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        return {
            totalDirectCustomers: directCustomers.length,
            activeLines: companyData.customers.length,
            inactiveLines: companyData.availableLines.length,
            directCustomersWithDues,
            paidDirectCustomers: directCustomers.length - directCustomersWithDues,
            daysUntilBilling,
        };
    }, [companyData]);

    const planStats = useMemo(() => {
        if (!companyData) return [];
        const activeLinesByPlan = companyData.customers.reduce((acc, customer) => {
            acc[customer.planId] = (acc[customer.planId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return companyData.plans.map(plan => ({
            ...plan,
            lineCount: activeLinesByPlan[plan.id] || 0,
        })).filter(plan => plan.lineCount > 0);
    }, [companyData]);


    if (!stats) {
        return <div>{translations.loading}...</div>;
    }
    
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

    return (
        <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title={translations.totalDirectCustomers} value={stats.totalDirectCustomers} icon={<UsersIcon className="w-6 h-6" />} />
                <StatCard title={translations.activeLines} value={stats.activeLines} icon={<PhoneIcon className="w-6 h-6" />} />
                <StatCard title={translations.inactiveLines} value={stats.inactiveLines} icon={<ArchiveIcon className="w-6 h-6" />} />
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center space-x-4 rtl:space-x-reverse cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => setPlanDetailsModalOpen(true)}>
                    <div className="bg-purple-500 text-white p-3 rounded-full">
                        <PackageIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{translations.pricePlansDetails}</p>
                        <p className="text-lg font-bold">{translations.viewDetails}</p>
                    </div>
                </div>
                <StatCard title={translations.directCustomersWithDues} value={stats.directCustomersWithDues} icon={<ExclamationCircleIcon className="w-6 h-6" />} />
                <StatCard title={translations.paidDirectCustomers} value={stats.paidDirectCustomers} icon={<CheckCircleIcon className="w-6 h-6" />} />
                <StatCard title={translations.daysUntilBilling} value={stats.daysUntilBilling} icon={<ClockIcon className="w-6 h-6" />} />

            </div>
            
            {/* Plan Details Modal */}
            {isPlanDetailsModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">{translations.pricePlansDetails}</h2>
                        <div className="space-y-4">
                           {planStats.length > 0 ? planStats.map(plan => (
                               <div key={plan.id} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                                   <span className="font-semibold">{plan.name}</span>
                                   <span className="text-blue-500 font-bold">{plan.lineCount} {translations.lineCount}</span>
                               </div>
                           )) : <p>{translations.noResultsFound}</p>}
                        </div>
                        <button onClick={() => setPlanDetailsModalOpen(false)} className="mt-6 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                            {translations.close}
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};

export default function DashboardPage() { return <DashboardPageComponent />; }
