'use client';

import { useCallback, useEffect, useState } from 'react';

const STAGE_LABELS = ['Applied', 'Screened', 'Interview', 'Decision'];

function stageIndex(status) {
  if (status === 'NEW') return 0;
  if (status === 'SCREENING') return 1;
  if (status === 'INTERVIEW') return 2;
  return 3; // OFFER / HIRED / REJECTED all reached the "Decision" stage
}

function decisionColor(status) {
  if (status === 'HIRED' || status === 'OFFER') return '#1E7A46';
  if (status === 'REJECTED') return '#C0392B';
  return '#C8960C';
}

function decisionLabel(status) {
  if (status === 'HIRED') return 'Hired';
  if (status === 'OFFER') return 'Offer extended';
  if (status === 'REJECTED') return 'Not selected';
  return 'Applied';
}

function StageTracker({ status }) {
  const idx = stageIndex(status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
      {STAGE_LABELS.map((label, i) => {
        const reached = i <= idx;
        const isLast = i === STAGE_LABELS.length - 1;
        const color = reached ? (isLast ? decisionColor(status) : '#0D2B4E') : '#D7DEE6';
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: isLast ? '0 0 auto' : '1 1 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: reached ? '#0D2B4E' : '#9BA6B2', whiteSpace: 'nowrap' }}>
                {isLast && reached ? decisionLabel(status) : label}
              </span>
            </div>
            {!isLast && <div style={{ flex: 1, height: 2, background: i < idx ? '#0D2B4E' : '#D7DEE6', marginBottom: 16 }} />}
          </div>
        );
      })}
    </div>
  );
}

