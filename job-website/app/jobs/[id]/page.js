import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '../../../lib/db';
import { effectiveStatus, serializeListing, publiclyVisibleWhere } from '../../../lib/jobs';
import { getSessionFromCookieStore } from '../../../lib/candidate-auth';
import SaveJobButton from '../../../components/SaveJobButton';

export const dynamic = 'force-dynamic';

const SHIFT_LABELS = { DAY: 'Day', NIGHT: 'Night', ROTATING: 'Rotating' };

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined) return 'Negotiable';
  return `${currency}${Number(amount).toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function generateMetadata({ params }) {
  const listing = await prisma.jobListing.findFirst({ where: publiclyVisibleWhere({ id: params.id }) });
  if (!listing) return { title: 'Role not found - OBA Careers' };
  return {
    title: `${listing.title} - OBA Careers`,
    description: listing.summary,
  };
}

export default async function JobDetailPage({ params }) {
  // Live filter, not a cached/denormalized flag - see lib/jobs.js
  // publiclyVisibleWhere for why this must be evaluated on every request.
  const listing = await prisma.jobListing.findFirst({ where: publiclyVisibleWhere({ id: params.id }) });
  if (!listing) notFound();

  const job = serializeListing(listing);
  const accepting = job.status === 'OPEN';

  const session = getSessionFromCookieStore(cookies());
  const savedJob = session
    ? await prisma.savedJob.findUnique({
        where: { candidateAccountId_jobListingId: { candidateAccountId: session.cid, jobListingId: job.id } },
      })
    : null;

  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.createdAt,
    validThrough: job.closingDate,
    employmentType: (job.employmentType || 'FULL_TIME').toUpperCase().replace(/[\s-]/g, '_'),
    hiringOrganization: { '@type': 'Organization', name: job.postingCompany },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.branch, addressCountry: 'GH' },
    },
    baseSalary: job.salaryMonth
      ? { '@type': 'MonetaryAmount', currency: 'GHS', value: { '@type': 'QuantitativeValue', value: job.salaryMonth, unitText: 'MONTH' } }
      : undefined,
  };

  return (
    <div className="container" style={{ padding: '32px 16px 56px' }}>
      <a href="/" style={{ fontSize: 13, fontWeight: 600 }}>&larr; All roles</a>

      <div style={{ marginTop: 16 }}>
        <div style={{ color: '#C8960C', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>
          {job.postingCompany.toUpperCase()}
        </div>
        <h1 style={{ margin: '6px 0 4px', color: '#0D2B4E', fontSize: 'clamp(22px, 4vw, 30px)' }}>{job.title}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <span className="badge">{job.employmentType}</span>
          <span className="badge">{job.branch}</span>
          <span className="badge">{SHIFT_LABELS[job.shift]} shift</span>
          {!accepting && <span className="badge" style={{ background: '#FBEAEA', color: '#C0392B' }}>Closed</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <SaveJobButton jobId={job.id} signedIn={!!session} initiallySaved={!!savedJob} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 24 }}>
        <div className="card">
          <div style={{ fontSize: 11.5, color: '#6B7684', fontWeight: 700, textTransform: 'uppercase' }}>Salary / month</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2B4E', marginTop: 4 }}>{formatMoney(job.salaryMonth, job.salaryCurrency)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: '#6B7684', fontWeight: 700, textTransform: 'uppercase' }}>Location</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2B4E', marginTop: 4 }}>{job.branch}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: '#6B7684', fontWeight: 700, textTransform: 'uppercase' }}>Shift</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2B4E', marginTop: 4 }}>{SHIFT_LABELS[job.shift]}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11.5, color: '#6B7684', fontWeight: 700, textTransform: 'uppercase' }}>Closing date</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0D2B4E', marginTop: 4 }}>{formatDate(job.closingDate)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, color: '#0D2B4E', marginTop: 0 }}>About this role</h2>
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14.5 }}>{job.description}</p>

        <h2 style={{ fontSize: 16, color: '#0D2B4E' }}>Requirements</h2>
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14.5 }}>{job.requirements}</p>
      </div>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        {accepting ? (
          <a href={`/jobs/${job.id}/apply`} className="btn btn-primary" style={{ width: '100%', maxWidth: 340 }}>
            Apply for this role
          </a>
        ) : (
          <div className="card" style={{ maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
            This role is no longer accepting applications.
          </div>
        )}
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
