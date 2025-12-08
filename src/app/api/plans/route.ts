import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/plans - Get all plans
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const plans = await prisma.plan.findMany({
      where: {
        companyId: companyId,
      },
    });
    return NextResponse.json(plans);
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
}

// POST /api/plans - Create a new plan
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, flexUnits, onNetMinutes, sms, dataAllowance, validityDays, purchasePrice, sellingPrice, companyId } = body;

    // Basic validation
    if (!name || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newPlan = await prisma.plan.create({
      data: {
        name,
        flexUnits: parseInt(flexUnits),
        onNetMinutes: parseInt(onNetMinutes),
        sms: parseInt(sms),
        dataAllowance: parseInt(dataAllowance),
        validityDays: parseInt(validityDays),
        purchasePrice: parseFloat(purchasePrice),
        sellingPrice: parseFloat(sellingPrice),
        companyId,
      },
    });

    return NextResponse.json(newPlan, { status: 201 });
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
