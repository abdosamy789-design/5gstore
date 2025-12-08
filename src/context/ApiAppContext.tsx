'use client';

import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, Company, CompanyData } from '../types';

// Define the shape of our new context
interface ApiAppContextType {
    // State
    auth: AuthUser | null;
    companies: Company[];
    selectedCompanyId: string | null;
    companyData: CompanyData | null; // This will hold the data for the selected company
    isLoading: boolean;

    // Derived State
    isAuthenticated: boolean;

    // Actions
    login: (username: string, password?: string) => Promise<AuthUser | null>;
    logout: () => void;
    selectCompany: (companyId: string) => void;
    
    // Company Management
    addCompany: (name: string) => Promise<void>;
    updateCompany: (id: string, name: string) => Promise<void>;
    deleteCompany: (id: string) => Promise<void>;

    // Settings Management (Placeholder for now, will be migrated to API)
    updateAdminCredentials: (data: any) => Promise<boolean>;
    getAdminCredentials: () => any;
    getAgents: () => any[];
    addAgent: (data: any) => Promise<void>;
    updateAgent: (id: string, data: any) => Promise<void>;
    deleteAgent: (id: string) => Promise<void>;
    updateLoginWelcomeMessage: (message: string) => Promise<void>;
    updateNotificationMessage: (message: string) => Promise<void>;

    // Inventory Management
    addAvailableLines: (lines: { phone: string, planId: string }[]) => Promise<{ success: boolean, error?: string }>;
    deleteAvailableLine: (lineId: string) => Promise<void>;
    
    // Plan Management
    addPlan: (plan: any) => Promise<void>;
    updatePlan: (plan: any) => Promise<void>;
    deletePlan: (planId: string) => Promise<void>;

    // Customer Management
    addNewCustomer: (customerData: any, lineId: string, paid: boolean) => Promise<void>;
    registerMultipleCustomersForDistributor: (distributorId: string, lineIds: string[], paid: boolean) => Promise<void>;
    updateCustomer: (customer: any) => Promise<void>;
    deleteCustomer: (customerId: string, returnToStock: boolean) => Promise<void>;
    deleteMultipleCustomers: (customerIds: string[], returnToStock: boolean) => Promise<void>;
    recordPayment: (customerId: string, amount: number) => Promise<void>;
    changeCustomerPlan: (customerId: string, newPlanId: string) => Promise<void>;

    // Distributor Management
    addDistributor: (distributorData: any) => Promise<void>;
    updateDistributor: (distributor: any) => Promise<void>;
    deleteDistributor: (distributorId: string) => Promise<void>;
    addDistributorPayment: (distributorId: string, amount: number) => Promise<void>;

    // Financial Management
    recordCommitmentPayment: (amount: number) => Promise<void>;
}

const ApiAppContext = createContext<ApiAppContextType | undefined>(undefined);

