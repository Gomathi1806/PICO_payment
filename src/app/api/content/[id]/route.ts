import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { picoLinks, users, payments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withDynamicX402 } from '@/lib/x402-config';

/**
 * x402 paywalled content endpoint.
 *
 *   GET /api/content/[id]
 *     • No payment header → 402 Payment Required (paywall config returned)
 *     • Valid payment header → 200 { contentUrl, title }
 *
 * This is the endpoint the publisher embed.js fetches. With x402-fetch
 * wrapping it on the client side, the reader's wallet auto-signs the
 * payment and retries the request — no popup, no postMessage. The
 * gated contentUrl is only revealed once the facilitator confirms the
 * on-chain settlement.
 *
 * Phase 1: payTo = creator's wallet directly (100% to creator, no
 * Pico fee on x402 flows yet). The atomic 95/5 split happens on the
 * direct /p/[id] page via EIP-5792 batched calls, not here. See
 * src/lib/x402-config.ts for the rationale.
 */

async function loadLink(linkId: string) {
  const link = await db.query.picoLinks.findFirst({
    where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
  });
  if (!link) return null;

  const creator = await db.query.users.findFirst({
    where: eq(users.id, link.creatorId),
  });
  if (!creator?.walletAddress) return null;

  return { link, creatorWallet: creator.walletAddress as `0x${string}` };
}

const handler = async (req: NextRequest) => {
  // We don't get params directly here because withDynamicX402 wraps us.
  // Pull the id from the URL pathname.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];

  const loaded = await loadLink(id);
  if (!loaded) {
    return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  }

  // Record the unlock so the dashboard activity feed picks it up.
  // The X-Payment header is settled by the facilitator before we
  // reach here, so it's safe to assume the tx hash and payer address
  // can be derived from the request — but @x402/next doesn't surface
  // those cleanly, so for now we record with placeholders and rely
  // on the on-chain tx for ground truth. A future revision can call
  // facilitator.settle directly to capture the txHash.
  try {
    await db.insert(payments).values({
      linkId: id,
      txHash: req.headers.get('x-payment-tx') || 'x402:pending',
      payerAddress: req.headers.get('x-payment-from') || 'x402:unknown',
      amount: loaded.link.price,
    });
  } catch (e) {
    console.warn('[pico/x402] payment record insert failed:', e);
  }

  return NextResponse.json({
    contentUrl: loaded.link.contentUrl,
    title: loaded.link.title,
    type: loaded.link.type,
  });
};

export const GET = withDynamicX402(handler, async (req) => {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];
  const loaded = await loadLink(id);
  if (!loaded) return null; // 404 path runs through the unguarded handler

  return {
    price: `$${loaded.link.price}`,
    payTo: loaded.creatorWallet,
    description: `Unlock: ${loaded.link.title}`,
  };
});
