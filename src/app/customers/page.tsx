'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer, Invoice, Plan } from '../../types';
import { EditIcon, TrashIcon, CashIcon, DocumentTextIcon, CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, CreditCardIcon } from '../../components/Icons';

type FilterStatus = 'all' | 'due' | 'paid';

const CustomersPageComponent: React.FC = () => {
    const { companyData, recordPayment, deleteCustomer, deleteMultipleCustomers, updateCustomer, changeCustomerPlan } = useApi();
    const { translations } = useLanguage();
    const searchParams = useSearchParams();
    const router = useRouter();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
    
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [paymentModalCustomer, setPaymentModalCustomer] = useState<Customer | null>(null);
    const [historyModalCustomer, setHistoryModalCustomer] = useState<Customer | null>(null);
    const [deleteModalCustomer, setDeleteModalCustomer] = useState<Customer | null>(null);
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
    
    const [highlightedId, setHighlightedId] = useState<string | null>(null);

        useEffect(() => {
        const highlight = searchParams.get('highlight');
        const search = searchParams.get('search');
        if (highlight) {
            setHighlightedId(highlight);
            setTimeout(() => setHighlightedId(null), 3000); // Highlight for 3 seconds
        }
        if (search) {
            setSearchTerm(search);
        }
    }, [searchParams]);

    const directCustomers = useMemo(() => {
        return companyData?.customers.filter(c => !c.distributorId) || [];
    }, [companyData?.customers]);

    const getCustomerFinancials = (customerId: string) => {
        const customerInvoices = companyData?.invoices.filter(i => i.customerId === customerId) || [];
        const totalDue = customerInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.paidAmount), 0);
        const monthsDue = customerInvoices.filter(inv => inv.status !== 'paid' && (inv.totalAmount - inv.paidAmount > 0.01)).length;
        return { totalDue, monthsDue };
    };

    const filteredCustomers = useMemo(() => {
        return directCustomers
            .map(customer => ({
                ...customer,
                ...getCustomerFinancials(customer.id),
                plan: companyData?.plans.find(p => p.id === customer.planId),
            }))
            .filter(customer => {
                const searchMatch = customer.name.toLowerCase().includes(searchTerm.toLowerCase()) || customer.phone.includes(searchTerm);
                if (!searchMatch) return false;

                if (filterStatus === 'due') return customer.totalDue > 0;
                if (filterStatus === 'paid') return customer.totalDue <= 0;
                return true;
            });
    }, [directCustomers, searchTerm, filterStatus, companyData?.invoices, companyData?.plans]);
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
        } else {
            setSelectedCustomers(new Set());
        }
    };

    const handleSelectCustomer = (customerId: string) => {
        setSelectedCustomers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(customerId)) {
                newSet.delete(customerId);
            } else {
                newSet.add(customerId);
            }
            return newSet;
        });
    };
    
    const handleDelete = (returnToStock: boolean) => {
        if (deleteModalCustomer) {
            deleteCustomer(deleteModalCustomer.id, returnToStock);
        }
        setDeleteModalCustomer(null);
    };

    const handleBulkDelete = (returnToStock: boolean) => {
        deleteMultipleCustomers(Array.from(selectedCustomers), returnToStock);
        setSelectedCustomers(new Set());
        setBulkDeleteModalOpen(false);
    };

    const PaymentStatusIcon = ({ totalDue }: { totalDue: number }) => {
        if (totalDue <= 0) {
            return <span title={translations.fullyPaid}><CheckCircleIcon className="w-6 h-6 text-green-500" /></span>;
        }
        return <span title={translations.hasDues}><ExclamationCircleIcon className="w-6 h-6 text-red-500" /></span>;
    };
    
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <div className="relative w-full md:w-1/3">
            <input
              type="text"
              placeholder={translations.search}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFilterStatus('all')} className={`px-4 py-2 rounded-lg ${filterStatus === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{translations.allCustomers}</button>
            <button onClick={() => setFilterStatus('due')} className={`px-4 py-2 rounded-lg ${filterStatus === 'due' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{translations.hasDues}</button>
            <button onClick={() => setFilterStatus('paid')} className={`px-4 py-2 rounded-lg ${filterStatus === 'paid' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{translations.fullyPaid}</button>
          </div>
        </div>
        
        {selectedCustomers.size > 0 && (
            <div className="bg-blue-100 dark:bg-blue-900 border border-blue-400 text-blue-700 dark:text-blue-300 px-4 py-3 rounded relative mb-4 flex items-center justify-between">
                <span>{selectedCustomers.size} {translations.customers} selected</span>
                <button onClick={() => setBulkDeleteModalOpen(true)} className="bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 flex items-center gap-1">
                    <TrashIcon className="w-4 h-4" /> {translations.deleteSelected}
                </button>
            </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="p-3"><input type="checkbox" onChange={handleSelectAll} checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0} /></th>
                <th className="p-3">{translations.customerName}</th>
                <th className="p-3">{translations.phone}</th>
                <th className="p-3">{translations.monthsDue}</th>
                <th className="p-3">{translations.totalDue}</th>
                <th className="p-3">{translations.credit}</th>
                <th className="p-3">{translations.paymentStatus}</th>
                <th className="p-3">{translations.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 ${highlightedId === customer.id ? 'bg-blue-100 dark:bg-blue-900 animate-pulse-fast' : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={selectedCustomers.has(customer.id)} onChange={() => handleSelectCustomer(customer.id)} /></td>
                  <td className="p-3 font-semibold">{customer.name}</td>
                  <td className="p-3">{customer.phone}</td>
                  <td className="p-3 text-center">{customer.monthsDue}</td>
                  <td className="p-3">{customer.totalDue.toFixed(2)}</td>
                  <td className="p-3">{customer.credit.toFixed(2)}</td>
                  <td className="p-3"><PaymentStatusIcon totalDue={customer.totalDue} /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPaymentModalCustomer(customer)} className="text-green-500 hover:text-green-700"><CashIcon className="w-5 h-5" /></button>
                      <button onClick={() => setEditingCustomer(customer)} className="text-blue-500 hover:text-blue-700"><EditIcon className="w-5 h-5" /></button>
                      <button onClick={() => setHistoryModalCustomer(customer)} className="text-purple-500 hover:text-purple-700"><DocumentTextIcon className="w-5 h-5" /></button>
                      <button onClick={() => setDeleteModalCustomer(customer)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modals */}
        {paymentModalCustomer && <PaymentModal customer={paymentModalCustomer} onClose={() => setPaymentModalCustomer(null)} onSave={recordPayment} />}
        {editingCustomer && <EditCustomerModal customer={editingCustomer} plans={companyData?.plans || []} onClose={() => setEditingCustomer(null)} onSave={updateCustomer} onChangePlan={changeCustomerPlan} />}
        {historyModalCustomer && <PaymentHistoryModal customer={historyModalCustomer} onClose={() => setHistoryModalCustomer(null)} />}
        {deleteModalCustomer && <DeleteModal title={translations.deleteCustomer} onConfirm={handleDelete} onCancel={() => setDeleteModalCustomer(null)} />}
        {bulkDeleteModalOpen && <DeleteModal title={translations.deleteSelected} onConfirm={handleBulkDelete} onCancel={() => setBulkDeleteModalOpen(false)} />}
      </div>
    );
};

// Payment Modal
const PaymentModal = ({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (customerId: string, amount: number) => void }) => {
    const [amount, setAmount] = useState('');
    const { translations } = useLanguage();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(customer.id, parseFloat(amount));
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{translations.paymentFor} {customer.name}</h2>
                <form onSubmit={handleSubmit}>
                    <label className="block mb-2">{translations.amountPaid}</label>
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

// Edit Customer Modal
const EditCustomerModal = ({ customer, plans, onClose, onSave, onChangePlan }: { customer: Customer; plans: Plan[]; onClose: () => void; onSave: (customer: Customer) => void; onChangePlan: (customerId: string, newPlanId: string) => void; }) => {
    const [formData, setFormData] = useState(customer);
    const [newPlanId, setNewPlanId] = useState('');
    const { translations } = useLanguage();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'idCardFront' | 'idCardBack') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, [field]: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        if (newPlanId && newPlanId !== customer.planId) {
            onChangePlan(customer.id, newPlanId);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-lg max-h-full overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">{translations.edit} {customer.name}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label>{translations.customerName}</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                    </div>
                     <div>
                        <label>{translations.whatsapp}</label>
                        <input type="text" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} className="w-full p-2 border rounded-lg dark:bg-gray-700" />
                    </div>
                    <div>
                        <label>{translations.currentPlan}</label>
                        <input type="text" value={plans.find(p => p.id === formData.planId)?.name || ''} readOnly className="w-full p-2 border rounded-lg bg-gray-100 dark:bg-gray-600" />
                    </div>
                    <div>
                        <label>{translations.changePlanTo}</label>
                        <select value={newPlanId} onChange={e => setNewPlanId(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700">
                            <option value="">{translations.noChange}</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {newPlanId && <p className="text-sm text-yellow-500 mt-1">{translations.changePlanNote}</p>}
                    </div>
                     <div className="mt-4">
                        <h3 className="font-semibold mb-2">{translations.idCardImages}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">{translations.idCardFront}</label>
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'idCardFront')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                {formData.idCardFront && <img src={formData.idCardFront} alt="Front" className="mt-2 rounded-lg max-h-32" />}
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">{translations.idCardBack}</label>
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'idCardBack')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                {formData.idCardBack && <img src={formData.idCardBack} alt="Back" className="mt-2 rounded-lg max-h-32" />}
                            </div>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button>
                        <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Payment History Modal
const PaymentHistoryModal = ({ customer, onClose }: { customer: Customer; onClose: () => void; }) => {
    const { companyData } = useApi();
    const { translations } = useLanguage();

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const payments = useMemo(() => {
        return companyData?.payments
            .filter(p => p.customerId === customer.id && new Date(p.date) >= sixMonthsAgo)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];
    }, [companyData?.payments, customer.id]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">{translations.paymentHistory} - {customer.name}</h2>
                <div className="max-h-80 overflow-y-auto">
                    {payments.length > 0 ? (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="p-2 text-left">{translations.date}</th>
                                    <th className="p-2 text-left">{translations.amount}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(payment => (
                                    <tr key={payment.id} className="border-b dark:border-gray-700">
                                        <td className="p-2">{new Date(payment.date).toLocaleString()}</td>
                                        <td className="p-2">{payment.amount.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p>{translations.noPaymentsFound}</p>}
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.close}</button>
                </div>
            </div>
        </div>
    );
};

// Generic Delete Confirmation Modal
const DeleteModal = ({ title, onConfirm, onCancel }: { title: string; onConfirm: (returnToStock: boolean) => void; onCancel: () => void; }) => {
    const { translations } = useLanguage();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{title}</h2>
                <p className="mb-6">{translations.areYouSure}</p>
                <div className="flex justify-end gap-4">
                    <button onClick={onCancel} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button>
                    <button onClick={() => onConfirm(false)} className="bg-red-600 text-white px-4 py-2 rounded-lg">{translations.deletePermanently}</button>
                    <button onClick={() => onConfirm(true)} className="bg-yellow-500 text-white px-4 py-2 rounded-lg">{translations.deleteAndReturnToStock}</button>
                </div>
            </div>
        </div>
    );
};

export default function CustomersPage() { return <CustomersPageComponent />; }
