import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/auth';
import AdminLogoutButton from '../../../components/AdminLogoutButton';

// Real server-side gate (not just a hidden nav link) — every page under
// app/admin/(dashboard)/** is wrapped by this layout via the route group,
// while /admin/login stays outside it. Runs in the Node.js runtime (default
// for App Router Server Components), so lib/auth.js's Node `crypto`-based
// HMAC verification works directly — no Edge-middleware crypto workaround
// needed.
export default function DashboardLayout({ children }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect('/admin/login');

  return (
    <div>
      <div style={{ background: '#EAF0F7', borderBottom: '1px solid #E3E7EC' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/admin" style={{ fontWeight: 700, color: '#0D2B4E' }}>Dashboard</a>
            <a href="/admin/jobs" style={{ fontWeight: 700, color: '#0D2B4E' }}>Job Listings</a>
            <a href="/admin/applicants" style={{ fontWeight: 700, color: '#0D2B4E' }}>Applicants</a>
          </div>
          <AdminLogoutButton />
        </div>
      </div>
      <div className="container" style={{ padding: '24px 16px 56px' }}>{children}</div>
    </div>
  );
}
