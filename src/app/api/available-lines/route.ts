import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/available-lines - Get all available lines
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const availableLines = await prisma.availableLine.findMany({
      where: {
        companyId: companyId,
      },
      include: {
        plan: true,
      },
    });
    return NextResponse.json(availableLines);
  } catch (error) {
    console.error('Error fetching available lines:', error);
    return NextResponse.json({ error: 'Failed to fetch available lines' }, { status: 500 });
  }
}

// POST /api/available-lines - Create a new available line
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, planId, companyId } = body;

    // Basic validation
    if (!phone || !planId || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newAvailableLine = await prisma.availableLine.create({
      data: {
        phone,
        planId,
        companyId,
      },
    });

    return NextResponse.json(newAvailableLine, { status: 201 });
  } catch (error) {
    console.error('Error creating available line:', error);
    // Check for unique constraint violation (e.g., phone number)
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Phone number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create available line' }, { status: 500 });
  }
}
