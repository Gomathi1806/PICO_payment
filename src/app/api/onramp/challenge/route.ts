import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { picoLinks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { issueChallenge } from '@/lib/onramp-auth';

/**
 * Step 1 of Onramp wallet-signature auth: hand the browser a nonce to
 * sign. See src/lib/onramp-auth.ts for the threat model.
 *
 * Issuing a challenge grants nothing on its own — the session token is
 * only minted once /api/onramp/session gets a valid signature back —
 * so this route is deliberately cheap and side-effect free.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ error: 'Cross-origin requests not allowed.' }, { status: 403 });
  }
  if (!host) {
    return NextResponse.json({ error: 'Missing host.' }, { status: 400 });
  }

  let body: { linkId?: string; walletAddress?: string };
  try {
    body = (await request.json()) as { linkId?: string; walletAddress?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const linkId = (body.linkId || '').trim();
  const walletAddress = (body.walletAddress || '').trim();

  if (!UUID_RE.test(linkId)) {
    return NextResponse.json({ error: 'Invalid linkId.' }, { status: 400 });
  }
  if (!ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid walletAddress.' }, { status: 400 });
  }

  // Only issue challenges for real content — keeps the endpoint from
  // being a generic nonce oracle.
  try {
    const link = await db.query.picoLinks.findFirst({
      where: eq(picoLinks.id, linkId),
      columns: { id: true },
    });
    if (!link) {
      return NextResponse.json({ error: 'Link not found.' }, { status: 404 });
    }
  } catch (error) {
    console.error('[onramp/challenge] DB lookup failed:', error);
    return NextResponse.json({ error: 'Link lookup failed.' }, { status: 500 });
  }

  try {
    const { challenge, message } = issueChallenge(host, walletAddress, linkId);
    return NextResponse.json({ challenge, message });
  } catch (error) {
    console.error('[onramp/challenge] issue failed:', error);
    return NextResponse.json({ error: 'Challenge unavailable.' }, { status: 500 });
  }
}
