import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateCdpJwt } from '@/lib/cdp-auth';

/**
 * Backend Coinbase Offramp session-token minter.
 *
 * Mirrors /api/onramp/session but for the SELL flow (USDC → GBP into
 * a bank account). Per docs.cdp.coinbase.com/onramp/offramp:
 *   - Off-ramp uses the SAME POST /onramp/v1/token endpoint as on-ramp
 *   - The distinction is which pay.coinbase.com URL the browser opens
 *     with the returned token: /v3/sell/input for off-ramp, /buy/... for
 *     on-ramp
 *   - Session tokens are single-use, 5-minute expiry, generated fresh
 *     per request server-side so the CDP secret never touches the client
 *
 * Auth model — this is the KEY difference from /api/onramp/session:
 *   Off-ramp is a CREATOR action (they're selling their own earnings),
 *   not a fan action, so we auth via NextAuth session cookie rather
 *   than by requiring a linkId. Anonymous callers get 401.
 *   The caller's own wallet becomes the source `address` — we do NOT
 *   accept arbitrary wallet addresses from the request body, because
 *   otherwise a logged-in creator could mint sessions for anyone.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ALLOWED_FIATS = new Set(['GBP', 'USD', 'EUR']);
const CDP_HOST = 'api.developer.coinbase.com';
const CDP_PATH = '/onramp/v1/token';

interface Body {
  walletAddress?: string;      // creator's own wallet, must match session's known address
  fiatCurrency?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Same-origin only, matching every other backend route we ship.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: 'Cross-origin requests not allowed.' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in as a creator to cash out.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const walletAddress = (body.walletAddress || '').trim();
  const fiatCurrency = (body.fiatCurrency || 'GBP').toUpperCase();

  if (!ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid walletAddress.' }, { status: 400 });
  }
  if (!ALLOWED_FIATS.has(fiatCurrency)) {
    return NextResponse.json({ error: 'Unsupported fiatCurrency.' }, { status: 400 });
  }

  let jwt: string;
  try {
    jwt = await generateCdpJwt('POST', CDP_HOST, CDP_PATH);
  } catch (error) {
    console.error('[offramp/session] JWT generation failed:', error);
    return NextResponse.json({ error: 'Authentication configuration error.' }, { status: 500 });
  }

  // Same body shape as on-ramp — Coinbase's session endpoint doesn't
  // require a flow-type flag; the caller's choice of launch URL
  // (buy/... vs v3/sell/input) determines which product renders.
  // For off-ramp the `addresses` array names the SOURCE wallets whose
  // USDC will be sold; Coinbase's UI reads the balance and presents
  // it as sellable.
  const cdpBody = {
    addresses: [
      {
        address: walletAddress,
        blockchains: ['base'],
      },
    ],
    assets: ['USDC'],
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
      console.error('[offramp/session] Coinbase rejected:', resp.status, responseText.slice(0, 500));
      return NextResponse.json(
        { error: `Offramp session generation failed (${resp.status}).` },
        { status: 502 },
      );
    }

    let json: { token?: string; channel_id?: string };
    try {
      json = JSON.parse(responseText);
    } catch {
      return NextResponse.json({ error: 'Malformed response from Coinbase.' }, { status: 502 });
    }

    // Only return what the browser needs — never leak our JWT or key id.
    return NextResponse.json({
      sessionToken: json.token,
      channelId: json.channel_id,
    });
  } catch (error) {
    console.error('[offramp/session] Coinbase call failed:', error);
    return NextResponse.json({ error: 'Offramp service unavailable.' }, { status: 502 });
  }
}
