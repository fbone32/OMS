import { Suspense } from 'react';
import AccountLoginForm from '../../../components/AccountLoginForm';

export const metadata = { title: 'Candidate sign in - OBA Jobs' };

export default function AccountLoginPage() {
  return (
    <Suspense fallback={null}>
      <AccountLoginForm />
    </Suspense>
  );
}
