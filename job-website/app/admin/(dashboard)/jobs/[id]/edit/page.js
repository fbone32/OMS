import { notFound } from 'next/navigation';
import { prisma } from '../../../../../../lib/db';
import { serializeListing } from '../../../../../../lib/jobs';
import JobForm from '../../../../../../components/JobForm';

export const dynamic = 'force-dynamic';

export default async function EditJobPage({ params }) {
  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) notFound();
  const job = serializeListing(listing);

  return (
    <div>
      <h1 style={{ color: '#0D2B4E' }}>Edit role</h1>
      <JobForm jobId={job.id} initial={job} />
    </div>
  );
}
