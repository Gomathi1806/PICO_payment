/**
 * Pay a Pico link over x402 on Arc mainnet, settled by Circle's
 * Facilitator Service. USDC moves straight from the buyer to the
 * creator's wallet — Pico never touches it.
 *
 *   node scripts/pay-arc.mts <pico-link-id> [base-url]
 *
 * Prompts for the buyer's private key (hidden), or reads BUYER_PRIVATE_KEY.
 *
 * The buyer wallet needs USDC on Arc (it is also Arc's gas token, but
 * the facilitator pays gas for the EIP-3009 transfer, so the buyer only
 * needs the link price).
 */
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const [linkId, baseUrl = 'https://picomicropay.nl'] = process.argv.slice(2);
if (!linkId) {
  console.error('Usage: node scripts/pay-arc.mts <pico-link-id> [base-url]');
  process.exit(1);
}

// Prompt without echoing, so the key never lands in shell history.
async function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  let input = '';
  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          // Strip terminal bracketed-paste markers (ESC[200~ / ESC[201~)
          // and any other control characters a paste can drag in.
          return resolve(input.replace(/\u001b\[20[01]~/g, '').replace(/[\u0000-\u001f\u007f]/g, ''));
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f') {
          // Backspace
          if (input) process.stdout.write('\b \b');
          input = input.slice(0, -1);
        } else {
          input += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

// Rabby and some other wallets export keys without the 0x prefix.
const rawKey = (process.env.BUYER_PRIVATE_KEY || (await promptHidden('Buyer private key (hidden): '))).trim();
const hex = rawKey.replace(/^0x/i, '');
if (/^[0-9a-f]{40}$/i.test(hex)) {
  console.error('That is a wallet ADDRESS (40 hex chars). Paste the PRIVATE KEY instead (64 hex chars).');
  process.exit(1);
}
if (!/^[0-9a-f]{64}$/i.test(hex)) {
  console.error(`Private key should be 64 hex characters; got ${hex.length}.`);
  process.exit(1);
}
const key = `0x${hex}` as `0x${string}`;

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
if (res.status === 402) {
  const required = res.headers.get('payment-required');
  if (required) {
    const decoded = JSON.parse(Buffer.from(required, 'base64').toString('utf8'));
    console.error('Payment rejected:', decoded.error ?? decoded);
    console.error('Check the buyer holds enough USDC on Arc mainnet:', `https://explorer.arc.io/address/${account.address}`);
  }
}
process.exit(res.ok ? 0 : 1);
