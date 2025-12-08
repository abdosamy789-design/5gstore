'use client';

import React, { useState } from 'react';
import { useApi } from '../../context/ApiAppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Plan } from '../../types';
import { TrashIcon, EditIcon, PlusIcon, CubeIcon, ClockIcon, ChatBubbleIcon, SignalIcon, CalendarIcon, DollarSignIcon } from '../../components/Icons';

const initialPlanState: Omit<Plan, 'id'> = {
    name: '',
    flexUnits: 0,
    onNetMinutes: 0,
    sms: 0,
    dataAllowance: 0,
    validityDays: 30,
    purchasePrice: 0,
    sellingPrice: 0,
};

const PlansPageComponent: React.FC = () => {
    const { companyData, addPlan, updatePlan, deletePlan } = useApi();
    const { translations } = useLanguage();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);

    const handleOpenModal = (plan: Plan | null) => {
        setEditingPlan(plan);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setEditingPlan(null);
        setIsModalOpen(false);
    };

    const handleSavePlan = (planData: Omit<Plan, 'id'> | Plan) => {
        if ('id' in planData) {
            updatePlan(planData);
        } else {
            addPlan(planData);
        }
        handleCloseModal();
    };

    const handleDeletePlan = () => {
        if (deletingPlan) {
            deletePlan(deletingPlan.id);
            setDeletingPlan(null);
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">{translations.pricePlans}</h1>
                <button onClick={() => handleOpenModal(null)} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                    <PlusIcon className="w-5 h-5" />
                    {translations.add} {translations.plan}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companyData?.plans.map((plan) => (
                    <div key={plan.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start">
                                <h2 className="text-xl font-bold text-blue-500">{plan.name}</h2>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => handleOpenModal(plan)} className="text-gray-500 hover:text-blue-500"><EditIcon className="w-5 h-5" /></button>
                                    <button onClick={() => setDeletingPlan(plan)} className="text-gray-500 hover:text-red-500"><TrashIcon className="w-5 h-5" /></button>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                                <InfoItem icon={<CubeIcon className="w-5 h-5 text-purple-500"/>} label={translations.flexUnits} value={plan.flexUnits} />
                                <InfoItem icon={<ClockIcon className="w-5 h-5 text-green-500"/>} label={translations.onNetMinutes} value={plan.onNetMinutes} />
                                <InfoItem icon={<ChatBubbleIcon className="w-5 h-5 text-yellow-500"/>} label={translations.sms} value={plan.sms} />
                                <InfoItem icon={<SignalIcon className="w-5 h-5 text-red-500"/>} label={translations.data} value={`${plan.dataAllowance} GB`} />
                                <InfoItem icon={<CalendarIcon className="w-5 h-5 text-indigo-500"/>} label={translations.validity} value={`${plan.validityDays}`} />
                            </div>
                        </div>
                        <div className="mt-6 border-t dark:border-gray-700 pt-4 flex justify-between items-center">
                            <div>
                                <p className="text-xs text-gray-400">{translations.purchasePrice}</p>
                                <p className="font-semibold">{plan.purchasePrice.toFixed(2)}</p>
                            </div>
                             <div>
                                <p className="text-xs text-gray-400">{translations.sellingPrice}</p>
                                <p className="text-2xl font-bold text-blue-500">{plan.sellingPrice.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && <PlanFormModal plan={editingPlan} onSave={handleSavePlan} onClose={handleCloseModal} />}
            {deletingPlan && <DeleteConfirmationModal onConfirm={handleDeletePlan} onCancel={() => setDeletingPlan(null)} />}
        </div>
    );
};

const InfoItem: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-2">
        {icon}
        <div>
            <p className="text-gray-400 text-xs">{label}</p>
            <p className="font-semibold">{value}</p>
        </div>
    </div>
);


const PlanFormModal: React.FC<{ plan: Plan | null; onSave: (data: Plan | Omit<Plan, 'id'>) => void; onClose: () => void; }> = ({ plan, onSave, onClose }) => {
    const [formData, setFormData] = useState<Plan | Omit<Plan, 'id'>>(plan || initialPlanState);
    const { translations } = useLanguage();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name.includes('Price') || !isNaN(Number(value)) ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-lg max-h-full overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">{plan ? translations.edit : translations.add} {translations.plan}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label>{translations.plan} Name</label><input name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                        <div><label>{translations.flexUnits}</label><input name="flexUnits" type="number" value={formData.flexUnits} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                        <div><label>{translations.onNetMinutes}</label><input name="onNetMinutes" type="number" value={formData.onNetMinutes} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                        <div><label>{translations.sms}</label><input name="sms" type="number" value={formData.sms} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                        <div><label>{translations.data}</label><input name="dataAllowance" type="number" value={formData.dataAllowance} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                        <div><label>{translations.validity}</label><input name="validityDays" type="number" value={formData.validityDays} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                        <div><label>{translations.purchasePrice}</label><input name="purchasePrice" type="number" step="0.01" value={formData.purchasePrice} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                        <div><label>{translations.sellingPrice}</label><input name="sellingPrice" type="number" step="0.01" value={formData.sellingPrice} onChange={handleChange} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
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

const DeleteConfirmationModal: React.FC<{ onConfirm: () => void; onCancel: () => void; }> = ({ onConfirm, onCancel }) => {
    const { translations } = useLanguage();
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{translations.deletePlan}</h2>
                <p className="mb-6">{translations.deletePlanConfirmation}</p>
                <div className="flex justify-end gap-4">
                    <button onClick={onCancel} className="bg-gray-300 dark:bg-gray-600 px-4 py-2 rounded-lg">{translations.cancel}</button>
                    <button onClick={onConfirm} className="bg-red-500 text-white px-4 py-2 rounded-lg">{translations.delete}</button>
                </div>
            </div>
        </div>
    );
};

export default function PlansPage() { return <PlansPageComponent />; }
