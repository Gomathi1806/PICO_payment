import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';
import { getPlatformStats, getPlatformRecentPayments } from '@/app/actions/admin';
import LegalFooter from '@/components/LegalFooter';

/**
 * /admin — platform overview for internal Pico staff.
 *
 * Server component because it gates on the session + ADMIN_EMAILS
 * allowlist before any data is fetched. Anyone whose role isn't admin
 * (or whose email isn't on the env allowlist) gets bounced to /login.
 *
 * The stats here are real — pulled from the live DB via server
 * actions in src/app/actions/admin.ts, themselves re-gated for
 * defence in depth so a leaked client-side state can't bypass the
 * server check.
 */
export default async function AdminDashboard() {
  const session = await auth();
  const allowed = await isAdmin(session?.user?.id, session?.user?.email ?? undefined);
  if (!allowed) {
    redirect('/login?reason=admin-required');
  }

  const [statsRes, recentRes] = await Promise.all([
    getPlatformStats(),
    getPlatformRecentPayments(25),
  ]);

  const stats = statsRes.success ? statsRes.stats : null;
  const recent = recentRes.success ? recentRes.payments : [];
  const gross = Number(stats?.grossVolume ?? '0.00');
  const piclFee = gross * 0.05;

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
            background: 'rgba(239,68,68,0.12)',
            color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '100px',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>Platform Admin</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {session?.user?.email}
        </span>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Platform overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
          Real-time stats across all Pico users. Read-only for now — moderation tools and AML alerts in Q3.
        </p>
      </header>

      {/* Platform stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Stat label="Total users" value={(stats?.totalUsers ?? 0).toString()} sub={`${stats?.usersByRole.creator ?? 0} creators · ${stats?.usersByRole.publisher ?? 0} publishers`} />
        <Stat label="Developer / agent users" value={(stats?.usersByRole.agent ?? 0).toString()} sub="x402 API consumers" />
        <Stat label="Paywalled links" value={(stats?.totalLinks ?? 0).toString()} sub={`${stats?.totalPayments ?? 0} unlocks`} />
        <Stat label="Gross volume" value={`$${gross.toFixed(2)}`} sub="all-time USDC paid" tone="ok" />
        <Stat label="Pico treasury (est)" value={`$${piclFee.toFixed(2)}`} sub="@ 5% effective fee" tone="warn" />
      </section>

      {/* Recent payments — the platform-wide activity feed */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Recent payments — all users</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>last {recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1.5rem 0' }}>
            No payments recorded yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>When</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Creator</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Article</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.4rem' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Payer</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '0.65rem 0.4rem', color: 'var(--text-muted)' }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem' }}>@{p.creatorHandle}</td>
                    <td style={{ padding: '0.65rem 0.4rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>
                      ${Number(p.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {p.payerAddress.slice(0, 6)}…{p.payerAddress.slice(-4)}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                      <a
                        href={`https://basescan.org/tx/${p.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'none' }}
                      >
                        {p.txHash.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Operational reminders */}
      <section className="glass" style={{
        padding: '1.25rem 1.5rem',
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        marginBottom: '2rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>Operational reminders</h3>
        <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: '1.2rem', margin: 0 }}>
          <li>Treasury balance is on-chain — check the wallet address you set as <code>NEXT_PUBLIC_PICO_TREASURY_ADDRESS</code> on BaseScan.</li>
          <li>Sweep treasury to Coinbase Business at least monthly; convert to GBP and move to Revolut Business.</li>
          <li>Sanctions screening is currently manual — review the payer addresses in this list against the UK HMT sanctions list.</li>
          <li>Roadmap: user suspension, manual link takedown, AML alerts, treasury balance snapshot — all Q3.</li>
        </ul>
      </section>

      <LegalFooter variant="compact" />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? '#fbbf24' : 'white';
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
