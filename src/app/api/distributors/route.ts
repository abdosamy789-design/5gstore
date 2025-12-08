import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/distributors - Get all distributors
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId');

  if (!companyId) {
    return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });
  }
  try {
    const distributors = await prisma.distributor.findMany({
      where: {
        companyId: companyId,
      },
      include: {
        payments: true, // Include payments for balance calculation
      }
    });
    return NextResponse.json(distributors);
  } catch (error) {
    console.error('Error fetching distributors:', error);
    return NextResponse.json({ error: 'Failed to fetch distributors' }, { status: 500 });
  }
}

// POST /api/distributors - Create a new distributor
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, companyId } = body;

    // Basic validation
    if (!name || !phone || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newDistributor = await prisma.distributor.create({
      data: {
        name,
        phone,
        companyId,
      },
    });

    return NextResponse.json(newDistributor, { status: 201 });
  } catch (error) {
    console.error('Error creating distributor:', error);
    return NextResponse.json({ error: 'Failed to create distributor' }, { status: 500 });
  }
}
