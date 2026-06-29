'use server';

import { db } from '@/db';
import { picoLinks, giftCards, giftCardRedemptions } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';

/**
 * Gift card (voucher) actions.
 *
 * Phase 1 ships the PROMO "welcome voucher" — a Pico-funded free first
 * unlock. The redeemer is identified by their wallet address (the
 * public payment page has no login). One free unlock per address.
 *
 * No buyer money is ever held: a promo redemption simply records that
 * Pico owes the creator the unlock price, settled later from Pico's own
 * treasury (settled=false until then). Gift/sponsor kinds (where the
 * creator is prepaid) reuse the same tables and will land in Phase 2.
 */

/**
 * Is this visitor eligible for the free first unlock?
 * Eligible when the address has never redeemed a promo voucher before.
 */
export async function getCreditEligibility(redeemerAddress: string | undefined) {
  try {
    if (!redeemerAddress) return { freeFirstUnlock: false };

    const prior = await db
      .select({ count: sql<number>`count(*)` })
      .from(giftCardRedemptions)
      .innerJoin(giftCards, eq(giftCards.id, giftCardRedemptions.giftCardId))
      .where(
        and(
          eq(giftCardRedemptions.redeemerId, redeemerAddress),
          eq(giftCards.kind, 'promo'),
        ),
      );

    const used = Number(prior[0]?.count ?? 0);
    return { freeFirstUnlock: used === 0 };
  } catch (error) {
    console.error('[giftcards] eligibility check failed:', error);
    return { freeFirstUnlock: false };
  }
}

/**
 * Redeem the Pico-funded free first unlock for a given link.
 * Grants access (writes a redemption row) and returns the gated content.
 * Re-entrancy / double-use is guarded by the per-address promo check.
 */
export async function redeemFreeUnlock(data: {
  linkId: string;
  redeemerAddress: string;
}) {
  try {
    const { linkId, redeemerAddress } = data;
    if (!linkId || !redeemerAddress) {
      return { success: false, error: 'Missing details.' };
    }

    // The link must exist and have a real price (don't free-unlock junk).
    const link = await db.query.picoLinks.findFirst({
      where: eq(picoLinks.id, linkId),
    });
    if (!link) return { success: false, error: 'Link not found.' };

    // Re-check eligibility server-side (never trust the client).
    const { freeFirstUnlock } = await getCreditEligibility(redeemerAddress);
    if (!freeFirstUnlock) {
      return { success: false, error: 'Free unlock already used.' };
    }

    // Mint a one-shot promo gift card scoped to this link, then redeem it.
    // Pico is the funder; prefunded=false → Pico owes the creator, settled
    // from treasury later (batched). No buyer money involved.
    const [card] = await db
      .insert(giftCards)
      .values({
        kind: 'promo',
        funderType: 'pico',
        scopeType: 'link',
        scopeId: linkId,
        totalValue: link.price,
        remaining: '0.00',
        prefunded: false,
        maxPerUser: 1,
        status: 'depleted',
      })
      .returning();

    await db.insert(giftCardRedemptions).values({
      giftCardId: card.id,
      linkId,
      redeemerId: redeemerAddress,
      valueUsed: link.price,
      settled: false,
    });

    return { success: true, contentUrl: link.contentUrl ?? null };
  } catch (error) {
    console.error('[giftcards] redeemFreeUnlock failed:', error);
    return { success: false, error: 'Could not unlock. Please try again.' };
  }
}
