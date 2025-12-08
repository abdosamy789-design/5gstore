'use client';
import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApi } from '../../context/ApiAppContext';
import { useRouter } from 'next/navigation';
import { AdminCredentials, AgentUser, Distributor } from '../../types';
import { PlusIcon, EditIcon, TrashIcon, MegaphoneIcon } from '../../components/Icons';

const SettingsPageComponent: React.FC = () => {
    const { translations } = useLanguage();
    const router = useRouter();
    
    return (
        <div className="max-w-4xl mx-auto space-y-8">
             <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">{translations.settings}</h1>
                <button onClick={() => router.push('/companies')} className="bg-gray-200 dark:bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{translations.back}</button>
            </div>
            
            <AdminSettings />
            <AgentSettings />
            <NotificationSettings />
            <LoginPageSettings />
        </div>
    );
};

const AdminSettings = () => {
    const { getAdminCredentials, updateAdminCredentials } = useApi();
    const { translations } = useLanguage();
    const [formData, setFormData] = useState<AdminCredentials & { confirmPassword?: string }>({ ...getAdminCredentials(), password: '', confirmPassword: '' });
    const [message, setMessage] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(formData.password && formData.password !== formData.confirmPassword) {
            setMessage(translations.passwordsDoNotMatch);
            return;
        }
        const { confirmPassword, ...updateData } = formData;
        if (!updateData.password) delete updateData.password;
        
        updateAdminCredentials(updateData);
        setMessage(translations.adminCredentialsUpdated);
        setFormData({ ...getAdminCredentials(), password: '', confirmPassword: '' });
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">{translations.adminAccountSettings}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div><label>{translations.username}</label><input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required/></div>
                 <div><label>{translations.newPassword}</label><input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                 <div><label>{translations.confirmPassword}</label><input type="password" value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" /></div>
                 {message && <p className="text-green-500">{message}</p>}
                 <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.save}</button>
            </form>
        </div>
    );
};

const AgentSettings = () => {
    const { getAgents, companyData, addAgent, updateAgent, deleteAgent } = useApi();
    const { translations } = useLanguage();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<AgentUser | null>(null);
    const [deletingAgent, setDeletingAgent] = useState<AgentUser | null>(null);

    const handleSave = (data: Omit<AgentUser, 'id'> | AgentUser) => {
        if ('id' in data) {
            const { id, ...updateData } = data;
            if(!updateData.password) delete updateData.password;
            updateAgent(id, updateData);
        } else {
            addAgent(data);
        }
        setIsModalOpen(false);
    };
    
    const handleDelete = () => {
        if (deletingAgent) {
            deleteAgent(deletingAgent.id);
            setDeletingAgent(null);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{translations.agentAccountSettings}</h2>
                <button onClick={() => { setEditingAgent(null); setIsModalOpen(true); }} className="bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2"><PlusIcon className="w-5 h-5"/> {translations.addAgent}</button>
            </div>
            <div className="space-y-2">
                {getAgents().map(agent => (
                    <div key={agent.id} className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                        <span>{agent.username}</span>
                        <span>{companyData?.distributors.find(d => d.id === agent.distributorId)?.name || 'Unassigned'}</span>
                        <div className="flex gap-2">
                            <button onClick={() => { setEditingAgent(agent); setIsModalOpen(true); }} className="text-blue-500"><EditIcon className="w-5 h-5"/></button>
                            <button onClick={() => setDeletingAgent(agent)} className="text-red-500"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                ))}
            </div>
            {isModalOpen && <AgentFormModal agent={editingAgent} distributors={companyData?.distributors || []} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
            {deletingAgent && <DeleteConfirmationModal title={translations.deleteAgent} message={translations.deleteAgentConfirmation} onConfirm={handleDelete} onCancel={() => setDeletingAgent(null)} />}
        </div>
    );
};


const AgentFormModal: React.FC<{ agent: AgentUser | null, distributors: Distributor[], onSave: (data: Omit<AgentUser, 'id'> | AgentUser) => void, onClose: () => void }> = ({ agent, distributors, onSave, onClose }) => {
    const { translations } = useLanguage();
    const [formData, setFormData] = useState({ username: agent?.username || '', password: '', distributorId: agent?.distributorId || '' });
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (agent) {
            onSave({ ...agent, ...formData });
        } else {
            onSave(formData as Omit<AgentUser, 'id'>);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">{agent ? translations.editAgent : translations.addAgent}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label>{translations.agentUsername}</label><input value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required /></div>
                    <div><label>{translations.agentPassword}</label><input type="password" placeholder={agent ? "Leave blank to keep current" : ""} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required={!agent} /></div>
                    <div>
                        <label>{translations.assignToDistributor}</label>
                        <select value={formData.distributorId} onChange={e => setFormData({...formData, distributorId: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-gray-700" required>
                            <option value="">--</option>
                            {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
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


const NotificationSettings = () => {
    const { updateNotificationMessage } = useApi();
    const { translations } = useLanguage();
    const [message, setMessage] = useState('Check the dashboard for the latest updates.'); // Mock state, as allData is removed

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateNotificationMessage(message);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MegaphoneIcon className="w-6 h-6"/>{translations.notificationBarSettings}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div><label>{translations.notificationMessage}</label><input value={message} onChange={e => setMessage(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required/></div>
                 <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.updateMessage}</button>
            </form>
        </div>
    );
}

const LoginPageSettings = () => {
    const { updateLoginWelcomeMessage } = useApi();
    const { translations } = useLanguage();
    const [message, setMessage] = useState('Welcome to the Mobile Line Manager!'); // Mock state, as allData is removed

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateLoginWelcomeMessage(message);
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">{translations.loginPageSettings}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div><label>{translations.welcomeMessage}</label><input value={message} onChange={e => setMessage(e.target.value)} className="w-full p-2 border rounded-lg dark:bg-gray-700" required/></div>
                 <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg">{translations.updateMessage}</button>
            </form>
        </div>
    );
}

export default function SettingsPage() { return <SettingsPageComponent />; }