export default function MySpaceDashboard() {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState(null);
  const [savedJobs, setSavedJobs] = useState(null);
  const [error, setError] = useState(null);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  const [cvFile, setCvFile] = useState(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [cvMessage, setCvMessage] = useState(null);

  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState(null);

  const [codeInput, setCodeInput] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [profileRes, appsRes, savedRes] = await Promise.all([
        fetch('/api/account/profile'),
        fetch('/api/account/applications'),
        fetch('/api/account/saved-jobs'),
      ]);
      const [profileData, appsData, savedData] = await Promise.all([profileRes.json(), appsRes.json(), savedRes.json()]);
      if (!profileRes.ok) throw new Error(profileData.error || 'Failed to load profile');
      if (!appsRes.ok) throw new Error(appsData.error || 'Failed to load applications');
      if (!savedRes.ok) throw new Error(savedData.error || 'Failed to load saved jobs');
      setProfile(profileData.candidate);
      setProfileForm({ name: profileData.candidate.name, phone: profileData.candidate.phone || '' });
      setApplications(appsData.applications);
      setSavedJobs(savedData.savedJobs);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save profile');
      setProfile(data.candidate);
      setEditingProfile(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleUploadCv(e) {
    e.preventDefault();
    if (!cvFile) return;
    setUploadingCv(true);
    setCvMessage(null);
    try {
      const fd = new FormData();
      fd.set('cv', cvFile);
      const res = await fetch('/api/account/cv', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to upload CV');
      setProfile((p) => ({ ...p, cvFileName: data.cvFileName, cvSizeBytes: data.cvSizeBytes }));
      setCvFile(null);
      setCvMessage({ ok: true, text: 'CV on file updated.' });
    } catch (err) {
      setCvMessage({ ok: false, text: err.message });
    } finally {
      setUploadingCv(false);
    }
  }

  async function handleResendVerification() {
    setResendBusy(true);
    setResendMessage(null);
    try {
      const res = await fetch('/api/account/resend-verification', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to resend verification email');
      setResendMessage(data.alreadyVerified ? 'Your email is already verified.' : 'Verification email sent.');
    } catch (err) {
      setResendMessage(err.message);
    } finally {
      setResendBusy(false);
    }
  }

  async function handleVerifyCode(e) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setCodeBusy(true);
    setCodeMessage(null);
    try {
      const res = await fetch('/api/account/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not verify that code.');
      setProfile((p) => ({ ...p, emailVerified: true }));
      setCodeInput('');
      setCodeMessage(data.alreadyVerified ? 'Your email is already verified.' : 'Email verified.');
    } catch (err) {
      setCodeMessage(err.message);
    } finally {
      setCodeBusy(false);
    }
  }

  async function handleUnsave(jobListingId) {
    setSavedJobs((jobs) => jobs.filter((j) => j.jobListingId !== jobListingId));
    await fetch(`/api/account/saved-jobs/${jobListingId}`, { method: 'DELETE' });
  }

  function handleExport() {
    window.location.href = '/api/account/export';
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete account');
      }
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  if (error) {
    return <div style={{ background: '#FBEAEA', color: '#C0392B', padding: '9px 14px', borderRadius: 8, fontSize: 13.5 }}>{error}</div>;
  }
  if (!profile) return <p>Loading…</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ color: '#0D2B4E', margin: 0 }}>My Space</h1>

      {/* ---- Profile ---- */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 16, color: '#0D2B4E', margin: 0 }}>Profile</h2>
          {!editingProfile && (
            <button type="button" className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12.5, minHeight: 32 }} onClick={() => setEditingProfile(true)}>
              Edit
            </button>
          )}
        </div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge">{profile.email}</span>
          {profile.emailVerified ? (
            <span className="badge" style={{ background: '#E7F5EC', color: '#1E7A46' }}>Email verified</span>
          ) : (
            <>
              <span className="badge" style={{ background: '#FCF1DC', color: '#B5860A' }}>Email not verified</span>
              <button
                type="button" onClick={handleResendVerification} disabled={resendBusy}
                className="btn btn-outline" style={{ padding: '4px 10px', minHeight: 26, fontSize: 11.5 }}
              >
                {resendBusy ? 'Sending…' : 'Resend verification email'}
              </button>
            </>
          )}
        </div>
        {resendMessage && <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 6 }}>{resendMessage}</div>}

        {!profile.emailVerified && (
          <form onSubmit={handleVerifyCode} style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="field-label" htmlFor="verify-code" style={{ margin: 0 }}>Enter the 6-digit code from your email</label>
            <input
              id="verify-code" className="field-input" inputMode="numeric" maxLength={6} placeholder="000000"
              style={{ width: 100, letterSpacing: '0.2em', textAlign: 'center' }}
              value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button type="submit" className="btn btn-primary" disabled={codeBusy || codeInput.length !== 6} style={{ padding: '6px 14px', minHeight: 32, fontSize: 12.5 }}>
              {codeBusy ? 'Checking…' : 'Verify'}
            </button>
          </form>
        )}
        {codeMessage && <div style={{ fontSize: 12.5, color: '#6B7684', marginTop: 6 }}>{codeMessage}</div>}

        {editingProfile ? (
          <form onSubmit={handleSaveProfile} style={{ marginTop: 14, display: 'grid', gap: 12, maxWidth: 360 }}>
            <div>
              <label className="field-label" htmlFor="name">Full name</label>
              <input
                id="name" className="field-input" value={profileForm.name}
                onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="phone">Phone number</label>
              <input
                id="phone" className="field-input" value={profileForm.phone}
                onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditingProfile(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div style={{ marginTop: 14, fontSize: 14, color: '#333' }}>
            <div><strong>{profile.name}</strong></div>
            <div style={{ color: '#6B7684' }}>{profile.phone || 'No phone number on file'}</div>
          </div>
        )}

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #E3E7EC' }}>
          <div className="field-label">CV on file</div>
          {profile.cvFileName ? (
            <div style={{ fontSize: 13.5, color: '#333', marginBottom: 8 }}>
              {profile.cvFileName} ({(profile.cvSizeBytes / (1024 * 1024)).toFixed(1)}MB)
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: '#6B7684', marginBottom: 8 }}>No CV on file yet.</div>
          )}
          <form onSubmit={handleUploadCv} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setCvFile(e.target.files && e.target.files[0])}
              className="field-input" style={{ maxWidth: 280 }}
            />
            <button type="submit" className="btn btn-outline" disabled={!cvFile || uploadingCv} style={{ padding: '8px 16px', minHeight: 38 }}>
              {uploadingCv ? 'Uploading…' : profile.cvFileName ? 'Replace CV' : 'Upload CV'}
            </button>
          </form>
          {cvMessage && (
            <div style={{ fontSize: 12.5, marginTop: 6, color: cvMessage.ok ? '#1E7A46' : '#C0392B' }}>{cvMessage.text}</div>
          )}
        </div>
      </div>

      {/* ---- Applications ---- */}
      <div className="card">
        <h2 style={{ fontSize: 16, color: '#0D2B4E', marginTop: 0 }}>My applications</h2>
        {!applications ? (
          <p>Loading…</p>
        ) : applications.length === 0 ? (
          <p style={{ color: '#6B7684', fontSize: 13.5 }}>You haven't applied to any roles while signed in yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {applications.map((a) => (
              <div key={a.id} style={{ borderBottom: '1px solid #E3E7EC', paddingBottom: 14 }}>
                <div style={{ fontWeight: 700, color: '#0D2B4E', fontSize: 14.5 }}>{a.jobTitle}</div>
                <div style={{ fontSize: 12.5, color: '#6B7684' }}>
                  {a.postingCompany} · {a.branch} · Applied {new Date(a.createdAt).toLocaleDateString('en-GB')}
                </div>
                <StageTracker status={a.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Saved jobs ---- */}
      <div className="card">
        <h2 style={{ fontSize: 16, color: '#0D2B4E', marginTop: 0 }}>Saved jobs</h2>
        {!savedJobs ? (
          <p>Loading…</p>
        ) : savedJobs.length === 0 ? (
          <p style={{ color: '#6B7684', fontSize: 13.5 }}>You haven't saved any roles yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {savedJobs.map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, borderBottom: '1px solid #E3E7EC', paddingBottom: 10 }}>
                <div>
                  <a href={`/jobs/${s.jobListingId}`} style={{ fontWeight: 700, color: '#0D2B4E', fontSize: 14 }}>{s.jobTitle}</a>
                  <div style={{ fontSize: 12.5, color: '#6B7684' }}>{s.branch}</div>
                </div>
                <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', minHeight: 32, fontSize: 12 }} onClick={() => handleUnsave(s.jobListingId)}>
                  Unsave
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Privacy self-service ---- */}
      <div className="card">
        <h2 style={{ fontSize: 16, color: '#0D2B4E', marginTop: 0 }}>Your data</h2>
        <p style={{ fontSize: 13, color: '#6B7684', marginTop: -6 }}>
          Under the Ghana Data Protection Act, you can request a copy of your data or ask us to delete your account at any time.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline" onClick={handleExport}>Request a copy of my data</button>
          {!deleteConfirm ? (
            <button
              type="button" className="btn btn-outline" style={{ color: '#C0392B', borderColor: '#C0392B' }}
              onClick={() => setDeleteConfirm(true)}
            >
              Request account &amp; data deletion
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#C0392B', fontWeight: 600 }}>
                This permanently deletes your account, profile, CV on file, and saved jobs. Are you sure?
              </span>
              <button type="button" className="btn btn-secondary" style={{ background: '#C0392B' }} onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setDeleteConfirm(false)} disabled={deleting}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
