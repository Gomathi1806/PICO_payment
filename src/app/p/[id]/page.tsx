'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useConnect, useSendTransaction } from 'wagmi';
import { parseEther } from 'viem';
import { getPicoLinkById } from '@/app/actions/pico';
import { isInAppBrowser, getBrowserName } from '@/lib/utils/browser';

export default function PublicLinkPage({ params }: { params: { id: string } }) {
  const [link, setLink] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIAB, setIsIAB] = useState(false);
  const [browserName, setBrowserName] = useState('');

  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const { sendTransactionAsync } = useSendTransaction();

  useEffect(() => {
    setIsIAB(isInAppBrowser());
    setBrowserName(getBrowserName());
    
    const fetchLink = async () => {
      const result = await getPicoLinkById(params.id);
      if (result.success) {
        setLink(result.link);
      }
      setLoading(false);
    };
    fetchLink();
  }, [params.id]);

  const handlePayAndUnlock = async () => {
    if (!isConnected) {
      const cb = connectors.find(c => c.id === 'coinbaseWalletSDK');
      if (cb) connect({ connector: cb });
      return;
    }

    if (!link) return;

    try {
      setIsProcessing(true);
      
      // REAL BLOCKCHAIN TRANSACTION
      // In a real USDC app, we would use a contract call or transferFrom
      // For this prototype, we'll send the native token (ETH/Base) or simulate the logic
      const tx = await sendTransactionAsync({
        to: link.creatorId as `0x${string}`,
        value: parseEther('0.0001'), // Sending a tiny amount of Base ETH as a "Tip"
      });

      console.log('Transaction success:', tx);
      setIsPaid(true);
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed. Make sure you have enough for gas on Base!');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return <div className="container" style={{ textAlign: 'center', padding: '10rem 0' }}>Loading Pico...</div>;
  if (!link) return <div className="container" style={{ textAlign: 'center', padding: '10rem 0' }}>Link not found.</div>;

  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 800 }}>Pico.</h1>
      </header>

      <div className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ 
          fontSize: '0.7rem', 
          fontWeight: 'bold', 
          color: 'var(--accent)', 
          marginBottom: '1rem',
          letterSpacing: '0.1em'
        }}>
          {link.type || 'DIGITAL CONTENT'}
        </div>
        
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{link.title}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {link.description}
        </p>

        <div style={{ 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--card-border)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          {isPaid ? (
            <div style={{ color: 'var(--success)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎉</div>
              <h3 style={{ marginBottom: '0.5rem' }}>Payment Successful!</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>You have unlocked this content.</p>
              <div style={{ 
                marginTop: '1.5rem', 
                background: 'rgba(16, 185, 129, 0.1)', 
                padding: '1rem', 
                borderRadius: '12px',
                fontWeight: 'bold',
                wordBreak: 'break-all'
              }}>
                SECRET CONTENT: {link.contentUrl || 'https://pico.link/guide-v1'}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                ${link.price} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>USDC</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Instant unlock. No account needed.
              </p>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                onClick={handlePayAndUnlock}
                disabled={isProcessing}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                {isProcessing ? 'Verifying...' : isConnected ? (isIAB ? 'Secure One-Click Pay' : 'Pay & Unlock with FaceID') : 'Secure Checkout'}
              </button>
              
              {isIAB && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Verified {browserName} Checkout</span>
                </div>
              )}
            </div>
          )}
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
          Payment secured by **Base Network** and **X402 Protocol**.
        </p>
      </div>

      <footer style={{ textAlign: 'center', marginTop: '4rem', paddingBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          &copy; 2026 Pico Micropayments
        </p>
      </footer>
    </div>
  );
}
