'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  walletAddress?: string;
  fiatCurrency?: 'GBP' | 'USD' | 'EUR';
  onClosed?: () => void;   // fires when the popup closes (completed or abandoned)
}

/**
 * Coinbase Offramp launcher — sits in the creator dashboard Cash Out
 * modal alongside Transak SELL and Ramp Network as a third off-ramp
 * option.
 *
 * Flow per docs.cdp.coinbase.com/onramp/offramp:
 *   1. POST /api/offramp/session — server-side JWT + CDP call, NextAuth
 *      cookie required (creator-only, not fan-facing)
 *   2. Backend returns { sessionToken } from Coinbase
 *   3. Open https://pay.coinbase.com/v3/sell/input?sessionToken=… in a
 *      centred popup; Coinbase's UI reads the wallet's USDC balance and
 *      lets the creator pick an amount + destination bank
 *   4. Poll popup.closed; parent dashboard refetches earnings on close
 *
 * Session tokens are single-use, 5-minute expiry, fetched fresh per
 * click and never cached.
 */
export default function CoinbaseOfframpButton({
  walletAddress,
  fiatCurrency = 'GBP',
  onClosed,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Unmount cleanup — if the dashboard modal closes while the popup
  // poll is still running, stop the interval so it doesn't tick on a
  // disposed component. The popup itself stays open; the creator closes it.
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const openWidget = useCallback(async () => {
    if (busy) return;
    if (!walletAddress) {
      setError('Connect a wallet first.');
      return;
    }
    setError(null);
    setBusy(true);

    try {
      const res = await fetch('/api/offramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, fiatCurrency }),
      });
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg ?? `Session request failed (${res.status})`);
      }
      const { sessionToken } = (await res.json()) as { sessionToken?: string };
      if (!sessionToken) throw new Error('No session token returned by server.');

      // pay.coinbase.com/v3/sell/input is the off-ramp launch URL per
      // docs.cdp.coinbase.com/onramp/offramp/offramp-integration-guide.
      // partnerUserRef ties the session back to the wallet for our own
      // logs; redirectUrl is optional but nice-to-have when the popup
      // isn't blocked.
      const params = new URLSearchParams({
        sessionToken,
        partnerUserRef: walletAddress,
        redirectUrl: `${window.location.origin}/dashboard`,
      });
      const url = `https://pay.coinbase.com/v3/sell/input?${params.toString()}`;

      const w = 460, h = 720;
      const left = Math.max(0, (window.screen.width - w) / 2 + window.screenX);
      const top = Math.max(0, (window.screen.height - h) / 2 + window.screenY);
      const popup = window.open(
        url,
        'coinbase_offramp',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        // Popup blocker — fall back to same-tab so the flow can complete.
        window.location.href = url;
        return;
      }

      popupRef.current = popup;
      pollRef.current = setInterval(() => {
        if (popup.closed) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          popupRef.current = null;
          setBusy(false);
          onClosed?.();
        }
      }, 700);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Offramp failed to open';
      setError(message);
      setBusy(false);
    }
  }, [busy, walletAddress, fiatCurrency, onClosed]);

  return (
    <div>
      <button
        type="button"
        onClick={openWidget}
        disabled={busy || !walletAddress}
        aria-busy={busy}
        className="btn btn-primary"
        style={{ width: '100%', padding: '0.85rem', fontSize: '0.85rem' }}
      >
        {busy ? 'Opening Coinbase…' : '🅲 Cash out via Coinbase — USDC → GBP'}
      </button>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: '#f87171',
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
