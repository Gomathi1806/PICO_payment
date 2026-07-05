'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LegalFooter from '@/components/LegalFooter';
import { resetPassword } from '@/app/actions/password-reset';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--card-border)',
  padding: '1rem',
  borderRadius: '12px',
  color: 'white',
  fontSize: '1rem',
  outline: 'none',
};

export default function ResetPasswordPage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = use(props.searchParams);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword({ token, password });
      if (result.success) {
        setDone(true);
        setTimeout(() => router.push('/login'), 2500);
      } else {
        setError(result.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center', paddingBottom: '4rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>
      </nav>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', lineHeight: '1.1', fontWeight: 800 }}>
          Choose a new password
        </h1>
      </div>

      <div className="glass" style={{ padding: '2.5rem' }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✅</div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              Password updated. Taking you to sign in…
            </p>
            <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
              Sign in now →
            </Link>
          </div>
        ) : !token ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1rem', color: 'var(--text-muted)' }}>
              This page needs the reset link from your email — the link contains a
              one-time code. If yours expired, request a fresh one.
            </p>
            <Link href="/forgot-password" className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
              Request a new reset link
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                color: '#f87171',
                fontSize: '0.85rem',
                textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
                  NEW PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  required
                  style={inputStyle}
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading || !password || !confirm}
                style={{ width: '100%', fontSize: '1rem', padding: '1rem' }}
              >
                {loading ? 'Updating...' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>

      <LegalFooter variant="compact" />
    </div>
  );
}
