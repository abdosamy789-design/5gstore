import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/financial-cycle - Get the financial cycle
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const financialCycle = await prisma.financialCycle.findMany({
      where: { companyId },
    });
    return NextResponse.json(financialCycle);
  } catch (error) {
    console.error('Error fetching financial cycle:', error);
    return NextResponse.json({ error: 'Failed to fetch financial cycle' }, { status: 500 });
  }
}

// POST /api/financial-cycle - Create or update the financial cycle
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lastBillingDate, monthlyPayments, monthlyProfits, totalCommitments, paidCommitments, companyId } = body;

    // Basic validation
    if (!companyId) {
      return NextResponse.json({ error: 'Missing required companyId' }, { status: 400 });
    }

    const data = {
      lastBillingDate: lastBillingDate ? new Date(lastBillingDate) : undefined,
      monthlyPayments: monthlyPayments !== undefined ? parseFloat(monthlyPayments) : undefined,
      monthlyProfits: monthlyProfits !== undefined ? parseFloat(monthlyProfits) : undefined,
      totalCommitments: totalCommitments !== undefined ? parseFloat(totalCommitments) : undefined,
      paidCommitments: paidCommitments !== undefined ? parseFloat(paidCommitments) : undefined,
      companyId,
    };

    // Find the existing cycle
    const existingCycle = await prisma.financialCycle.findUnique({
      where: { companyId },
    });

    let result;
    if (existingCycle) {
      // Update
      result = await prisma.financialCycle.update({
        where: { companyId },
        data: data,
      });
    } else {
      // Create
      result = await prisma.financialCycle.create({
        data: data as any, // Cast to any to bypass TS error on partial data, which is fine for create
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Error creating/updating financial cycle:', error);
    return NextResponse.json({ error: 'Failed to create/update financial cycle' }, { status: 500 });
  }
}
