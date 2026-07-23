// Local-dev convenience seed — NOT run automatically during the Vercel
// build (see scripts/build.mjs), so production never gets seeded with demo
// listings behind your back. Run manually with `npm run db:seed` for local
// testing/demoing the public listings + apply flow before any real role has
// been posted through the admin panel.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.jobListing.findFirst({ where: { title: 'Customer Support Agent' } });
  if (existing) {
    console.log('Demo listing already exists — skipping seed.');
    return;
  }

  const future = new Date();
  future.setDate(future.getDate() + 30);

  await prisma.jobListing.create({
    data: {
      title: 'Customer Support Agent',
      branch: 'Accra HQ',
      shift: 'NIGHT',
      salaryMonth: 2800,
      summary: 'Handle inbound customer queries for our BPO clients, night shift, Accra HQ.',
      description:
        'As a Customer Support Agent you will handle inbound calls and chats for our clients, ' +
        'resolving queries professionally and logging every interaction accurately. This is a ' +
        'night-shift role based at our Accra HQ branch.',
      requirements:
        'At least 1 year of customer service experience. Clear spoken English. Comfortable working ' +
        'night shifts. Basic computer literacy.',
      closingDate: future,
    },
  });

  await prisma.jobListing.create({
    data: {
      title: 'QA Analyst',
      branch: 'Kumasi',
      shift: 'DAY',
      salaryMonth: 3500,
      summary: 'Audit customer interactions for quality and coach agents on improvements.',
      description:
        'The QA Analyst reviews recorded calls/chats against our quality rubric, logs scores, and ' +
        'partners with team leads on coaching plans for agents who need support.',
      requirements: 'Prior QA or team-lead experience in a BPO/call-centre environment preferred.',
      closingDate: future,
    },
  });

  console.log('Seeded 2 demo job listings.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
