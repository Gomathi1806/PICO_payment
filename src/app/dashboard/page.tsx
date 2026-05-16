'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { getPicoLinks } from '@/app/actions/pico';

export default function CreatorDashboard() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    if (isConnected && address) {
      const fetchLinks = async () => {
        setLoading(true);
        const result = await getPicoLinks(address);
        if (result.success) {
          setItems(result.links || []);
        }
        setLoading(false);
      };
      fetchLinks();
    } else {
      setLoading(false);
    }
  }, [isConnected, address]);

  const handleConnect = () => {
    const coinbaseConnector = connectors.find((c) => c.id === 'coinbaseWalletSDK');
    if (coinbaseConnector) {
      connect({ connector: coinbaseConnector });
    }
  };

  const handleCopy = (id: string) => {
    const url = `${window.location.origin}/p/${id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const handleCashOut = () => {
    alert('Initiating Coinbase Off-ramp... Select your linked bank account to receive USDC as Fiat.');
  };

  return (
    <div className="animate-fade">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Pico Dashboard</h1>
        
        {isConnected ? (
          <div 
            onClick={() => disconnect()}
            className="glass" 
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: '100px', 
              fontSize: '0.7rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              cursor: 'pointer'
            }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </div>
        ) : (
          <button 
            onClick={handleConnect}
            className="btn btn-primary" 
            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '100px' }}
          >
            Connect Wallet
          </button>
        )}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Total Earnings</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>0.00 <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>USDC</span></div>
        </div>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Active Links</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{items.length}</div>
        </div>
      </div>

      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Your Pico Links</h2>
          <Link href="/dashboard/new" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px', textDecoration: 'none' }}>
            + Create New
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem' }}>Loading from Neon...</p>
          ) : items.length > 0 ? (
            items.map((item) => (
              <div key={item.id} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '1rem', 
                background: 'rgba(255,255,255,0.02)', 
                borderRadius: '12px',
                border: '1px solid var(--card-border)'
              }}>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{item.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>${item.price} &bull; 0 sales</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem' }}
                    onClick={() => handleCopy(item.id)}
                  >
                    Copy Link
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem' }}>Edit</button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>You haven't created any Pico links yet.</p>
              <Link href="/dashboard/new" className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>Create your first link</Link>
            </div>
          )}
        </div>
      </div>

      <footer style={{ marginTop: '3rem', paddingBottom: '3rem' }}>
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Earnings are instantly settled on Base. You can cash out to your bank via Coinbase anytime.
          </p>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%' }}
            onClick={handleCashOut}
          >
            Cash Out to Bank
          </button>
        </div>
      </footer>
    </div>
  );
}
