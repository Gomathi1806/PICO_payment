'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useConnect, useAccount } from 'wagmi';
import { getPicoLinks, getCreatorEarnings, getPerLinkStats, getRecentActivity, getUSDCtoGBP } from '@/app/actions/pico';
import RampOfframpButton from '@/components/RampOfframpButton';
import { calculateFeeBps } from '@/lib/constants';
import { getUserById, updateWalletAddress } from '@/app/actions/auth';
import { PicoLink } from '@/db/schema';

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

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
  const [perLinkStats, setPerLinkStats] = useState<Record<string, { sales: number; earned: string }>>({});
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [gbpRate, setGbpRate] = useState(0.78);

  const [isCashOutOpen, setIsCashOutOpen] = useState(false);

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

      // Fetch earnings, per-link stats, recent activity, GBP rate in parallel
      const [earningsResult, statsResult, activityResult, rateResult] = await Promise.all([
        getCreatorEarnings(userId),
        getPerLinkStats(userId),
        getRecentActivity(userId, 10),
        getUSDCtoGBP(),
      ]);

      if (earningsResult.success) {
        setTotalEarnings(earningsResult.totalEarnings);
        setTotalSales(earningsResult.totalSales);
      }
      if (statsResult.success) setPerLinkStats(statsResult.stats);
      if (activityResult.success) setRecentActivity(activityResult.activity);
      if (rateResult.success) setGbpRate(rateResult.rate);

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

      {/* Stats — top row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Net Earnings</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>
            ${(Number(totalEarnings) * 0.95).toFixed(2)}
            <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}> USDC</span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            ≈ £{(Number(totalEarnings) * 0.95 * gbpRate).toFixed(2)} GBP
          </div>
        </div>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Total Sales</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{totalSales}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {items.length} active link{items.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Earnings breakdown — gross / fee / net so creators see the real numbers */}
      {Number(totalEarnings) > 0 && (
        <div className="glass" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
            💰 Earnings Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Gross sales</span>
              <span>${Number(totalEarnings).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Pico fee (5%)</span>
              <span style={{ color: '#f87171' }}>−${(Number(totalEarnings) * 0.05).toFixed(3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Network gas (est.)</span>
              <span style={{ color: '#f87171' }}>−${(0.001 * totalSales).toFixed(3)}</span>
            </div>
            <div style={{ height: '1px', background: 'var(--card-border)', margin: '0.4rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Net to your wallet</span>
              <span style={{ color: 'var(--success)' }}>
                ${(Number(totalEarnings) * 0.95 - 0.001 * totalSales).toFixed(3)}
              </span>
            </div>
          </div>
        </div>
      )}

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
            items.map((item) => {
              const s = perLinkStats[item.id] || { sales: 0, earned: '0.00' };
              const feePct = Number(calculateFeeBps(Number(item.price))) / 100;
              return (
                <div key={item.id} style={{
                  padding: '1rem',
                  background: 'rgba(255,255,255,0.02)',
                  borderRadius: '12px',
                  border: '1px solid var(--card-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{item.title}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                        ${item.price} · {feePct}% fee
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.7rem', flexWrap: 'wrap' }}>
                        <span style={{ color: s.sales > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                          💰 {s.sales} sale{s.sales === 1 ? '' : 's'}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          📈 ${Number(s.earned).toFixed(2)} earned
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Link
                        href={`/dashboard/embed/${item.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem', textDecoration: 'none' }}
                        title="Get embed code for publisher integration"
                      >
                        📦 Embed
                      </Link>
                      <Link
                        href={`/dashboard/edit/${item.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem', textDecoration: 'none' }}
                      >
                        Edit
                      </Link>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.7rem' }}
                        onClick={() => handleCopy(item.id)}
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>You haven&apos;t created any Pico links yet.</p>
              <Link href="/dashboard/new" className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>Create your first link</Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <div className="glass" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {recentActivity.map((event) => {
              const when = event.createdAt ? new Date(event.createdAt) : null;
              const ago = when ? timeAgo(when) : '';
              const net = (Number(event.amount) * 0.95).toFixed(3);
              return (
                <div key={event.id} style={{
                  padding: '0.75rem',
                  background: 'rgba(16, 185, 129, 0.05)',
                  borderRadius: '10px',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      🟢 Sale ${Number(event.amount).toFixed(2)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {event.title}</span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Net ${net} → your wallet · {ago}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Cash Out Modal — three paths from fastest to most manual */}
      {isCashOutOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1.5rem',
          overflowY: 'auto',
        }}>
          <div className="glass animate-fade" style={{
            maxWidth: '500px', width: '100%', padding: '1.75rem',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            boxShadow: '0 10px 30px rgba(59, 130, 246, 0.1)', background: 'rgba(10, 10, 12, 0.96)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🏦</span>
                <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>Cash Out</span>
              </div>
              <button onClick={() => setIsCashOutOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Three ways to convert your USDC earnings to spendable money, ranked by speed.
            </p>

            {/* Option 1: Ramp Network 1-click (when approved) */}
            <div style={{
              padding: '1rem',
              border: '1px solid var(--card-border)',
              borderRadius: '12px',
              marginBottom: '0.85rem',
              background: 'rgba(59,130,246,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>🚀 Ramp — 1-click to UK bank</div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                  0.99% · ~1 hour
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem', lineHeight: 1.4 }}>
                Sell USDC straight to your UK bank via Faster Payments. KYC once, withdraw anytime after.
              </p>
              {walletAddress ? (
                <RampOfframpButton walletAddress={walletAddress} />
              ) : (
                <div style={{ fontSize: '0.75rem', color: '#f87171' }}>Connect a wallet first.</div>
              )}
            </div>

            {/* Option 2: Coinbase Card */}
            <div style={{
              padding: '1rem',
              border: '1px solid var(--card-border)',
              borderRadius: '12px',
              marginBottom: '0.85rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>💳 Coinbase Card — spend USDC directly</div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                  Instant · 2% spread
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.6rem', lineHeight: 1.4 }}>
                Free UK Visa card from Coinbase. Swipe anywhere Visa is accepted — your USDC auto-converts at checkout. No withdrawal needed.
              </p>
              <a
                href="https://www.coinbase.com/card"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.7rem', fontSize: '0.8rem', textDecoration: 'none' }}
              >
                Order Coinbase Card →
              </a>
            </div>

            {/* Option 3: Manual flow */}
            <details style={{
              padding: '0.85rem 1rem',
              border: '1px solid var(--card-border)',
              borderRadius: '12px',
              marginBottom: '1rem',
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', listStyle: 'none' }}>
                🐢 Manual flow (works today, no Ramp account needed)
              </summary>
              <ol style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.55, paddingLeft: '1.2rem', margin: '0.75rem 0' }}>
                <li>Open your Coinbase Wallet (same one connected to Pico)</li>
                <li>Send USDC to your Coinbase.com account (same email — instant, no fee)</li>
                <li>On Coinbase.com, sell USDC → GBP at spot</li>
                <li>Withdraw GBP via Faster Payments (free, ~30 min)</li>
              </ol>
              <a
                href="https://www.coinbase.com/price/usd-coin"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--accent)' }}
              >
                Open Coinbase →
              </a>
            </details>

            {walletAddress && (
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                padding: '0.6rem 0.75rem',
                marginBottom: '0.85rem',
                fontSize: '0.65rem',
                fontFamily: 'monospace',
                color: 'var(--text-muted)',
                wordBreak: 'break-all',
              }}>
                Your wallet: {walletAddress}
              </div>
            )}

            <button
              onClick={() => setIsCashOutOpen(false)}
              className="btn btn-secondary"
              style={{ width: '100%', fontSize: '0.8rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
