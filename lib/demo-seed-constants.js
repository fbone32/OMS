// Single source of truth for the demo credentials shared by every seeded
// account (see prisma/seed.mjs), so the seed script and the production
// health check (app/api/health) can't drift out of sync with each other.
// "Demo1234!" is intentionally public — it's printed by the seed script's
// own console output and is the documented shared password for every demo
// account in this non-production showcase app, not a real secret.
const SEED_PASSWORD = 'Demo1234!';

// A stable, always-seeded account used by the health check's optional
// `?deep=1` check to prove, end-to-end and against the real database, that
// bootstrap (migrate + seed) actually succeeded — without accepting any
// caller-supplied credentials.
const HEALTH_CHECK_DEMO_EMAIL = 'admin@openbaseafrica.com';

module.exports = { SEED_PASSWORD, HEALTH_CHECK_DEMO_EMAIL };
