import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '../../../../lib/db';
import { isAcceptingApplications } from '../../../../lib/jobs';
import { SESSION_COOKIE, getSessionFromCookieStore } from '../../../../lib/candidate-auth';
import ApplyForm from '../../../../components/ApplyForm';

export const dynamic = 'force-dynamic';

export default async function ApplyPage({ params }) {
  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) notFound();

  const accepting = isAcceptingApplications(listing);

  // Optional prefill for a signed-in candidate - read directly from the DB
  // in this server component (no client round trip needed) since applying
  // never requires an account: a candidate with no session gets identical
  // initialValues/cvOnFile of null/undefined, i.e. today's guest behavior.
  const session = getSessionFromCookieStore(cookies());
  const candidate = session ? await prisma.candidateAccount.findUnique({ where: { id: session.cid } }) : null;

  return (
    <div className="container" style={{ padding: '32px 16px 56px', maxWidth: 640 }}>
      <a href={`/jobs/${listing.id}`} style={{ fontSize: 13, fontWeight: 600 }}>&larr; Back to role</a>
      <h1 style={{ color: '#0D2B4E', margin: '14px 0 4px', fontSize: 24 }}>Apply for {listing.title}</h1>
      <p style={{ color: '#6B7684', fontSize: 14, marginBottom: 20 }}>{listing.branch}</p>

      {accepting ? (
        <ApplyForm
          jobId={listing.id}
          jobTitle={listing.title}
          initialValues={candidate ? { fullName: candidate.name, phone: candidate.phone || '', email: candidate.email } : null}
          cvOnFile={candidate && candidate.cvFileName ? { fileName: candidate.cvFileName, sizeBytes: candidate.cvSizeBytes } : null}
        />
      ) : (
        <div className="card">This role is no longer accepting applications.</div>
      )}
    </div>
  );
}
