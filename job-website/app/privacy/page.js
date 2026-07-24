export const metadata = { title: 'Privacy Policy - OBA Careers' };

export default function PrivacyPage() {
  return (
    <div className="container" style={{ padding: '32px 16px 56px', maxWidth: 720 }}>
      <h1 style={{ color: '#0D2B4E' }}>Privacy Policy</h1>
      <p style={{ color: '#6B7684', fontSize: 13 }}>Last updated: 24 July 2026</p>

      <div className="card" style={{ lineHeight: 1.7, fontSize: 14.5 }}>
        <p>
          Open Base Africa ("OBA", "we", "us") collects the personal data you submit through
          this careers site, your name, phone number, email address, your written answer to
          "why are you a good fit," and your CV file, solely to evaluate you for the role you
          apply to and to contact you about your application.
        </p>
        <h2 style={{ fontSize: 16, color: '#0D2B4E' }}>What we collect</h2>
        <ul>
          <li>Full name, phone number, email address</li>
          <li>Your application answers and CV (PDF or Word document)</li>
          <li>If you create a My Space account: your password (stored as a secure hash, never in plain text) and any jobs you save</li>
          <li>Basic technical data (IP address) used only for spam/abuse prevention</li>
        </ul>
        <h2 style={{ fontSize: 16, color: '#0D2B4E' }}>How we use it</h2>
        <p>
          Your application is reviewed by OBA's HR team and, where relevant, shared internally
          with the hiring team for the role you applied to. We do not sell or share your data
          with third parties for marketing purposes.
        </p>
        <h2 style={{ fontSize: 16, color: '#0D2B4E' }}>Your rights (Ghana Data Protection Act, 2012, Act 843)</h2>
        <p>
          You have the right to access, correct, or request deletion of your personal data at
          any time.
        </p>
        <p>
          If you have a My Space account, you can exercise these rights yourself at any time
          from your <a href="/account">My Space dashboard</a>: download a full copy of your
          profile, applications, and saved jobs with "Request a copy of my data," or permanently
          delete your account with "Request account &amp; data deletion." Deleting your account
          removes your profile, CV on file, and saved jobs immediately; any job applications you
          submitted while signed in stay on record as the employer's own recruitment record (the
          same as a guest application) but are no longer linked back to your account.
        </p>
        <p>
          If you applied as a guest without an account, email{' '}
          <a href="mailto:privacy@openbaseafrica.com">privacy@openbaseafrica.com</a> with the
          email address you applied with. We will confirm deletion within a reasonable time,
          except where retention is required by law.
        </p>
        <h2 style={{ fontSize: 16, color: '#0D2B4E' }}>Data retention</h2>
        <p>
          Unsuccessful applications are retained for up to 12 months in case a similar role
          opens, then deleted, unless you ask us to delete them sooner.
        </p>
      </div>
    </div>
  );
}
