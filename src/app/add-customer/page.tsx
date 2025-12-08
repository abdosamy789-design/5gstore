'use client';
import React, { useState, useMemo } from 'react';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Customer, Plan, Distributor, AvailableLine } from '../../types';
import { useRouter } from 'next/navigation';

type CustomerType = 'direct' | 'distributor';

const AddNewCustomerPageComponent: React.FC = () => {
    const { companyData, addNewCustomer, registerMultipleCustomersForDistributor } = useApi();
    const { translations } = useLanguage();
    const router = useRouter();
    
    const [customerType, setCustomerType] = useState<CustomerType>('direct');

    const [directCustomerData, setDirectCustomerData] = useState<Partial<Omit<Customer, 'id' | 'joinDate' | 'credit' | 'phone' | 'planId'>>>({ name: '', whatsapp: '' });
    const [selectedLineId, setSelectedLineId] = useState<string>('');
    const [paid, setPaid] = useState(true);
    const [nameSuggestions, setNameSuggestions] = useState<Customer[]>([]);
    
    const [distributorId, setDistributorId] = useState<string>(companyData?.distributors[0]?.id || '');
    const [isLineModalOpen, setIsLineModalOpen] = useState(false);
    const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const name = e.target.value;
        setDirectCustomerData(prev => ({ ...prev, name }));
        if (name.length > 2) {
            const suggestions = companyData?.customers.filter(c => c.name.toLowerCase().includes(name.toLowerCase()) && !c.distributorId) || [];
            setNameSuggestions(suggestions);
        } else {
            setNameSuggestions([]);
        }
    };

    const handleSuggestionClick = (customer: Customer) => {
        setDirectCustomerData({
            name: customer.name,
            whatsapp: customer.whatsapp,
            idCardFront: customer.idCardFront,
            idCardBack: customer.idCardBack
        });
        setNameSuggestions([]);
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'idCardFront' | 'idCardBack') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setDirectCustomerData(prev => ({ ...prev, [field]: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDirectSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!directCustomerData.name || !directCustomerData.whatsapp || !selectedLineId || !directCustomerData.idCardFront || !directCustomerData.idCardBack) {
            alert('Please fill all fields');
            return;
        }
        addNewCustomer(directCustomerData as Omit<Customer, 'id' | 'joinDate' | 'credit'>, selectedLineId, paid);
        alert(translations.customerAddedSuccess);
        router.push('/customers');
    };
    
    const handleDistributorSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!distributorId || selectedLines.size === 0) {
            alert('Please select an agent and at least one line');
            return;
        }
        registerMultipleCustomersForDistributor(distributorId, Array.from(selectedLines), paid);
        alert(translations.customersAddedSuccess);
        router.push('/distributors');
    };

    const selectedLinePlan = useMemo(() => {
        if (!selectedLineId) return null;
        const line = companyData?.availableLines.find(l => l.id === selectedLineId);
        return companyData?.plans.find(p => p.id === line?.planId);
    }, [selectedLineId, companyData]);
    
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">{translations.addNewCustomer}</h1>

            <div className="mb-6">
                <label className="block font-semibold mb-2">{translations.customerType}</label>
                <div className="flex gap-4">
                    <button onClick={() => setCustomerType('direct')} className={`px-4 py-2 rounded-lg ${customerType === 'direct' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{translations.directCustomer}</button>
                    <button onClick={() => setCustomerType('distributor')} className={`px-4 py-2 rounded-lg ${customerType === 'distributor' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{translations.distributorCustomer}</button>
                </div>
            </div>

            {customerType === 'direct' ? (
                // Direct Customer Form
                <form onSubmit={handleDirectSubmit} className="space-y-4">
                    <div className="relative">
                        <label className="block font-semibold">{translations.customerName} *</label>
                        <input type="text" value={directCustomerData.name} onChange={handleNameChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                        {nameSuggestions.length > 0 && (
                            <ul className="absolute z-10 w-full bg-white dark:bg-gray-900 border rounded-lg mt-1">
                                {nameSuggestions.map(s => <li key={s.id} onClick={() => handleSuggestionClick(s)} className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">{s.name}</li>)}
                            </ul>
                        )}
                    </div>
                    <div><label className="block font-semibold">{translations.whatsapp} *</label><input type="text" value={directCustomerData.whatsapp} onChange={e => setDirectCustomerData(prev => ({...prev, whatsapp: e.target.value}))} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                    <div>
                        <label className="block font-semibold">{translations.selectLine} *</label>
                        <select value={selectedLineId} onChange={e => setSelectedLineId(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required>
                            <option value="">--</option>
                            {companyData?.availableLines.map(l => <option key={l.id} value={l.id}>{l.phone}</option>)}
                        </select>
                         {selectedLinePlan && <p className="text-sm text-gray-500 mt-1">{translations.plan}: {selectedLinePlan.name}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block font-semibold">{translations.idCardFrontImage} *</label>
                            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'idCardFront')} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" required />
                            {directCustomerData.idCardFront && <img src={directCustomerData.idCardFront} className="mt-2 rounded-lg max-h-32" />}
                        </div>
                        <div>
                            <label className="block font-semibold">{translations.idCardBackImage} *</label>
                            <input type="file" accept="image/*" onChange={e => handleFileChange(e, 'idCardBack')} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" required />
                             {directCustomerData.idCardBack && <img src={directCustomerData.idCardBack} className="mt-2 rounded-lg max-h-32" />}
                        </div>
                    </div>
                     <div className="flex items-center gap-2">
                        <input type="checkbox" id="paid" checked={paid} onChange={e => setPaid(e.target.checked)} />
                        <label htmlFor="paid">{translations.paid}</label>
                    </div>
                    <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-lg font-bold hover:bg-blue-600">{translations.add} {translations.customer}</button>
                </form>
            ) : (
                // Distributor Customer Form
                <form onSubmit={handleDistributorSubmit} className="space-y-4">
                    <div>
                        <label className="block font-semibold">{translations.selectDistributor}</label>
                        <select value={distributorId} onChange={e => setDistributorId(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700">
                             {companyData?.distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <button type="button" onClick={() => setIsLineModalOpen(true)} className="w-full p-2 border-dashed border-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">{translations.selectLines} ({selectedLines.size})</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="dist-paid" checked={paid} onChange={e => setPaid(e.target.checked)} />
                        <label htmlFor="dist-paid">{translations.paid}</label>
                    </div>
                    <button type="submit" className="w-full bg-blue-500 text-white p-3 rounded-lg font-bold hover:bg-blue-600">{translations.add} {translations.customers}</button>
                </form>
            )}

            {isLineModalOpen && <LineSelectionModal availableLines={companyData?.availableLines || []} plans={companyData?.plans || []} selected={selectedLines} onSave={setSelectedLines} onClose={() => setIsLineModalOpen(false)} />}
        </div>
    );
};

// Line Selection Modal for Distributors
const LineSelectionModal: React.FC<{ availableLines: AvailableLine[], plans: Plan[], selected: Set<string>, onSave: (selected: Set<string>) => void, onClose: () => void }> = ({ availableLines, plans, selected, onSave, onClose }) => {
    const [currentSelection, setCurrentSelection] = useState(selected);
    const [searchTerm, setSearchTerm] = useState('');
    const { translations } = useLanguage();

    const filteredLines = useMemo(() => {
        return availableLines.filter(line => line.phone.includes(searchTerm));
    }, [availableLines, searchTerm]);

    const handleToggleLine = (lineId: string) => {
        setCurrentSelection(prev => {
            const newSet = new Set(prev);
            if (newSet.has(lineId)) {
                newSet.delete(lineId);
            } else {
                newSet.add(lineId);
            }
            return newSet;
        });
    };
    
    const handleSave = () => {
        onSave(currentSelection);
        onClose();
    };
    
    const getPlanName = (planId: string) => plans.find(p => p.id === planId)?.name || 'N/A';
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-lg">
                <h2 className="text-xl font-bold mb-4">{translations.selectLines}</h2>
                <input type="text" placeholder={translations.searchLines} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700 mb-4" />
                <div className="max-h-80 overflow-y-auto space-y-2">
                    {filteredLines.map(line => (
                        <div key={line.id} className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer ${currentSelection.has(line.id) ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-700'}`} onClick={() => handleToggleLine(line.id)}>
                            <input type="checkbox" checked={currentSelection.has(line.id)} readOnly />
                            <span className="font-semibold">{line.phone}</span>
                            <span className="text-sm text-gray-500">({getPlanName(line.planId)})</span>
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button>
                    <button type="button" onClick={handleSave} className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button>
                </div>
            </div>
        </div>
    );
};


export default function AddNewCustomerPage() { return <AddNewCustomerPageComponent />; }
