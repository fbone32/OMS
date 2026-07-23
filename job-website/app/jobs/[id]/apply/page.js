import { notFound } from 'next/navigation';
import { prisma } from '../../../../lib/db';
import { isAcceptingApplications } from '../../../../lib/jobs';
import ApplyForm from '../../../../components/ApplyForm';

export const dynamic = 'force-dynamic';

export default async function ApplyPage({ params }) {
  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) notFound();

  const accepting = isAcceptingApplications(listing);

  return (
    <div className="container" style={{ padding: '32px 16px 56px', maxWidth: 640 }}>
      <a href={`/jobs/${listing.id}`} style={{ fontSize: 13, fontWeight: 600 }}>&larr; Back to role</a>
      <h1 style={{ color: '#0D2B4E', margin: '14px 0 4px', fontSize: 24 }}>Apply — {listing.title}</h1>
      <p style={{ color: '#6B7684', fontSize: 14, marginBottom: 20 }}>{listing.branch}</p>

      {accepting ? (
        <ApplyForm jobId={listing.id} jobTitle={listing.title} />
      ) : (
        <div className="card">This role is no longer accepting applications.</div>
      )}
    </div>
  );
}
