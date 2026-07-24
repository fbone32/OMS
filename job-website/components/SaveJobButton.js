'use client';

import { useState } from 'react';

export default function SaveJobButton({ jobId, signedIn, initiallySaved }) {
  const [saved, setSaved] = useState(!!initiallySaved);
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <a href={`/account/login?next=/jobs/${jobId}`} className="btn btn-outline" style={{ padding: '10px 16px', fontSize: 13 }}>
        Sign in to save this job
      </a>
    );
  }

  async function toggle() {
    setBusy(true);
    try {
      if (saved) {
        await fetch(`/api/account/saved-jobs/${jobId}`, { method: 'DELETE' });
        setSaved(false);
      } else {
        await fetch('/api/account/saved-jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobListingId: jobId }),
        });
        setSaved(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="btn btn-outline"
      style={{ padding: '10px 16px', fontSize: 13, color: saved ? '#C8960C' : undefined, borderColor: saved ? '#C8960C' : undefined }}
    >
      {saved ? '★ Saved' : '☆ Save this job'}
    </button>
  );
}
