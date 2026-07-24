'use client';

export default function EmployerLogoutButton() {
  async function handleLogout() {
    await fetch('/api/employer/logout', { method: 'POST' });
    window.location.href = '/employer/login';
  }
  return (
    <button type="button" onClick={handleLogout} className="btn btn-outline" style={{ padding: '6px 14px', fontSize: 12.5, minHeight: 32 }}>
      Sign out
    </button>
  );
}
