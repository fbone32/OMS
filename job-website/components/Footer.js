export default function Footer() {
  return (
    <footer style={{ background: '#0D2B4E', marginTop: 48, padding: '28px 16px', color: '#C9D2DC' }}>
      <div className="container" style={{ fontSize: 12.5, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
        <span>© {new Date().getFullYear()} Open Base Africa. All rights reserved.</span>
        <span>
          <a href="/privacy" style={{ color: '#C8960C' }}>Privacy Policy</a>
        </span>
      </div>
    </footer>
  );
}
