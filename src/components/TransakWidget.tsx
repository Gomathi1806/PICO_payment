'use client';

import React, { useEffect, useRef } from 'react';

type Mode = 'BUY' | 'SELL';

interface Props {
  mode: Mode;
  walletAddress?: string;
  fiatCurrency?: string;
  /** USDC amount to pre-fill (off-ramp: crypto amount; on-ramp: fiat amount) */
  defaultAmount?: string;
  onClose?: () => void;
  onOrderSuccess?: (orderId: string) => void;
}

const TRANSAK_API_KEY = process.env.NEXT_PUBLIC_TRANSAK_API_KEY ?? '';

// Staging URL for testing with a dev API key.
// Swap to https://global.transak.com when going production.
const WIDGET_BASE =
  process.env.NEXT_PUBLIC_TRANSAK_ENV === 'PRODUCTION'
    ? 'https://global.transak.com'
    : 'https://global-stg.transak.com';

function buildWidgetUrl(mode: Mode, walletAddress: string | undefined, fiatCurrency: string, defaultAmount?: string): string {
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

export default function TransakWidget({
  mode,
  walletAddress,
  fiatCurrency = 'GBP',
  defaultAmount,
  onClose,
  onOrderSuccess,
}: Props) {
  const transakRef = useRef<import('@transak/ui-js-sdk').Transak | null>(null);

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
        ⚠️ Transak API key not configured.<br />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
          Add <code>NEXT_PUBLIC_TRANSAK_API_KEY</code> to your environment variables.
        </span>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    let instance: import('@transak/ui-js-sdk').Transak | null = null;

    (async () => {
      const { Transak } = await import('@transak/ui-js-sdk');
      const widgetUrl = buildWidgetUrl(mode, walletAddress, fiatCurrency, defaultAmount);

      instance = new Transak({ widgetUrl, widgetWidth: '100%', widgetHeight: '570px' });
      transakRef.current = instance;

      Transak.on('TRANSAK_WIDGET_CLOSE', () => {
        onClose?.();
      });

      Transak.on('TRANSAK_ORDER_SUCCESSFUL', (data: unknown) => {
        const orderId = (data as { status?: { id?: string } })?.status?.id ?? '';
        onOrderSuccess?.(orderId);
      });

      instance.init();
    })();

    return () => {
      instance?.cleanup();
      transakRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, walletAddress, fiatCurrency, defaultAmount]);

  return (
    <div id="transakMount" style={{ borderRadius: '12px', overflow: 'hidden', minHeight: '570px' }} />
  );
}
