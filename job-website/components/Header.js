export default function Header() {
  return (
    <header style={{ background: '#0D2B4E', borderBottom: '2px solid #C8960C' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/assets/anchored-o.png" alt="" width={30} height={30} style={{ borderRadius: 6 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>
            Open Base Africa <span style={{ color: '#C8960C' }}>Careers</span>
          </span>
        </a>
        <nav style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <a href="/" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Roles</a>
          <a href="/privacy" style={{ color: '#fff', fontSize: 13.5, fontWeight: 600 }}>Privacy</a>
          <a
            href="/admin/login"
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
            Staff sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
