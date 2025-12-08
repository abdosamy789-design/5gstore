import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/customer-payments - Get all customer payments
export async function GET() {
  try {
    const payments = await prisma.customerPayment.findMany({
      include: {
        customer: true,
      },
    });
    return NextResponse.json(payments);
  } catch (error) {
    console.error('Error fetching customer payments:', error);
    return NextResponse.json({ error: 'Failed to fetch customer payments' }, { status: 500 });
  }
}

// POST /api/customer-payments - Create a new customer payment
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { amount, date, customerId, companyId } = body;

    // Basic validation
    if (!customerId || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newPayment = await prisma.customerPayment.create({
      data: {
        amount: parseFloat(amount),
        date: new Date(date),
        customerId,
        companyId,
      },
    });

    return NextResponse.json(newPayment, { status: 201 });
  } catch (error) {
    console.error('Error creating customer payment:', error);
    return NextResponse.json({ error: 'Failed to create customer payment' }, { status: 500 });
  }
}
