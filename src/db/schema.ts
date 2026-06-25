import { pgTable, text, timestamp, decimal, uuid } from 'drizzle-orm/pg-core';

// ─── Users ──────────────────────────────────────────────────
// `role` decides which dashboard the user lands on after login and
// which menus they see. The four roles map to distinct products:
//
//   creator   → /dashboard      (individual influencers, writers)
//   publisher → /publisher      (newsrooms, magazines, B2B media)
//   agent     → /agents         (developer platform — x402 API users)
//   admin     → /admin          (internal Pico staff; also gated by
//                                ADMIN_EMAILS env allowlist for
//                                defence-in-depth on top of the role)
//
// Existing rows default to 'creator' so the migration is safe.
export const USER_ROLES = ['creator', 'publisher', 'agent', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  handle: text('handle').notNull().unique(),
  walletAddress: text('wallet_address'),
  role: text('role').notNull().default('creator').$type<UserRole>(),
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
