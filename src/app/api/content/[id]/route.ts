import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { picoLinks, users, payments, widgetViews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withDynamicX402 } from '@/lib/x402-config';
import { PICO_TREASURY_ADDRESS } from '@/lib/constants';

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

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
 * Fee capture: x402's exact scheme has one payTo per request. Until we
 * ship the PicoRouter splitter contract, we collect the fee off-chain
 * by routing the full payment to the Pico treasury and settling 95% to
 * the creator in a batched payout. The `payments` row records linkId +
 * gross amount so the settlement job knows who is owed what. If the
 * treasury address is unset (local dev), we fall back to direct-to-
 * creator so the flow still works end-to-end without a treasury.
 */

// picoLinks.id is a Postgres UUID column. Passing a non-UUID string
// makes the driver throw a "Failed query" error that our x402 wrapper
// converts to an unhelpful 500 with the SQL text leaking out. Screen
// obviously-invalid IDs before the query so bots and typos get a clean
// 404 instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadLink(linkId: string) {
  if (!linkId || !UUID_RE.test(linkId)) return null;

  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });
    if (!link) return null;

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });
    if (!creator?.walletAddress) return null;

    return { link, creatorWallet: creator.walletAddress as `0x${string}` };
  } catch (e) {
    // Defence in depth — any DB-level failure (bad connection, transient
    // Neon outage) is treated as "link not lookup-able" rather than
    // leaking the query. The outer 500 handler keeps the fallback for
    // anything upstream that still throws.
    console.error('[pico/x402] loadLink DB error:', e);
    return null;
  }
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

  // Log the impression after the response is sent. resolve() runs on
  // every request — whether it ends in 402 or 200 — so this counts
  // every time a reader sees the paywall and gives publishers a real
  // conversion funnel (views vs payments) in the widget dashboard.
  // after() is the Next.js 15+ primitive that defers the work until
  // after the response is flushed, so the user never waits on the DB.
  const referrer = req.headers.get('referer');
  const userAgent = req.headers.get('user-agent');
  after(async () => {
    try {
      await db.insert(widgetViews).values({
        linkId: id,
        referrer: referrer?.slice(0, 500) ?? null,
        userAgent: userAgent?.slice(0, 500) ?? null,
      });
    } catch (e) {
      console.warn('[pico/x402] widget_views insert failed:', e);
    }
  });

  const treasuryConfigured =
    PICO_TREASURY_ADDRESS && PICO_TREASURY_ADDRESS.toLowerCase() !== ZERO_ADDR;
  const payTo = treasuryConfigured ? PICO_TREASURY_ADDRESS : loaded.creatorWallet;

  if (!treasuryConfigured) {
    console.warn(
      '[pico/x402] NEXT_PUBLIC_PICO_TREASURY_ADDRESS not set — routing 100% to creator, platform fee NOT collected on this request.',
    );
  }

  return {
    price: `$${loaded.link.price}`,
    payTo: payTo as `0x${string}`,
    description: `Unlock: ${loaded.link.title}`,
  };
});
