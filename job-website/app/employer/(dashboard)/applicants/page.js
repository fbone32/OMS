'use client';

import { useEffect, useState, useCallback } from 'react';

export default function EmployerApplicantsPage() {
  const [applicants, setApplicants] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/employer/applicants');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setApplicants(data.applicants);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (applicants || []).filter(
    (a) => !q || a.fullName.toLowerCase().includes(q.toLowerCase()) || a.email.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <h1 style={{ color: '#0D2B4E', margin: 0 }}>Applicants</h1>

      <div className="card" style={{ marginTop: 16 }}>
        <label className="field-label">Search (name or email)</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="field-input" placeholder="Search..." />
      </div>

      {error && <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, marginTop: 14, fontSize: 13.5 }}>{error}</div>}

      {!applicants ? (
        <p style={{ marginTop: 20 }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>No applicants yet.</div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((a) => (
            <div key={a.id} className="card">
              <div style={{ fontWeight: 700, color: '#0D2B4E', fontSize: 15 }}>{a.fullName}</div>
              <div style={{ fontSize: 12.5, color: '#6B7684' }}>{a.email} · {a.phone}</div>
              <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 2 }}>
                Applied for <strong>{a.jobTitle}</strong> ({a.branch}) on {new Date(a.createdAt).toLocaleDateString('en-GB')}
              </div>
              <div style={{ fontSize: 13, marginTop: 8, color: '#333' }}>{a.whyGoodFit}</div>
              <div style={{ marginTop: 8 }}>
                <a href={`/api/employer/applicants/${a.id}/cv`} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '5px 12px', minHeight: 30, fontSize: 12 }}>
                  View CV ({a.cvFileName})
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
