
'use client';
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Distributor, Customer, Invoice, Plan } from '../../types';
import { EditIcon, TrashIcon, PlusIcon, CashIcon, DocumentTextIcon, ChevronDownIcon, ChevronUpIcon } from '../../components/Icons';

type DistributorWithDetails = Distributor & {
  customerCount: number;
  totalInvoicesValue: number;
  totalCollectedFromCustomers: number;
  totalDeliveredToCompany: number;
  balance: number;
};

const DistributorsPageComponent: React.FC = () => {
    const { companyData, addDistributor, updateDistributor, deleteDistributor, addDistributorPayment, deleteCustomer } = useApi();
    const { translations } = useLanguage();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDistributor, setEditingDistributor] = useState<Distributor | null>(null);
    const [deletingDistributor, setDeletingDistributor] = useState<Distributor | null>(null);
    const [paymentModalDistributor, setPaymentModalDistributor] = useState<Distributor | null>(null);
    const [detailsModalDistributor, setDetailsModalDistributor] = useState<DistributorWithDetails | null>(null);
    const [expandedDistributor, setExpandedDistributor] = useState<string | null>(null);

    const [highlightedId, setHighlightedId] = useState<string | null>(null);

    useEffect(() => {
        const highlight = searchParams.get('highlight');
        const search = searchParams.get('search');
        if (highlight) {
            setHighlightedId(highlight);
            setExpandedDistributor(highlight); // Also expand it
            setTimeout(() => setHighlightedId(null), 3000);
        }
        if (search) {
            setSearchTerm(search);
        }
    }, [searchParams]);

    const distributorsWithDetails = useMemo((): DistributorWithDetails[] => {
        if (!companyData) return [];
        return companyData.distributors.map(distributor => {
            const customers = companyData.customers.filter(c => c.distributorId === distributor.id);
            const customerIds = customers.map(c => c.id);
            const invoices = companyData.invoices.filter(i => customerIds.includes(i.customerId));
            
            const totalInvoicesValue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
            const totalCollectedFromCustomers = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
            const totalDeliveredToCompany = distributor.payments.reduce((sum, p) => sum + p.amount, 0);
            
            return {
                ...distributor,
                customerCount: customers.length,
                totalInvoicesValue,
                totalCollectedFromCustomers,
                totalDeliveredToCompany,
                balance: totalCollectedFromCustomers - totalDeliveredToCompany
            };
        });
    }, [companyData]);

    const filteredDistributors = useMemo(() => {
        return distributorsWithDetails.filter(d => 
            d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            d.phone.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [distributorsWithDetails, searchTerm]);

    const handleOpenModal = (distributor: Distributor | null) => {
        setEditingDistributor(distributor);
        setIsModalOpen(true);
    };

    const handleSave = (data: Omit<Distributor, 'id' | 'payments'> | Distributor) => {
        if ('id' in data) {
            updateDistributor(data);
        } else {
            addDistributor(data);
        }
        setIsModalOpen(false);
    };
    
    const handleDelete = () => {
        if (deletingDistributor) {
            deleteDistributor(deletingDistributor.id);
            setDeletingDistributor(null);
        }
    };
    
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-full md:w-1/3">
             <input type="text" placeholder={translations.search} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700"/>
          </div>
          <button onClick={() => handleOpenModal(null)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <PlusIcon className="w-5 h-5"/> {translations.addAgent}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="p-3 w-8"></th>
                <th className="p-3">{translations.distributorName}</th>
                <th className="p-3">{translations.phone}</th>
                <th className="p-3 text-center">{translations.customerCount}</th>
                <th className="p-3">{translations.distributorRevenue}</th>
                <th className="p-3">{translations.distributorDues}</th>
                <th className="p-3">{translations.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDistributors.map((distributor) => (
                <React.Fragment key={distributor.id}>
                    <tr className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 ${highlightedId === distributor.id ? 'bg-blue-100 dark:bg-blue-900 animate-pulse-fast' : ''}`}>
                      <td className="p-3 text-center">
                         <button onClick={() => setExpandedDistributor(expandedDistributor === distributor.id ? null : distributor.id)}>
                            {expandedDistributor === distributor.id ? <ChevronUpIcon className="w-5 h-5"/> : <ChevronDownIcon className="w-5 h-5"/>}
                         </button>
                      </td>
                      <td className="p-3 font-semibold">{distributor.name}</td>
                      <td className="p-3">{distributor.phone}</td>
                      <td className="p-3 text-center">{distributor.customerCount}</td>
                      <td className="p-3 text-green-500">{distributor.totalDeliveredToCompany.toFixed(2)}</td>
                      <td className={`p-3 font-bold ${distributor.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>{distributor.balance.toFixed(2)}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setPaymentModalDistributor(distributor)} className="text-green-500" title={translations.recordDistributorPayment}><CashIcon className="w-5 h-5"/></button>
                          <button onClick={() => setDetailsModalDistributor(distributor)} className="text-purple-500" title={translations.details}><DocumentTextIcon className="w-5 h-5"/></button>
                          <button onClick={() => handleOpenModal(distributor)} className="text-blue-500" title={translations.edit}><EditIcon className="w-5 h-5"/></button>
                          <button onClick={() => setDeletingDistributor(distributor)} className="text-red-500" title={translations.delete}><TrashIcon className="w-5 h-5"/></button>
                        </div>
                      </td>
                    </tr>
                    {expandedDistributor === distributor.id && (
                        <tr>
                            <td colSpan={7} className="p-4 bg-gray-50 dark:bg-gray-900">
                                <DistributorCustomers
                                  distributorId={distributor.id}
                                  initialSearch={highlightedId === distributor.id ? searchTerm : ''}
                                />
                            </td>
                        </tr>
                    )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        
        {isModalOpen && <DistributorFormModal distributor={editingDistributor} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
        {deletingDistributor && <DeleteConfirmationModal title={translations.deleteAgent} message={translations.deleteAgentConfirmation} onConfirm={handleDelete} onCancel={() => setDeletingDistributor(null)} />}
        {paymentModalDistributor && <PaymentModal distributor={paymentModalDistributor} onSave={addDistributorPayment} onClose={() => setPaymentModalDistributor(null)} />}
        {detailsModalDistributor && <DetailsModal distributor={detailsModalDistributor} onClose={() => setDetailsModalDistributor(null)} />}
      </div>
    );
};


const DistributorCustomers: React.FC<{ distributorId: string; initialSearch: string }> = ({ distributorId, initialSearch }) => {
    const { companyData, deleteCustomer } = useApi();
    const { translations } = useLanguage();
    const [customerSearch, setCustomerSearch] = useState(initialSearch);
    const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

    const customers = useMemo(() => {
        if (!companyData) return [];
        return companyData.customers
            .filter(c => c.distributorId === distributorId)
            .map(c => ({
                ...c,
                plan: companyData.plans.find(p => p.id === c.planId)
            }))
            .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone.includes(customerSearch));
    }, [companyData, distributorId, customerSearch]);

    const handleDelete = (returnToStock: boolean) => {
        if(deletingCustomer) {
            deleteCustomer(deletingCustomer.id, returnToStock);
        }
        setDeletingCustomer(null);
    }
    
    return (
        <div>
            <h3 className="font-bold mb-2">{translations.associatedCustomers}</h3>
            <input 
                type="text" 
                value={customerSearch} 
                onChange={(e) => setCustomerSearch(e.target.value)} 
                placeholder={translations.search}
                className="w-full p-2 border rounded-lg dark:bg-gray-800 mb-2"
            />
            <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-200 dark:bg-gray-800">
                            <th className="p-2">{translations.customerName}</th>
                            <th className="p-2">{translations.phone}</th>
                            <th className="p-2">{translations.plan}</th>
                            <th className="p-2">{translations.actions}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map(customer => (
                             <tr key={customer.id} className="border-b dark:border-gray-700">
                                <td className="p-2">{customer.name}</td>
                                <td className="p-2">{customer.phone}</td>
                                <td className="p-2">{customer.plan?.name}</td>
                                <td className="p-2">
                                    <button onClick={() => setDeletingCustomer(customer)} className="text-red-500"><TrashIcon className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
             {deletingCustomer && <DeleteModal title={translations.deleteDistributorCustomer} onConfirm={handleDelete} onCancel={() => setDeletingCustomer(null)} />}
        </div>
    );
};

// Modals
type DistributorFormModalProps = { onClose: () => void; } & (
    | { distributor: Distributor; onSave: (data: Omit<Distributor, 'payments'>) => void; }
    | { distributor: null; onSave: (data: Omit<Distributor, 'id' | 'payments'>) => void; }
);

const DistributorFormModal: React.FC<DistributorFormModalProps> = (props) => {
    const { onClose, distributor, onSave } = props;
    const [formData, setFormData] = useState({ name: distributor?.name || '', phone: distributor?.phone || '' });
    const { translations } = useLanguage();
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (distributor) {
            (onSave as (data: Omit<Distributor, 'payments'>) => void)({ ...distributor, ...formData });
        } else {
            (onSave as (data: Omit<Distributor, 'id' | 'payments'>) => void)(formData);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{distributor ? translations.editAgent : translations.addAgent}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label>{translations.distributorName}</label><input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                    <div><label>{translations.phone}</label><input value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                    <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button></div>
                </form>
            </div>
        </div>
    );
};

const DeleteConfirmationModal: React.FC<{ title: string; message: string; onConfirm: () => void; onCancel: () => void; }> = ({ title, message, onConfirm, onCancel }) => {
    const { translations } = useLanguage();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{title}</h2>
                <p className="mb-6">{message}</p>
                <div className="flex justify-end gap-4"><button onClick={onCancel} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-lg">{translations.delete}</button></div>
            </div>
        </div>
    );
};

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

const PaymentModal = ({ distributor, onSave, onClose }: { distributor: Distributor; onSave: (id: string, amount: number) => void; onClose: () => void; }) => {
    const [amount, setAmount] = useState('');
    const { translations } = useLanguage();
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(distributor.id, parseFloat(amount));
        onClose();
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{translations.recordDistributorPayment}</h2>
                <form onSubmit={handleSubmit}>
                    <label>{translations.paymentAmount}</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required step="0.01" />
                    <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button></div>
                </form>
            </div>
        </div>
    );
};

const DetailsModal = ({ distributor, onClose }: { distributor: DistributorWithDetails, onClose: () => void; }) => {
    const { companyData } = useApi();
    const { translations } = useLanguage();

    // FIX: Moved sixMonthsAgo to a higher scope to be accessible by both monthlyData and paymentLog
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyData = useMemo(() => {
        const data: { [key: string]: { dues: number, collected: number } } = {};

        const customerIds = companyData?.customers.filter(c => c.distributorId === distributor.id).map(c => c.id) || [];
        const invoices = companyData?.invoices.filter(i => customerIds.includes(i.customerId) && new Date(i.issueDate) >= sixMonthsAgo) || [];

        invoices.forEach(invoice => {
            const month = new Date(invoice.issueDate).toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!data[month]) data[month] = { dues: 0, collected: 0 };
            data[month].dues += (invoice.totalAmount - invoice.paidAmount);
            data[month].collected += invoice.paidAmount;
        });
        return data;
    }, [companyData, distributor.id]);

    const paymentLog = distributor.payments
        .filter(p => new Date(p.date) >= sixMonthsAgo)
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-full overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">{translations.details} - {distributor.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-semibold mb-2">{translations.monthlyDetails}</h3>
                         <div className="space-y-2">
                             {Object.entries(monthlyData).map(([month, values]) => (
                                 <div key={month} className="p-2 bg-gray-100 dark:bg-gray-700 rounded">
                                     <p className="font-bold">{month}</p>
                                     {/* FIX: Cast values to 'any' to resolve typing issue with Object.entries */}
                                     <p>{translations.collectedFromCustomers}: <span className="text-green-500">{(values as any).collected.toFixed(2)}</span></p>
                                     {/* FIX: Cast values to 'any' to resolve typing issue with Object.entries */}
                                     <p>{translations.duesFromCustomers}: <span className="text-red-500">{(values as any).dues.toFixed(2)}</span></p>
                                 </div>
                             ))}
                         </div>
                    </div>
                     <div>
                        <h3 className="font-semibold mb-2">{translations.paymentLog}</h3>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                             {paymentLog.map((payment, index) => (
                                 <div key={index} className="p-2 bg-gray-100 dark:bg-gray-700 rounded flex justify-between">
                                     <span>{new Date(payment.date).toLocaleString()}</span>
                                     <span className="font-bold text-green-500">{payment.amount.toFixed(2)}</span>
                                 </div>
                             ))}
                         </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.close}</button>
                </div>
            </div>
        </div>
    );
};

export default function DistributorsPage() { return <DistributorsPageComponent />; }
