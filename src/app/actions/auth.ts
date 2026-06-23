'use server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export async function registerUser(data: {
  email: string;
  password: string;
  handle: string;
}) {
  try {
    const email = data.email.toLowerCase().trim();
    const handle = data.handle.toLowerCase().trim().replace(/[^a-z0-9_]/g, '');

    if (!email || !data.password || !handle) {
      return { success: false, error: 'All fields are required.' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    // Check if email already exists
    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingEmail) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    // Check if handle already exists
    const existingHandle = await db.query.users.findFirst({
      where: eq(users.handle, handle),
    });
    if (existingHandle) {
      return { success: false, error: 'This handle is already taken.' };
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    await db.insert(users).values({
      email,
      passwordHash,
      handle,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to register user:', error);
    return { success: false, error: 'Registration failed. Please try again.' };
  }
}

export async function updateWalletAddress(userId: string, walletAddress: string) {
  try {
    await db
      .update(users)
      .set({ walletAddress })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error('Failed to update wallet address:', error);
    return { success: false, error: 'Failed to save wallet address.' };
  }
}

export async function getUserById(userId: string) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    
    if (!user) return { success: true, user: null };

    // Convert Date object to ISO string to prevent client-side serialization errors
    const serializedUser = {
      ...user,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
    };

    return { success: true, user: serializedUser };
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return { success: false, user: null };
  }
}
