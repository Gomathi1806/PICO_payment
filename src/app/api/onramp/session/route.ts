import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { picoLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateCdpJwt } from '@/lib/cdp-auth';

/**
 * Backend Onramp session-token minter.
 *
 * Coinbase's security requirements say the client must NEVER hold the
 * CDP secret key or generate its own Onramp session tokens. This route
 * is the server-side gate: it authenticates the caller, generates a
 * short-lived CDP JWT with our private key (held in Vercel encrypted
 * env vars), calls Coinbase's session-token endpoint, and returns only
 * the client_secret to the browser.
 *
 * Authentication model for fans (who don't sign up to Pico):
 *   The request must reference a real Pico link UUID that exists in
 *   our DB. That constraint means bots can't spam this endpoint to
 *   generate free session tokens for arbitrary addresses — every
 *   session is tied to a real content transaction. Combined with
 *   Vercel's per-function rate limits and same-origin CORS (this
 *   route only accepts requests from pico-payment.vercel.app), that's
 *   sufficient for the current risk profile.
 *
 * Response shape mirrors the Onramp v1 token endpoint.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ALLOWED_FIATS = new Set(['GBP', 'USD', 'EUR']);
const CDP_HOST = 'api.developer.coinbase.com';
const CDP_PATH = '/onramp/v1/token';

interface Body {
  linkId?: string;
  walletAddress?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Same-origin only — same header behaviour we already have on every
  // other backend route. Coinbase's security requirement explicitly
  // asks that this endpoint not be cross-origin accessible.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: 'Cross-origin requests not allowed.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const linkId = (body.linkId || '').trim();
  const walletAddress = (body.walletAddress || '').trim();
  const fiatCurrency = (body.fiatCurrency || 'GBP').toUpperCase();
  const fiatAmount = Number.isFinite(body.fiatAmount) ? Number(body.fiatAmount) : 5;

  // Input validation — cheap rejects before we spend a CDP call.
  if (!UUID_RE.test(linkId)) {
    return NextResponse.json({ error: 'Invalid linkId.' }, { status: 400 });
  }
  if (!ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid walletAddress.' }, { status: 400 });
  }
  if (!ALLOWED_FIATS.has(fiatCurrency)) {
    return NextResponse.json({ error: 'Unsupported fiatCurrency.' }, { status: 400 });
  }
  if (fiatAmount < 1 || fiatAmount > 1000) {
    return NextResponse.json({ error: 'fiatAmount must be between 1 and 1000.' }, { status: 400 });
  }

  // Auth for anonymous fans: the linkId must exist. This ties every
  // session token to a real content transaction and prevents random
  // scripts from minting free tokens against our CDP account.
  try {
    const link = await db.query.picoLinks.findFirst({
      where: eq(picoLinks.id, linkId),
      columns: { id: true },
    });
    if (!link) {
      return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
    }
  } catch (error) {
    console.error('[onramp/session] DB lookup failed:', error);
    return NextResponse.json({ error: 'Link lookup failed.' }, { status: 500 });
  }

  // Sign a short-lived CDP JWT and call Coinbase.
  let jwt: string;
  try {
    jwt = await generateCdpJwt('POST', CDP_HOST, CDP_PATH);
  } catch (error) {
    console.error('[onramp/session] JWT generation failed:', error);
    return NextResponse.json({ error: 'Authentication configuration error.' }, { status: 500 });
  }

  const cdpBody = {
    addresses: [
      {
        address: walletAddress,
        blockchains: ['base'],
      },
    ],
    assets: ['USDC'],
    presetFiatAmount: fiatAmount,
    fiatCurrency,
  };

  try {
    const resp = await fetch(`https://${CDP_HOST}${CDP_PATH}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cdpBody),
    });

    const responseText = await resp.text();
    if (!resp.ok) {
      // Bubble up Coinbase's error for debugging but do NOT leak the JWT.
      console.error('[onramp/session] Coinbase rejected:', resp.status, responseText.slice(0, 500));
      return NextResponse.json(
        { error: `Onramp session generation failed (${resp.status}).` },
        { status: 502 },
      );
    }

    let json: { token?: string; channel_id?: string };
    try {
      json = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: 'Malformed response from Coinbase.' }, { status: 502 });
    }

    // Coinbase returns snake_case (token, channel_id) per the CDP docs.
    // Only return what the browser needs — never leak our JWT or key id.
    return NextResponse.json({
      sessionToken: json.token,
      channelId: json.channel_id,
    });
  } catch (error) {
    console.error('[onramp/session] Coinbase call failed:', error);
    return NextResponse.json({ error: 'Onramp service unavailable.' }, { status: 502 });
  }
}
