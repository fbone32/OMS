const { prisma } = require('../../../../lib/db');
const { requireCandidate } = require('../../../../lib/candidate-auth');

// Ghana Data Protection Act (Act 843) "right to access" self-service export
// - a downloadable JSON snapshot of everything tied to this candidate's own
// account: profile, applications, saved jobs. Scoped to session.cid only.
async function GET(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const candidate = await prisma.candidateAccount.findUnique({ where: { id: session.cid } });
  if (!candidate) {
    return new Response(JSON.stringify({ error: 'Account not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const [applications, savedJobs] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { candidateAccountId: session.cid },
      include: { jobListing: { include: { employer: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.savedJob.findMany({
      where: { candidateAccountId: session.cid },
      include: { jobListing: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    profile: {
      name: candidate.name,
      email: candidate.email,
      phone: candidate.phone,
      emailVerified: candidate.emailVerified,
      cvOnFile: candidate.cvFileName
        ? { fileName: candidate.cvFileName, sizeBytes: candidate.cvSizeBytes }
        : null,
      accountCreatedAt: candidate.createdAt,
    },
    applications: applications.map((a) => ({
      jobTitle: a.jobListing.title,
      branch: a.jobListing.branch,
      postingCompany: a.jobListing.employer ? a.jobListing.employer.companyName : a.jobListing.postingCompany,
      status: a.status,
      appliedAt: a.createdAt,
      cvFileName: a.cvFileName,
    })),
    savedJobs: savedJobs.map((s) => ({
      jobTitle: s.jobListing.title,
      branch: s.jobListing.branch,
      savedAt: s.createdAt,
    })),
  };

  return new Response(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="oba-jobs-my-data.json"',
    },
  });
}

module.exports = { GET };
