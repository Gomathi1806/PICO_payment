'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LegalFooter from '@/components/LegalFooter';
import { getPicoLinks, getCreatorEarnings, getPerLinkStats } from '@/app/actions/pico';
import { getUserById } from '@/app/actions/auth';

/**
 * /publisher — the B2B newsroom dashboard.
 *
 * Same backend as /dashboard for now (same picoLinks table, same
 * payments), but a deliberately different information architecture:
 * gross/net revenue front-and-centre for accounting, an article-list
 * view rather than a link-card view, and roadmap callouts for the
 * publisher-specific features that aren't built yet (team, accounting
 * export, white-label paywall, scheduled drops).
 *
 * Pages this dashboard would eventually grow:
 *   /publisher/team        — multi-author management
 *   /publisher/articles    — paywall management at article scale
 *   /publisher/finance     — VAT-aware monthly statements + CSV export
 *   /publisher/whitelabel  — paywall theming + custom domain
 */
export default function PublisherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<{ id: string; title: string; price: string; type: string | null }[]>([]);
  const [totalEarnings, setTotalEarnings] = useState('0.00');
  const [totalSales, setTotalSales] = useState(0);
  const [perLinkStats, setPerLinkStats] = useState<Record<string, { sales: number; earned: string }>>({});
  const [handle, setHandle] = useState<string | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const [user, linksResult, earningsResult, statsResult] = await Promise.all([
        getUserById(userId),
        getPicoLinks(userId),
        getCreatorEarnings(userId),
        getPerLinkStats(userId),
      ]);
      if (user.success && user.user) setHandle(user.user.handle);
      if (linksResult.success) setItems(linksResult.links || []);
      if (earningsResult.success) {
        setTotalEarnings(earningsResult.totalEarnings);
        setTotalSales(earningsResult.totalSales);
      }
      if (statsResult.success) setPerLinkStats(statsResult.stats);
      setLoading(false);
    })();
  }, [userId]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (status === 'loading' || loading) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading newsroom…</div>;
  }
  if (!userId) {
    router.replace('/login');
    return null;
  }

  const gross = Number(totalEarnings);
  const fee = gross * 0.05;
  const net = gross - fee;

  return (
    <div className="animate-fade">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
            Pico.
          </Link>
          <span style={{
            marginLeft: '0.75rem',
            padding: '0.2rem 0.55rem',
            background: 'rgba(99,102,241,0.12)',
            color: '#a5b4fc',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '100px',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>Publisher</span>
        </div>
        <div onClick={handleLogout} className="glass" style={{
          padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
        }} title="Click to log out">
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
          {handle ? `@${handle}` : 'Account'}
        </div>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Newsroom dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
          Manage paywalled articles, monitor revenue, and integrate the embed across your CMS.
        </p>
      </header>

      {/* Finance row — gross/fee/net, the numbers an editor or accountant would actually want */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Stat label="Gross revenue" value={`$${gross.toFixed(2)}`} sub="USDC, this period" />
        <Stat label="Pico fee" value={`−$${fee.toFixed(3)}`} sub="5% under $10 tier" tone="warn" />
        <Stat label="Net to wallet" value={`$${net.toFixed(2)}`} sub="paid instantly on Base" tone="ok" />
        <Stat label="Articles sold" value={totalSales.toString()} sub={`${items.length} live paywalls`} />
      </section>

      {/* Article list — B2B headline framing */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Paywalled articles</h2>
          <Link href="/dashboard/new" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px', textDecoration: 'none' }}>
            + New paywall
          </Link>
        </div>
        {items.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 1rem' }}>
            No paywalled articles yet.{' '}
            <Link href="/dashboard/new" style={{ color: 'var(--accent)' }}>Create your first one</Link>.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {items.map((item) => {
              const s = perLinkStats[item.id] || { sales: 0, earned: '0.00' };
              return (
                <div key={item.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--card-border)', borderRadius: '10px', gap: '1rem',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.title}</div>
                    <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      <span>${item.price}</span>
                      <span>{item.type || 'Article'}</span>
                      <span>{s.sales} sales · ${Number(s.earned).toFixed(2)} earned</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <Link href={`/dashboard/embed/${item.id}`} className="btn btn-secondary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.7rem', textDecoration: 'none' }}>
                      📦 Embed
                    </Link>
                    <Link href={`/dashboard/edit/${item.id}`} className="btn btn-secondary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.7rem', textDecoration: 'none' }}>
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Roadmap callouts — honest about what isn't built yet */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <RoadmapCard icon="👥" title="Team management" body="Invite editors and journalists. Per-author revenue splits." status="Q3" />
        <RoadmapCard icon="📊" title="Accounting export" body="VAT-aware monthly statements as CSV / Xero / QuickBooks." status="Q3" />
        <RoadmapCard icon="🎨" title="White-label paywall" body="Match your masthead — custom colours, typography, copy." status="Q4" />
        <RoadmapCard icon="📅" title="Scheduled drops" body="Publish + paywall articles ahead of time." status="Q4" />
      </section>

      <LegalFooter variant="compact" />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? '#f87171' : 'white';
  return (
    <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.35rem', color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function RoadmapCard({ icon, title, body, status }: { icon: string; title: string; body: string; status: string }) {
  return (
    <div className="glass" style={{ padding: '1.1rem 1.25rem', opacity: 0.85 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'rgba(59,130,246,0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', letterSpacing: '0.05em' }}>
          {status}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{body}</div>
    </div>
  );
}
