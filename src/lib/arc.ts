import { defineChain } from 'viem';

// Arc mainnet — Circle's USDC-native L1. Values from docs.arc.io and
// confirmed on-chain (eth_chainId 0x13b2).
export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  // Native gas is USDC with 18 decimals. Payment amounts go through the
  // ERC-20 interface below, which uses 6 — never mix the two.
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
});

export const ARC_NETWORK = 'eip155:5042' as const;
export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;

// payments has no network column, so x402 rows store their tx hash
// CAIP-prefixed ("eip155:5042:0x…", "eip155:8453:0x…"). Direct /p/[id]
// checkouts keep the bare hash. The prefix also marks the row as a
// fee-free x402 unlock — 100% went to the creator.
export function encodeX402TxHash(network: string, hash: string) {
  return `${network}:${hash}`;
}

const EXPLORERS: Record<string, { network: 'arc' | 'base'; url: string }> = {
  [ARC_NETWORK]: { network: 'arc', url: 'https://explorer.arc.io/tx/' },
  'eip155:8453': { network: 'base', url: 'https://basescan.org/tx/' },
  'eip155:84532': { network: 'base', url: 'https://sepolia.basescan.org/tx/' },
};

export function describePaymentTx(stored: string) {
  const match = /^(eip155:\d+):(0x[0-9a-f]{64})$/i.exec(stored);
  if (match) {
    const explorer = EXPLORERS[match[1]];
    return {
      network: explorer?.network ?? ('base' as const),
      hash: match[2],
      explorerUrl: explorer ? `${explorer.url}${match[2]}` : null,
      viaX402: true,
    };
  }
  const isHash = /^0x[0-9a-f]{64}$/i.test(stored);
  return {
    network: 'base' as const,
    hash: stored,
    explorerUrl: isHash ? `https://basescan.org/tx/${stored}` : null,
    viaX402: false,
  };
}
