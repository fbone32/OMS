import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../../lib/candidate-auth';
import { prisma } from '../../../lib/db';
import CandidateLogoutButton from '../../../components/CandidateLogoutButton';

// Real server-side gate for every page under app/account/(dashboard)/**,
// while /account/login and /account/signup stay outside it - same pattern
// as the HR admin and employer dashboard layouts.
export default async function AccountDashboardLayout({ children }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect('/account/login');

  const candidate = await prisma.candidateAccount.findUnique({ where: { id: session.cid } });
  if (!candidate) redirect('/account/login');

  return (
    <div>
      <div style={{ background: '#EAF0F7', borderBottom: '1px solid #E3E7EC' }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', fontSize: 13, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span style={{ fontWeight: 800, color: '#0D2B4E' }}>{candidate.name}</span>
            <a href="/account" style={{ fontWeight: 700, color: '#0D2B4E' }}>My Space</a>
          </div>
          <CandidateLogoutButton variant="dashboard" />
        </div>
      </div>
      <div className="container" style={{ padding: '24px 16px 56px' }}>{children}</div>
    </div>
  );
}
