import { prisma } from '../lib/db';
import { effectiveStatus, serializeListing } from '../lib/jobs';

export const dynamic = 'force-dynamic'; // always reflect the latest listings/closing dates

const SHIFT_LABELS = { DAY: 'Day', NIGHT: 'Night', ROTATING: 'Rotating' };

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined) return 'Negotiable';
  return `${currency}${Number(amount).toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function jobPostingJsonLd(job) {
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.summary || job.description,
    datePosted: job.createdAt,
    validThrough: job.closingDate,
    employmentType: (job.employmentType || 'FULL_TIME').toUpperCase().replace(/[\s-]/g, '_'),
    hiringOrganization: {
      '@type': 'Organization',
      name: job.postingCompany || 'Open Base Africa',
    },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.branch, addressCountry: 'GH' },
    },
    baseSalary: job.salaryMonth
      ? {
          '@type': 'MonetaryAmount',
          currency: 'GHS',
          value: { '@type': 'QuantitativeValue', value: job.salaryMonth, unitText: 'MONTH' },
        }
      : undefined,
  };
}

export default async function HomePage({ searchParams }) {
  const q = (searchParams.q || '').trim();
  const branch = (searchParams.branch || '').trim();
  const shift = (searchParams.shift || '').trim();

  const allOpen = await prisma.jobListing.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  const openNow = allOpen.filter((l) => effectiveStatus(l) === 'OPEN');

  const branches = [...new Set(openNow.map((l) => l.branch))].sort();

  const filtered = openNow.filter((l) => {
    if (branch && l.branch !== branch) return false;
    if (shift && l.shift !== shift) return false;
    if (q && !`${l.title} ${l.branch}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const jobs = filtered.map(serializeListing);

  return (
    <div>
      <section style={{ background: '#0D2B4E', padding: '40px 0 64px' }}>
        <div className="container">
          <div style={{ color: '#C8960C', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', marginBottom: 8 }}>
            JOIN THE TEAM
          </div>
          <h1 style={{ color: '#fff', fontSize: 'clamp(24px, 5vw, 36px)', margin: '0 0 10px', fontWeight: 800 }}>
            Open roles at Open Base Africa
          </h1>
          <p style={{ color: '#C9D2DC', fontSize: 15, maxWidth: 520, marginBottom: 0 }}>
            Browse current openings across our branches and apply directly — no account needed.
          </p>
        </div>
      </section>

      <section className="container" style={{ marginTop: -40 }}>
        <form method="get" className="card" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <label className="field-label" htmlFor="q">Search</label>
              <input id="q" name="q" defaultValue={q} placeholder="Role or keyword" className="field-input" />
            </div>
            <div>
              <label className="field-label" htmlFor="branch">Location / branch</label>
              <select id="branch" name="branch" defaultValue={branch} className="field-input">
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="shift">Shift</label>
              <select id="shift" name="shift" defaultValue={shift} className="field-input">
                <option value="">Any shift</option>
                <option value="DAY">Day</option>
                <option value="NIGHT">Night</option>
                <option value="ROTATING">Rotating</option>
              </select>
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary">Search roles</button>
            {(q || branch || shift) && (
              <a href="/" className="btn btn-outline" style={{ marginLeft: 10 }}>Clear filters</a>
            )}
          </div>
        </form>
      </section>

      <section className="container" style={{ marginTop: 28, marginBottom: 56 }}>
        {jobs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🔍</div>
            <h2 style={{ margin: '0 0 8px', color: '#0D2B4E' }}>No roles match your search</h2>
            <p style={{ color: '#6B7684', fontSize: 14 }}>
              Try clearing your filters, or check back soon — new roles are posted regularly.
            </p>
            <a href="/" className="btn btn-outline" style={{ marginTop: 12 }}>Clear filters</a>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="listing-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Location</th>
                  <th>Shift</th>
                  <th>Salary / month</th>
                  <th>Closing date</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td data-label="Role">
                      <a href={`/jobs/${job.id}`} style={{ fontWeight: 700, color: '#0D2B4E', display: 'block' }}>
                        {job.title}
                      </a>
                      <span style={{ color: '#6B7684', fontSize: 12.5 }}>{job.employmentType}</span>
                    </td>
                    <td data-label="Location"><a href={`/jobs/${job.id}`}>{job.branch}</a></td>
                    <td data-label="Shift"><a href={`/jobs/${job.id}`}><span className="badge">{SHIFT_LABELS[job.shift]}</span></a></td>
                    <td data-label="Salary/month"><a href={`/jobs/${job.id}`}>{formatMoney(job.salaryMonth, job.salaryCurrency)}</a></td>
                    <td data-label="Closing"><a href={`/jobs/${job.id}`}>{formatDate(job.closingDate)}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {jobs.map((job) => (
        <script
          key={job.id}
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd(job)) }}
        />
      ))}
    </div>
  );
}
