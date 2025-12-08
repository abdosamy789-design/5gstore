import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/invoices - Get all invoices
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId: companyId,
      },
      include: {
        customer: true,
        plan: true,
      },
    });
    return NextResponse.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST /api/invoices - Create a new invoice
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issueDate, totalAmount, paidAmount, status, customerId, planId, companyId } = body;

    // Basic validation
    if (!customerId || !planId || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newInvoice = await prisma.invoice.create({
      data: {
        issueDate: new Date(issueDate),
        totalAmount: parseFloat(totalAmount),
        paidAmount: parseFloat(paidAmount),
        status,
        customerId,
        planId,
        companyId,
      },
    });

    return NextResponse.json(newInvoice, { status: 201 });
  } catch (error) {
    console.error('Error creating invoice:', error);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
