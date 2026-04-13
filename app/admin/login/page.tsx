'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push('/admin');
    } else {
      setError('incorrect password');
      setPassword('');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0e0e0e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
      }}
    >
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 260 }}>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
          style={{
            background: '#141414',
            border: '1px solid #252525',
            borderRadius: 4,
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 14,
            padding: '10px 14px',
            outline: 'none',
          }}
        />
        {error && (
          <span style={{ fontSize: 11, color: '#FF3B3B', letterSpacing: '0.08em' }}>{error}</span>
        )}
        <button
          type="submit"
          style={{
            background: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.15em',
            padding: '10px',
            cursor: 'pointer',
          }}
        >
          ENTER
        </button>
      </form>
    </div>
  );
}
