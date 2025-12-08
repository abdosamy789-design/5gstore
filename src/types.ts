// Auth & Users
export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'agent';
  distributorId?: string; // For agent users
  companyId?: string; // For agent users
}

export interface AdminCredentials {
  username: string;
  password?: string; // Optional when updating without changing password
}

export interface AgentUser {
  id: string;
  username: string;
  password?: string; // Optional when updating
  distributorId: string;
}

// Companies
export interface Company {
  id: string;
  name: string;
}

// Main Data Structure
export interface CompanyData {
  customers: Customer[];
  plans: Plan[];
  distributors: Distributor[];
  invoices: Invoice[];
  availableLines: AvailableLine[];
  expenses: Expense[];
  payments: CustomerPayment[];
  financialCycle: FinancialCycle;
}

export interface AllData {
  companies: Company[];
  companiesData: {
    [companyId: string]: CompanyData;
  };
  authData: {
    admin: AdminCredentials;
    agents: AgentUser[];
  };
  appSettings: AppSettings;
}

export interface AppSettings {
    loginWelcomeMessage: string;
    notificationMessage: string;
}

// Business Entities
export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  planId: string;
  distributorId?: string;
  joinDate: string;
  credit: number;
  idCardFront?: string; // base64
  idCardBack?: string; // base64
}

export interface Distributor {
  id: string;
  name: string;
  phone: string;
  payments: DistributorPayment[];
}

export interface DistributorPayment {
    amount: number;
    date: string;
}

export interface Plan {
  id: string;
  name: string;
  flexUnits: number;
  onNetMinutes: number;
  sms: number;
  dataAllowance: number;
  validityDays: number;
  purchasePrice: number;
  sellingPrice: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  planId: string;
  issueDate: string;
  totalAmount: number;
  paidAmount: number;
  status: 'paid' | 'due' | 'overdue';
}

export interface AvailableLine {
  id: string;
  phone: string;
  planId: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  isPaid: boolean;
}

export interface CustomerPayment {
    id: string;
    customerId: string;
    amount: number;
    date: string;
}


// Financial & Reporting
export interface FinancialCycle {
    lastBillingDate: string;
    monthlyPayments: number;
    monthlyProfits: number;
    totalCommitments: number;
    paidCommitments: number;
}

export interface SearchResult {
    type: 'customer' | 'distributor' | 'inventory' | 'distributor_customer';
    id: string;
    name: string;
    details: string;
    distributorId?: string;
}
