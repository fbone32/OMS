import { cookies } from 'next/headers';
import { prisma } from '../lib/db';
import { getSessionFromCookieStore } from '../lib/candidate-auth';
import CandidateLogoutButton from './CandidateLogoutButton';

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// Server component - reads the candidate session cookie directly (no
// existing admin/employer auth-state display to mirror here, Header was
// previously fully static) so a signed-in candidate sees their name and a
// My Space / Sign out link instead of the generic "Sign in" button.
export default async function Header() {
  const session = getSessionFromCookieStore(cookies());
  const candidate = session
    ? await prisma.candidateAccount.findUnique({ where: { id: session.cid }, select: { name: true } })
    : null;

  return (
    <header style={{ background: '#0D2B4E', borderBottom: '2px solid #C8960C' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', flexWrap: 'wrap', gap: 10 }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/assets/anchored-o.png" alt="" width={30} height={30} style={{ borderRadius: 6 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
            Open Base Africa <span style={{ color: '#C8960C' }}>Careers</span>
          </span>
        </a>
        <nav style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="/" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Roles</a>
          <a href="/employers" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>For Employers</a>
          <a href="/privacy" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Privacy</a>
          {candidate ? (
            <>
              <a href="/account" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%', background: '#C8960C', color: '#0D2B4E',
                    fontSize: 11, fontWeight: 800,
                  }}
                >
                  {initials(candidate.name) || '?'}
                </span>
                My Space
              </a>
              <CandidateLogoutButton />
            </>
          ) : (
            <a
              href="/sign-in"
              style={{
                color: '#0D2B4E',
                background: '#C8960C',
                fontSize: 13,
                fontWeight: 700,
                padding: '7px 14px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
