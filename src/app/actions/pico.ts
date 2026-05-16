'use server';

import { db } from '@/db';
import { picoLinks } from '@/db/schema';
import { revalidatePath } from 'next/cache';

export async function createPicoLink(data: {
  title: string;
  description: string;
  price: string;
  creatorId: string;
}) {
  try {
    await db.insert(picoLinks).values({
      title: data.title,
      description: data.description,
      price: data.price,
      creatorId: data.creatorId,
      type: 'PDF', // Default for now
    });

    revalidatePath('/dashboard');
    return { success: true };
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
    return { success: true, links };
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
    return { success: true, link };
  } catch (error) {
    console.error('Failed to fetch pico link:', error);
    return { success: false, link: null };
  }
}
