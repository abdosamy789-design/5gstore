'use client';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { AvailableLine, Plan } from '../../types';
import { PlusIcon, TrashIcon } from '../../components/Icons';

const InventoryPageComponent: React.FC = () => {
    const { companyData, addAvailableLines, deleteAvailableLine } = useApi();
    const { translations } = useLanguage();
    const searchParams = useSearchParams();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [deletingLine, setDeletingLine] = useState<AvailableLine | null>(null);
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

    const filteredLines = React.useMemo(() => {
        if (!companyData) return [];
        return companyData.availableLines
            .map(line => ({
                ...line,
                plan: companyData.plans.find(p => p.id === line.planId)
            }))
            .filter(line => line.phone.includes(searchTerm));
    }, [companyData, searchTerm]);

    const handleDelete = () => {
        if (deletingLine) {
            deleteAvailableLine(deletingLine.id);
            setDeletingLine(null);
        }
    };
    
    return (
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-full md:w-1/3">
             <input type="text" placeholder={translations.search} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700"/>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <PlusIcon className="w-5 h-5"/> {translations.addAvailableLines}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-700">
                <th className="p-3">{translations.availableLine}</th>
                <th className="p-3">{translations.associatedPlan}</th>
                <th className="p-3">{translations.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.map((line) => (
                <tr key={line.id} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 ${highlightedId === line.id ? 'bg-blue-100 dark:bg-blue-900 animate-pulse-fast' : ''}`}>
                  <td className="p-3 font-semibold">{line.phone}</td>
                  <td className="p-3">{line.plan?.name}</td>
                  <td className="p-3">
                    <button onClick={() => setDeletingLine(line)} className="text-red-500"><TrashIcon className="w-5 h-5"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {isModalOpen && <AddLinesModal plans={companyData?.plans || []} onSave={addAvailableLines} onClose={() => setIsModalOpen(false)} />}
        {deletingLine && <DeleteConfirmationModal onConfirm={handleDelete} onCancel={() => setDeletingLine(null)} />}
      </div>
    );
};

// Modals
const AddLinesModal: React.FC<{ plans: Plan[], onSave: (lines: { phone: string, planId: string }[]) => Promise<{ success: boolean, error?: string }>, onClose: () => void }> = ({ plans, onSave, onClose }) => {
    const [linesText, setLinesText] = useState('');
    const [planId, setPlanId] = useState<string>(plans[0]?.id || '');
    const [error, setError] = useState('');
    const { translations } = useLanguage();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const phones = linesText.split('\n').map(p => p.trim()).filter(p => p);
        if (phones.length === 0 || !planId) return;

        const lines = phones.map(phone => ({ phone, planId }));
        
        // Await the asynchronous onSave function
        const result = await onSave(lines);
        
        if (result.success) {
            onClose();
        } else if (result.error) {
            setError(translations[result.error as keyof typeof translations] || "An error occurred.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">{translations.addAvailableLines}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label>{translations.linesToAdd}</label>
                        <textarea value={linesText} onChange={e => setLinesText(e.target.value)} rows={5} className="w-full p-2 border rounded-lg dark:bg-gray-700" required />
                    </div>
                    <div>
                        <label>{translations.associatedPlan}</label>
                        <select value={planId} onChange={e => setPlanId(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
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
                <h2 className="text-xl font-bold mb-4">{translations.deleteLine}</h2>
                <p className="mb-6">{translations.areYouSure}</p>
                <div className="flex justify-end gap-4"><button onClick={onCancel} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button><button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-lg">{translations.delete}</button></div>
            </div>
        </div>
    );
};

export default function InventoryPage() { return <InventoryPageComponent />; }
