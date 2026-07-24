import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/employer-auth';
import { prisma } from '../../../lib/db';
import EmployerLogoutButton from '../../../components/EmployerLogoutButton';

// Real server-side gate for every page under app/employer/(dashboard)/**,
// while /employer/login stays outside it - same pattern as the HR admin
// dashboard's layout. Also re-checks the employer's live status on every
// request (not just at login time) so a company SUSPENDED after signing in
// is immediately kicked back to the login screen, not left with a stale
// session that still shows their dashboard.
export default async function EmployerDashboardLayout({ children }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect('/employer/login');

  const employer = await prisma.employer.findUnique({ where: { id: session.eid } });
  if (!employer || employer.status !== 'APPROVED') redirect('/employer/login');

  return (
    <div>
      <div style={{ background: '#EAF0F7', borderBottom: '1px solid #E3E7EC' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: '#0D2B4E' }}>{employer.companyName}</span>
            <a href="/employer/jobs" style={{ fontWeight: 700, color: '#0D2B4E' }}>Job Listings</a>
            <a href="/employer/applicants" style={{ fontWeight: 700, color: '#0D2B4E' }}>Applicants</a>
          </div>
          <EmployerLogoutButton />
        </div>
      </div>
      <div className="container" style={{ padding: '24px 16px 56px' }}>{children}</div>
    </div>
  );
}
