'use client';

import { useEffect, useState } from 'react';

const STATUS_COLORS = { OPEN: '#1E7A46', CLOSED: '#6B7684', EXPIRED: '#C0392B' };

export default function EmployerJobsPage() {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/employer/jobs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setJobs(data.jobs);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAction(id, action) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/employer/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Action failed');
      }
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ color: '#0D2B4E', margin: 0 }}>Your job listings</h1>
        <a href="/employer/jobs/new" className="btn btn-primary">+ Post a new role</a>
      </div>

      {error && <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, marginTop: 14, fontSize: 13.5 }}>{error}</div>}

      {!jobs ? (
        <p style={{ marginTop: 20 }}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>You haven't posted any roles yet.</div>
      ) : (
        <div className="card" style={{ marginTop: 20, padding: 0, overflowX: 'auto' }}>
          <table className="listing-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Role</th>
                <th>Branch</th>
                <th>Status</th>
                <th>Applicants</th>
                <th>Closing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} style={{ cursor: 'default' }}>
                  <td data-label="Role"><a href={`/employer/jobs/${j.id}/edit`} style={{ fontWeight: 700 }}>{j.title}</a></td>
                  <td data-label="Branch">{j.branch}</td>
                  <td data-label="Status">
                    <span style={{ color: STATUS_COLORS[j.status], fontWeight: 700, fontSize: 12.5 }}>{j.status}</span>
                  </td>
                  <td data-label="Applicants">{j.applicationCount}</td>
                  <td data-label="Closing">{new Date(j.closingDate).toLocaleDateString('en-GB')}</td>
                  <td data-label="Actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`/employer/jobs/${j.id}/edit`} className="btn btn-outline" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }}>Edit</a>
                    {j.status === 'OPEN' ? (
                      <button
                        className="btn btn-outline" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }}
                        disabled={busyId === j.id} onClick={() => handleAction(j.id, 'close')}
                      >
                        Close
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }}
                        disabled={busyId === j.id} onClick={() => handleAction(j.id, 'repost')}
                      >
                        {j.status === 'EXPIRED' ? 'Repost' : 'Reopen'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
