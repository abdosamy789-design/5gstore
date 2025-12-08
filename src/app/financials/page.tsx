
'use client';
import React, { useMemo, useState } from 'react';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
// FIX: Added missing PlusIcon import
import { TrendingUpIcon, TrendingDownIcon, DollarSignIcon, ArchiveIcon, PlusIcon } from '../../components/Icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Invoice, Plan } from '../../types';

type BreakdownData = { [key: string]: number };

const FinancialsPageComponent: React.FC = () => {
    const { companyData, recordCommitmentPayment } = useApi();
    const { translations } = useLanguage();
    
    const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
    const [breakdownData, setBreakdownData] = useState<BreakdownData | null>(null);
    const [breakdownTitle, setBreakdownTitle] = useState('');
    const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);


    const financialSummary = useMemo(() => {
        if (!companyData) return null;

        const totalDues = companyData.invoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);
        const { monthlyPayments, monthlyProfits, totalCommitments, paidCommitments } = companyData.financialCycle;
        
        return {
            monthlyPayments,
            totalDues,
            monthlyProfits,
            commitments: totalCommitments - paidCommitments
        };
    }, [companyData]);

    const chartData = useMemo(() => {
        if (!companyData) return [];
        const data: { [month: string]: { revenue: number, expenses: number, profit: number } } = {};
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);

        for (let i = 0; i < 6; i++) {
            const date = new Date(sixMonthsAgo);
            date.setMonth(date.getMonth() + i);
            const monthKey = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            data[monthKey] = { revenue: 0, expenses: 0, profit: 0 };
        }

        companyData.invoices.forEach(invoice => {
            const issueDate = new Date(invoice.issueDate);
            if (issueDate >= sixMonthsAgo) {
                const monthKey = issueDate.toLocaleString('default', { month: 'long', year: 'numeric' });
                const plan = companyData.plans.find(p => p.id === invoice.planId);
                if (data[monthKey] && plan) {
                    data[monthKey].revenue += invoice.paidAmount;
                    data[monthKey].expenses += plan.purchasePrice * (invoice.totalAmount > 0 ? (invoice.paidAmount / invoice.totalAmount) : 0);
                }
            }
        });

        Object.keys(data).forEach(monthKey => {
            data[monthKey].profit = data[monthKey].revenue - data[monthKey].expenses;
        });

        return Object.entries(data).map(([name, values]) => ({ name, ...values }));
    }, [companyData]);

    const calculateBreakdown = (type: 'payments' | 'dues' | 'profits'): BreakdownData => {
        if (!companyData) return {};

        const breakdown: BreakdownData = { [translations.direct]: 0 };
        companyData.distributors.forEach(d => breakdown[d.name] = 0);
        
        companyData.invoices.forEach(invoice => {
            const customer = companyData.customers.find(c => c.id === invoice.customerId);
            if (!customer) return;

            let value = 0;
            if (type === 'payments') {
                value = invoice.paidAmount;
            } else if (type === 'dues') {
                value = invoice.totalAmount - invoice.paidAmount;
            } else if (type === 'profits') {
                 const plan = companyData.plans.find(p => p.id === invoice.planId);
                 if (plan && plan.sellingPrice > 0) {
                     const profitRatio = (plan.sellingPrice - plan.purchasePrice) / plan.sellingPrice;
                     value = invoice.paidAmount * profitRatio;
                 }
            }

            if (customer.distributorId) {
                const distributor = companyData.distributors.find(d => d.id === customer.distributorId);
                if (distributor) {
                    breakdown[distributor.name] += value;
                }
            } else {
                breakdown[translations.direct] += value;
            }
        });

        return breakdown;
    };

    const handleCardClick = (type: 'payments' | 'dues' | 'profits') => {
        const data = calculateBreakdown(type);
        setBreakdownData(data);
        let title = '';
        if (type === 'payments') title = translations.monthlyPayments;
        if (type === 'dues') title = translations.totalDues;
        if (type === 'profits') title = translations.monthlyProfits;
        setBreakdownTitle(`${translations.breakdownOf} ${title}`);
        setIsBreakdownModalOpen(true);
    };

    if (!financialSummary) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatCard title={translations.monthlyPayments} value={financialSummary.monthlyPayments} icon={<TrendingUpIcon className="w-6 h-6"/>} onClick={() => handleCardClick('payments')} />
                 <StatCard title={translations.totalDues} value={financialSummary.totalDues} icon={<TrendingDownIcon className="w-6 h-6"/>} onClick={() => handleCardClick('dues')} />
                 <StatCard title={translations.monthlyProfits} value={financialSummary.monthlyProfits} icon={<DollarSignIcon className="w-6 h-6"/>} onClick={() => handleCardClick('profits')} />
                 <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center justify-between">
                    <div className="flex items-center space-x-4 rtl:space-x-reverse">
                        <div className="bg-yellow-500 text-white p-3 rounded-full"><ArchiveIcon className="w-6 h-6"/></div>
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">{translations.commitments}</p>
                            <p className="text-2xl font-bold">{financialSummary.commitments.toFixed(2)}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsCommitmentModalOpen(true)} className="bg-yellow-500 text-white p-2 rounded-full hover:bg-yellow-600">
                        <PlusIcon className="w-5 h-5"/>
                    </button>
                 </div>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                 <h2 className="text-xl font-bold mb-4">{translations.monthlyDetails}</h2>
                 <div style={{ width: '100%', height: 400 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="revenue" fill="#4ade80" name={translations.revenue} />
                            <Bar dataKey="expenses" fill="#f87171" name={translations.expenses} />
                            <Bar dataKey="profit" fill="#60a5fa" name={translations.profit} />
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
            </div>

            {isBreakdownModalOpen && <BreakdownModal title={breakdownTitle} data={breakdownData} onClose={() => setIsBreakdownModalOpen(false)} />}
            {isCommitmentModalOpen && <CommitmentPaymentModal onSave={recordCommitmentPayment} onClose={() => setIsCommitmentModalOpen(false)} />}
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; onClick: () => void; }> = ({ title, value, icon, onClick }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center space-x-4 rtl:space-x-reverse cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={onClick}>
        <div className="bg-blue-500 text-white p-3 rounded-full">{icon}</div>
        <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{title}</p>
            <p className="text-2xl font-bold">{value.toFixed(2)}</p>
        </div>
    </div>
);

const BreakdownModal: React.FC<{ title: string; data: BreakdownData | null; onClose: () => void; }> = ({ title, data, onClose }) => {
    const { translations } = useLanguage();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">{title}</h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {data && Object.entries(data).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                            <span className="font-semibold">{key}</span>
                            {/* FIX: Cast value to 'number' to resolve typing issue with Object.entries */}
                            <span className="font-bold">{(value as number).toFixed(2)}</span>
                        </div>
                    ))}
                </div>
                <button onClick={onClose} className="mt-6 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">{translations.close}</button>
            </div>
        </div>
    );
};

const CommitmentPaymentModal: React.FC<{ onSave: (amount: number) => void; onClose: () => void; }> = ({ onSave, onClose }) => {
    const [amount, setAmount] = useState('');
    const { translations } = useLanguage();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(parseFloat(amount));
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{translations.recordCommitmentPayment}</h2>
                <form onSubmit={handleSubmit}>
                    <label className="block mb-2">{translations.paymentAmount}</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required step="0.01" />
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button>
                        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function FinancialsPage() { return <FinancialsPageComponent />; }
