'use client';

import React, { useState } from 'react';
import { adminCreateResetLink } from '@/app/actions/password-reset';

/**
 * Admin rescue hatch for locked-out users: look up an account by email
 * and mint a one-time reset link to send them over any channel (DM,
 * WhatsApp, email). Link expires in 1 hour, single use.
 */
export default function AdminPasswordReset() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLink(null);
    setBusy(true);
    try {
      const result = await adminCreateResetLink(email);
      if (result.success && result.path) {
        setLink(`${window.location.origin}${result.path}`);
        setHandle(result.handle ?? null);
      } else {
        setError(result.error || 'Something went wrong.');
      }
    } catch {
      setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <form onSubmit={handleGenerate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            flex: '1 1 220px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--card-border)',
            padding: '0.65rem 0.85rem',
            borderRadius: '10px',
            color: 'white',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={busy || !email.trim()}
          style={{ padding: '0.65rem 1rem', fontSize: '0.8rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
        >
          {busy ? 'Generating…' : '🔑 Generate reset link'}
        </button>
      </form>

      {error && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#f87171',
        }}>
          ⚠️ {error}
        </div>
      )}

      {link && (
        <div style={{
          marginTop: '0.6rem',
          padding: '0.75rem',
          background: 'rgba(16,185,129,0.05)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: '10px',
        }}>
          <div style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
            ✅ One-time reset link for <b>@{handle}</b> — valid 1 hour. Send it to them directly:
          </div>
          <div style={{
            fontSize: '0.7rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--text-muted)',
            wordBreak: 'break-all',
            marginBottom: '0.5rem',
          }}>
            {link}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCopy}
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.72rem', borderRadius: '8px' }}
          >
            {copied ? '✓ Copied' : '📋 Copy link'}
          </button>
        </div>
      )}
    </div>
  );
}
