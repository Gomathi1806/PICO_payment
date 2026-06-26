'use client';

import React, { useEffect, useRef, useCallback } from 'react';

type Mode = 'BUY' | 'SELL';

interface Props {
  mode: Mode;
  walletAddress?: string;
  fiatCurrency?: string;
  defaultAmount?: string;
  onClose?: () => void;
  onOrderSuccess?: (orderId: string) => void;
}

const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY ?? '';

// Staging vs production widget URLs.
// The JS SDK embeds these as iframes, but Transak's servers block iframe
// embedding with X-Frame-Options. We open a centred popup instead —
// same UX, no CORS/frame issues.
const WIDGET_BASE =
  process.env.NEXT_PUBLIC_TRANSAK_ENV === 'PRODUCTION'
    ? 'https://global.transak.com'
    : 'https://global-stg.transak.com';

function buildWidgetUrl(
  mode: Mode,
  walletAddress: string | undefined,
  fiatCurrency: string,
  defaultAmount?: string,
): string {
  const params = new URLSearchParams({
    apiKey: TRANSAK_API_KEY,
    productsAvailed: mode,
    cryptoCurrencyCode: 'USDC',
    network: 'base',
    fiatCurrency,
    hideMenu: 'true',
    themeColor: '3b82f6',
  });

  if (walletAddress) {
    params.set('walletAddress', walletAddress);
    params.set('disableWalletAddressEdit', 'true');
  }

  if (defaultAmount) {
    if (mode === 'SELL') {
      params.set('cryptoAmount', defaultAmount);
    } else {
      params.set('defaultFiatAmount', defaultAmount);
    }
  }

  return `${WIDGET_BASE}?${params.toString()}`;
}

function openPopup(url: string): Window | null {
  const w = 450;
  const h = 700;
  const left = Math.max(0, (window.screen.width - w) / 2 + window.screenX);
  const top = Math.max(0, (window.screen.height - h) / 2 + window.screenY);
  return window.open(
    url,
    'transak_widget',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
  );
}

export default function TransakWidget({
  mode,
  walletAddress,
  fiatCurrency = 'GBP',
  defaultAmount,
  onClose,
  onOrderSuccess,
}: Props) {
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  useEffect(() => {
    if (!TRANSAK_API_KEY) return;

    const url = buildWidgetUrl(mode, walletAddress, fiatCurrency, defaultAmount);
    const popup = openPopup(url);
    popupRef.current = popup;

    if (!popup) {
      // Popup blocked — fall back to new tab
      window.open(url, '_blank');
      onClose?.();
      return;
    }

    // Listen for postMessage events from the Transak popup
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('transak.com')) return;
      const { event_id, data } = (event.data ?? {}) as { event_id?: string; data?: { status?: { id?: string } } };
      if (event_id === 'TRANSAK_ORDER_SUCCESSFUL') {
        onOrderSuccess?.(data?.status?.id ?? '');
        cleanup();
        onClose?.();
      }
      if (event_id === 'TRANSAK_WIDGET_CLOSE') {
        cleanup();
        onClose?.();
      }
    };
    window.addEventListener('message', handleMessage);

    // Poll every second — if user closes the popup manually, fire onClose
    pollRef.current = setInterval(() => {
      if (popupRef.current?.closed) {
        cleanup();
        onClose?.();
      }
    }, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, walletAddress, fiatCurrency, defaultAmount]);

  if (!TRANSAK_API_KEY) {
    return (
      <div style={{
        padding: '1.5rem',
        background: 'rgba(245,158,11,0.08)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: '12px',
        fontSize: '0.82rem',
        color: '#fbbf24',
        textAlign: 'center',
      }}>
        ⚠️ Transak API key not configured.{' '}
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
          Add <code>NEXT_PUBLIC_TRANSAK_API_KEY</code> to your environment variables.
        </span>
      </div>
    );
  }

  // The widget opens in a popup — show a status card in the page
  return (
    <div style={{
      padding: '1.5rem',
      background: 'rgba(59,130,246,0.06)',
      border: '1px solid rgba(59,130,246,0.25)',
      borderRadius: '12px',
      textAlign: 'center',
      fontSize: '0.85rem',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem' }}>
        {mode === 'SELL' ? '🏦' : '💳'}
      </div>
      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
        {mode === 'SELL' ? 'Transak cash-out window opened' : 'Transak buy window opened'}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
        Complete your {mode === 'SELL' ? 'withdrawal' : 'purchase'} in the Transak window.
        <br />If it didn&apos;t open, check your popup blocker.
      </div>
      <button
        type="button"
        onClick={() => {
          const url = buildWidgetUrl(mode, walletAddress, fiatCurrency, defaultAmount);
          const popup = openPopup(url);
          if (!popup) window.open(url, '_blank');
          else popupRef.current = popup;
        }}
        className="btn btn-secondary"
        style={{ marginTop: '0.85rem', fontSize: '0.78rem', padding: '0.45rem 1rem' }}
      >
        Reopen window
      </button>
    </div>
  );
}
