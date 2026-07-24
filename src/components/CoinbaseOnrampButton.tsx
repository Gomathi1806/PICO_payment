'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  linkId: string;
  walletAddress?: string;
  fiatAmount?: number;      // default 5 (matches server-side default)
  fiatCurrency?: 'GBP' | 'USD' | 'EUR';
  onClosed?: () => void;    // fires when the popup closes (paid or abandoned)
}

/**
 * Coinbase Onramp launcher — sits alongside TransakWidget as a second
 * fiat funding option on the fan payment page.
 *
 * Flow, per docs.cdp.coinbase.com/onramp/introduction/quickstart:
 *   1. POST to our backend /api/onramp/session (the endpoint that
 *      auth-gates and signs a CDP JWT server-side — the fan never
 *      sees a key)
 *   2. Backend returns { sessionToken } from Coinbase
 *   3. Open https://pay.coinbase.com/buy/select-asset?sessionToken=…
 *      in a popup so the fan doesn't leave the article
 *   4. Poll for popup close; the payment page's balance refetch handles
 *      the "unlock" side once USDC lands
 *
 * Session tokens are single-use and expire in 5 minutes, so we fetch a
 * fresh one every click and never cache it.
 */
export default function CoinbaseOnrampButton({
  linkId,
  walletAddress,
  fiatAmount = 5,
  fiatCurrency = 'GBP',
  onClosed,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);

  // Unmount cleanup — if the parent hides this button while the popup
  // poll is still running, clear the interval so it doesn't tick on a
  // disposed component. Popup itself stays open; user closes it.
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
      // 1. Mint session token via our backend (server-side JWT + CDP call)
      const res = await fetch('/api/onramp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkId, walletAddress, fiatAmount, fiatCurrency }),
      });
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg ?? `Session request failed (${res.status})`);
      }
      const { sessionToken } = (await res.json()) as { sessionToken?: string };
      if (!sessionToken) throw new Error('No session token returned by server.');

      // 2. Open Coinbase Onramp in a popup. Full-page redirect is the
      //    documented default but a popup keeps the fan on the article
      //    they were trying to unlock. Coinbase's page handles the
      //    payment session internally; on close we let the parent
      //    payment page refetch balance to detect settlement.
      const url = `https://pay.coinbase.com/buy/select-asset?sessionToken=${encodeURIComponent(sessionToken)}`;

      const w = 460, h = 720;
      const left = Math.max(0, (window.screen.width - w) / 2 + window.screenX);
      const top = Math.max(0, (window.screen.height - h) / 2 + window.screenY);
      const popup = window.open(
        url,
        'coinbase_onramp',
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        // Popup blocked — fall back to same-tab so the flow can still complete
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
      const message = e instanceof Error ? e.message : 'Onramp failed to open';
      setError(message);
      setBusy(false);
    }
  }, [busy, walletAddress, linkId, fiatAmount, fiatCurrency, onClosed]);

  return (
    <div>
      <button
        type="button"
        onClick={openWidget}
        disabled={busy || !walletAddress}
        className="btn btn-primary"
        style={{ width: '100%', padding: '0.85rem', fontSize: '0.85rem' }}
      >
        {busy ? 'Opening Coinbase…' : '🅲 Pay with Coinbase — Apple Pay / Card'}
      </button>
      {error && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#f87171',
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