export const ApiAppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const router = useRouter();
    const [auth, setAuth] = useState<AuthUser | null>(null);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
    const [companyData, setCompanyData] = useState<CompanyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // --- Effects to fetch initial data ---

    // Fetch companies on load
    useEffect(() => {
        const fetchCompanies = async () => {
            try {
                const response = await fetch('/api/company');
                const data = await response.json();
                // Assuming the API returns an array of companies, even if it's just one
                const fetchedCompanies = Array.isArray(data) ? data : [data];
                setCompanies(fetchedCompanies);
                
                // If there are companies, set the first one as selected by default
                if (fetchedCompanies.length > 0) {
                    setSelectedCompanyId(fetchedCompanies[0].id);
                } else {
                    // If no companies, we can stop loading here.
                    setIsLoading(false);
                }
            } catch (error) {
                console.error("Failed to fetch companies:", error);
                setIsLoading(false); // Stop loading on error
            }
        };
        fetchCompanies();
    }, []);

    // Fetch data for the selected company
    useEffect(() => {
        if (!selectedCompanyId) {
            setCompanyData(null);
            return;
        }

        const fetchCompanyData = async () => {
            // Set loading only if it's not already loading (i.e., not the initial load)
            if (!isLoading) {
                setIsLoading(true);
            }
            try {
                // We'll fetch all data related to the company in parallel
                const [customersRes, plansRes, distributorsRes, invoicesRes, financialCycleRes, availableLinesRes] = await Promise.all([
                    fetch(`/api/customers?companyId=${selectedCompanyId}`),
                    fetch(`/api/plans?companyId=${selectedCompanyId}`),
                    fetch(`/api/distributors?companyId=${selectedCompanyId}`),
                    fetch(`/api/invoices?companyId=${selectedCompanyId}`),
                    fetch(`/api/financial-cycle?companyId=${selectedCompanyId}`),
                    fetch(`/api/available-lines?companyId=${selectedCompanyId}`),
                    // Add other fetches here as API routes are created
                ]);

                const customers = await customersRes.json();
                const plans = await plansRes.json();
                const distributors = await distributorsRes.json();
                const invoices = await invoicesRes.json();
                const financialCycle = await financialCycleRes.json();
                const availableLines = await availableLinesRes.json();

                setCompanyData({
                    customers,
                    plans,
                    distributors,
                    invoices,
                    availableLines,
                    // Initialize other fields as empty arrays for now
                    payments: [],
                    
                    expenses: [],
                    financialCycle: financialCycle[0] || { lastBillingDate: new Date().toISOString(), monthlyPayments: 0, monthlyProfits: 0, totalCommitments: 0, paidCommitments: 0 },
                });

            } catch (error) {
                console.error(`Failed to fetch data for company ${selectedCompanyId}:`, error);
                setCompanyData(null);
            } finally {
                // Only set loading to false if it was set to true by this effect, or if it's the final step of the initial load
                // Since the first useEffect handles the initial setIsLoading(false) when no companies are found,
                // and sets selectedCompanyId which triggers this one, we can safely set it to false here.
                setIsLoading(false);
            }
        };

        if (selectedCompanyId) {
            fetchCompanyData();
        }
    }, [selectedCompanyId, isLoading]); // Added isLoading to dependency array to prevent infinite loop and ensure correct logic flow

    // Helper to re-fetch company data after a mutation
    const refetchCompanyData = async () => {
        if (selectedCompanyId) {
            // We'll re-use the logic from the useEffect above
            try {
                const [customersRes, plansRes, distributorsRes, invoicesRes, financialCycleRes, availableLinesRes] = await Promise.all([
                    fetch(`/api/customers?companyId=${selectedCompanyId}`),
                    fetch(`/api/plans?companyId=${selectedCompanyId}`),
                    fetch(`/api/distributors?companyId=${selectedCompanyId}`),
                    fetch(`/api/invoices?companyId=${selectedCompanyId}`),
                    fetch(`/api/financial-cycle?companyId=${selectedCompanyId}`),
                    fetch(`/api/available-lines?companyId=${selectedCompanyId}`),
                ]);

                const customers = await customersRes.json();
                const plans = await plansRes.json();
                const distributors = await distributorsRes.json();
                const invoices = await invoicesRes.json();
                const financialCycle = await financialCycleRes.json();
                const availableLines = await availableLinesRes.json();

                setCompanyData({
                    customers,
                    plans,
                    distributors,
                    invoices,
                    availableLines,
                    payments: [],
                    
                    expenses: [],
                    financialCycle: financialCycle[0] || { lastBillingDate: new Date().toISOString(), monthlyPayments: 0, monthlyProfits: 0, totalCommitments: 0, paidCommitments: 0 },
                });
            } catch (error) {
                console.error(`Failed to refetch data for company ${selectedCompanyId}:`, error);
                setCompanyData(null);
            }
        }
    };

    // --- Placeholder/Unmigrated Actions ---
    const unmigratedAction = (name: string) => {
        console.warn(`Action "${name}" is not yet fully migrated to use the database. Placeholder implementation used.`);
    };

    // Company Management
    const addCompany = async (name: string) => unmigratedAction('addCompany');
    const updateCompany = async (id: string, name: string) => unmigratedAction('updateCompany');
    const deleteCompany = async (id: string) => unmigratedAction('deleteCompany');

    // Settings Management
    const updateAdminCredentials = async (data: any) => { unmigratedAction('updateAdminCredentials'); return false; };
    const getAdminCredentials = () => { unmigratedAction('getAdminCredentials'); return {}; };
    const getAgents = () => { unmigratedAction('getAgents'); return []; };
    const addAgent = async (data: any) => unmigratedAction('addAgent');
    const updateAgent = async (id: string, data: any) => unmigratedAction('updateAgent');
    const deleteAgent = async (id: string) => unmigratedAction('deleteAgent');
    const updateLoginWelcomeMessage = async (message: string) => unmigratedAction('updateLoginWelcomeMessage');
    const updateNotificationMessage = async (message: string) => unmigratedAction('updateNotificationMessage');

    // Inventory Management
    const addAvailableLines = async (lines: { phone: string, planId: string }[]) => { unmigratedAction('addAvailableLines'); return { success: false }; };
    const deleteAvailableLine = async (lineId: string) => unmigratedAction('deleteAvailableLine');
    
    // Plan Management
    const addPlan = async (plan: any) => unmigratedAction('addPlan');
    const updatePlan = async (plan: any) => unmigratedAction('updatePlan');
    const deletePlan = async (planId: string) => unmigratedAction('deletePlan');

    // Customer Management
    const addNewCustomer = async (customerData: any, lineId: string, paid: boolean) => unmigratedAction('addNewCustomer');
    const registerMultipleCustomersForDistributor = async (distributorId: string, lineIds: string[], paid: boolean) => unmigratedAction('registerMultipleCustomersForDistributor');
    const updateCustomer = async (customer: any) => unmigratedAction('updateCustomer');
    const deleteCustomer = async (customerId: string, returnToStock: boolean) => unmigratedAction('deleteCustomer');
    const deleteMultipleCustomers = async (customerIds: string[], returnToStock: boolean) => unmigratedAction('deleteMultipleCustomers');
    const recordPayment = async (customerId: string, amount: number) => unmigratedAction('recordPayment');
    const changeCustomerPlan = async (customerId: string, newPlanId: string) => unmigratedAction('changeCustomerPlan');

    // Distributor Management
    const addDistributor = async (distributorData: any) => unmigratedAction('addDistributor');
    const updateDistributor = async (distributor: any) => unmigratedAction('updateDistributor');
    const deleteDistributor = async (distributorId: string) => unmigratedAction('deleteDistributor');
    const addDistributorPayment = async (distributorId: string, amount: number) => unmigratedAction('addDistributorPayment');

    // Financial Management
    const recordCommitmentPayment = async (amount: number) => unmigratedAction('recordCommitmentPayment');


    // --- Auth Actions ---
    const login = async (username: string, password?: string): Promise<AuthUser | null> => {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const { user } = await response.json();
                setAuth(user);
                // If the user is an admin, they can select a company. If an agent, they are tied to one.
                if (user.role === 'admin' && companies.length > 0) {
                    setSelectedCompanyId(companies[0].id); // Default to the first company
                } else if (user.role === 'agent' && user.companyId) {
                    setSelectedCompanyId(user.companyId);
                }
                return user;
            } else {
                setAuth(null);
                return null;
            }
        } catch (error) {
            console.error('Login failed:', error);
            setAuth(null);
            return null;
        }
    };

    const logout = () => {
        setAuth(null);
        setSelectedCompanyId(null);
        setCompanyData(null);
        router.push('/login');
    };

    const selectCompany = (companyId: string) => {
        if (auth?.role === 'admin') {
            setSelectedCompanyId(companyId);
        }
    };

    const value: ApiAppContextType = {
        auth,
        companies,
        selectedCompanyId,
        companyData,
        isLoading,
        isAuthenticated: !!auth,
        login,
        logout,
        selectCompany,
        addCompany,
        updateCompany,
        deleteCompany,
        updateAdminCredentials,
        getAdminCredentials,
        getAgents,
        addAgent,
        updateAgent,
        deleteAgent,
        updateLoginWelcomeMessage,
        updateNotificationMessage,
        addAvailableLines,
        deleteAvailableLine,
        addPlan,
        updatePlan,
        deletePlan,
        addNewCustomer,
        registerMultipleCustomersForDistributor,
        updateCustomer,
        deleteCustomer,
        deleteMultipleCustomers,
        recordPayment,
        changeCustomerPlan,
        addDistributor,
        updateDistributor,
        deleteDistributor,
        addDistributorPayment,
        recordCommitmentPayment,
    };

    return <ApiAppContext.Provider value={value}>{children}</ApiAppContext.Provider>;
};

export const useApi = () => {
    const context = useContext(ApiAppContext);
    if (context === undefined) {
        throw new Error('useApi must be used within an ApiAppProvider');
    }
    return context;
};
