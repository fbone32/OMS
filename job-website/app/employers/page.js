import EmployerRegisterForm from '../../components/EmployerRegisterForm';

export const metadata = {
  title: 'For Employers - OBA Jobs',
  description: 'Post open roles and manage applicants on OBA Jobs.',
};

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Contact us',
    tagline: 'For companies posting their first few roles.',
    features: ['Up to 3 active job listings', 'Applicant tracking dashboard', 'Email support'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 'Contact us',
    tagline: 'For growing teams hiring regularly.',
    features: ['Up to 15 active job listings', 'Applicant tracking dashboard', 'Priority placement in search results', 'Priority email support'],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Contact us',
    tagline: 'For larger organizations with ongoing hiring needs.',
    features: ['Unlimited active job listings', 'Applicant tracking dashboard', 'Priority placement in search results', 'Dedicated account contact'],
  },
];

export default function EmployersPage() {
  return (
    <div>
      <section style={{ background: '#0D2B4E', padding: '40px 0 64px' }}>
        <div className="container">
          <div style={{ color: '#C8960C', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', marginBottom: 8 }}>
            FOR EMPLOYERS
          </div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(24px, 5vw, 36px)', margin: '0 0 10px', fontWeight: 800 }}>
            Post your open roles on OBA Jobs
          </h1>
          <p style={{ color: '#C9D2DC', fontSize: 15, maxWidth: 560, marginBottom: 0 }}>
            Reach candidates directly, manage your listings, and review applicants from one dashboard.
            Every new account is reviewed by our team before it goes live.
          </p>
          <a href="#register" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-flex' }}>
            Register your company
          </a>
        </div>
      </section>

      <section className="container" style={{ marginTop: -40, marginBottom: 48 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="card"
              style={plan.highlight ? { border: '2px solid #C8960C', position: 'relative' } : undefined}
            >
              {plan.highlight && (
                <span className="badge-gold badge" style={{ position: 'absolute', top: -12, left: 20 }}>Most popular</span>
              )}
              <h2 style={{ color: '#0D2B4E', fontSize: 18, margin: '4px 0 4px' }}>{plan.name}</h2>
              <div style={{ color: '#C8960C', fontWeight: 800, fontSize: 20, marginBottom: 6 }}>{plan.price}</div>
              <p style={{ color: '#6B7684', fontSize: 13, marginTop: 0, marginBottom: 14 }}>{plan.tagline}</p>
              <ul style={{ paddingLeft: 18, margin: 0, color: '#333', fontSize: 13.5, lineHeight: 1.8 }}>
                {plan.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <a href="#register" className="btn btn-outline btn-block" style={{ marginTop: 18 }}>Choose {plan.name}</a>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: '#6B7684', fontSize: 12.5, marginTop: 16 }}>
          Plans shown are informational for now. Our team will follow up on billing details after your
          registration is approved.
        </p>
      </section>

      <section className="container" style={{ marginBottom: 56, maxWidth: 640 }}>
        <EmployerRegisterForm />
        <p style={{ fontSize: 12.5, color: '#6B7684', textAlign: 'center', marginTop: 16 }}>
          Already registered and approved? <a href="/employer/login" style={{ fontWeight: 700 }}>Sign in here</a>.
        </p>
      </section>
    </div>
  );
}
