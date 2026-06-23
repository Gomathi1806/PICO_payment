'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { createPicoLink } from '@/app/actions/pico';

export default function CreateNewLink() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('0.50');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const userId = session?.user?.id;
  const handle = session?.user?.name;

  const handleSubmit = async () => {
    if (!userId) {
      router.replace('/login');
      return;
    }

    if (!title || !price) {
      alert('Please fill in the title and price.');
      return;
    }

    setIsSaving(true);
    const result = await createPicoLink({
      title,
      description,
      price,
      creatorId: userId,
    });

    if (result.success) {
      router.push('/dashboard');
    } else {
      alert(result.error || 'Something went wrong.');
      setIsSaving(false);
    }
  };

  if (status === 'loading') {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading...</div>;
  }

  return (
    <div className="animate-fade">
      <header style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Create New Pico Link</h1>
      </header>

      <div style={{ display: 'grid', gap: '2rem' }}>
        {/* Form Section */}
        <div className="glass" style={{ padding: '1.5rem' }}>

          {/* Creator tag */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '100px', padding: '0.3rem 0.75rem', fontSize: '0.75rem',
            color: 'var(--accent)', marginBottom: '1.5rem'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }}></div>
            @{handle}
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>PRODUCT TITLE</label>
            <input
              type="text"
              placeholder="e.g. My 5 Daily AI Prompts"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--card-border)', padding: '1rem',
                borderRadius: '12px', color: 'white', fontSize: '1rem', outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>PRICE (USDC)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--card-border)', padding: '1rem 1rem 1rem 2.5rem',
                  borderRadius: '12px', color: 'white', fontSize: '1rem', outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>DESCRIPTION</label>
            <textarea
              rows={3}
              placeholder="What are they buying? (Shown on the locked card)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--card-border)', padding: '1rem',
                borderRadius: '12px', color: 'white', fontSize: '0.9rem',
                outline: 'none', resize: 'none'
              }}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Create Pico Link'}
          </button>
        </div>

        {/* Preview Section */}
        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center', letterSpacing: '0.1em' }}>LIVE PREVIEW</label>
          <div className="glass" style={{ padding: '1.5rem', opacity: 0.8, filter: 'grayscale(0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>DIGITAL CONTENT</span>
              <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${price || '0.00'}</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{title || 'Your Product Title'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
              {description || 'The description will appear here...'}
            </p>
            <button className="btn btn-primary" style={{ width: '100%', padding: '0.7rem', fontSize: '0.9rem' }} disabled>
              🔒 Unlock with FaceID
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
