const { prisma } = require('../../../../lib/db');
const { getSession, unauthorized } = require('../../../../lib/auth');

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.uid }, include: { employee: true } });
  if (!user) return unauthorized();

  return new Response(
    JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        employeeName: user.employee ? user.employee.name : null,
        employeeBranch: user.employee ? user.employee.branch : null,
        employeeJobTitle: user.employee ? user.employee.jobTitle : null,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

module.exports = { GET };
