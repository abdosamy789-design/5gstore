import { AllData, CompanyData } from './types';
import { v4 as uuidv4 } from 'uuid';

const generateCompanyData = (companyName: string): CompanyData => {
  const plans = [
    { id: `p1-${companyName}`, name: 'باقة 100', flexUnits: 1000, onNetMinutes: 500, sms: 100, dataAllowance: 10, validityDays: 30, purchasePrice: 80, sellingPrice: 100 },
    { id: `p2-${companyName}`, name: 'باقة 200', flexUnits: 2500, onNetMinutes: 1000, sms: 200, dataAllowance: 25, validityDays: 30, purchasePrice: 160, sellingPrice: 200 },
    { id: `p3-${companyName}`, name: 'باقة 300', flexUnits: 5000, onNetMinutes: 2000, sms: 300, dataAllowance: 60, validityDays: 30, purchasePrice: 240, sellingPrice: 300 },
  ];

  const distributors = [
    { id: `d1-${companyName}`, name: `وكيل القاهرة - ${companyName}`, phone: '01100000001', payments: [{amount: 50, date: new Date().toISOString()}] },
    { id: `d2-${companyName}`, name: `وكيل الإسكندرية - ${companyName}`, phone: '01200000002', payments: [] },
  ];

  const customers = [
    { id: `c1-${companyName}`, name: `عميل مباشر 1 - ${companyName}`, phone: '01000000001', whatsapp: '01000000001', planId: plans[0].id, joinDate: '2023-10-01T10:00:00Z', credit: 0 },
    { id: `c2-${companyName}`, name: `عميل مباشر 2 - ${companyName}`, phone: '01000000002', whatsapp: '01000000002', planId: plans[1].id, joinDate: '2023-11-15T11:00:00Z', credit: 10 },
    { id: `c3-${companyName}`, name: `عميل وكيل 1 - ${companyName}`, phone: '01500000001', whatsapp: '01500000001', planId: plans[1].id, distributorId: distributors[0].id, joinDate: '2023-12-20T12:00:00Z', credit: 0 },
    { id: `c4-${companyName}`, name: `عميل وكيل 2 - ${companyName}`, phone: '01500000002', whatsapp: '01500000002', planId: plans[2].id, distributorId: distributors[1].id, joinDate: '2024-01-05T13:00:00Z', credit: 0 },
  ];
  
  const invoices = [
     { id: `i1-${companyName}`, customerId: customers[0].id, planId: plans[0].id, issueDate: '2024-06-11T10:00:00Z', totalAmount: 100, paidAmount: 100, status: 'paid' as const },
     { id: `i2-${companyName}`, customerId: customers[1].id, planId: plans[1].id, issueDate: '2024-06-11T10:00:00Z', totalAmount: 200, paidAmount: 150, status: 'due' as const },
     { id: `i3-${companyName}`, customerId: customers[2].id, planId: plans[1].id, issueDate: '2024-06-11T10:00:00Z', totalAmount: 200, paidAmount: 200, status: 'paid' as const },
     { id: `i4-${companyName}`, customerId: customers[3].id, planId: plans[2].id, issueDate: '2024-06-11T10:00:00Z', totalAmount: 300, paidAmount: 0, status: 'due' as const },
  ];
  
  const availableLines = [
      { id: `l1-${companyName}`, phone: '01012345671', planId: plans[0].id },
      { id: `l2-${companyName}`, phone: '01012345672', planId: plans[1].id },
      { id: `l3-${companyName}`, phone: '01012345673', planId: plans[2].id },
  ];
  
  const expenses = [
      { id: `e1-${companyName}`, description: 'إيجار المكتب', amount: 500, date: '2024-06-01T10:00:00Z', isPaid: true },
      { id: `e2-${companyName}`, description: 'فاتورة كهرباء', amount: 150, date: '2024-06-05T10:00:00Z', isPaid: false },
  ];
  
  const payments = [
      { id: `p1-${companyName}`, customerId: customers[0].id, amount: 100, date: '2024-06-12T10:00:00Z' }
  ];

  const financialCycle = {
      lastBillingDate: '2024-06-11T10:00:00Z',
      monthlyPayments: 100,
      monthlyProfits: 20,
      totalCommitments: 1000,
      paidCommitments: 500
  };

  return {
    plans,
    distributors,
    customers,
    invoices,
    availableLines,
    expenses,
    payments,
    financialCycle
  };
};

export const getInitialData = (): AllData => {
  return {
    companies: [
      { id: 'company1', name: 'شركة ألف' },
      { id: 'company2', name: 'شركة باء' },
    ],
    companiesData: {
      'company1': generateCompanyData('ألف'),
      'company2': generateCompanyData('باء'),
    },
    authData: {
      admin: { username: 'admin', password: 'admin' },
      agents: [
        { id: 'agent1', username: 'agent1', password: '123', distributorId: `d1-ألف` },
      ],
    },
    appSettings: {
        loginWelcomeMessage: 'أهلاً بك في نظام إدارة خطوط الهاتف المحمول',
        notificationMessage: 'عرض خاص: اشترك في باقة 300 واحصل على خصم 50% للشهر الأول!'
    }
  };
};
