import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { withX402 } from '@x402/next';
import { convertToTokenAmount, numberToDecimalString } from '@x402/core/utils';
import { NextRequest, NextResponse } from 'next/server';

/**
 * x402 facilitator setup.
 *
 * Ported from the Farcaster Pico project's lib/x402-config.ts and
 * adapted for pico-payment's use case: the payTo address is dynamic
 * per request (the creator's wallet for the given Pico link), not a
 * single fixed operator address.
 *
 * x402's exact scheme allows exactly one payTo per request. Until the
 * PicoRouter splitter contract ships, we collect the platform fee
 * off-chain: x402 routes send the full payment to the Pico treasury
 * (NEXT_PUBLIC_PICO_TREASURY_ADDRESS), the `payments` table records
 * gross-per-link, and creators are settled 95% in a batched payout.
 * The direct /p/[id] page keeps its atomic 95/5 EIP-5792 batch — that
 * path splits on-chain in a single tx and pays creators instantly.
 * When Phase 2 lands, x402 will point at PicoRouter for on-chain split.
 */

export type PicoNetwork = 'eip155:8453' | 'eip155:84532' | 'eip155:5042';

const NETWORK_ALIAS: Record<string, PicoNetwork> = {
  base: 'eip155:8453',
  'eip155:8453': 'eip155:8453',
  'base-sepolia': 'eip155:84532',
  'eip155:84532': 'eip155:84532',
  arc: 'eip155:5042',
  'eip155:5042': 'eip155:5042',
};

// Arc mainnet USDC. Arc's native gas token is USDC (18 decimals); this
// is its ERC-20 interface (6 decimals) and supports EIP-3009, which is
// what the exact scheme signs. @x402/evm has no default asset for Arc,
// so we supply it via a money parser. Values cross-checked against
// Circle's /supported (extra.name "USDC", version "2") and on-chain.
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
const ARC_NETWORK = 'eip155:5042';

// Default to Base MAINNET. Prod, staging, and any deploy that faces real
// users must land here. Local dev opts into testnet with X402_NETWORK=base-sepolia.
export const DEFAULT_NETWORK = (NETWORK_ALIAS[
  (process.env.X402_NETWORK?.trim() || 'base').toLowerCase()
] ?? 'eip155:8453') as string;

// Facilitator setup.
//
// x402ResourceServer merges every client's /supported list at
// initialize(); for a given (version, network, scheme) the EARLIEST
// listed client wins, and a client whose /supported call fails is
// skipped with a warning rather than taking the endpoint down.
//
// Base MAINNET (eip155:8453) is the load-bearing case: prod runs with
// X402_NETWORK=base. The x402.org public facilitator is testnet-only
// for EVM (its /supported has eip155:84532 but NOT 8453 — verified
// 2026-07-18), so on its own it 500s every mainnet request with
// "facilitator not ready". PayAI's public facilitator serves
// v2/exact on eip155:8453 (and 84532) with no API keys, so it is the
// mainnet workhorse. x402.org stays first purely as the Sepolia
// preference; CDP is appended when credentials exist, as a fallback
// for anything the first two don't cover.
//
// Arc mainnet (eip155:5042) is served only by Circle's Facilitator
// Service — CDP, PayAI and x402.org don't list it (checked 2026-10-14).
// Circle is appended LAST so it never takes over Base from the clients
// above. It needs CIRCLE_API_KEY: the keyless trial requires a proof
// signed by the payTo key, and payTo is the creator's wallet, which
// Pico doesn't (and must never) control.
const facilitatorClients = [
  new HTTPFacilitatorClient({ url: 'https://www.x402.org/facilitator' }),
  new HTTPFacilitatorClient({ url: 'https://facilitator.payai.network' }),
];
if (process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET) {
  facilitatorClients.push(
    new HTTPFacilitatorClient(
      createFacilitatorConfig(
        process.env.CDP_API_KEY_ID,
        process.env.CDP_API_KEY_SECRET,
      ),
    ),
  );
}

