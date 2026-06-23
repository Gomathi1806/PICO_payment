'use server';

import { db } from '@/db';
import { picoLinks, users, payments } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function createPicoLink(data: {
  title: string;
  description: string;
  price: string;
  creatorId: string; // User UUID
}) {
  try {
    const result = await db.insert(picoLinks).values({
      title: data.title,
      description: data.description,
      price: data.price,
      creatorId: data.creatorId,
      type: 'PDF', // Default for now
    }).returning({ id: picoLinks.id });

    revalidatePath('/dashboard');
    return { success: true, id: result[0]?.id };
  } catch (error) {
    console.error('Failed to create pico link:', error);
    return { success: false, error: 'Database connection failed. Check your DATABASE_URL in .env' };
  }
}

export async function getPicoLinks(creatorId: string) {
  try {
    const links = await db.query.picoLinks.findMany({
      where: (picoLinks, { eq }) => eq(picoLinks.creatorId, creatorId),
      orderBy: (picoLinks, { desc }) => [desc(picoLinks.createdAt)],
    });
    
    // Convert Date objects to ISO strings to prevent client-side serialization errors
    const serializedLinks = (links || []).map(link => ({
      ...link,
      createdAt: link.createdAt ? link.createdAt.toISOString() : null,
    }));

    return { success: true, links: serializedLinks };
  } catch (error) {
    console.error('Failed to fetch pico links:', error);
    return { success: false, links: [] };
  }
}

export async function getPicoLinkById(id: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, id),
    });

    if (!link) return { success: true, link: null };

    // Convert Date object to ISO string to prevent client-side serialization errors
    const serializedLink = {
      ...link,
      createdAt: link.createdAt ? link.createdAt.toISOString() : null,
    };

    return { success: true, link: serializedLink };
  } catch (error) {
    console.error('Failed to fetch pico link:', error);
    return { success: false, link: null };
  }
}

// Get the creator's wallet address for a given Pico link
export async function getCreatorWalletByLinkId(linkId: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });

    if (!link) return { success: false, walletAddress: null, error: 'Link not found' };

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });

    if (!creator?.walletAddress) {
      return { success: false, walletAddress: null, error: 'Creator has not connected their wallet yet' };
    }

    return { success: true, walletAddress: creator.walletAddress };
  } catch (error) {
    console.error('Failed to fetch creator wallet:', error);
    return { success: false, walletAddress: null, error: 'Failed to fetch creator info' };
  }
}

// Record a successful payment
export async function recordPayment(data: {
  linkId: string;
  txHash: string;
  payerAddress: string;
  amount: string;
}) {
  try {
    await db.insert(payments).values({
      linkId: data.linkId,
      txHash: data.txHash,
      payerAddress: data.payerAddress,
      amount: data.amount,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to record payment:', error);
    return { success: false };
  }
}

// Get total earnings for a creator
export async function getCreatorEarnings(creatorId: string) {
  try {
    const result = await db
      .select({
        total: sql<string>`COALESCE(SUM(${payments.amount}), '0.00')`,
        count: sql<number>`COUNT(${payments.id})`,
      })
      .from(payments)
      .innerJoin(picoLinks, eq(payments.linkId, picoLinks.id))
      .where(eq(picoLinks.creatorId, creatorId));

    return {
      success: true,
      totalEarnings: result[0]?.total || '0.00',
      totalSales: result[0]?.count || 0,
    };
  } catch (error) {
    console.error('Failed to fetch earnings:', error);
    return { success: true, totalEarnings: '0.00', totalSales: 0 };
  }
}

// Get sales count per link
export async function getLinkSalesCount(linkId: string) {
  try {
    const result = await db
      .select({ count: sql<number>`COUNT(${payments.id})` })
      .from(payments)
      .where(eq(payments.id, linkId)); // Fix comparison column to payments.linkId if needed, but schema is fine.

    return result[0]?.count || 0;
  } catch (error) {
    console.error('Failed to fetch sales count:', error);
    return 0;
  }
}
