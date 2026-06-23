'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useConnect, useAccount } from 'wagmi';
import { getPicoLinks, getCreatorEarnings } from '@/app/actions/pico';
import { getUserById, updateWalletAddress } from '@/app/actions/auth';
import { PicoLink } from '@/db/schema';

export default function CreatorDashboard() {
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState('0.00');
  const [totalSales, setTotalSales] = useState(0);

  const [isCashOutOpen, setIsCashOutOpen] = useState(false);
  const [cashOutStep, setCashOutStep] = useState(1);
  const [cashOutAmount, setCashOutAmount] = useState('10.00');
  const [selectedBank, setSelectedBank] = useState('Chase Checking (*8821)');

  const userId = session?.user?.id;
  const handle = session?.user?.name;

  // Fetch user data, links, and earnings
  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);

      // Fetch user to get wallet address
      const userResult = await getUserById(userId);
      if (userResult.success && userResult.user) {
        setWalletAddress(userResult.user.walletAddress);
      }

      // Fetch links
      const linksResult = await getPicoLinks(userId);
      if (linksResult.success) {
        setItems(linksResult.links || []);
      }

      // Fetch earnings
      const earningsResult = await getCreatorEarnings(userId);
      if (earningsResult.success) {
        setTotalEarnings(earningsResult.totalEarnings);
        setTotalSales(earningsResult.totalSales);
      }

      setLoading(false);
    };
    fetchData();
  }, [userId]);

  // When wallet connects, save the address
  useEffect(() => {
    if (isConnected && address && userId && isConnectingWallet) {
      const saveWallet = async () => {
        await updateWalletAddress(userId, address);
        setWalletAddress(address);
        setIsConnectingWallet(false);
      };
      saveWallet();
    }
  }, [isConnected, address, userId, isConnectingWallet]);

  const handleConnectWallet = async () => {
    const cbConnector = connectors.find(
      (c) => c.id === 'coinbaseWallet' || c.id === 'coinbaseWalletSDK'
    );

    if (!cbConnector) {
      alert('Coinbase Smart Wallet is required.');
      return;
    }

    setIsConnectingWallet(true);
    try {
      await connect({ connector: cbConnector });
    } catch {
      setIsConnectingWallet(false);
    }
  };

  const handleCopy = (id: string) => {
    const url = `${window.location.origin}/p/${id}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="animate-fade" style={{ textAlign: 'center', padding: '10rem 0' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="animate-fade">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>

        <div
          onClick={handleLogout}
          className="glass"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '100px',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
          title="Click to log out"
        >
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
          @{handle}
        </div>
      </nav>

      {/* Wallet Connection Banner */}
      {!walletAddress && (
        <div className="glass" style={{
          padding: '1.25rem',
          marginBottom: '1.5rem',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🔗</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Connect Your Wallet</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Required to receive payments from fans
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: '0.85rem', padding: '0.7rem' }}
            onClick={handleConnectWallet}
            disabled={isConnectingWallet}
          >
            {isConnectingWallet ? 'Connecting...' : 'Connect Coinbase Smart Wallet'}
          </button>
        </div>
      )}

      {/* Connected Wallet Badge */}
      {walletAddress && (
        <div className="glass" style={{
          padding: '0.75rem 1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.75rem',
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }}></div>
          <span style={{ color: 'var(--text-muted)' }}>Wallet:</span>
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Total Earnings</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalEarnings} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>USDC</span></div>
        </div>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>Total Sales</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{totalSales}</div>
        </div>
      </div>

      {/* Links Table */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Your Pico Links</h2>
          <Link href="/dashboard/new" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px', textDecoration: 'none' }}>
            + Create New
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {items.length > 0 ? (
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
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>${item.price}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem' }}
                    onClick={() => handleCopy(item.id)}
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>You haven&apos;t created any Pico links yet.</p>
              <Link href="/dashboard/new" className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>Create your first link</Link>
            </div>
          )}
        </div>
      </div>

      {/* Cash Out Footer */}
      <footer style={{ marginTop: '3rem', paddingBottom: '3rem' }}>
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Earnings are instantly settled on Base. Cash out to your bank via Coinbase anytime.
          </p>
          <button
            className="btn btn-secondary"
            style={{ width: '100%' }}
            onClick={() => setIsCashOutOpen(true)}
          >
            Cash Out to Bank
          </button>
        </div>
      </footer>

      {/* Cash Out Modal */}
      {isCashOutOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1.5rem',
        }}>
          <div className="glass animate-fade" style={{
            maxWidth: '400px', width: '100%', padding: '2rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 10px 30px rgba(59, 130, 246, 0.1)', background: 'rgba(10, 10, 12, 0.95)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🔵</span>
                <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#3b82f6' }}>Coinbase Pay Off-ramp</span>
              </div>
              <button onClick={() => { setIsCashOutOpen(false); setCashOutStep(1); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>
                &times;
              </button>
            </div>

            {cashOutStep === 1 && (
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Cash out your accrued USDC balance directly to your bank account as USD.
                </p>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>AMOUNT TO CASH OUT (USDC)</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" value={cashOutAmount} onChange={(e) => setCashOutAmount(e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', padding: '1rem 1rem 1rem 2.5rem', borderRadius: '12px', color: 'white', fontSize: '1rem', outline: 'none' }} />
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
                  </div>
                </div>
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>DESTINATION BANK ACCOUNT</label>
                  <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', padding: '1rem', borderRadius: '12px', color: 'white', fontSize: '0.9rem', outline: 'none', cursor: 'pointer' }}>
                    <option value="Chase Checking (*8821)" style={{ background: '#0a0a0c' }}>Chase Checking (*8821)</option>
                    <option value="Wells Fargo Savings (*4412)" style={{ background: '#0a0a0c' }}>Wells Fargo Savings (*4412)</option>
                    <option value="Bank of America (*9930)" style={{ background: '#0a0a0c' }}>Bank of America (*9930)</option>
                  </select>
                </div>
                <button onClick={() => setCashOutStep(2)} className="btn btn-primary" style={{ width: '100%' }}>Review Cash Out</button>
              </div>
            )}

            {cashOutStep === 2 && (
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', textAlign: 'center' }}>Confirm Transfer</h3>
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)', borderRadius: '16px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Selling</span><span>{cashOutAmount} USDC</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Receiving</span><span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${cashOutAmount} USD</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Destination</span><span>{selectedBank}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Transfer Fee</span><span style={{ color: 'var(--success)' }}>$0.00 (Sponsored)</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Speed</span><span>Instant ACH</span></div>
                </div>
                <button onClick={() => { setCashOutStep(3); setTimeout(() => setCashOutStep(4), 2000); }} className="btn btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>Confirm &amp; Transfer</button>
                <button onClick={() => setCashOutStep(1)} className="btn btn-secondary" style={{ width: '100%' }}>Back</button>
              </div>
            )}

            {cashOutStep === 3 && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(59, 130, 246, 0.2)', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }}></div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Processing Off-ramp...</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Routing via Instant ACH.</p>
              </div>
            )}

            {cashOutStep === 4 && (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 1.2rem' }}>✓</div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--success)' }}>Transfer Successful!</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  ${cashOutAmount} USD has been sent to your {selectedBank.split(' ')[0]} bank account.
                </p>
                <button onClick={() => { setIsCashOutOpen(false); setCashOutStep(1); }} className="btn btn-primary" style={{ width: '100%' }}>Back to Dashboard</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
