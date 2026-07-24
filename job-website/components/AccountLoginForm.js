'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AccountLoginForm() {
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === '1';
  const verifyError = searchParams.get('verifyError') === '1';
  const next = searchParams.get('next') || '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/login', {
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
      window.location.href = next;
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={handleSubmit} className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ color: '#C8960C', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8, textAlign: 'center' }}>
          OBA JOBS MY SPACE
        </div>
        <h1 style={{ fontSize: 18, color: '#0D2B4E', textAlign: 'center', marginTop: 0 }}>Candidate sign in</h1>

        {verified && (
          <div style={{ background: '#E7F5EC', color: '#1E7A46', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            Your email has been verified. You can sign in now.
          </div>
        )}
        {verifyError && (
          <div style={{ background: '#FBEAEA', color: '#C0392B', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            That verification link is invalid or has expired. You can request a new one from My Space.
          </div>
        )}
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

        <p style={{ fontSize: 12.5, color: '#6B7684', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          New here? <a href="/account/signup" style={{ fontWeight: 700 }}>Create an account</a>
        </p>
      </form>
    </div>
  );
}
