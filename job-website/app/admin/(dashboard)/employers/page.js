'use client';

import { useEffect, useState, useCallback } from 'react';

const STATUS_COLORS = { PENDING: '#B5860A', APPROVED: '#1E7A46', REJECTED: '#C0392B', SUSPENDED: '#6B7684' };

export default function AdminEmployersPage() {
  const [employers, setEmployers] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    try {
      const res = await fetch(`/api/admin/employers?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setEmployers(data.employers);
    } catch (err) {
      setError(err.message);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(id, action) {
    let reason = null;
    if (action === 'reject') {
      reason = window.prompt('Optional: reason to include in the rejection email') || '';
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/employers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
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
        <h1 style={{ color: '#0D2B4E', margin: 0 }}>Employer accounts</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field-input" style={{ maxWidth: 200 }}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {error && <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, marginTop: 14, fontSize: 13.5 }}>{error}</div>}

      {!employers ? (
        <p style={{ marginTop: 20 }}>Loading...</p>
      ) : employers.length === 0 ? (
        <div className="card" style={{ marginTop: 20 }}>No employer registrations match this filter.</div>
      ) : (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {employers.map((e) => (
            <div key={e.id} className="card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0D2B4E', fontSize: 15 }}>
                  {e.companyName} <span style={{ color: STATUS_COLORS[e.status], fontSize: 12, fontWeight: 700 }}>({e.status})</span>
                </div>
                <div style={{ fontSize: 12.5, color: '#6B7684' }}>{e.contactName} · {e.contactEmail} · {e.contactPhone}</div>
                <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 2 }}>Login email: {e.loginEmail} · Plan: {e.planTier}</div>
                <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 2 }}>
                  {e.jobListingCount} job listing{e.jobListingCount === 1 ? '' : 's'} · Registered {new Date(e.createdAt).toLocaleDateString('en-GB')}
                </div>
                {e.approvedByEmail && (
                  <div style={{ fontSize: 12, color: '#6B7684', marginTop: 2 }}>
                    Actioned by {e.approvedByEmail} on {new Date(e.approvedAt).toLocaleDateString('en-GB')}
                  </div>
                )}
                {e.rejectedReason && (
                  <div style={{ fontSize: 12, color: '#C0392B', marginTop: 2 }}>Reason: {e.rejectedReason}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {e.status === 'PENDING' && (
                  <>
                    <button className="btn btn-primary" style={{ padding: '6px 14px', minHeight: 32, fontSize: 12.5 }} disabled={busyId === e.id} onClick={() => handleAction(e.id, 'approve')}>
                      Approve
                    </button>
                    <button className="btn btn-outline" style={{ padding: '6px 14px', minHeight: 32, fontSize: 12.5 }} disabled={busyId === e.id} onClick={() => handleAction(e.id, 'reject')}>
                      Reject
                    </button>
                  </>
                )}
                {e.status === 'APPROVED' && (
                  <button className="btn btn-outline" style={{ padding: '6px 14px', minHeight: 32, fontSize: 12.5 }} disabled={busyId === e.id} onClick={() => handleAction(e.id, 'suspend')}>
                    Suspend
                  </button>
                )}
                {(e.status === 'SUSPENDED' || e.status === 'REJECTED') && (
                  <button className="btn btn-outline" style={{ padding: '6px 14px', minHeight: 32, fontSize: 12.5 }} disabled={busyId === e.id} onClick={() => handleAction(e.id, 'reinstate')}>
                    Reinstate (approve)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
