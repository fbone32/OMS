'use client';

import { useEffect, useState, useCallback } from 'react';

const STATUSES = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

export default function ApplicantsPage() {
  const [applicants, setApplicants] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    try {
      const res = await fetch(`/api/admin/applicants?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setApplicants(data.applicants);
    } catch (err) {
      setError(err.message);
    }
  }, [status, q]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(id, newStatus) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/applicants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  function exportUrl() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    return `/api/admin/applicants/export?${params.toString()}`;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ color: '#0D2B4E', margin: 0 }}>Applicants</h1>
        <a href={exportUrl()} className="btn btn-outline">Export CSV</a>
      </div>

      <div className="card" style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label className="field-label">Search (name or email)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field-input" placeholder="Search…" />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <label className="field-label">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field-input">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, marginTop: 14, fontSize: 13.5 }}>{error}</div>}

      {!applicants ? (
        <p style={{ marginTop: 20 }}>Loading…</p>
      ) : applicants.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>No applicants match this filter.</div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {applicants.map((a) => (
            <div key={a.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0D2B4E', fontSize: 15 }}>{a.fullName}</div>
                <div style={{ fontSize: 12.5, color: '#6B7684' }}>{a.email} · {a.phone}</div>
                <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 2 }}>
                  Applied for <strong>{a.jobTitle}</strong> ({a.branch}) on {new Date(a.createdAt).toLocaleDateString('en-GB')}
                </div>
                <div style={{ fontSize: 13, marginTop: 8, color: '#333' }}>{a.whyGoodFit}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <a href={`/api/admin/applicants/${a.id}/cv`} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '5px 12px', minHeight: 30, fontSize: 12 }}>
                    View CV ({a.cvFileName})
                  </a>
                  <span className="badge" style={{ background: a.syncStatus === 'SYNCED' ? '#E7F5EC' : '#FCF1DC', color: a.syncStatus === 'SYNCED' ? '#1E7A46' : '#B5860A' }}>
                    OMS: {a.syncStatus}
                  </span>
                  {a.confirmationEmailSent && <span className="badge">Email sent</span>}
                </div>
              </div>
              <div>
                <select
                  value={a.status}
                  disabled={busyId === a.id}
                  onChange={(e) => handleStatusChange(a.id, e.target.value)}
                  className="field-input"
                  style={{ minWidth: 140 }}
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
