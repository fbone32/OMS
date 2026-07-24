import { prisma } from '../../../lib/db';
import { effectiveStatus } from '../../../lib/jobs';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const [listings, applicantCount, pendingSyncCount, newCount, pendingEmployerCount] = await Promise.all([
    prisma.jobListing.findMany(),
    prisma.jobApplication.count(),
    prisma.jobApplication.count({ where: { syncStatus: 'PENDING' } }),
    prisma.jobApplication.count({ where: { status: 'NEW' } }),
    prisma.employer.count({ where: { status: 'PENDING' } }),
  ]);
  const openCount = listings.filter((l) => effectiveStatus(l) === 'OPEN').length;

  const stats = [
    { label: 'Open roles', value: openCount },
    { label: 'Total applicants', value: applicantCount },
    { label: 'New / unreviewed', value: newCount },
    { label: 'Pending OMS sync', value: pendingSyncCount, warn: pendingSyncCount > 0 },
    { label: 'Pending employers', value: pendingEmployerCount, warn: pendingEmployerCount > 0 },
  ];

  return (
    <div>
      <h1 style={{ color: '#0D2B4E' }}>HR Admin Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 20 }}>
        {stats.map((s) => (
          <div className="card" key={s.label}>
            <div style={{ fontSize: 12, color: '#6B7684', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.warn ? '#C0392B' : '#0D2B4E', marginTop: 6 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <a href="/admin/jobs/new" className="btn btn-primary">+ Post a new role</a>
        <a href="/admin/applicants" className="btn btn-outline">Review applicants</a>
        <a href="/admin/employers" className="btn btn-outline">Review employers</a>
      </div>
    </div>
  );
}
