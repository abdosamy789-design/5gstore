import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/company - Get the company (assuming only one for this app)
export async function GET() {
  try {
    const company = await prisma.company.findFirst({
      include: {
        financialCycle: true,
      }
    });
    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

// POST /api/company - Create a new company (for initial setup)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    // Basic validation
    if (!name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newCompany = await prisma.company.create({
      data: {
        name,
      },
    });

    return NextResponse.json(newCompany, { status: 201 });
  } catch (error) {
    console.error('Error creating company:', error);
    return NextResponse.json({ error: 'Failed to create company' }, { status: 500 });
  }
}
