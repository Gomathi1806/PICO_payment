import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { db } from '@/db';
import { picoLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateCdpJwt } from '@/lib/cdp-auth';
import { challengeMessage, clientIpFrom, verifyChallenge } from '@/lib/onramp-auth';

/**
 * Backend Onramp session-token minter.
 *
 * Coinbase's security requirements say the client must NEVER hold the
 * CDP secret key or generate its own Onramp session tokens. This route
 * is the server-side gate: it authenticates the caller, generates a
 * short-lived CDP JWT with our private key (held in Vercel encrypted
 * env vars), calls Coinbase's session-token endpoint, and returns only
 * the session token to the browser.
 *
 * Authentication (docs.cdp.coinbase.com/onramp/security-requirements):
 *   Wallet Signature Authentication. The caller must present a
 *   challenge we issued at /api/onramp/challenge plus a signature over
 *   it from the very wallet the session would fund. We verify the
 *   signature on-chain-aware — viem's verifyMessage covers EOAs, EIP-1271
 *   contract wallets, and ERC-6492 counterfactual ones, which matters
 *   because most Pico fans arrive on a Coinbase Smart Wallet.
 *
 *   An earlier revision only checked that the linkId existed. Pico links
 *   are public by design, so that gated nothing: anyone could mint
 *   sessions for arbitrary addresses. Proving control of the receiving
 *   wallet is what actually binds a session to a real user.
 *
 * Response shape mirrors the Onramp v1 token endpoint.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]+$/;
const ALLOWED_FIATS = new Set(['GBP', 'USD', 'EUR']);
const CDP_HOST = 'api.developer.coinbase.com';
const CDP_PATH = '/onramp/v1/token';

interface Body {
  linkId?: string;
  walletAddress?: string;
  fiatAmount?: number;
  fiatCurrency?: string;
  challenge?: string;
  signature?: string;
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
  const challenge = (body.challenge || '').trim();
  const signature = (body.signature || '').trim();

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
  if (!challenge || !SIGNATURE_RE.test(signature)) {
    return NextResponse.json(
      { error: 'Wallet signature required. Request a challenge first.' },
      { status: 401 },
    );
  }

  // Coinbase requires the end user's IP so the quote can only be used by
  // the browser that asked for it. Vercel rewrites x-forwarded-for at the
  // edge, so the caller can't forge this.
  const clientIp = clientIpFrom(request.headers);
  if (!clientIp) {
    return NextResponse.json({ error: 'Could not determine client IP.' }, { status: 400 });
  }

  // Auth step 1: is this a challenge we issued, for this wallet, link
  // and host, still inside its 5-minute window?
  const payload = verifyChallenge(challenge, { host: host ?? '', address: walletAddress, linkId });
  if (!payload) {
    return NextResponse.json(
      { error: 'Challenge invalid or expired. Please try again.' },
      { status: 401 },
    );
  }

  // Auth step 2: did the wallet that will receive the funds actually
  // sign it? verifyMessage handles EOA, EIP-1271 and ERC-6492 wallets.
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
    });
    const valid = await publicClient.verifyMessage({
      address: walletAddress as `0x${string}`,
      message: challengeMessage(payload),
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: 'Signature does not match wallet.' }, { status: 401 });
    }
  } catch (error) {
    console.error('[onramp/session] signature verification failed:', error);
    return NextResponse.json({ error: 'Signature verification failed.' }, { status: 401 });
  }

  // The link must exist — every session stays tied to real content.
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
    clientIp,
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
