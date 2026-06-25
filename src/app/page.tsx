import React from 'react';
import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginTop: '4rem' }}>
        <div style={{ 
          display: 'inline-block', 
          padding: '4px 12px', 
          background: 'rgba(59, 130, 246, 0.1)', 
          borderRadius: '100px', 
          color: 'var(--accent)',
          fontSize: '0.8rem',
          fontWeight: '600',
          marginBottom: '1rem'
        }}>
          PREVIEW RELEASE
        </div>
        <h1 className="text-gradient" style={{ fontSize: '3.5rem', lineHeight: '1.1', fontWeight: 800 }}>
          Pico.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '1rem', maxWidth: '320px', margin: '1rem auto' }}>
          Sell small wins for small prices. The Link-in-Bio tool for creators.
        </p>
        <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Link href="/signup" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Claim your handle
          </Link>
          <Link href="/creator/alex_ai_art" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            See a demo
          </Link>
        </div>
      </header>

      <section style={{ marginTop: '6rem' }}>
        <div className="glass" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Why Pico?</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>01. No &ldquo;Platform Tax&rdquo;</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Keep 98% of your revenue. No 30% Apple tax. No high Stripe fixed fees.
              </p>
            </div>
            
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>02. X402 Powered</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                The web&rsquo;s native payment protocol. Instant unlocks, near-zero gas on Base.
              </p>
            </div>
            
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>03. FaceID Checkout</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Fans pay in seconds with their thumbprint. No crypto knowledge required.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer style={{
        marginTop: '6rem',
        paddingTop: '2rem',
        paddingBottom: '4rem',
        borderTop: '1px solid var(--card-border)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        maxWidth: '640px',
        marginInline: 'auto',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          Built on <a href="https://www.x402.org" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>x402</a> · Settled on Base L2 · Coinbase Smart Wallet
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', margin: 0, lineHeight: 1.55 }}>
          © 2026 Pico Payments Ltd · Pico is a non-custodial software platform. Cryptoasset purchases are facilitated by Transak Pty Ltd (FCA #928910) and Ramp Network Limited (FCA #920097). Cryptoassets are high-risk, unregulated investments — you may lose all the money you invest.
        </p>
      </footer>
    </div>
  );
}
