import { generateJwt } from '@coinbase/cdp-sdk/auth';

/**
 * Coinbase Developer Platform (CDP) auth helper.
 *
 * Coinbase's REST APIs on api.developer.coinbase.com require a signed
 * JWT per request. We previously hand-rolled the token with jose, but
 * our claims drifted from what Coinbase's verifier actually expects —
 * we sent `uri` (singular string) plus an `aud` claim, while the
 * official SDK sends `uris` (array) and no audience at all. The
 * mismatch made every Onramp/Offramp call fail with a blanket
 * 401 Unauthorized even though the credentials were fine.
 *
 * Lesson learned: delegate to @coinbase/cdp-sdk's generateJwt (the
 * reference implementation, same code path createFacilitatorConfig
 * uses) so the claim shape can never drift again. It also handles
 * both key formats natively:
 *
 *   • Ed25519 Secret API Keys (current portal default): base64 string
 *     of 64 raw bytes, signed with EdDSA.
 *   • Legacy ECDSA keys: PEM ("-----BEGIN EC PRIVATE KEY-----"),
 *     signed with ES256.
 *
 * The secret lives in Vercel encrypted env vars, server-side only.
 */

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
  // Env loaders sometimes escape newlines as literal "\n", which breaks
  // PEM parsing for legacy ECDSA keys — same fixup as x402-config.ts.
  const apiKeySecret = process.env.CDP_API_KEY_SECRET?.trim().replace(/\\n/g, '\n');

  if (!apiKeyId || !apiKeySecret) {
    throw new Error('CDP_API_KEY_ID or CDP_API_KEY_SECRET is not configured.');
  }

  return await generateJwt({
    apiKeyId,
    apiKeySecret,
    requestMethod: method,
    requestHost: host,
    requestPath: path,
  });
}
