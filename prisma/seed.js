const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Create Admin Credentials
  await prisma.adminCredentials.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: 'password', // In a real app, this would be hashed
    },
  });
  console.log('Admin credentials created.');

  // 2. Create App Settings
  await prisma.appSettings.upsert({
    where: { id: 'app_settings_id' },
    update: {},
    create: {
      id: 'app_settings_id',
      loginWelcomeMessage: 'Welcome to the Mobile Line Manager!',
      notificationMessage: 'Check the dashboard for the latest updates.',
    },
  });
  console.log('App settings created.');

  // 3. Create a default Company
  const defaultCompany = await prisma.company.upsert({
    where: { name: 'Default Company' },
    update: {},
    create: {
      name: 'Default Company',
    },
  });
  console.log(`Default company created with ID: ${defaultCompany.id}`);

  // 4. Create Financial Cycle for the company
  await prisma.financialCycle.upsert({
    where: { companyId: defaultCompany.id },
    update: {},
    create: {
      companyId: defaultCompany.id,
      lastBillingDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString(), // Last month
      monthlyPayments: 0,
      monthlyProfits: 0,
      totalCommitments: 0,
      paidCommitments: 0,
    },
  });
  console.log('Financial cycle created.');

  // 5. Create some Plans
  const plan1 = await prisma.plan.create({
    data: {
      name: 'Basic Plan',
      flexUnits: 100,
      onNetMinutes: 50,
      sms: 10,
      dataAllowance: 1024, // 1GB
      validityDays: 30,
      purchasePrice: 5.00,
      sellingPrice: 10.00,
      companyId: defaultCompany.id,
    },
  });

  const plan2 = await prisma.plan.create({
    data: {
      name: 'Premium Plan',
      flexUnits: 500,
      onNetMinutes: 200,
      sms: 50,
      dataAllowance: 5120, // 5GB
      validityDays: 30,
      purchasePrice: 15.00,
      sellingPrice: 25.00,
      companyId: defaultCompany.id,
    },
  });
  console.log('Plans created.');

  // 6. Create some Distributors
  const distributor1 = await prisma.distributor.create({
    data: {
      name: 'John Doe',
      phone: '1234567890',
      companyId: defaultCompany.id,
    },
  });

  const distributor2 = await prisma.distributor.create({
    data: {
      name: 'Jane Smith',
      phone: '0987654321',
      companyId: defaultCompany.id,
    },
  });
  console.log('Distributors created.');

  // 7. Create some Available Lines
  await prisma.availableLine.createMany({
    data: [
      { phone: '5551000', planId: plan1.id, companyId: defaultCompany.id },
      { phone: '5551001', planId: plan1.id, companyId: defaultCompany.id },
      { phone: '5551002', planId: plan2.id, companyId: defaultCompany.id },
      { phone: '5551003', planId: plan2.id, companyId: defaultCompany.id },
    ],
  });
  console.log('Available lines created.');

  // 8. Create a Customer
  const customer1 = await prisma.customer.create({
    data: {
      name: 'Alice Johnson',
      phone: '5552000',
      whatsapp: '5552000',
      joinDate: new Date().toISOString(),
      credit: 0,
      planId: plan1.id,
      distributorId: distributor1.id,
      companyId: defaultCompany.id,
    },
  });
  console.log('Customer created.');

  // 9. Create an Invoice for the customer
  const invoice1 = await prisma.invoice.create({
    data: {
      issueDate: new Date().toISOString(),
      totalAmount: plan1.sellingPrice,
      paidAmount: plan1.sellingPrice,
      status: 'paid',
      customerId: customer1.id,
      planId: plan1.id,
      companyId: defaultCompany.id,
    },
  });
  console.log('Invoice created.');

  // 10. Create a Customer Payment
  await prisma.customerPayment.create({
    data: {
      amount: plan1.sellingPrice,
      date: new Date().toISOString(),
      customerId: customer1.id,
      companyId: defaultCompany.id,
    },
  });
  console.log('Customer payment created.');

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
