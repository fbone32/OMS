'use client';

export default function AdminLogoutButton() {
  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }
  return (
    <button type="button" onClick={handleLogout} className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12.5, minHeight: 32 }}>
      Sign out
    </button>
  );
}
