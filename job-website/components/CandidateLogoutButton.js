'use client';

// Two visual contexts reuse this same action: the navy site Header (plain
// white text link) and the light My Space dashboard strip (bordered
// btn-outline button, same as Employer/Admin logout buttons). `variant`
// picks the styling, the logout behavior itself is identical either way.
export default function CandidateLogoutButton({ variant = 'header' }) {
  async function handleLogout() {
    await fetch('/api/account/logout', { method: 'POST' });
    window.location.href = '/';
  }

  if (variant === 'dashboard') {
    return (
      <button type="button" onClick={handleLogout} className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12.5, minHeight: 32 }}>
        Sign out
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{ background: 'none', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}
    >
      Sign out
    </button>
  );
}
