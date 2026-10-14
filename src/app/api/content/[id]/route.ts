import { NextRequest, NextResponse, after } from 'next/server';
import { db } from '@/db';
import { picoLinks, users, payments, widgetViews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setSettledListener, withDynamicX402 } from '@/lib/x402-config';
import { ARC_NETWORK, encodeArcTxHash } from '@/lib/arc';
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

// Record each unlock once the facilitator has actually settled it, with
// the real tx hash and payer, so the dashboard activity feed and admin
// view can link to the explorer.
setSettledListener(async ({ paymentPayload, requirements, result }) => {
  if (!result.success || !result.transaction) return;
  const resourceUrl = paymentPayload.resource?.url;
  if (!resourceUrl) return;
  const segments = new URL(resourceUrl).pathname.split('/').filter(Boolean);
  const linkId = segments[segments.length - 1];
  if (segments[0] !== 'api' || segments[1] !== 'content' || !UUID_RE.test(linkId)) return;

  // The resource URL is echoed by the buyer, so only record against a
  // link whose payee and price match what was actually settled.
  const loaded = await loadLink(linkId);
  if (!loaded) return;
  const payTo = requirements.payTo.toLowerCase();
  const amount = (Number(result.amount ?? requirements.amount) / 1e6).toFixed(2);
  const payeeMatches =
    payTo === loaded.creatorWallet.toLowerCase() || payTo === PICO_TREASURY_ADDRESS.toLowerCase();
  if (!payeeMatches || amount !== Number(loaded.link.price).toFixed(2)) {
    console.warn('[pico/x402] settled payment does not match link', linkId);
    return;
  }

  // USDC is 6 decimals on every network we register (amount above).
  const txHash =
    result.network === ARC_NETWORK ? encodeArcTxHash(result.transaction) : result.transaction;
  try {
    await db.insert(payments).values({
      linkId,
      txHash,
      payerAddress: result.payer ?? 'x402:unknown',
      amount,
    });
  } catch (e) {
    console.warn('[pico/x402] payment record insert failed:', e);
  }
});

const handler = async (req: NextRequest) => {
  // We don't get params directly here because withDynamicX402 wraps us.
  // Pull the id from the URL pathname.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1];

  const loaded = await loadLink(id);
  if (!loaded) {
    return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
  }

  return NextResponse.json({
    contentUrl: loaded.link.contentUrl,
    title: loaded.link.title,
    type: loaded.link.type,
  });
};

export const GET = withDynamicX402(handler, async (req, network) => {
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

  // Arc settles straight to the creator — Pico never holds the funds on
  // this path, and there's no off-chain batch payout to reconcile.
  const isArc = network === 'eip155:5042';
  const treasuryConfigured =
    !isArc && PICO_TREASURY_ADDRESS && PICO_TREASURY_ADDRESS.toLowerCase() !== ZERO_ADDR;
  const payTo = treasuryConfigured ? PICO_TREASURY_ADDRESS : loaded.creatorWallet;

  if (!treasuryConfigured && !isArc) {
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
