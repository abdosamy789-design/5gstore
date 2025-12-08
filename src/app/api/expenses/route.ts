import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/expenses - Get all expenses
export async function GET() {
  try {
    const expenses = await prisma.expense.findMany();
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

// POST /api/expenses - Create a new expense
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { description, amount, date, isPaid, companyId } = body;

    // Basic validation
    if (!description || !amount || !companyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newExpense = await prisma.expense.create({
      data: {
        description,
        amount: parseFloat(amount),
        date: new Date(date),
        isPaid: isPaid === 'true' || isPaid === true,
        companyId,
      },
    });

    return NextResponse.json(newExpense, { status: 201 });
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
