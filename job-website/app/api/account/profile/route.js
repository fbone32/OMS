const { prisma } = require('../../../../lib/db');
const { requireCandidate } = require('../../../../lib/candidate-auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    emailVerified: c.emailVerified,
    cvFileName: c.cvFileName,
    cvSizeBytes: c.cvSizeBytes,
    createdAt: c.createdAt,
  };
}

// Every query here is scoped to session.cid from the verified session
// cookie - never a client-supplied id - so one candidate can never read or
// edit another candidate's profile.
async function GET(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const candidate = await prisma.candidateAccount.findUnique({ where: { id: session.cid } });
  if (!candidate) return json({ error: 'Account not found.' }, { status: 404 });
  return json({ candidate: serialize(candidate) });
}

async function PATCH(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  if (!name) return json({ error: 'Name is required.', fieldErrors: { name: 'Name is required.' } }, { status: 400 });

  const candidate = await prisma.candidateAccount.update({
    where: { id: session.cid },
    data: { name, phone: phone || null },
  });

  return json({ ok: true, candidate: serialize(candidate) });
}

module.exports = { GET, PATCH };
