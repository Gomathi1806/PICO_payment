import React from 'react';

/**
 * Trust markers for the surfaces where someone is deciding whether to
 * part with money — the fan payment page and the creator dashboard.
 *
 * Wording note: we are an approved Coinbase Onramp & Offramp customer,
 * which is product access, not a partnership or an endorsement. So the
 * copy says what Coinbase actually does here ("powered by") and never
 * implies Coinbase vouches for Pico. No Coinbase wordmark or logo is
 * used as a seal for the same reason.
 *
 * The x402-list mark is the STATIC badge (public/x402-listed-badge.svg),
 * not the live-data one used on the marketing pages. On a payment page a
 * hotlinked third-party image is a request we don't control sitting in
 * front of a payment; self-hosting removes it. The link still points at
 * the live listing, where the real uptime numbers are published.
 */

const LISTING_URL =
  'https://x402-list.com/services/pico?utm_source=badge&utm_medium=referral&utm_campaign=embed';

const line: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  textAlign: 'center',
};

export default function TrustStrip({
  variant,
  children,
}: {
  variant: 'fan' | 'creator';
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {variant === 'fan' && (
        <>
          <div style={line}>⚡ Powered by Coinbase Smart Wallet — no seed phrase, no MetaMask</div>
          <div style={line}>🔐 Authenticate with FaceID or fingerprint</div>
          <div style={line}>💳 Card &amp; Apple Pay powered by Coinbase Onramp</div>
        </>
      )}

      {variant === 'creator' && (
        <>
          <div style={line}>🏦 Cash out to your bank via Coinbase Offramp</div>
          <div style={line}>⚡ Paid in USDC on Base — settled onchain, no invoicing</div>
        </>
      )}

      {children}

      <a
        href={LISTING_URL}
        target="_blank"
        rel="noopener"
        style={{ display: 'inline-block', marginTop: '0.35rem', alignSelf: 'center' }}
        title="Independently monitored in the x402 directory"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/x402-listed-badge.svg"
          alt="Listed on x402-list — independently monitored x402 service"
          width={152}
          height={28}
          style={{ height: '28px', width: 'auto', verticalAlign: 'middle', opacity: 0.85 }}
        />
      </a>
    </div>
  );
}
