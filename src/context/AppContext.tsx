'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { AuthUser, Company, CompanyData } from '../types';
import { useApi } from './ApiAppContext';

// Define the shape of the original context for compatibility
interface AppContextType {
    // State
    auth: AuthUser | null;
    selectedCompanyId: string | null;
    notificationMessage: string | null;

    // Derived State
    isAuthenticated: boolean;
    companies: Company[];
    companyData: CompanyData | null;

    // Actions
    login: (username: string, password?: string) => Promise<AuthUser | null>;
    logout: () => void;
    switchCompany: (companyId: string) => void;
    selectCompany: (companyId: string) => void;
    
    // The rest of the actions will be migrated to use the API in ApiAppContext
    // For now, we'll keep the interface but the implementation will throw an error
    // until they are fully migrated.
    addCompany: (name: string) => Promise<void>;
    updateCompany: (id: string, name: string) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;

    // Settings Management
    updateAdminCredentials: (data: any) => Promise<boolean>;
    getAdminCredentials: () => any;
    getAgents: () => any[];
    addAgent: (data: any) => Promise<void>;
    updateAgent: (id: string, data: any) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
    updateLoginWelcomeMessage: (message: string) => Promise<void>;
    updateNotificationMessage: (message: string) => Promise<void>;

    // Core Business Logic (operates on selected company)
    addAvailableLines: (lines: any[]) => Promise<{ success: boolean, error?: string }>;
    deleteAvailableLine: (lineId: string) => Promise<void>;
    
    addPlan: (plan: any) => Promise<void>;
    updatePlan: (plan: any) => Promise<void>;
    deletePlan: (planId: string) => Promise<void>;

    addNewCustomer: (customerData: any, lineId: string, paid: boolean) => Promise<void>;
    registerMultipleCustomersForDistributor: (distributorId: string, lineIds: string[], paid: boolean) => Promise<void>;
    updateCustomer: (customer: any) => Promise<void>;
    deleteCustomer: (customerId: string, returnToStock: boolean) => Promise<void>;
    deleteMultipleCustomers: (customerIds: string[], returnToStock: boolean) => Promise<void>;
    recordPayment: (customerId: string, amount: number) => Promise<void>;
    changeCustomerPlan: (customerId: string, newPlanId: string) => Promise<void>;

    addDistributor: (distributorData: any) => Promise<void>;
    updateDistributor: (distributor: any) => Promise<void>;
    deleteDistributor: (distributorId: string) => Promise<void>;
    addDistributorPayment: (distributorId: string, amount: number) => Promise<void>;

    recordCommitmentPayment: (amount: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// This is the new AppProvider that wraps the ApiAppProvider and provides the old interface
// for compatibility. All components should eventually be updated to use useApi().
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const api = useApi();

    // Placeholder function to warn about unmigrated logic
    const unmigratedAction = (name: string) => {
        console.error(`Action "${name}" is not yet migrated to use the database. Please update the component to use the new API context or wait for full migration.`);
        // throw new Error(`Action "${name}" is not yet migrated to use the database.`);
    };

    const value: AppContextType = {
        // State from API Context
        auth: api.auth,
        selectedCompanyId: api.selectedCompanyId,
        notificationMessage: 'Notification message not yet migrated', // Placeholder
        isAuthenticated: api.isAuthenticated,
        companies: api.companies,
        companyData: api.companyData,

        // Actions from API Context
        login: api.login,
        logout: api.logout,
        selectCompany: api.selectCompany,
        switchCompany: api.selectCompany, // switchCompany is an alias for selectCompany

        // Placeholder Actions
        addCompany: (name) => { unmigratedAction('addCompany'); return api.addCompany(name); },
        updateCompany: (id, name) => { unmigratedAction('updateCompany'); return api.updateCompany(id, name); },
        deleteCompany: (id) => { unmigratedAction('deleteCompany'); return api.deleteCompany(id); },
        updateAdminCredentials: (data) => { unmigratedAction('updateAdminCredentials'); return api.updateAdminCredentials(data); },
        getAdminCredentials: () => { unmigratedAction('getAdminCredentials'); return {}; },
        getAgents: () => { unmigratedAction('getAgents'); return []; },
        addAgent: (data) => { unmigratedAction('addAgent'); return api.addAgent(data); },
        updateAgent: (id, data) => { unmigratedAction('updateAgent'); return api.updateAgent(id, data); },
        deleteAgent: (id) => { unmigratedAction('deleteAgent'); return api.deleteAgent(id); },
        updateLoginWelcomeMessage: (message) => { unmigratedAction('updateLoginWelcomeMessage'); return api.updateLoginWelcomeMessage(message); },
        updateNotificationMessage: (message) => { unmigratedAction('updateNotificationMessage'); return api.updateNotificationMessage(message); },
        addAvailableLines: (lines) => { unmigratedAction('addAvailableLines'); return api.addAvailableLines(lines); },
        deleteAvailableLine: (lineId) => { unmigratedAction('deleteAvailableLine'); return api.deleteAvailableLine(lineId); },
        addPlan: (plan) => { unmigratedAction('addPlan'); return api.addPlan(plan); },
        updatePlan: (plan) => { unmigratedAction('updatePlan'); return api.updatePlan(plan); },
        deletePlan: (planId) => { unmigratedAction('deletePlan'); return api.deletePlan(planId); },
        addNewCustomer: (customerData, lineId, paid) => { unmigratedAction('addNewCustomer'); return api.addNewCustomer(customerData, lineId, paid); },
        registerMultipleCustomersForDistributor: (distributorId, lineIds, paid) => { unmigratedAction('registerMultipleCustomersForDistributor'); return api.registerMultipleCustomersForDistributor(distributorId, lineIds, paid); },
        updateCustomer: (customer) => { unmigratedAction('updateCustomer'); return api.updateCustomer(customer); },
        deleteCustomer: (customerId, returnToStock) => { unmigratedAction('deleteCustomer'); return api.deleteCustomer(customerId, returnToStock); },
        deleteMultipleCustomers: (customerIds, returnToStock) => { unmigratedAction('deleteMultipleCustomers'); return api.deleteMultipleCustomers(customerIds, returnToStock); },
        recordPayment: (customerId, amount) => { unmigratedAction('recordPayment'); return api.recordPayment(customerId, amount); },
        changeCustomerPlan: (customerId, newPlanId) => { unmigratedAction('changeCustomerPlan'); return api.changeCustomerPlan(customerId, newPlanId); },
        addDistributor: (distributorData) => { unmigratedAction('addDistributor'); return api.addDistributor(distributorData); },
        updateDistributor: (distributor) => { unmigratedAction('updateDistributor'); return api.updateDistributor(distributor); },
        deleteDistributor: (distributorId) => { unmigratedAction('deleteDistributor'); return api.deleteDistributor(distributorId); },
        addDistributorPayment: (distributorId, amount) => { unmigratedAction('addDistributorPayment'); return api.addDistributorPayment(distributorId, amount); },
        recordCommitmentPayment: (amount) => { unmigratedAction('recordCommitmentPayment'); return api.recordCommitmentPayment(amount); },
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
