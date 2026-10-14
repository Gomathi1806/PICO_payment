/**
 * Pay a Pico link over x402 on Arc mainnet, settled by Circle's
 * Facilitator Service. USDC moves straight from the buyer to the
 * creator's wallet — Pico never touches it.
 *
 *   BUYER_PRIVATE_KEY=0x... node scripts/pay-arc.mts <pico-link-id> [base-url]
 *
 * The buyer wallet needs USDC on Arc (it is also Arc's gas token, but
 * the facilitator pays gas for the EIP-3009 transfer, so the buyer only
 * needs the link price).
 */
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const [linkId, baseUrl = 'https://picomicropay.nl'] = process.argv.slice(2);
const key = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
if (!linkId || !key) {
  console.error('Usage: BUYER_PRIVATE_KEY=0x... node scripts/pay-arc.mts <pico-link-id> [base-url]');
  process.exit(1);
}

const account = privateKeyToAccount(key);
const client = registerExactEvmScheme(new x402Client(), {
  signer: account,
  networks: ['eip155:5042'],
});
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const url = `${baseUrl.replace(/\/+$/, '')}/api/content/${linkId}?network=arc`;
console.log(`Buyer ${account.address} paying ${url}`);

const res = await fetchWithPayment(url);
const body = await res.json().catch(() => null);
console.log(`HTTP ${res.status}`, body);

const header = res.headers.get('payment-response') ?? res.headers.get('x-payment-response');
if (header) {
  const settlement = decodePaymentResponseHeader(header);
  console.log('Settlement:', settlement);
  if (settlement.transaction) {
    console.log(`Explorer: https://explorer.arc.io/tx/${settlement.transaction}`);
  }
}
process.exit(res.ok ? 0 : 1);
