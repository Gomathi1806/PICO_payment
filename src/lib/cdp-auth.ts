import { SignJWT } from 'jose';
import crypto from 'node:crypto';

/**
 * Coinbase Developer Platform (CDP) auth helper.
 *
 * Coinbase's REST APIs on api.developer.coinbase.com require a signed
 * JWT per request. Per the official spec
 * (docs.cdp.coinbase.com/get-started/authentication/jwt-authentication,
 * verified 2026-07-18):
 *
 *   payload:  iss="cdp", sub=<key id>, aud=["cdp_service"],
 *             nbf/iat=now, exp=now+120s,
 *             uri="<METHOD> <host><path>"  (no protocol, e.g.
 *             "POST api.developer.coinbase.com/onramp/v1/token")
 *   header:   alg, kid=<key id>, typ="JWT", nonce=<random per token>
 *
 * KEY FORMATS — this is the part that bites people:
 *
 *   • Ed25519 Secret API Keys (the current default when you create a
 *     key in the CDP portal) are delivered as a BASE64 STRING of
 *     64 raw bytes — 32-byte seed + 32-byte public key. NOT PEM.
 *     Sign with alg "EdDSA".
 *
 *   • Legacy ECDSA keys are PEM ("-----BEGIN EC PRIVATE KEY-----").
 *     Sign with alg "ES256".
 *
 * We detect the format from the secret itself and build a Node
 * KeyObject either way (jose's SignJWT accepts KeyObjects in Node).
 * The secret lives in Vercel encrypted env vars, server-side only.
 */

const CDP_JWT_TTL_SECONDS = 120; // fixed window per Coinbase spec

// PKCS8 DER prefix for an Ed25519 private key: wrapping the raw
// 32-byte seed in this header yields a key Node's crypto can import.
// (SEQUENCE { version 0, AlgorithmIdentifier { id-Ed25519 }, OCTET STRING { seed } })
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function keyFromSecret(secret: string): { key: crypto.KeyObject; alg: 'EdDSA' | 'ES256' } {
  if (secret.includes('BEGIN')) {
    // PEM path — createPrivateKey handles PKCS8 and SEC1 ("EC PRIVATE
    // KEY") wrappers alike, which importPKCS8 from jose does not.
    const key = crypto.createPrivateKey(secret);
    const alg = key.asymmetricKeyType === 'ed25519' ? 'EdDSA' : 'ES256';
    return { key, alg };
  }

  // Base64 Ed25519 path (current CDP default). 64 bytes = seed ‖ pubkey;
  // only the 32-byte seed goes into the PKCS8 wrapper.
  const raw = Buffer.from(secret, 'base64');
  if (raw.length !== 64 && raw.length !== 32) {
    throw new Error(
      `CDP_API_KEY_SECRET is neither PEM nor a 64-byte base64 Ed25519 key (decoded ${raw.length} bytes).`,
    );
  }
  const seed = raw.subarray(0, 32);
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const key = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  return { key, alg: 'EdDSA' };
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

  const { key, alg } = keyFromSecret(apiKeySecret);
  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  return await new SignJWT({
    // Ties this token to exactly one request. Spec format has no
    // protocol prefix: "POST api.developer.coinbase.com/onramp/v1/token"
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
