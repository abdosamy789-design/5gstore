import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/customers - Get all customers
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const customers = await prisma.customer.findMany({
      where: {
        companyId: companyId,
      },
      include: {
        plan: true,
        distributor: true,
      },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

// POST /api/customers - Create a new customer
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, whatsapp, joinDate, credit, planId, distributorId, companyId } = body;

    // Basic validation (can be expanded)
    if (!name || !phone || !planId || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newCustomer = await prisma.customer.create({
      data: {
        name,
        phone,
        whatsapp,
        joinDate: new Date(joinDate),
        credit: parseFloat(credit),
        planId,
        distributorId,
        companyId,
      },
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    // Check for unique constraint violation (e.g., phone number)
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Phone number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
