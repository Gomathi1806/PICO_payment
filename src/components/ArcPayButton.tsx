'use client';

import { useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, formatUnits, type EIP1193Provider } from 'viem';
import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { arc, ARC_NETWORK, ARC_USDC_ADDRESS } from '@/lib/arc';
import { ERC20_ABI } from '@/lib/constants';

/**
 * Pay a Pico link with USDC on Arc mainnet over x402.
 *
 * Uses the browser's injected wallet (Rabby, MetaMask, …) directly rather
 * than wagmi, which this page pins to Coinbase Smart Wallet on Base. The
 * buyer signs one EIP-3009 authorization — no gas, no approval tx — and
 * Circle's x402 facilitator settles it straight to the creator's wallet.
 */
export default function ArcPayButton({
  linkId,
  price,
  onUnlocked,
}: {
  linkId: string;
  price: string;
  onUnlocked: (result: { contentUrl: string; txHash: string | null }) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'signing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [fundAddress, setFundAddress] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setFundAddress(null);
    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum) {
      setError('Paying on Arc needs a browser wallet such as Rabby or MetaMask.');
      return;
    }

    try {
      setStatus('connecting');
      const wallet = createWalletClient({ chain: arc, transport: custom(ethereum) });
      const [address] = await wallet.requestAddresses();

      // The EIP-712 domain is bound to chain 5042, and wallets refuse to
      // sign typed data for a chain they aren't on.
      if ((await wallet.getChainId()) !== arc.id) {
        try {
          await wallet.switchChain({ id: arc.id });
        } catch {
          await wallet.addChain({ chain: arc });
          await wallet.switchChain({ id: arc.id });
        }
      }

      const publicClient = createPublicClient({ chain: arc, transport: http() });
      const balance = await publicClient.readContract({
        address: ARC_USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      if (Number(formatUnits(balance, 6)) < Number(price)) {
        setError(`This wallet has ${formatUnits(balance, 6)} USDC on Arc; you need ${price}.`);
        setFundAddress(address);
        setStatus('idle');
        return;
      }

      setStatus('signing');
      const client = registerExactEvmScheme(new x402Client(), {
        signer: {
          address,
          signTypedData: (typed) =>
            wallet.signTypedData({ account: address, ...typed } as Parameters<typeof wallet.signTypedData>[0]),
        },
        networks: [ARC_NETWORK],
      });
      const fetchWithPayment = wrapFetchWithPayment(fetch, client);
      const res = await fetchWithPayment(`/api/content/${linkId}?network=arc`);

      if (!res.ok) {
        let reason = `HTTP ${res.status}`;
        const required = res.headers.get('payment-required');
        if (required) {
          try {
            reason = JSON.parse(atob(required)).error ?? reason;
          } catch {
            /* keep the status code */
          }
        }
        throw new Error(reason);
      }

      const body = (await res.json()) as { contentUrl?: string };
      const header = res.headers.get('payment-response');
      const tx = header ? decodePaymentResponseHeader(header).transaction ?? null : null;
      setTxHash(tx);
      if (body.contentUrl) onUnlocked({ contentUrl: body.contentUrl, txHash: tx });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setError(
        /reject|denied/i.test(message)
          ? 'Payment was cancelled in your wallet.'
          : `Arc payment failed: ${message}`,
      );
    } finally {
      setStatus('idle');
    }
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        className="btn btn-secondary"
        onClick={pay}
        disabled={status !== 'idle'}
        style={{ width: '100%', padding: '0.8rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
      >
        {status === 'connecting'
          ? 'Connecting wallet…'
          : status === 'signing'
            ? 'Sign in your wallet…'
            : `⚡ Pay $${price} USDC on Arc`}
      </button>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
        Rabby or MetaMask · one signature, no gas · settled by Circle straight to the creator
      </div>
      {txHash && (
        <a
          href={`https://explorer.arc.io/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', fontSize: '0.7rem', marginTop: '0.35rem', color: '#3b82f6' }}
        >
          View Arc transaction →
        </a>
      )}
      {error && (
        <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.5rem', textAlign: 'left' }}>
          ⚠️ {error}
        </div>
      )}
      {fundAddress && (
        <div style={{
          marginTop: '0.5rem', padding: '0.75rem', textAlign: 'left',
          fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5,
          background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px',
        }}>
          <div style={{ fontWeight: 700, color: 'white', marginBottom: '0.3rem' }}>Get USDC on Arc</div>
          Move USDC from Base, Ethereum or Arbitrum to Arc with Circle&apos;s CCTP bridge, to the same address. You only
          need the price — Circle pays the gas for this unlock.
          <div style={{
            margin: '0.5rem 0', fontFamily: 'monospace', fontSize: '0.65rem', wordBreak: 'break-all',
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: '6px', padding: '0.4rem 0.6rem',
          }}>
            {fundAddress}
          </div>
          <a
            href="https://docs.arc.io/app-kit/quickstarts/bridge-tokens-across-blockchains"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6' }}
          >
            How to bridge USDC to Arc →
          </a>
          {' · '}
          <a
            href={`https://explorer.arc.io/address/${fundAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6' }}
          >
            Check balance on Arc →
          </a>
        </div>
      )}
    </div>
  );
}
