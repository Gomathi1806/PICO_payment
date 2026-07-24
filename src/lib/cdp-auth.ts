import { SignJWT, importPKCS8 } from 'jose';
import crypto from 'node:crypto';

/**
 * Coinbase Developer Platform (CDP) auth helper.
 *
 * Coinbase's REST APIs on api.developer.coinbase.com require a signed
 * JWT per request. The JWT is short-lived (~2 minutes), scoped to a
 * single METHOD + host + path, and includes a nonce so it can't be
 * replayed.
 *
 * Two things to know:
 *
 *  1. The private key CDP issues is either Ed25519 (PEM, newer default)
 *     or ES256 P-256 (PEM, older). This helper handles both — jose's
 *     importPKCS8 accepts either PEM format if you pass the matching
 *     algorithm. We detect the algorithm from the PEM header.
 *
 *  2. Coinbase's spec puts the `nonce` in the JWT HEADER (not the
 *     payload) — this is deliberately non-standard. `SignJWT`'s
 *     `setProtectedHeader` covers it.
 *
 * The private key sits in Vercel encrypted env vars (CDP_API_KEY_SECRET),
 * server-side only. It never leaves the process, never lands in a
 * client-side bundle, never appears in logs.
 */

const CDP_JWT_TTL_SECONDS = 120; // Coinbase enforces short-lived tokens

function detectAlgorithm(pem: string): 'EdDSA' | 'ES256' {
  // Ed25519 keys start with -----BEGIN PRIVATE KEY----- (PKCS8 wrapper)
  // and are ~48 bytes long — much shorter than P-256.
  // P-256 keys typically use -----BEGIN EC PRIVATE KEY----- (SEC1) or
  // longer PKCS8 blobs (~121 bytes base64).
  if (pem.includes('BEGIN EC PRIVATE KEY')) return 'ES256';
  // For PKCS8, length heuristic: Ed25519 PKCS8 is significantly smaller
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return body.length < 100 ? 'EdDSA' : 'ES256';
}

/**
 * Build a signed JWT for a single CDP REST call.
 *
 * @param method     HTTP method (uppercase, e.g. "POST")
 * @param host       API host without protocol (e.g. "api.developer.coinbase.com")
 * @param path       Path with leading slash (e.g. "/onramp/v1/token")
 */
export async function generateCdpJwt(
  method: string,
  host: string,
  path: string,
): Promise<string> {
  const apiKeyId = process.env.CDP_API_KEY_ID?.trim();
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim().replace(/\\n/g, '\n');

  if (!apiKeyId || !apiKeySecret) {
    throw new Error('CDP_API_KEY_ID or CDP_API_KEY_SECRET is not configured.');
  }

  const alg = detectAlgorithm(apiKeySecret);
  const key = await importPKCS8(apiKeySecret, alg);
  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    // Coinbase's spec: URI claim ties this token to a single request.
    uri: `${method} ${host}${path}`,
  })
    .setProtectedHeader({ alg, typ: 'JWT', kid: apiKeyId, nonce })
    .setIssuer('cdp')
    .setSubject(apiKeyId)
    .setAudience(['cdp_service'])
    .setNotBefore(now)
    .setIssuedAt(now)
    .setExpirationTime(now + CDP_JWT_TTL_SECONDS)
    .sign(key);
}
