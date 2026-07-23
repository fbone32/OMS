'use client';

import { useState } from 'react';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        setSubmitting(false);
        return;
      }
      window.location.href = '/admin';
    } catch {
      setError('Network error — please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ color: '#C8960C', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8, textAlign: 'center' }}>
          OBA CAREERS
        </div>
        <h1 style={{ fontSize: 18, color: '#0D2B4E', textAlign: 'center', marginTop: 0 }}>HR Admin sign in</h1>

        {error && (
          <div style={{ background: '#FBEAEA', color: '#C0392B', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <label className="field-label" htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" style={{ marginBottom: 14 }} autoComplete="username" />

        <label className="field-label" htmlFor="password">Password</label>
        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" style={{ marginBottom: 18 }} autoComplete="current-password" />

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
