'use client';

import React, { useState } from 'react';
import { useApi } from '../../context/ApiAppContext'; // Use the new API context
import { useRouter } from 'next/navigation';
import { Company } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { PlusIcon, EditIcon, TrashIcon, SettingsIcon, LogoutIcon } from '../../components/Icons';

const CompanySelectionPageComponent: React.FC = () => {
    // Note: We need to implement addCompany, updateCompany, deleteCompany in ApiAppContext later.
    // For now, we'll use the available context properties.
    const { companies, selectCompany, logout } = useApi();
    const { translations } = useLanguage();
    const router = useRouter();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);

    const handleSelect = (companyId: string) => {
        selectCompany(companyId);
        router.push('/dashboard'); // Redirect to dashboard after selection
    };

    const handleOpenModal = (company: Company | null) => {
        setEditingCompany(company);
        setIsModalOpen(true);
    };

    const handleSave = (name: string) => {
        // Placeholder for API call to save company
        console.log(`Saving company: ${name}, ID: ${editingCompany?.id}`);
        setIsModalOpen(false);
        setEditingCompany(null);
    };
    
    const handleDelete = () => {
        // Placeholder for API call to delete company
        console.log(`Deleting company: ${deletingCompany?.id}`);
        setDeletingCompany(null);
    };

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-2xl text-center">
                 <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-8">{translations.selectCompany}</h1>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {companies.map(company => (
                        <div key={company.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 group">
                            <h2 className="text-xl font-bold mb-4">{company.name}</h2>
                            <button onClick={() => handleSelect(company.id)} className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 mb-4">{translations.login}</button>
                            <div className="flex justify-center gap-4">
                                <button onClick={() => handleOpenModal(company)} className="text-gray-500 hover:text-blue-500"><EditIcon className="w-5 h-5"/></button>
                                <button onClick={() => setDeletingCompany(company)} className="text-gray-500 hover:text-red-500"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        </div>
                    ))}
                     <button onClick={() => handleOpenModal(null)} className="border-2 border-dashed border-gray-400 rounded-lg p-6 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700">
                        <PlusIcon className="w-8 h-8 mb-2" />
                        <span>{translations.addCompany}</span>
                    </button>
                 </div>
                 <div className="mt-8 flex justify-center gap-4">
                    <button onClick={() => router.push('/settings')} className="text-gray-600 dark:text-gray-300 hover:text-blue-500 flex items-center gap-2">
                        <SettingsIcon className="w-5 h-5"/> {translations.settings}
                    </button>
                     <button onClick={handleLogout} className="text-gray-600 dark:text-gray-300 hover:text-red-500 flex items-center gap-2">
                        <LogoutIcon className="w-5 h-5"/> {translations.logout}
                    </button>
                 </div>
            </div>
            {isModalOpen && <CompanyFormModal company={editingCompany} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
            {deletingCompany && <DeleteConfirmationModal onConfirm={handleDelete} onCancel={() => setDeletingCompany(null)} />}
        </div>
    );
};


const CompanyFormModal: React.FC<{ company: Company | null; onSave: (name: string) => void; onClose: () => void; }> = ({ company, onSave, onClose }) => {
    const [name, setName] = useState(company?.name || '');
    const { translations } = useLanguage();
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(name);
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{company ? translations.editCompany : translations.addCompany}</h2>
                <form onSubmit={handleSubmit}>
                    <label>{translations.companyName}</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                    <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button></div>
                </form>
            </div>
        </div>
    );
};

const DeleteConfirmationModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => {
    const { translations } = useLanguage();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{translations.deleteCompany}</h2>
                <p className="mb-6">{translations.deleteCompanyConfirmation}</p>
                <div className="flex justify-end gap-4"><button onClick={onCancel} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-lg">{translations.delete}</button></div>
            </div>
        </div>
    );
};

export default function CompanySelectionPage() { return <CompanySelectionPageComponent />; }
