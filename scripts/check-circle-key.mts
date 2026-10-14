/**
 * Checks a Circle API key against Facilitator Service /verify on Arc
 * mainnet using throwaway, unfunded wallets. Nothing is signed by a
 * real wallet and nothing settles — a working key returns
 * `insufficient_funds`; a key Circle refuses returns 401/403.
 *
 *   node scripts/check-circle-key.mts
 */
import { x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

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
        if (ch === '\u0003') process.exit(130);
        if (ch === '\u007f') {
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

const apiKey = (process.env.CIRCLE_API_KEY || (await promptHidden('Circle API key (hidden): '))).trim();
const parts = apiKey.split(':');
const pastes = apiKey.match(/(LIVE|TEST)_API_KEY/g)?.length ?? 0;
console.log(`Key prefix: ${parts[0]}  parts: ${parts.length}  length: ${apiKey.length}`);
if (pastes > 1) {
  console.error(`The key was pasted ${pastes} times. Run again and paste it ONCE, then press Enter.`);
  process.exit(1);
}
if (parts.length !== 3) {
  console.error('A Circle key looks like LIVE_API_KEY:<id>:<secret> (3 parts). Copy it again from Circle Console.');
  process.exit(1);
}

const buyer = privateKeyToAccount(generatePrivateKey());
const seller = privateKeyToAccount(generatePrivateKey());
const client = registerExactEvmScheme(new x402Client(), { signer: buyer, networks: ['eip155:5042'] });
const requirements = {
  scheme: 'exact',
  network: 'eip155:5042',
  amount: '100000',
  asset: '0x3600000000000000000000000000000000000000',
  payTo: seller.address,
  maxTimeoutSeconds: 300,
  extra: { name: 'USDC', version: '2' },
};
const paymentPayload = await client.createPaymentPayload({
  x402Version: 2,
  resource: { url: 'https://picomicropay.nl/', description: 'key check', mimeType: '' },
  accepts: [requirements],
} as Parameters<typeof client.createPaymentPayload>[0]);

const res = await fetch('https://api.circle.com/v1/facilitator/x402/verify', {
  method: 'POST',
  headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements }),
});
const text = await res.text();
console.log(`Circle /verify -> HTTP ${res.status} ${text}`);
console.log(
  res.status === 200
    ? 'Key WORKS (insufficient_funds is expected for the empty test wallet).'
    : 'Circle refused this key for Facilitator Service.',
);
