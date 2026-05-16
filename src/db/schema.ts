import { pgTable, text, timestamp, decimal, uuid } from 'drizzle-orm/pg-core';

export const picoLinks = pgTable('pico_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: text('creator_id').notNull(), // This will be their wallet address
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  contentUrl: text('content_url'), // The gated content
  type: text('type').default('PDF'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PicoLink = typeof picoLinks.$inferSelect;
export type NewPicoLink = typeof picoLinks.$inferInsert;
