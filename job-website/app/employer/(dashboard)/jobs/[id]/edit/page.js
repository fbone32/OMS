import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../../../../../lib/employer-auth';
import { prisma } from '../../../../../../lib/db';
import { serializeListing } from '../../../../../../lib/jobs';
import JobForm from '../../../../../../components/JobForm';

export const dynamic = 'force-dynamic';

export default async function EditEmployerJobPage({ params }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token);
  if (!session) redirect('/employer/login');

  // Scoped to (id AND employerId) together - an employer must never be
  // able to open another employer's listing by guessing its id in the URL.
  const listing = await prisma.jobListing.findFirst({ where: { id: params.id, employerId: session.eid } });
  if (!listing) notFound();
  const job = serializeListing(listing);

  return (
    <div>
      <h1 style={{ color: '#0D2B4E' }}>Edit role</h1>
      <JobForm jobId={job.id} initial={job} basePath="/api/employer/jobs" redirectPath="/employer/jobs" />
    </div>
  );
}
