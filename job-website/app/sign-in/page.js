export const metadata = { title: 'Sign in - OBA Jobs' };

const OPTIONS = [
  {
    href: '/employer/login',
    label: 'Employer',
    desc: 'For approved employers managing their own job listings and applicants.',
  },
  {
    href: '/admin/login',
    label: 'Staff',
    desc: 'For Open Base Africa HR staff managing the careers site.',
  },
];

export default function SignInPage() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div style={{ color: '#C8960C', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8 }}>
          OBA JOBS
        </div>
        <h1 style={{ fontSize: 18, color: '#0D2B4E', marginTop: 0 }}>Sign in as</h1>
        <p style={{ color: '#6B7684', fontSize: 13, marginTop: -6, marginBottom: 20 }}>
          Choose the account type you want to sign in with.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {OPTIONS.map((opt) => (
            <a
              key={opt.href}
              href={opt.href}
              className="btn btn-outline"
              style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left', height: 'auto', padding: '14px 16px' }}
            >
              <span style={{ fontWeight: 800, fontSize: 15 }}>{opt.label}</span>
              <span style={{ fontWeight: 400, fontSize: 12, color: '#6B7684', marginTop: 2 }}>{opt.desc}</span>
            </a>
          ))}
        </div>

        <p style={{ fontSize: 12, color: '#6B7684', marginTop: 20, marginBottom: 0 }}>
          Not registered as an employer yet? <a href="/employers" style={{ fontWeight: 700 }}>Register your company</a>.
        </p>
      </div>
    </div>
  );
}
