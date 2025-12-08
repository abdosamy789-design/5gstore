import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// POST /api/auth/login - Handle user login
export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // 1. Check AdminCredentials
    const admin = await prisma.adminCredentials.findUnique({
      where: { username },
    });

    if (admin && admin.password === password) {
      // In a real app, you would generate a JWT or session token here.
      // For this simple app, we return a success status and the user info.
      return NextResponse.json({
        success: true,
        user: { username: admin.username, role: 'admin' },
      });
    }

    // 2. Check AgentUser (if needed, based on original app logic)
    // The original app only had 'admin' login, so we'll stick to that for now.
    // If the original app had agent users, the logic would go here.

    return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json({ success: false, message: 'An error occurred during login' }, { status: 500 });
  }
}
