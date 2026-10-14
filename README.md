# Pico

Pay-per-unlock paywalls for creators. Put any link — a PDF, article, audio clip or file — behind a price of a few cents, share one URL, and fans unlock it in a tap. Every paywall speaks HTTP 402 ([x402](https://x402.org)), so the same link can be paid by a person in a browser or by an AI agent in code.

Live at **https://picomicropay.nl**.

## Settled in USDC on Arc

Pico settles x402 payments on **[Arc](https://arc.io) mainnet** (`eip155:5042`), Circle's USDC-native L1, alongside Base.

- **Live link:** https://picomicropay.nl/p/743ed419-bbb9-4983-9a2a-a65212eb248a (0.10 USDC)
- **Settled unlock on Arc:** [`0x5fae3d…66de`](https://explorer.arc.io/tx/0x5fae3d5ed8e859fccdc1f591740ab083c308d5ec8f1b61e9d17e37ad4cdb66de)

### How a payment works

1. The fan opens a Pico link and clicks **⚡ Pay on Arc**. Pico connects their browser wallet (Rabby, MetaMask), adds/switches to Arc, and checks their USDC balance.
2. `GET /api/content/:id?network=arc` returns `402 Payment Required` with an `exact` payment requirement for Arc USDC, payable to the **creator's wallet**.
3. The fan signs one EIP-3009 `transferWithAuthorization` — no gas, no approval transaction.
4. Pico forwards it to **Circle's x402 Facilitator Service**, which verifies and settles it on Arc (final in under a second) and returns the transaction hash.
5. Pico returns the unlocked content and records the payment with the real Arc tx hash; the creator's dashboard shows it with an **ARC** badge linking to the explorer.

Pico never holds buyer funds: every x402 unlock, on Arc or Base, pays the creator directly. Without a `?network=` pin, the 402 challenge offers Base and Arc side by side and the payer chooses.

### Where it lives

| Piece | File |
|---|---|
| Arc chain config, USDC address, tx-hash helpers | [`src/lib/arc.ts`](src/lib/arc.ts) |
| x402 server, Circle facilitator, Arc registration | [`src/lib/x402-config.ts`](src/lib/x402-config.ts) |
| Paywalled content route + payment recording | [`src/app/api/content/[id]/route.ts`](src/app/api/content/%5Bid%5D/route.ts) |
| "Pay on Arc" browser flow | [`src/components/ArcPayButton.tsx`](src/components/ArcPayButton.tsx) |
| Agent/CLI buyer | [`scripts/pay-arc.mts`](scripts/pay-arc.mts) |
| Circle API key check (no funds spent) | [`scripts/check-circle-key.mts`](scripts/check-circle-key.mts) |

Arc details that matter: USDC's ERC-20 interface is `0x3600000000000000000000000000000000000000` with **6 decimals** (EIP-712 domain `USDC` / `2`), while native gas USDC uses 18 — Pico only ever uses the 6-decimal interface.

### Pay a link from code

```bash
node scripts/pay-arc.mts <pico-link-id>
```

The script prompts for the buyer's private key (hidden), pays over x402 on Arc, and prints the explorer link. The buyer only needs the link price in Arc USDC; Circle pays settlement gas.

## Running locally

```bash
npm install
npm run dev
```

Environment (see Vercel for production values):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (Neon) |
| `AUTH_SECRET`, `AUTH_URL` | NextAuth |
| `CIRCLE_API_KEY` | Circle Facilitator Service — enables Arc (`LIVE_API_KEY:…` for mainnet) |
| `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET` | Optional Coinbase facilitator fallback for Base |
| `X402_NETWORK` | Default network (`base`, `base-sepolia`, or `arc`) |
| `NEXT_PUBLIC_PICO_TREASURY_ADDRESS` | Fee wallet for the direct (non-x402) checkout |

## Stack

Next.js 16 (App Router) on Vercel · viem / wagmi · x402 v2 (`@x402/next`, `@x402/fetch`, `@x402/evm`) · Circle Facilitator Service · Postgres (Neon) + Drizzle · Vercel Blob.
