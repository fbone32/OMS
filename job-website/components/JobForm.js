'use client';

import { useState } from 'react';

const EMPTY = {
  title: '', postingCompany: 'Open Base Africa', employmentType: 'Full-time', branch: '', shift: 'DAY',
  salaryMonth: '', summary: '', description: '', requirements: '', closingDate: '',
};

function toDateInputValue(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

export default function JobForm({ initial, jobId }) {
  const [values, setValues] = useState(() => (initial ? { ...EMPTY, ...initial, closingDate: toDateInputValue(initial.closingDate) } : EMPTY));
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const url = jobId ? `/api/admin/jobs/${jobId}` : '/api/admin/jobs';
      const method = jobId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      window.location.href = '/admin/jobs';
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      {error && <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13.5 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <label className="field-label">Role title *</label>
          <input name="title" value={values.title} onChange={handleChange} className="field-input" required />
        </div>
        <div>
          <label className="field-label">Branch / location *</label>
          <input name="branch" value={values.branch} onChange={handleChange} className="field-input" required />
        </div>
        <div>
          <label className="field-label">Employment type</label>
          <input name="employmentType" value={values.employmentType} onChange={handleChange} className="field-input" />
        </div>
        <div>
          <label className="field-label">Shift *</label>
          <select name="shift" value={values.shift} onChange={handleChange} className="field-input">
            <option value="DAY">Day</option>
            <option value="NIGHT">Night</option>
            <option value="ROTATING">Rotating</option>
          </select>
        </div>
        <div>
          <label className="field-label">Salary / month (GH₵, optional)</label>
          <input name="salaryMonth" type="number" value={values.salaryMonth ?? ''} onChange={handleChange} className="field-input" placeholder="Leave blank for Negotiable" />
        </div>
        <div>
          <label className="field-label">Closing date *</label>
          <input name="closingDate" type="date" value={values.closingDate} onChange={handleChange} className="field-input" required />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="field-label">Summary (short, shown on the listings/tiles) *</label>
        <textarea name="summary" value={values.summary} onChange={handleChange} className="field-input" rows={2} required />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="field-label">Full description *</label>
        <textarea name="description" value={values.description} onChange={handleChange} className="field-input" rows={6} required />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="field-label">Requirements *</label>
        <textarea name="requirements" value={values.requirements} onChange={handleChange} className="field-input" rows={5} required />
      </div>

      <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 20 }}>
        {submitting ? 'Saving…' : jobId ? 'Save changes' : 'Post role'}
      </button>
    </form>
  );
}