const circleApiKey = process.env.CIRCLE_API_KEY?.trim();
if (circleApiKey) {
  const auth = { Authorization: `Bearer ${circleApiKey}` };
  facilitatorClients.push(
    new HTTPFacilitatorClient({
      url: 'https://api.circle.com/v1/facilitator/x402',
      createAuthHeaders: async () => ({ verify: auth, settle: auth, supported: auth }),
    }),
  );
}

export const x402Server = new x402ResourceServer(facilitatorClients);

let initialized = false;
export async function ensureX402Ready() {
  if (initialized) return;

  // Same env-var fixup as the Farcaster project: env loaders sometimes
  // escape \n as the literal characters, which breaks PEM parsing.
  if (process.env.CDP_API_KEY_SECRET) {
    process.env.CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET.trim().replace(/\\n/g, '\n');
  }
  if (process.env.CDP_API_KEY_ID) {
    process.env.CDP_API_KEY_ID = process.env.CDP_API_KEY_ID.trim();
  }

  for (const net of ['eip155:8453', 'eip155:84532'] as const) {
    try {
      x402Server.register(net, new ExactEvmScheme());
    } catch (error) {
      console.error(`[pico/x402] Failed to register ${net}:`, error);
    }
  }

  if (circleApiKey) {
    try {
      const arcScheme = new ExactEvmScheme().registerMoneyParser(async (amount, network) =>
        network === ARC_NETWORK
          ? {
              amount: convertToTokenAmount(numberToDecimalString(amount), 6),
              asset: ARC_USDC_ADDRESS,
              extra: { name: 'USDC', version: '2' },
            }
          : null,
      );
      x402Server.register(ARC_NETWORK, arcScheme);
    } catch (error) {
      console.error(`[pico/x402] Failed to register ${ARC_NETWORK}:`, error);
    }
  }

  try {
    await x402Server.initialize();
    initialized = true;
    console.log('[pico/x402] facilitator ready for all configured networks');
  } catch (error) {
    console.error('[pico/x402] initialization failed:', error);
  }
}

/**
 * Wraps a Next.js route handler with an x402 paywall whose `payTo` and
 * `price` are computed per request. The wrapped handler only runs after
 * the client has presented a valid X-Payment header for the requested
 * amount; otherwise the client gets back a 402 with the payment
 * requirements and retries via x402-fetch.
 *
 * `resolve` is called once per request and returns the per-request
 * paywall config (or null to bypass the paywall entirely — used to
 * return free preview content for visitors who haven't paid yet).
 */
export function withDynamicX402(
  handler: (req: NextRequest) => Promise<NextResponse>,
  resolve: (req: NextRequest, network: PicoNetwork) => Promise<
    | { price: string; payTo: `0x${string}`; description: string }
    | null
  >,
) {
  return async function (req: NextRequest) {
    try {
      await ensureX402Ready();

      const requestedNet =
        req.headers.get('x-x402-network') ||
        new URL(req.url).searchParams.get('network') ||
        DEFAULT_NETWORK;
      const targetNetwork = (NETWORK_ALIAS[requestedNet.trim().toLowerCase()] ??
        DEFAULT_NETWORK) as PicoNetwork;

      const config = await resolve(req, targetNetwork);
      if (!config) {
        // Free path — no paywall, just run the handler.
        return await handler(req);
      }

      if (!x402Server.hasRegisteredScheme(targetNetwork, 'exact')) {
        return NextResponse.json(
          { error: `Network ${targetNetwork} not registered.` },
          { status: 500 },
        );
      }

      const supportedKind = x402Server.getSupportedKind(2, targetNetwork, 'exact');
      if (!supportedKind) {
        return NextResponse.json(
          { error: `x402 facilitator not ready for ${targetNetwork}.` },
          { status: 500 },
        );
      }

      const accepts = [
        {
          scheme: 'exact' as const,
          price: config.price,
          network: targetNetwork,
          payTo: config.payTo,
        },
      ];

      const wrapped = withX402(
        handler,
        { accepts, description: config.description },
        x402Server,
        undefined,
        undefined,
        false,
      );

      return await wrapped(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[pico/x402] handler failed:', error);
      return NextResponse.json(
        { error: `Internal Server Error: ${message}` },
        { status: 500 },
      );
    }
  };
}
