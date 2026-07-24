'use client';

import { useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmployerRegisterForm({ selectedPlan = 'starter' }) {
  const [values, setValues] = useState({
    companyName: '', contactName: '', contactEmail: '', contactPhone: '',
    loginEmail: '', password: '', planTier: selectedPlan,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  function handleChange(e) {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  }

  function validateAll() {
    const next = {};
    if (!values.companyName.trim()) next.companyName = 'Company name is required.';
    if (!values.contactName.trim()) next.contactName = 'Contact name is required.';
    if (!values.contactEmail.trim() || !EMAIL_RE.test(values.contactEmail.trim())) {
      next.contactEmail = 'A valid contact email is required.';
    }
    if (!values.contactPhone.trim()) next.contactPhone = 'Contact phone is required.';
    if (!values.loginEmail.trim() || !EMAIL_RE.test(values.loginEmail.trim())) {
      next.loginEmail = 'A valid login email is required.';
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
      const res = await fetch('/api/employers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setErrors((prev) => ({ ...prev, ...data.fieldErrors }));
        setResult({ ok: false, error: data.error || 'Something went wrong. Please try again.' });
      } else {
        setResult({ ok: true });
      }
    } catch {
      setResult({ ok: false, error: 'Network error. Please check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result && result.ok) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h2 style={{ color: '#0D2B4E', margin: '0 0 8px' }}>Registration received</h2>
        <p style={{ color: '#444', fontSize: 14.5, maxWidth: 440, margin: '0 auto' }}>
          Thanks for registering <strong>{values.companyName}</strong>. Our HR team will review your
          registration and email you at {values.contactEmail} once it has been approved. You will be
          able to sign in and post roles as soon as that happens.
        </p>
        <a href="/employer/login" className="btn btn-outline" style={{ marginTop: 20 }}>Go to employer sign in</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" noValidate id="register">
      <h2 style={{ color: '#0D2B4E', marginTop: 0, fontSize: 18 }}>Register your company</h2>
      <p style={{ color: '#6B7684', fontSize: 13, marginTop: -6, marginBottom: 18 }}>
        Submit your details below. Our HR team reviews every new employer account before it can sign
        in or post roles.
      </p>

      {result && !result.ok && (
        <div style={{ background: '#FBEAEA', color: '#C0392B', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          {result.error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <label className="field-label" htmlFor="companyName">Company name *</label>
          <input id="companyName" name="companyName" value={values.companyName} onChange={handleChange} className={`field-input ${errors.companyName ? 'has-error' : ''}`} />
          {errors.companyName && <div className="field-error">{errors.companyName}</div>}
        </div>
        <div>
          <label className="field-label" htmlFor="contactName">Contact name *</label>
          <input id="contactName" name="contactName" value={values.contactName} onChange={handleChange} className={`field-input ${errors.contactName ? 'has-error' : ''}`} />
          {errors.contactName && <div className="field-error">{errors.contactName}</div>}
        </div>
        <div>
          <label className="field-label" htmlFor="contactEmail">Contact email *</label>
          <input id="contactEmail" name="contactEmail" type="email" value={values.contactEmail} onChange={handleChange} className={`field-input ${errors.contactEmail ? 'has-error' : ''}`} />
          {errors.contactEmail && <div className="field-error">{errors.contactEmail}</div>}
        </div>
        <div>
          <label className="field-label" htmlFor="contactPhone">Contact phone *</label>
          <input id="contactPhone" name="contactPhone" value={values.contactPhone} onChange={handleChange} className={`field-input ${errors.contactPhone ? 'has-error' : ''}`} />
          {errors.contactPhone && <div className="field-error">{errors.contactPhone}</div>}
        </div>
        <div>
          <label className="field-label" htmlFor="loginEmail">Login email *</label>
          <input id="loginEmail" name="loginEmail" type="email" value={values.loginEmail} onChange={handleChange} className={`field-input ${errors.loginEmail ? 'has-error' : ''}`} autoComplete="username" />
          {errors.loginEmail && <div className="field-error">{errors.loginEmail}</div>}
          <div style={{ fontSize: 11.5, color: '#6B7684', marginTop: 4 }}>Use this to sign in once approved. It can be different from your contact email.</div>
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password *</label>
          <input id="password" name="password" type="password" value={values.password} onChange={handleChange} className={`field-input ${errors.password ? 'has-error' : ''}`} autoComplete="new-password" />
          {errors.password && <div className="field-error">{errors.password}</div>}
        </div>
        <div>
          <label className="field-label" htmlFor="planTier">Plan of interest</label>
          <select id="planTier" name="planTier" value={values.planTier} onChange={handleChange} className="field-input">
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting} style={{ marginTop: 20 }}>
        {submitting ? 'Submitting...' : 'Submit registration'}
      </button>
    </form>
  );
}
