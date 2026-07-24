import AccountSignupForm from '../../../components/AccountSignupForm';

export const metadata = { title: 'Create your account - OBA Jobs' };

export default function AccountSignupPage() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ color: '#C8960C', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 8, textAlign: 'center' }}>
          OBA JOBS MY SPACE
        </div>
        <AccountSignupForm />
      </div>
    </div>
  );
}
