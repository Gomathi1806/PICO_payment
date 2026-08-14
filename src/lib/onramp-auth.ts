import crypto from 'node:crypto';

/**
 * Wallet-signature authentication for the Onramp session endpoint.
 *
 * Coinbase's security requirements
 * (docs.cdp.coinbase.com/onramp/security-requirements) ask that session
 * tokens only be minted for authenticated users, and name "Wallet
 * Signature Authentication" as the approved pattern for apps whose
 * users don't hold accounts. Pico's fans never sign up — they land on
 * a creator's link and pay — so wallet signatures are the only identity
 * we have, and the one Coinbase asks for.
 *
 * Flow:
 *   1. Client asks /api/onramp/challenge for a nonce.
 *   2. We mint a stateless, HMAC-signed challenge binding
 *      host + wallet + link + timestamp. No DB row needed: the MAC is
 *      the proof we issued it, and the timestamp bounds its life.
 *   3. Client signs the human-readable message with their wallet.
 *   4. /api/onramp/session re-derives the message from the challenge,
 *      verifies the MAC, then verifies the signature actually came from
 *      the wallet the session token would fund.
 *
 * That last step is the security property that matters: a session token
 * can only ever be minted for an address whose owner just proved
 * control of it. Replaying a captured challenge+signature pair inside
 * its 5-minute window only re-funds the original signer's own wallet,
 * so it gains an attacker nothing — which is why we don't pay for a
 * nonce store.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // matches Coinbase's own token TTL

export interface ChallengePayload {
  host: string;
  address: string; // lowercased
  linkId: string;
  nonce: string;
  issuedAt: number; // epoch ms
}

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (!s) throw new Error('AUTH_SECRET is not configured.');
  return s;
}

function mac(encodedPayload: string): string {
  return crypto.createHmac('sha256', secret()).update(encodedPayload).digest('hex');
}

/**
 * The exact text the wallet signs. Both sides derive it from the same
 * payload, so a tampered challenge yields a different message and the
 * signature check fails.
 */
export function challengeMessage(p: ChallengePayload): string {
  return [
    `${p.host} wants you to authorize a Coinbase Onramp session.`,
    '',
    `Wallet: ${p.address}`,
    `Content: ${p.linkId}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${new Date(p.issuedAt).toISOString()}`,
    '',
    'Signing this message is free and does not move any funds.',
  ].join('\n');
}

/** Mint a signed challenge. Returns the opaque token and the message to sign. */
export function issueChallenge(
  host: string,
  address: string,
  linkId: string,
): { challenge: string; message: string } {
  const payload: ChallengePayload = {
    host,
    address: address.toLowerCase(),
    linkId,
    nonce: crypto.randomBytes(16).toString('hex'),
    issuedAt: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return {
    challenge: `${encoded}.${mac(encoded)}`,
    message: challengeMessage(payload),
  };
}

/**
 * Verify a challenge token is one we issued, is unexpired, and matches
 * the wallet/link the caller claims. Returns the payload (so the caller
 * can rebuild the signed message) or null if anything is off.
 */
export function verifyChallenge(
  challenge: string,
  expected: { host: string; address: string; linkId: string },
): ChallengePayload | null {
  const [encoded, providedMac] = challenge.split('.');
  if (!encoded || !providedMac) return null;

  const expectedMac = mac(encoded);
  if (providedMac.length !== expectedMac.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(providedMac), Buffer.from(expectedMac))) return null;

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as ChallengePayload;
  } catch {
    return null;
  }

  if (Date.now() - payload.issuedAt > CHALLENGE_TTL_MS) return null;
  if (payload.issuedAt > Date.now() + 60_000) return null; // clock-skew guard
  if (payload.host !== expected.host) return null;
  if (payload.address !== expected.address.toLowerCase()) return null;
  if (payload.linkId !== expected.linkId) return null;

  return payload;
}

/**
 * The end user's public IP, which Coinbase requires as `clientIp` so a
 * quote can only be used by the browser that requested it. Vercel
 * overwrites x-forwarded-for at the edge and refuses to forward
 * external values, so this can't be spoofed by the caller
 * (vercel.com/docs/headers/request-headers).
 */
export function clientIpFrom(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim();
  if (ip) return ip;

  // `next dev` has no proxy in front of it, so neither header exists.
  // Fall back to loopback locally to keep the flow testable, but never
  // in production — there a missing IP means something is wrong with
  // the request path, and Coinbase needs the real one.
  if (process.env.NODE_ENV !== 'production') return '127.0.0.1';
  return null;
}
