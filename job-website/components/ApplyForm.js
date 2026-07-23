'use client';

import { useState } from 'react';

const MAX_CV_BYTES = 4 * 1024 * 1024; // keep in sync with lib/validation.js — see that file's comment
const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];

function validateCvClientSide(file) {
  if (!file) return 'Please attach your CV.';
  const lowerName = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => lowerName.endsWith(ext))) {
    return 'CV must be a PDF or Word document (.pdf, .doc, .docx).';
  }
  if (file.size > MAX_CV_BYTES) {
    return `CV must be 4MB or smaller (yours is ${(file.size / (1024 * 1024)).toFixed(1)}MB).`;
  }
  if (file.size === 0) return 'That file appears to be empty — please choose a valid CV file.';
  return null;
}

export default function ApplyForm({ jobId, jobTitle }) {
  const [values, setValues] = useState({ fullName: '', phone: '', email: '', whyGoodFit: '' });
  const [cvFile, setCvFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, error } after submit

  function handleChange(e) {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  }

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    setCvFile(file || null);
    const err = validateCvClientSide(file);
    setErrors((prev) => ({ ...prev, cv: err }));
  }

  function validateAll() {
    const next = {};
    if (!values.fullName.trim()) next.fullName = 'Full name is required.';
    if (!values.phone.trim()) next.phone = 'Phone number is required.';
    if (!values.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      next.email = 'A valid email address is required.';
    }
    if (!values.whyGoodFit.trim() || values.whyGoodFit.trim().length < 20) {
      next.whyGoodFit = 'Please tell us why you are a good fit (at least 20 characters).';
    }
    const cvErr = validateCvClientSide(cvFile);
    if (cvErr) next.cv = cvErr;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setResult(null);
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set('fullName', values.fullName.trim());
      fd.set('phone', values.phone.trim());
      fd.set('email', values.email.trim());
      fd.set('whyGoodFit', values.whyGoodFit.trim());
      fd.set('cv', cvFile);
      fd.set('company_website', ''); // honeypot — real candidates never see this field

      const res = await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.fieldErrors) setErrors((prev) => ({ ...prev, ...data.fieldErrors }));
        setResult({ ok: false, error: data.error || 'Something went wrong. Please try again.' });
      } else {
        setResult({ ok: true });
      }
    } catch (err) {
      setResult({ ok: false, error: 'Network error — please check your connection and try again.' });
    } finally {
      setSubmitting(false);
    }
  }

  if (result && result.ok) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <h2 style={{ color: '#0D2B4E', margin: '0 0 8px' }}>Application received!</h2>
        <p style={{ color: '#444', fontSize: 14.5, maxWidth: 420, margin: '0 auto' }}>
          Thanks for applying for <strong>{jobTitle}</strong>. We've sent a confirmation to your
          email, and our HR team will be in touch if you're shortlisted.
        </p>
        <a href="/" className="btn btn-outline" style={{ marginTop: 20 }}>Browse more roles</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" noValidate>
      {result && !result.ok && (
        <div style={{ background: '#FBEAEA', color: '#C0392B', borderRadius: 8, padding: '10px 14px', fontSize: 13.5, fontWeight: 600, marginBottom: 16 }}>
          {result.error}
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label className="field-label" htmlFor="fullName">Full name *</label>
        <input
          id="fullName" name="fullName" value={values.fullName} onChange={handleChange}
          className={`field-input ${errors.fullName ? 'has-error' : ''}`} autoComplete="name"
        />
        {errors.fullName && <div className="field-error">{errors.fullName}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="field-label" htmlFor="phone">Phone number *</label>
        <input
          id="phone" name="phone" value={values.phone} onChange={handleChange}
          className={`field-input ${errors.phone ? 'has-error' : ''}`} autoComplete="tel" inputMode="tel"
        />
        {errors.phone && <div className="field-error">{errors.phone}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="field-label" htmlFor="email">Email address *</label>
        <input
          id="email" name="email" type="email" value={values.email} onChange={handleChange}
          className={`field-input ${errors.email ? 'has-error' : ''}`} autoComplete="email" inputMode="email"
        />
        {errors.email && <div className="field-error">{errors.email}</div>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="field-label" htmlFor="whyGoodFit">Why are you a good fit for this role? *</label>
        <textarea
          id="whyGoodFit" name="whyGoodFit" value={values.whyGoodFit} onChange={handleChange}
          className={`field-input ${errors.whyGoodFit ? 'has-error' : ''}`} rows={5}
        />
        {errors.whyGoodFit && <div className="field-error">{errors.whyGoodFit}</div>}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="field-label" htmlFor="cv">Upload CV (PDF or Word, max 4MB) *</label>
        <input
          id="cv" name="cv" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange} className={`field-input ${errors.cv ? 'has-error' : ''}`}
        />
        {errors.cv && <div className="field-error">{errors.cv}</div>}
      </div>

      {/* Honeypot field — hidden from real users via CSS, bots that autofill
          every field will fill this and get silently ignored server-side. */}
      <div style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
        <label htmlFor="company_website">Do not fill this in</label>
        <input id="company_website" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>

      <p style={{ fontSize: 12, color: '#6B7684', lineHeight: 1.6, marginTop: 4 }}>
        By submitting this application, you consent to Open Base Africa processing your
        personal data for recruitment purposes in line with the Ghana Data Protection Act. See our{' '}
        <a href="/privacy">Privacy Policy</a> — you can request deletion of your data at any time.
      </p>

      <button type="submit" className="btn btn-primary btn-block" disabled={submitting} style={{ marginTop: 8 }}>
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>
    </form>
  );
}
