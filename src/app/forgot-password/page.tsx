'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import LegalFooter from '@/components/LegalFooter';
import { requestPasswordReset } from '@/app/actions/password-reset';

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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setSent(true);
        setEmailConfigured(result.emailConfigured);
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
          Forgot your password?
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
      </div>

      <div className="glass" style={{ padding: '2.5rem' }}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📬</div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '0.75rem' }}>
              If an account exists for <b>{email}</b>, a reset link is on its way.
              It works once and expires in 1 hour.
            </p>
            {!emailConfigured && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                Email delivery isn&apos;t fully set up yet — if nothing arrives in a few
                minutes, contact us and we&apos;ll reset it for you manually.
              </p>
            )}
            <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem' }}>
              ← Back to sign in
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
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
                  EMAIL
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>

              <button
                className="btn btn-primary"
                type="submit"
                disabled={loading || !email.trim()}
                style={{ width: '100%', fontSize: '1rem', padding: '1rem' }}
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Remembered it?{' '}
              <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>

      <LegalFooter variant="compact" />
    </div>
  );
}
