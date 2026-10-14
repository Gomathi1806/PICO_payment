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

// payments has no network column, so Arc rows store their tx hash
// CAIP-prefixed ("eip155:5042:0x…"). Base rows keep the bare hash.
const ARC_TX_PREFIX = `${ARC_NETWORK}:`;

export function encodeArcTxHash(hash: string) {
  return `${ARC_TX_PREFIX}${hash}`;
}

export function describePaymentTx(stored: string) {
  if (stored.startsWith(ARC_TX_PREFIX)) {
    const hash = stored.slice(ARC_TX_PREFIX.length);
    return { network: 'arc' as const, hash, explorerUrl: `https://explorer.arc.io/tx/${hash}` };
  }
  const isHash = /^0x[0-9a-f]{64}$/i.test(stored);
  return {
    network: 'base' as const,
    hash: stored,
    explorerUrl: isHash ? `https://basescan.org/tx/${stored}` : null,
  };
}
