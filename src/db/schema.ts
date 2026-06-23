import { pgTable, text, timestamp, decimal, uuid } from 'drizzle-orm/pg-core';

// ─── Users (Creators) ───────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  handle: text('handle').notNull().unique(),
  walletAddress: text('wallet_address'), // Set when creator connects Coinbase Smart Wallet
  createdAt: timestamp('created_at').defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ─── Pico Links (Content for Sale) ──────────────────────────
export const picoLinks = pgTable('pico_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: text('creator_id').notNull(), // User UUID stored as text for backward compat
  title: text('title').notNull(),
  description: text('description').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  contentUrl: text('content_url'), // The gated content
  type: text('type').default('PDF'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type PicoLink = typeof picoLinks.$inferSelect;
export type NewPicoLink = typeof picoLinks.$inferInsert;

// ─── Payments (Transaction Records) ─────────────────────────
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  linkId: uuid('link_id').notNull(),       // References picoLinks.id
  txHash: text('tx_hash').notNull(),
  payerAddress: text('payer_address').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
