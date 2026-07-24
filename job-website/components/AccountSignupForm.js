'use client';

import { useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountSignupForm() {
  const [values, setValues] = useState({ name: '', phone: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  function handleChange(e) {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  }

  function validateAll() {
    const next = {};
    if (!values.name.trim()) next.name = 'Full name is required.';
    if (!values.email.trim() || !EMAIL_RE.test(values.email.trim())) {
      next.email = 'A valid email address is required.';
    }
    if (!values.password || values.password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/account/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setErrors((prev) => ({ ...prev, ...data.fieldErrors }));
        setResult({ ok: false, error: data.error || 'Something went wrong. Please try again.' });
        setSubmitting(false);
        return;
      }
      window.location.href = '/account';
    } catch {
      setResult({ ok: false, error: 'Network error, please check your connection and try again.' });
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" noValidate>
      <h2 style={{ color: '#0D2B4E', marginTop: 0, fontSize: 18 }}>Create your account</h2>
      <p style={{ color: '#6B7684', fontSize: 13, marginTop: -6, marginBottom: 18 }}>
        Save time on future applications, track your status, and bookmark roles you like.
      </p>

      {result && !result.ok && (
        <div style={{ background: '#FBEAEA', color: '#C0392B', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          {result.error}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="name">Full name *</label>
        <input id="name" name="name" value={values.name} onChange={handleChange} className={`field-input ${errors.name ? 'has-error' : ''}`} autoComplete="name" />
        {errors.name && <div className="field-error">{errors.name}</div>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="phone">Phone number</label>
        <input id="phone" name="phone" value={values.phone} onChange={handleChange} className="field-input" autoComplete="tel" inputMode="tel" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label className="field-label" htmlFor="email">Email address *</label>
        <input id="email" name="email" type="email" value={values.email} onChange={handleChange} className={`field-input ${errors.email ? 'has-error' : ''}`} autoComplete="username" />
        {errors.email && <div className="field-error">{errors.email}</div>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="field-label" htmlFor="password">Password *</label>
        <input id="password" name="password" type="password" value={values.password} onChange={handleChange} className={`field-input ${errors.password ? 'has-error' : ''}`} autoComplete="new-password" />
        {errors.password && <div className="field-error">{errors.password}</div>}
      </div>

      <p style={{ fontSize: 12, color: '#6B7684', lineHeight: 1.6, marginTop: 8 }}>
        By creating an account, you consent to Open Base Africa storing your profile data in
        line with the Ghana Data Protection Act. See our <a href="/privacy">Privacy Policy</a>.
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting} style={{ marginTop: 8 }}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p style={{ fontSize: 12.5, color: '#6B7684', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
        Already have an account? <a href="/account/login" style={{ fontWeight: 700 }}>Sign in</a>
      </p>
    </form>
  );
}
