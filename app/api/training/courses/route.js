const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { TRAINING_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { errorResponse } = requireRole(request, TRAINING_VIEW);
  if (errorResponse) return errorResponse;

  const [courses, cohorts] = await Promise.all([
    prisma.course.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.cohort.findMany({
      include: { course: true, completions: true },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  const coursesOut = courses.map((c) => ({
    id: c.id,
    name: c.name,
    modules: c.modules,
    durationHours: Number(c.durationHours),
    status: c.status,
  }));

  const cohortsOut = cohorts.map((c) => {
    const total = c.completions.length;
    const done = c.completions.filter((tc) => tc.status === 'COMPLETED').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return {
      id: c.id,
      name: c.name,
      courseName: c.course ? c.course.name : null,
      startDate: c.startDate,
      learnerCount: total,
      completedCount: done,
      pct,
    };
  });

  return json({ courses: coursesOut, cohorts: cohortsOut });
}

module.exports = { GET };
