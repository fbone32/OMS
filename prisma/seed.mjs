// Seeds enough Phase 1 (Core HR & Payroll) data to exercise every screen:
// PayrollSettings, employees across 5 branches, one real login per
// Phase-1-relevant role (+ BD/Board Advisor so the login screen's roles stay
// meaningful end to end), a couple of attendance records, one pending leave
// request, and one draft payroll run with payslips.
//
// All seeded accounts share the password documented below and in the final
// report — this is what you actually type in to test the app.
//
// IDEMPOTENT BY DESIGN: this script is wired into the Vercel build pipeline
// (scripts/vercel-build.mjs) and runs on every deploy, not just once, so it
// must be safe to run against a database that already has this data.
// Every write below is an upsert (or an explicit find-before-create for
// models with no natural unique key) keyed on a stable, human-meaningful
// field — never a bare `.create()` — so re-running this script updates
// existing rows in place instead of throwing a unique-constraint error or
// piling up duplicates.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SEED_PASSWORD } from '../lib/demo-seed-constants.js';
import { encryptSecret } from '../lib/vault-crypto.js';
import { computeInvoiceTax } from '../lib/invoice-tax.js';

const prisma = new PrismaClient();

// Same shape/logic as lib/payroll.js (duplicated here since this seed script
// runs as a standalone ESM entrypoint) — SSNIT on gross, PAYE on
// (gross - SSNIT employee) via cumulative bands.
function calculatePaye(taxableIncome, payeBands) {
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;
  let floor = 0;
  for (const band of payeBands) {
    const ceiling = band.upTo == null ? Infinity : band.upTo;
    const bandWidth = ceiling - floor;
    const sliceInBand = Math.max(0, Math.min(remaining, bandWidth));
    tax += sliceInBand * (band.rate / 100);
    remaining -= sliceInBand;
    floor = ceiling;
    if (remaining <= 0) break;
  }
  return tax;
}

function computePayslip(grossPay, settings) {
  const gross = Number(grossPay);
  const ssnitEmployee = gross * (Number(settings.ssnitEmployeeRatePct) / 100);
  const ssnitEmployer = gross * (Number(settings.ssnitEmployerRatePct) / 100);
  const taxableIncome = Math.max(0, gross - ssnitEmployee);
  const payeTax = calculatePaye(taxableIncome, settings.payeBands);
  const netPay = gross - ssnitEmployee - payeTax;
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    grossPay: round2(gross),
    ssnitEmployee: round2(ssnitEmployee),
    ssnitEmployer: round2(ssnitEmployer),
    payeTax: round2(payeTax),
    netPay: round2(netPay),
  };
}

async function main() {
  console.log('Seeding PayrollSettings (placeholder Ghana rates — see notes)...');
  const payeBands = [
    { upTo: 490, rate: 0 },
    { upTo: 600, rate: 5 },
    { upTo: 730, rate: 10 },
    { upTo: 3896.67, rate: 17.5 },
    { upTo: 19896.67, rate: 25 },
    { upTo: 50416.67, rate: 30 },
    { upTo: null, rate: 35 },
  ];
  // PayrollSettings has no natural unique key (it's a single evolving row of
  // statutory rates, not a lookup table) — idempotency here means "create
  // the placeholder rates once, then leave whatever's there alone," since a
  // real deploy might have since had a Director edit these via the app, and
  // re-running seed must never clobber a real edit.
  let settings = await prisma.payrollSettings.findFirst();
  if (!settings) {
    settings = await prisma.payrollSettings.create({
      data: {
        ssnitEmployeeRatePct: 5.5,
        ssnitEmployerRatePct: 13.0,
        payeBands,
        notes:
          'PLACEHOLDER rates for demo purposes only — approximate current-ish Ghana SSNIT (5.5% employee / 13% employer) ' +
          'and GRA monthly PAYE bands. NOT yet signed off by an accountant; verify against current GRA guidance before ' +
          'running real payroll (see brief’s own compliance note).',
      },
    });
  } else {
    console.log('PayrollSettings already exist — leaving as-is (may have been edited since seeding).');
  }

  const BRANCHES = ['Accra HQ', 'Kumasi', 'Takoradi', 'Tema', 'Tamale'];

  console.log('Seeding employees...');
  const employeeDefs = [
    { name: 'Kelvin Nana Boateng', role: 'DIRECTOR', email: 'admin@openbaseafrica.com', jobTitle: 'Director', branch: 'Accra HQ', startDate: '2019-01-06', salaryGross: 14000, bankName: 'Ecobank Ghana', bankAccountNumber: '1441220088901', emergencyContactName: 'Kofi Owusu', emergencyContactPhone: '024 111 2233', emergencyContactRelation: 'Spouse' },
    { name: 'Fred Bonney', role: 'HR_OFFICER', email: 'openbaseafrica@gmail.com', jobTitle: 'HR Officer', branch: 'Accra HQ', startDate: '2021-03-15', salaryGross: 6200, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 222 3344', emergencyContactName: 'Yaa Mensah', emergencyContactPhone: '024 222 5566', emergencyContactRelation: 'Sister' },
    { name: 'Kofi Safo', role: 'BUSINESS_DEVELOPMENT', email: 'info@openbaseafrica.com', jobTitle: 'Business Development', branch: 'Accra HQ', startDate: '2022-05-02', salaryGross: 4800, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '020 333 4455', emergencyContactName: 'Efua Boateng', emergencyContactPhone: '020 333 6677', emergencyContactRelation: 'Spouse' },
    { name: 'Kwabena Owusu', role: 'OPERATIONS_MANAGER', email: 'kwabena.owusu@openbaseafrica.com', jobTitle: 'Ops Manager', branch: 'Kumasi', startDate: '2020-02-11', salaryGross: 5600, bankName: 'GCB Bank', bankAccountNumber: '2201004455', emergencyContactName: 'Adjoa Owusu', emergencyContactPhone: '027 444 5566', emergencyContactRelation: 'Spouse' },
    { name: 'Abena Darko', role: 'ACCOUNTANT', email: 'abena.darko@openbaseafrica.com', jobTitle: 'Accountant', branch: 'Accra HQ', startDate: '2021-07-19', salaryGross: 5100, bankName: 'Ecobank Ghana', bankAccountNumber: '1441229900', emergencyContactName: 'Kojo Darko', emergencyContactPhone: '020 555 6677', emergencyContactRelation: 'Brother' },
    { name: 'Nana Adjei', role: 'IT_FACILITIES', email: 'nana.adjei@openbaseafrica.com', jobTitle: 'IT & Facilities Lead', branch: 'Accra HQ', startDate: '2022-01-10', salaryGross: 4700, mobileMoneyProvider: 'Vodafone Cash', mobileMoneyNumber: '050 666 7788', emergencyContactName: 'Esi Adjei', emergencyContactPhone: '050 666 9900', emergencyContactRelation: 'Spouse' },
    { name: 'Yaw Asante', role: 'SUPERVISOR', email: 'yaw.asante@openbaseafrica.com', jobTitle: 'Supervisor', branch: 'Accra HQ', startDate: '2022-02-14', salaryGross: 3400, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 777 8899', emergencyContactName: 'Abena Asante', emergencyContactPhone: '024 777 1122', emergencyContactRelation: 'Spouse' },
    { name: 'Kojo Bediako', role: 'EMPLOYEE', email: 'kojo.bediako@openbaseafrica.com', jobTitle: 'Support Agent', branch: 'Accra HQ', startDate: '2025-03-10', salaryGross: 2300, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 888 9911', emergencyContactName: 'Ama Bediako', emergencyContactPhone: '024 888 2233', emergencyContactRelation: 'Mother' },
    { name: 'Ama Serwaa', role: null, jobTitle: 'QA Analyst', branch: 'Accra HQ', startDate: '2024-01-15', salaryGross: 2800 },
    { name: 'Kwame Owusu', role: null, jobTitle: 'Team Lead', branch: 'Kumasi', startDate: '2023-06-01', salaryGross: 3600 },
    { name: 'Efua Mensah-Bonsu', role: null, jobTitle: 'Support Agent', branch: 'Takoradi', startDate: '2025-09-02', salaryGross: 2250 },
    { name: 'Abena Boateng', role: null, jobTitle: 'Support Agent', branch: 'Tema', startDate: '2024-11-11', salaryGross: 2250 },
    { name: 'Kwabena Darko', role: null, jobTitle: 'Trainer', branch: 'Tamale', startDate: '2023-04-20', salaryGross: 3100 },
  ];

  // Employee has no @unique field in the schema, so re-running this seed
  // needs a stable way to find "the same" row across reruns even when a
  // person's display name changes (e.g. swapping a placeholder for a real
  // employee's real name). For the 8 employees tied to a login account, the
  // stable key is that account's EMAIL — not Role. (An earlier version of
  // this file keyed on Role instead, which is unique for DIRECTOR/HR_OFFICER/
  // BUSINESS_DEVELOPMENT/OPERATIONS_MANAGER/ACCOUNTANT/IT_FACILITIES/
  // SUPERVISOR in this org chart, but is NOT unique for EMPLOYEE — any other
  // account onboarded with role EMPLOYEE, e.g. through the ordinary Add-
  // Employee flow or a Recruitment hire, makes `findFirst({where:{role:
  // 'EMPLOYEE'}})` return an arbitrary EMPLOYEE-role user, silently
  // overwriting the WRONG employee's row on the next deploy. Caught locally
  // during Phase 2 verification when leftover test accounts triggered
  // exactly that collision — fixed here by matching on email, which is
  // @unique on User and never ambiguous.) Employees with no login (role:
  // null) fall back to matching by name, same as before — fine since those
  // were never subject to a rename here.
  const employees = {};
  for (const def of employeeDefs) {
    const data = {
      name: def.name,
      jobTitle: def.jobTitle,
      branch: def.branch,
      startDate: new Date(def.startDate),
      salaryGross: def.salaryGross,
      bankName: def.bankName || null,
      bankAccountNumber: def.bankAccountNumber || null,
      mobileMoneyProvider: def.mobileMoneyProvider || null,
      mobileMoneyNumber: def.mobileMoneyNumber || null,
      emergencyContactName: def.emergencyContactName || null,
      emergencyContactPhone: def.emergencyContactPhone || null,
      emergencyContactRelation: def.emergencyContactRelation || null,
    };
    let existing = null;
    if (def.email) {
      const existingUser = await prisma.user.findUnique({ where: { email: def.email }, select: { employeeId: true } });
      if (existingUser && existingUser.employeeId) {
        existing = await prisma.employee.findUnique({ where: { id: existingUser.employeeId } });
      }
    }
    if (!existing) {
      existing = await prisma.employee.findFirst({ where: { name: def.name } });
    }
    const emp = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data })
      : await prisma.employee.create({ data });
    employees[def.name] = emp;
  }

  console.log('Seeding user accounts (all share password: ' + SEED_PASSWORD + ')...');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userDefs = [
    { email: 'admin@openbaseafrica.com', role: 'DIRECTOR', employee: 'Kelvin Nana Boateng' },
    { email: 'openbaseafrica@gmail.com', role: 'HR_OFFICER', employee: 'Fred Bonney' },
    { email: 'info@openbaseafrica.com', role: 'BUSINESS_DEVELOPMENT', employee: 'Kofi Safo' },
    { email: 'kwabena.owusu@openbaseafrica.com', role: 'OPERATIONS_MANAGER', employee: 'Kwabena Owusu' },
    { email: 'abena.darko@openbaseafrica.com', role: 'ACCOUNTANT', employee: 'Abena Darko' },
    { email: 'nana.adjei@openbaseafrica.com', role: 'IT_FACILITIES', employee: 'Nana Adjei' },
    { email: 'yaw.asante@openbaseafrica.com', role: 'SUPERVISOR', employee: 'Yaw Asante' },
    { email: 'tina@openbaseafrica.com', role: 'BOARD_ADVISOR', employee: null },
    { email: 'kojo.bediako@openbaseafrica.com', role: 'EMPLOYEE', employee: 'Kojo Bediako' },
  ];
  const users = {};
  for (const def of userDefs) {
    const employeeId = def.employee ? employees[def.employee].id : null;
    // employeeId is the stable identity for accounts tied to an employee —
    // upsert on THAT (not email) so changing an account's email in this
    // file updates the existing row in place instead of colliding with the
    // employeeId unique constraint by trying to create a second row for
    // the same employee. Accounts with no employee (Board Advisor) have no
    // employeeId to key on, so those fall back to email.
    const user = employeeId
      ? await prisma.user.upsert({
          where: { employeeId },
          update: { email: def.email, passwordHash, role: def.role },
          create: { email: def.email, passwordHash, role: def.role, employeeId },
        })
      : await prisma.user.upsert({
          where: { email: def.email },
          update: { passwordHash, role: def.role, employeeId },
          create: { email: def.email, passwordHash, role: def.role, employeeId },
        });
    users[def.role] = user;
  }

  console.log('Seeding attendance records...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const clockIn = new Date(today);
  clockIn.setHours(7, 52);
  // @@unique([employeeId, date]) — a real upsert, and also just correct
  // behavior for "today's attendance" specifically: re-running seed later
  // the same day should update, not duplicate, that day's record.
  await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: employees['Kojo Bediako'].id, date: today } },
    update: { clockIn, status: 'ON_TIME' },
    create: { employeeId: employees['Kojo Bediako'].id, date: today, clockIn, status: 'ON_TIME' },
  });
  const lateClockIn = new Date(today);
  lateClockIn.setHours(8, 24);
  await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: employees['Yaw Asante'].id, date: today } },
    update: { clockIn: lateClockIn, status: 'LATE' },
    create: { employeeId: employees['Yaw Asante'].id, date: today, clockIn: lateClockIn, status: 'LATE' },
  });

  console.log('Seeding one pending leave request...');
  const leaveStart = new Date(today);
  leaveStart.setDate(leaveStart.getDate() + 7);
  const leaveEnd = new Date(today);
  leaveEnd.setDate(leaveEnd.getDate() + 9);
  // LeaveRequest has no natural unique key. Guard idempotency with a
  // find-first check instead: if Kojo already has a pending annual leave
  // request seeded, don't create a second one on the next deploy.
  const existingLeave = await prisma.leaveRequest.findFirst({
    where: { employeeId: employees['Kojo Bediako'].id, type: 'ANNUAL', status: 'PENDING' },
  });
  if (!existingLeave) {
    await prisma.leaveRequest.create({
      data: {
        employeeId: employees['Kojo Bediako'].id,
        type: 'ANNUAL',
        startDate: leaveStart,
        endDate: leaveEnd,
        days: 3,
        status: 'PENDING',
        reason: 'Family event upcountry',
      },
    });
  } else {
    console.log('Pending leave request already seeded for Kojo Bediako — skipping.');
  }

  console.log('Seeding one draft payroll run with payslips...');
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  // PayrollRun.period is @unique — a real upsert (one run per calendar
  // month; re-deploying within the same month reuses it).
  const run = await prisma.payrollRun.upsert({
    where: { period },
    update: {},
    create: { period, createdByUserId: users.ACCOUNTANT.id },
  });
  for (const emp of Object.values(employees)) {
    const figures = computePayslip(emp.salaryGross, settings);
    // @@unique([payrollRunId, employeeId]) — a real upsert.
    await prisma.payslip.upsert({
      where: { payrollRunId_employeeId: { payrollRunId: run.id, employeeId: emp.id } },
      update: {
        grossPay: figures.grossPay,
        ssnitEmployee: figures.ssnitEmployee,
        ssnitEmployer: figures.ssnitEmployer,
        payeTax: figures.payeTax,
        netPay: figures.netPay,
      },
      create: {
        payrollRunId: run.id,
        employeeId: emp.id,
        grossPay: figures.grossPay,
        overtimePay: 0,
        otherDeductions: 0,
        ssnitEmployee: figures.ssnitEmployee,
        ssnitEmployer: figures.ssnitEmployer,
        payeTax: figures.payeTax,
        netPay: figures.netPay,
      },
    });
  }

  console.log('Seeding company-wide/employee documents...');
  // Document has no natural unique key. Guard idempotency with a find-first
  // check on (employeeId, fileName) instead of a bare create.
  const docDefs = [
    {
      employeeId: null,
      category: 'SOP',
      fileName: 'SOP - Escalations.txt',
      mimeType: 'text/plain',
      sizeBytes: 512,
      body: 'Standard procedure for escalating unresolved tickets.',
      signed: false,
      notes: 'Standard procedure for escalating unresolved tickets.',
      uploadedByUserId: users.HR_OFFICER.id,
    },
    {
      employeeId: employees['Kojo Bediako'].id,
      category: 'CONTRACT',
      fileName: 'Employment Contract - Kojo Bediako.txt',
      mimeType: 'text/plain',
      sizeBytes: 256,
      body: 'Signed employment contract on file.',
      signed: true,
      notes: 'Signed employment contract on file.',
      uploadedByUserId: users.HR_OFFICER.id,
    },
  ];
  for (const doc of docDefs) {
    const existingDoc = await prisma.document.findFirst({
      where: { employeeId: doc.employeeId, fileName: doc.fileName },
    });
    if (existingDoc) continue;
    await prisma.document.create({
      data: {
        employeeId: doc.employeeId,
        category: doc.category,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        fileDataUrl: 'data:text/plain;base64,' + Buffer.from(doc.body).toString('base64'),
        signed: doc.signed,
        notes: doc.notes,
        uploadedByUserId: doc.uploadedByUserId,
      },
    });
  }

  // ============== Phase 2 (Operations & Performance) ==============

  console.log('Seeding KPI targets (Director-editable, real actuals computed live)...');
  // @unique on metricKey — a real upsert.
  const kpiTargetDefs = [
    { metricKey: 'ATTENDANCE', label: 'Attendance', targetValue: 95, unit: '%' },
    { metricKey: 'QA_SCORE', label: 'QA score', targetValue: 90, unit: 'pts' },
  ];
  for (const t of kpiTargetDefs) {
    await prisma.kpiTarget.upsert({
      where: { metricKey: t.metricKey },
      update: {},
      create: t,
    });
  }

  console.log('Seeding training course catalogue and cohorts...');
  // Course.name and Cohort.name are @unique — real upserts.
  const courseDefs = [
    { name: 'Customer Support Fundamentals', modules: 6, durationHours: 4, status: 'LIVE' },
    { name: 'QA Scoring & Calibration', modules: 4, durationHours: 2.5, status: 'LIVE' },
    { name: 'Leadership for Team Leads', modules: 8, durationHours: 6, status: 'LIVE' },
    { name: 'Data Protection Act 843', modules: 3, durationHours: 1.5, status: 'MANDATORY' },
  ];
  const courses = {};
  for (const c of courseDefs) {
    courses[c.name] = await prisma.course.upsert({
      where: { name: c.name },
      update: { modules: c.modules, durationHours: c.durationHours, status: c.status },
      create: c,
    });
  }
  const cohortDefs = [
    { name: 'July onboarding cohort', course: 'Customer Support Fundamentals' },
    { name: 'QA calibration refresh', course: 'QA Scoring & Calibration' },
    { name: 'Data protection compliance', course: 'Data Protection Act 843' },
  ];
  const cohorts = {};
  for (const c of cohortDefs) {
    cohorts[c.name] = await prisma.cohort.upsert({
      where: { name: c.name },
      update: { courseId: courses[c.course].id },
      create: { name: c.name, courseId: courses[c.course].id },
    });
  }
  // TrainingCompletion has @@unique([employeeId, courseId]) — real upserts.
  // A handful of real completions across the seeded roster so the Training
  // screen's completion ring/cohort bars reflect genuine data, not a
  // fabricated percentage.
  const trainingCompletionDefs = [
    { employee: 'Kojo Bediako', course: 'Customer Support Fundamentals', cohort: 'July onboarding cohort', status: 'COMPLETED' },
    { employee: 'Yaw Asante', course: 'Data Protection Act 843', cohort: 'Data protection compliance', status: 'COMPLETED' },
    { employee: 'Kwabena Owusu', course: 'Leadership for Team Leads', status: 'IN_PROGRESS' },
    { employee: 'Abena Darko', course: 'Data Protection Act 843', cohort: 'Data protection compliance', status: 'IN_PROGRESS' },
  ];
  for (const d of trainingCompletionDefs) {
    const employeeId = employees[d.employee].id;
    const courseId = courses[d.course].id;
    const cohortId = d.cohort ? cohorts[d.cohort].id : null;
    await prisma.trainingCompletion.upsert({
      where: { employeeId_courseId: { employeeId, courseId } },
      update: { status: d.status, cohortId, completedAt: d.status === 'COMPLETED' ? new Date() : null, recordedByUserId: users.HR_OFFICER.id },
      create: { employeeId, courseId, cohortId, status: d.status, completedAt: d.status === 'COMPLETED' ? new Date() : null, recordedByUserId: users.HR_OFFICER.id },
    });
  }

  console.log('Seeding QA audits...');
  // QaAudit has no natural unique key. Guard idempotency with a find-first
  // check on (employeeId, ticketRef) instead of a bare create.
  const qaAuditDefs = [
    { employee: 'Kojo Bediako', ticketRef: 'TCK-4201', score: 92, note: 'Great empathy, followed script.' },
    { employee: 'Yaw Asante', ticketRef: 'TCK-4188', score: 88, note: 'Missed verification step.' },
  ];
  for (const a of qaAuditDefs) {
    const employeeId = employees[a.employee].id;
    const exists = await prisma.qaAudit.findFirst({ where: { employeeId, ticketRef: a.ticketRef } });
    if (exists) continue;
    await prisma.qaAudit.create({
      data: { employeeId, ticketRef: a.ticketRef, score: a.score, note: a.note, auditedByUserId: users.OPERATIONS_MANAGER.id },
    });
  }

  console.log('Seeding one incident (open) for the Incidents screen...');
  // Incident has no natural unique key. Guard idempotency with a find-first
  // check on (employeeId, type, detail) instead of a bare create.
  const incidentDefs = [
    {
      employee: 'Yaw Asante',
      type: 'LATENESS',
      severity: 'LOW',
      detail: 'Third lateness this month, over 15 minutes.',
      action: 'Verbal warning issued',
    },
  ];
  for (const inc of incidentDefs) {
    const employeeId = employees[inc.employee].id;
    const exists = await prisma.incident.findFirst({ where: { employeeId, type: inc.type, detail: inc.detail } });
    if (exists) continue;
    await prisma.incident.create({
      data: {
        employeeId,
        type: inc.type,
        severity: inc.severity,
        detail: inc.detail,
        action: inc.action,
        ownerUserId: users.OPERATIONS_MANAGER.id,
      },
    });
  }

  console.log('Seeding a second SOP version (Escalations v2)...');
  // Real versioning chain on the existing company-wide "SOP - Escalations"
  // document — guard idempotency by checking whether a v2 already
  // supersedes it, rather than creating a new chain link on every deploy.
  const sopV1 = await prisma.document.findFirst({ where: { employeeId: null, fileName: 'SOP - Escalations.txt' } });
  if (sopV1) {
    const alreadyHasV2 = await prisma.document.findFirst({ where: { supersedesId: sopV1.id } });
    if (!alreadyHasV2) {
      const v2Body = 'Standard procedure for escalating unresolved tickets — v2: adds a 2-hour response SLA for Tier 1 escalations.';
      await prisma.document.create({
        data: {
          employeeId: null,
          category: 'SOP',
          fileName: sopV1.fileName,
          mimeType: 'text/plain',
          sizeBytes: Buffer.byteLength(v2Body),
          fileDataUrl: 'data:text/plain;base64,' + Buffer.from(v2Body).toString('base64'),
          signed: false,
          notes: v2Body,
          uploadedByUserId: users.HR_OFFICER.id,
          version: sopV1.version + 1,
          supersedesId: sopV1.id,
        },
      });
    }
  }

  console.log('Seeding recruitment pipeline (job opening + candidates across every stage)...');
  // JobOpening has no natural unique key. Guard idempotency with a
  // find-first check on (title, branch) instead of a bare create.
  let jobOpening = await prisma.jobOpening.findFirst({ where: { title: 'Support Agent · Night shift', branch: 'Accra HQ' } });
  if (!jobOpening) {
    jobOpening = await prisma.jobOpening.create({
      data: { title: 'Support Agent · Night shift', branch: 'Accra HQ', openings: 3, createdByUserId: users.HR_OFFICER.id },
    });
  }
  // Candidate has no natural unique key — email is the real-world unique
  // identifier for a person applying, so guard idempotency on that.
  const candidateDefs = [
    { name: 'Priscilla Amoah', email: 'priscilla.amoah@example.com', phone: '024 555 0192', roleTitle: 'Support Agent · Night shift', stage: 'APPLIED', experience: '2 yrs customer support', education: 'BA, University of Ghana', notes: 'Strong phone manner, referred by Kwame Owusu.' },
    { name: 'Richmond Boateng', email: 'richmond.b@example.com', phone: '020 444 8871', roleTitle: 'Support Agent · Night shift', stage: 'APPLIED', experience: '1 yr call centre', education: 'HND, Accra Technical', notes: 'Applied via job board, awaiting screening call.' },
    { name: 'Sandra Owusu', email: 'sandra.owusu@example.com', phone: '027 112 3345', roleTitle: 'QA Analyst', stage: 'SCREENING', experience: '3 yrs QA in BPO', education: 'BSc, KNUST', notes: 'Screening call booked.' },
    { name: 'Michael Asare', email: 'michael.asare@example.com', phone: '055 998 2211', roleTitle: 'Support Agent · Night shift', stage: 'INTERVIEW', experience: '4 yrs support', education: 'BA, UCC', notes: 'Panel interview scheduled with Yaw Asante.' },
    { name: 'Grace Adjei', email: 'grace.adjei@example.com', phone: '024 776 6600', roleTitle: 'Team Lead', stage: 'OFFER', experience: '6 yrs, 2 as lead', education: 'BSc, GIMPA', notes: 'Offer sent, awaiting response.' },
  ];
  for (const c of candidateDefs) {
    const exists = await prisma.candidate.findFirst({ where: { email: c.email } });
    if (exists) continue;
    await prisma.candidate.create({
      data: {
        name: c.name, email: c.email, phone: c.phone, jobOpeningId: jobOpening.id, roleTitle: c.roleTitle,
        stage: c.stage, experience: c.experience, education: c.education, notes: c.notes,
      },
    });
  }

  // ============== Phase 3 (Client Portal & Assets — real parts only) ==============
  // Client Portal itself stays mock (needs a real Client entity from the
  // Phase 4 Sales & CRM "convert deal to client" flow) — nothing seeded here
  // for it. Everything below is Asset Tracking / IT & Facilities.

  console.log('Seeding asset register...');
  // Asset.tag is @unique — a real upsert.
  const assetDefs = [
    { name: 'Dell Latitude 5440', tag: 'OBA-LT-0142', category: 'Laptop', branch: 'Kumasi', condition: 'GOOD', assignTo: 'Kwame Owusu' },
    { name: 'iPhone SE', tag: 'OBA-PH-0088', category: 'Phone', branch: 'Accra HQ', condition: 'GOOD', assignTo: 'Ama Serwaa' },
    { name: 'Jabra Headset', tag: 'OBA-HS-0311', category: 'Headset', branch: 'Takoradi', condition: 'NEEDS_REPAIR', assignTo: 'Kojo Bediako' },
    { name: 'HP LaserJet Pro', tag: 'OBA-PR-0021', category: 'Printer', branch: 'Accra HQ', condition: 'FAIR', assignTo: null },
    { name: 'Dell Latitude 5440', tag: 'OBA-LT-0203', category: 'Laptop', branch: 'Tema', condition: 'GOOD', assignTo: 'Abena Boateng' },
    { name: 'Ergonomic chair', tag: 'OBA-FR-0450', category: 'Furniture', branch: 'Tamale', condition: 'GOOD', assignTo: null },
  ];
  for (const a of assetDefs) {
    const assignedToEmployeeId = a.assignTo ? employees[a.assignTo].id : null;
    await prisma.asset.upsert({
      where: { tag: a.tag },
      update: {
        name: a.name, category: a.category, branch: a.branch, condition: a.condition,
        status: assignedToEmployeeId ? 'ASSIGNED' : 'IN_STORAGE',
        assignedToEmployeeId,
        assignedAt: assignedToEmployeeId ? new Date() : null,
        assignedByUserId: assignedToEmployeeId ? users.IT_FACILITIES.id : null,
      },
      create: {
        name: a.name, tag: a.tag, category: a.category, branch: a.branch, condition: a.condition,
        status: assignedToEmployeeId ? 'ASSIGNED' : 'IN_STORAGE',
        assignedToEmployeeId,
        assignedAt: assignedToEmployeeId ? new Date() : null,
        assignedByUserId: assignedToEmployeeId ? users.IT_FACILITIES.id : null,
        registeredByUserId: users.IT_FACILITIES.id,
      },
    });
  }

  console.log('Seeding IT ticket queue...');
  // ITTicket has no natural unique key. Guard idempotency with a find-first
  // check on `title` instead of a bare create.
  const ticketDefs = [
    { title: 'Wifi down · Kumasi floor 2', branch: 'Kumasi', priority: 'HIGH', status: 'OPEN' },
    { title: 'Printer offline · Accra HQ', branch: 'Accra HQ', priority: 'MEDIUM', status: 'IN_PROGRESS' },
    { title: 'New monitor request · Takoradi', branch: 'Takoradi', priority: 'LOW', status: 'DONE' },
    { title: 'VPN certificate expiring', branch: 'All branches', priority: 'HIGH', status: 'OPEN' },
  ];
  for (const t of ticketDefs) {
    const exists = await prisma.iTTicket.findFirst({ where: { title: t.title } });
    if (exists) continue;
    await prisma.iTTicket.create({
      data: {
        title: t.title, branch: t.branch, priority: t.priority, status: t.status,
        reportedByUserId: users.IT_FACILITIES.id,
        startedAt: t.status !== 'OPEN' ? new Date() : null,
        closedAt: t.status === 'DONE' ? new Date() : null,
        resolvedByUserId: t.status === 'DONE' ? users.IT_FACILITIES.id : null,
      },
    });
  }

  console.log('Seeding branch systems status...');
  // SystemStatus.name is @unique — a real upsert.
  const systemDefs = [
    { name: 'Core telephony (VOIP)', detail: 'All branches', status: 'ONLINE' },
    { name: 'CRM / ticketing', detail: 'Cloud-hosted', status: 'ONLINE' },
    { name: 'Payroll system', detail: 'Cloud-hosted', status: 'ONLINE' },
    { name: 'Kumasi branch wifi', detail: 'Floor 2 outage', status: 'DEGRADED' },
    { name: 'Backup power (Accra HQ)', detail: 'Generator + UPS', status: 'ONLINE' },
  ];
  for (const s of systemDefs) {
    await prisma.systemStatus.upsert({
      where: { name: s.name },
      update: { detail: s.detail, status: s.status },
      create: { name: s.name, detail: s.detail, status: s.status, updatedByUserId: users.IT_FACILITIES.id },
    });
  }

  console.log('Seeding maintenance schedule...');
  // MaintenanceTask has no natural unique key. Guard idempotency with a
  // find-first check on `task` + `location`.
  const maintenanceDefs = [
    { task: 'Generator service', location: 'Accra HQ', dueLabel: 'Fri 24 Jul', status: 'SCHEDULED' },
    { task: 'AC servicing', location: 'Kumasi', dueLabel: 'Mon 27 Jul', status: 'SCHEDULED' },
    { task: 'Network cabling audit', location: 'Takoradi', dueLabel: '3 Aug', status: 'SCHEDULED' },
    { task: 'Fire extinguisher check', location: 'All branches', dueLabel: 'Completed', status: 'DONE' },
  ];
  for (const m of maintenanceDefs) {
    const exists = await prisma.maintenanceTask.findFirst({ where: { task: m.task, location: m.location } });
    if (exists) continue;
    await prisma.maintenanceTask.create({
      data: {
        task: m.task, location: m.location, dueLabel: m.dueLabel, status: m.status,
        createdByUserId: users.IT_FACILITIES.id,
        completedAt: m.status === 'DONE' ? new Date() : null,
      },
    });
  }

  console.log('Seeding procurement requests...');
  // ProcurementRequest has no natural unique key. Guard idempotency with a
  // find-first check on `item` + `reason`.
  const procurementDefs = [
    { item: '5 × monitors', costLabel: 'GH₵ 6,200', reason: 'New Accra HQ desks', status: 'PENDING' },
    { item: 'UPS backup unit', costLabel: 'GH₵ 4,800', reason: 'Kumasi power outages', status: 'APPROVED' },
  ];
  for (const p of procurementDefs) {
    const exists = await prisma.procurementRequest.findFirst({ where: { item: p.item, reason: p.reason } });
    if (exists) continue;
    await prisma.procurementRequest.create({
      data: {
        item: p.item, costLabel: p.costLabel, reason: p.reason, status: p.status,
        requestedByUserId: users.IT_FACILITIES.id,
        decidedByUserId: p.status !== 'PENDING' ? users.DIRECTOR.id : null,
        decidedAt: p.status !== 'PENDING' ? new Date() : null,
      },
    });
  }

  // ============== Phase 4 (Growth & Finance) ==============

  console.log('Seeding Sales & CRM pipeline (deals across all 5 stages)...');
  const bd = users.BUSINESS_DEVELOPMENT;
  const dealDefs = [
    { company: 'Coastline Insurance', contactName: 'Efua Owusu', contactEmail: 'efua.owusu@coastline.example.com', contactPhone: '024 100 2001', region: 'Accra', serviceDesc: 'Claims support, 24/7, 12 agents', valueAmount: 7200, currency: '$', source: 'Website', stage: 'NEW_ENQUIRY' },
    { company: 'Savannah Microfinance', contactName: 'Kwesi Mensah', contactEmail: 'kwesi.mensah@savannahmf.example.com', contactPhone: '020 200 3002', region: 'Kumasi', serviceDesc: 'Collections desk, 6 agents', valueAmount: 3600, currency: '$', source: 'Referral', stage: 'QUALIFIED' },
    { company: 'Gulf Freight Gh', contactName: 'Ama Tetteh', contactEmail: 'ama.tetteh@gulffreight.example.com', contactPhone: '027 300 4003', region: 'Takoradi', serviceDesc: 'Dispatch & tracking, 8 agents', valueAmount: 5100, currency: '$', source: 'Website', stage: 'PROPOSAL_SENT' },
    { company: 'Kente Retail Group', contactName: 'Kojo Appiah', contactEmail: 'kojo.appiah@kenteretail.example.com', contactPhone: '055 400 5004', region: 'Tema', serviceDesc: 'Customer care, 10 agents', valueAmount: 6400, currency: '$', source: 'Outbound', stage: 'NEGOTIATION' },
    { company: 'Northline Traders', contactName: 'Abena Osei', contactEmail: 'abena.osei@northline.example.com', contactPhone: '024 500 6005', region: 'Tamale', serviceDesc: 'General helpdesk, 4 agents', valueAmount: 2200, currency: '$', source: 'Outbound', stage: 'LOST', lostReason: 'Went with an in-house team' },
    // Two WON deals, each converted to a real Client with its own Contract +
    // JobOpening + CLIENT portal login — the seed data needed to actually
    // test cross-client isolation (see report/verification notes).
    { company: 'Zanzu Telecom', contactName: 'Yaa Adjei', contactEmail: 'yaa.adjei@zanzutelecom.example.com', contactPhone: '024 600 7006', region: 'Accra', serviceDesc: 'Billing helpdesk, 14 agents', valueAmount: 8900, currency: '$', source: 'Website', stage: 'WON', convert: true, portalEmail: 'client@zanzutelecom.example.com', staffEmployee: 'Kojo Bediako' },
    { company: 'PrimeCare Health', contactName: 'Nana Kwarteng', contactEmail: 'nana.kwarteng@primecarehealth.example.com', contactPhone: '020 700 8007', region: 'Kumasi', serviceDesc: 'Healthcare patient support, 8 agents', valueAmount: 5400, currency: 'GH₵', source: 'Referral', stage: 'WON', convert: true, portalEmail: 'client@primecarehealth.example.com', staffEmployee: 'Yaw Asante' },
  ];
  const deals = {};
  for (const def of dealDefs) {
    let deal = await prisma.deal.findFirst({ where: { company: def.company, serviceDesc: def.serviceDesc } });
    if (!deal) {
      deal = await prisma.deal.create({
        data: {
          company: def.company, contactName: def.contactName, contactEmail: def.contactEmail, contactPhone: def.contactPhone,
          region: def.region, serviceDesc: def.serviceDesc, valueAmount: def.valueAmount, currency: def.currency,
          source: def.source, stage: def.stage, lostReason: def.lostReason || null, createdByUserId: bd.id,
        },
      });
    }
    deals[def.company] = { deal, def };
  }

  console.log('Seeding a couple of contact log entries...');
  const contactLogDefs = [
    { company: 'Gulf Freight Gh', type: 'CALL', note: 'Initial discovery call — confirmed 8-agent dispatch desk scope.' },
    { company: 'Kente Retail Group', type: 'EMAIL', note: 'Sent revised pricing after their counter-offer.' },
    { company: 'Zanzu Telecom', type: 'MEETING', note: 'Contract signing meeting — deal closed.' },
  ];
  for (const c of contactLogDefs) {
    const dealId = deals[c.company].deal.id;
    const exists = await prisma.dealContactLog.findFirst({ where: { dealId, note: c.note } });
    if (exists) continue;
    await prisma.dealContactLog.create({ data: { dealId, type: c.type, note: c.note, createdByUserId: bd.id } });
  }

  console.log('Converting won deals to real Clients (+ Contract + JobOpening + Client Portal login)...');
  const clients = {};
  for (const def of dealDefs.filter((d) => d.convert)) {
    let { deal } = deals[def.company];
    let client;
    if (deal.convertedClientId) {
      // Already converted by a previous seed run — idempotent, just fetch it.
      client = await prisma.client.findUnique({ where: { id: deal.convertedClientId } });
    } else {
      const startDate = new Date();
      const renewalDueDate = new Date(startDate);
      renewalDueDate.setFullYear(renewalDueDate.getFullYear() + 1);
      const result = await prisma.$transaction(async (tx) => {
        const newClient = await tx.client.create({
          data: {
            name: def.company, region: def.region, industry: def.serviceDesc,
            currency: def.currency === '$' ? '$' : 'GH₵', status: 'ACTIVE', health: 'GOOD',
            slaTargetPct: 92,
          },
        });
        await tx.contract.create({
          data: {
            type: 'CLIENT', clientId: newClient.id, title: `${def.company} — Service Agreement`,
            value: def.valueAmount, currency: def.currency === '$' ? '$' : 'GH₵', startDate, renewalDueDate,
            status: 'ACTIVE', notes: `Auto-created from won deal (${def.serviceDesc}).`, createdByUserId: bd.id,
          },
        });
        await tx.jobOpening.create({
          data: { title: `Support Agent · ${def.company}`, branch: 'Accra HQ', status: 'OPEN', openings: 1, createdByUserId: bd.id },
        });
        const updatedDeal = await tx.deal.update({ where: { id: deal.id }, data: { convertedClientId: newClient.id, convertedAt: new Date() } });
        return { newClient, updatedDeal };
      });
      client = result.newClient;
      deal = result.updatedDeal;
    }
    clients[def.company] = client;

    // Real portal login — same shared demo password as every other seeded
    // account (see SEED_PASSWORD), upserted on email so reruns don't fail.
    await prisma.user.upsert({
      where: { email: def.portalEmail },
      update: { role: 'CLIENT', clientId: client.id },
      create: { email: def.portalEmail, passwordHash, role: 'CLIENT', clientId: client.id },
    });

    // Assign a real, already-seeded employee (with real Attendance/QaAudit
    // history from Phase 1/2 seeding) to this client's roster, so the
    // Client Portal shows genuinely distinguishable data per client — the
    // actual precondition for testing cross-client isolation with 2+ live
    // clients, not just 2 empty shells.
    if (def.staffEmployee && employees[def.staffEmployee]) {
      await prisma.employee.update({ where: { id: employees[def.staffEmployee].id }, data: { clientId: client.id } });
    }
  }

  console.log('Seeding Contracts register (STAFF + VENDOR entries, alongside the auto-created CLIENT ones above)...');
  const soonRenewal = new Date(today);
  soonRenewal.setDate(soonRenewal.getDate() + 30); // within 60 days -> shows as RENEWAL_DUE
  const contractDefs = [
    {
      type: 'STAFF', title: 'Employment Contract — Kwame Owusu', employeeId: employees['Kwame Owusu'] ? employees['Kwame Owusu'].id : null,
      value: 3600, currency: 'GH₵', startDate: new Date('2023-06-01'), renewalDueDate: soonRenewal, notes: 'Annual staff contract, up for renewal.',
    },
    {
      type: 'VENDOR', title: 'Cloud Hosting Agreement', vendorName: 'AWS (Amazon Web Services)',
      value: 1200, currency: '$', startDate: new Date('2024-01-01'), renewalDueDate: null, notes: 'Rolling monthly cloud infrastructure agreement.',
    },
  ];
  for (const c of contractDefs) {
    const exists = await prisma.contract.findFirst({ where: { title: c.title } });
    if (exists) continue;
    await prisma.contract.create({
      data: {
        type: c.type, title: c.title, employeeId: c.employeeId || null, vendorName: c.vendorName || null,
        value: c.value, currency: c.currency, startDate: c.startDate, renewalDueDate: c.renewalDueDate,
        notes: c.notes, createdByUserId: users.DIRECTOR.id,
      },
    });
  }

  console.log('Seeding InvoiceTaxSettings (placeholder Ghana VAT/levy rates — see notes)...');
  // Same idempotency shape as PayrollSettings: no natural unique key, create
  // the placeholder rates once, then leave whatever's there alone so a real
  // Director/Accountant edit via the app is never clobbered by a re-seed.
  let taxSettings = await prisma.invoiceTaxSettings.findFirst();
  if (!taxSettings) {
    taxSettings = await prisma.invoiceTaxSettings.create({
      data: {
        vatRatePct: 15.0,
        nhilRatePct: 2.5,
        getfundRatePct: 2.5,
        covidLevyRatePct: 1.0,
        notes:
          'PLACEHOLDER rates for demo purposes only — illustrative Ghana VAT + NHIL + GETFund + COVID-19 Health Recovery ' +
          'Levy figures, each applied independently to the invoice subtotal (a simplified, non-compounding calculation). ' +
          'NOT yet signed off by an accountant or tax advisor; verify both the rates AND the compounding order against ' +
          'current GRA guidance before relying on this for any real invoice (see lib/invoice-tax.js and the brief’s ' +
          'own compliance note).',
      },
    });
  } else {
    console.log('InvoiceTaxSettings already exist — leaving as-is (may have been edited since seeding).');
  }

  console.log('Seeding Invoices (real Client + Contract-derived billing)...');
  const zanzuContract = clients['Zanzu Telecom']
    ? await prisma.contract.findFirst({ where: { clientId: clients['Zanzu Telecom'].id, type: 'CLIENT' } })
    : null;
  const primeCareContract = clients['PrimeCare Health']
    ? await prisma.contract.findFirst({ where: { clientId: clients['PrimeCare Health'].id, type: 'CLIENT' } })
    : null;
  const lastMonthDue = new Date(today);
  lastMonthDue.setMonth(lastMonthDue.getMonth() - 1);
  const overdueDue = new Date(today);
  overdueDue.setDate(overdueDue.getDate() - 4); // 4 days overdue, matches the existing dashboard's illustrative copy
  const nextMonthDue = new Date(today);
  nextMonthDue.setMonth(nextMonthDue.getMonth() + 1);
  const invoiceDefs = [
    {
      client: 'Zanzu Telecom', contract: zanzuContract, description: 'Support team · retainer (last period)',
      amount: 8900, currency: '$', dueDate: lastMonthDue, status: 'PAID',
    },
    {
      client: 'Zanzu Telecom', contract: zanzuContract, description: 'Support team · retainer (this period)',
      amount: 8900, currency: '$', dueDate: nextMonthDue, status: 'SENT',
    },
    {
      client: 'PrimeCare Health', contract: primeCareContract, description: 'Healthcare patient support · retainer',
      amount: 16900, currency: 'GH₵', dueDate: overdueDue, status: 'SENT', // dueDate in the past + status SENT -> shows as OVERDUE (derived, see lib/invoices.js)
    },
    {
      client: 'PrimeCare Health', contract: primeCareContract, description: 'Extra weekend coverage (draft, not yet sent)',
      amount: 2100, currency: 'GH₵', dueDate: nextMonthDue, status: 'DRAFT',
    },
  ];
  for (const inv of invoiceDefs) {
    const client = clients[inv.client];
    if (!client) continue;
    const exists = await prisma.invoice.findFirst({ where: { clientId: client.id, lineItems: { some: { description: inv.description } } } });
    if (exists) continue;
    const period = `${inv.dueDate.getFullYear()}-${String(inv.dueDate.getMonth() + 1).padStart(2, '0')}`;
    // Same default signal as app/api/invoices POST: a USD-billed client
    // (Zanzu Telecom) is treated as export-of-services/exempt; a GH₵-billed
    // domestic client (PrimeCare Health) gets the real standard-rated tax
    // breakdown — real seeded data to exercise both branches.
    const taxExempt = inv.currency === '$';
    const tax = computeInvoiceTax(inv.amount, taxExempt, taxSettings);
    await prisma.invoice.create({
      data: {
        clientId: client.id,
        contractId: inv.contract ? inv.contract.id : null,
        period,
        currency: inv.currency,
        amount: inv.amount,
        taxExempt,
        vatAmount: tax.vatAmount,
        nhilAmount: tax.nhilAmount,
        getfundAmount: tax.getfundAmount,
        covidLevyAmount: tax.covidLevyAmount,
        totalAmount: tax.totalAmount,
        status: inv.status,
        dueDate: inv.dueDate,
        sentAt: inv.status === 'SENT' || inv.status === 'PAID' ? new Date() : null,
        paidAt: inv.status === 'PAID' ? new Date() : null,
        createdByUserId: users.ACCOUNTANT.id,
        lineItems: { create: [{ description: inv.description, quantity: 1, unitPrice: inv.amount, amount: inv.amount }] },
      },
    });
  }

  console.log('Seeding Client Portal documents (real Document rows scoped via Document.clientId)...');
  const clientDocDefs = [
    { client: 'Zanzu Telecom', category: 'CONTRACT', fileName: 'Master Service Agreement.txt', body: 'Master Service Agreement between Open Base Africa and Zanzu Telecom.', signed: true },
    { client: 'Zanzu Telecom', category: 'CONTRACT', fileName: 'SLA Schedule A.txt', body: 'Service Level Agreement schedule — 92% target, billing helpdesk.', signed: false },
    { client: 'PrimeCare Health', category: 'CONTRACT', fileName: 'Master Service Agreement.txt', body: 'Master Service Agreement between Open Base Africa and PrimeCare Health.', signed: true },
    { client: 'PrimeCare Health', category: 'COMPLIANCE', fileName: 'Data Protection Addendum.txt', body: 'Data protection addendum covering patient support data handling.', signed: true },
  ];
  for (const doc of clientDocDefs) {
    const client = clients[doc.client];
    if (!client) continue;
    const exists = await prisma.document.findFirst({ where: { clientId: client.id, fileName: doc.fileName } });
    if (exists) continue;
    await prisma.document.create({
      data: {
        clientId: client.id,
        category: doc.category,
        fileName: doc.fileName,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(doc.body),
        fileDataUrl: 'data:text/plain;base64,' + Buffer.from(doc.body).toString('base64'),
        signed: doc.signed,
        notes: doc.body,
        uploadedByUserId: users.DIRECTOR.id,
      },
    });
  }

  console.log('Seeding Client Portal support requests (real thread, not a mock)...');
  const zanzuPortalUser = await prisma.user.findUnique({ where: { email: 'client@zanzutelecom.example.com' } });
  if (zanzuPortalUser && clients['Zanzu Telecom']) {
    const existingReq = await prisma.clientSupportRequest.findFirst({
      where: { clientId: clients['Zanzu Telecom'].id, title: 'Need an extra agent for the weekend shift' },
    });
    if (!existingReq) {
      await prisma.clientSupportRequest.create({
        data: {
          clientId: clients['Zanzu Telecom'].id,
          title: 'Need an extra agent for the weekend shift',
          status: 'IN_PROGRESS',
          createdByUserId: zanzuPortalUser.id,
          messages: {
            create: [
              { authorUserId: zanzuPortalUser.id, fromClient: true, body: 'Need an extra agent for the weekend shift' },
              { authorUserId: bd.id, fromClient: false, body: 'On it — checking coverage with the Ops Manager now.' },
            ],
          },
        },
      });
    }
  }

  console.log('Seeding Finance expense ledger (manual entries)...');
  const expenseDefs = [
    { category: 'Rent', description: 'Accra HQ office rent — July', amount: 3500, currency: 'GH₵' },
    { category: 'Utilities', description: 'Internet & phone lines — July', amount: 450, currency: 'GH₵' },
  ];
  const expenses = {};
  for (const e of expenseDefs) {
    let expense = await prisma.expense.findFirst({ where: { description: e.description } });
    if (!expense) {
      expense = await prisma.expense.create({
        data: { category: e.category, description: e.description, amount: e.amount, currency: e.currency, source: 'MANUAL', createdByUserId: users.ACCOUNTANT.id },
      });
    }
    expenses[e.description] = expense;
  }

  console.log('Seeding bank statement lines (one reconciled, one outstanding)...');
  const bankLineDefs = [
    { description: 'POS DEBIT — OFFICE RENT LTD', amount: 3500, matchTo: 'Accra HQ office rent — July' },
    { description: 'MOMO DEPOSIT — UNKNOWN REF 88213', amount: 1200, matchTo: null },
  ];
  for (const l of bankLineDefs) {
    const exists = await prisma.bankStatementLine.findFirst({ where: { description: l.description } });
    if (exists) continue;
    await prisma.bankStatementLine.create({
      data: {
        date: today, description: l.description, amount: l.amount,
        importedByUserId: users.ACCOUNTANT.id,
        matchedExpenseId: l.matchTo ? expenses[l.matchTo].id : null,
        matchedByUserId: l.matchTo ? users.ACCOUNTANT.id : null,
        matchedAt: l.matchTo ? new Date() : null,
      },
    });
  }

  console.log('Seeding statutory tax/filing calendar (PAYE, SSNIT, VAT, corporate tax)...');
  const thisPeriod = period; // "YYYY-MM", already computed above for payroll
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextPeriod = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevPeriod = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  // GRA-style due dates: PAYE/SSNIT by the 14th/15th of the FOLLOWING month;
  // VAT by the last day of the following month; corporate tax quarterly.
  const dueInFollowingMonth = (periodStr, day) => {
    const [y, m] = periodStr.split('-').map(Number);
    return new Date(y, m, day); // JS Date month is 0-based, so `m` (1-based) IS next month
  };
  const taxFilingDefs = [
    { type: 'PAYE', period: prevPeriod, dueDate: dueInFollowingMonth(prevPeriod, 14), amount: 12500, filed: true },
    { type: 'SSNIT', period: prevPeriod, dueDate: dueInFollowingMonth(prevPeriod, 15), amount: 18700, filed: true },
    { type: 'PAYE', period: thisPeriod, dueDate: dueInFollowingMonth(thisPeriod, 14), amount: null, filed: false },
    { type: 'SSNIT', period: thisPeriod, dueDate: dueInFollowingMonth(thisPeriod, 15), amount: null, filed: false },
    { type: 'VAT', period: thisPeriod, dueDate: dueInFollowingMonth(thisPeriod, 28), amount: null, filed: false },
    { type: 'CORPORATE_TAX', period: `${today.getFullYear()}-Q${Math.ceil((today.getMonth() + 1) / 3)}`, dueDate: new Date(today.getFullYear(), today.getMonth() + 2, 0), amount: null, filed: false },
    { type: 'PAYE', period: nextPeriod, dueDate: dueInFollowingMonth(nextPeriod, 14), amount: null, filed: false },
    { type: 'SSNIT', period: nextPeriod, dueDate: dueInFollowingMonth(nextPeriod, 15), amount: null, filed: false },
  ];
  for (const f of taxFilingDefs) {
    await prisma.taxFiling.upsert({
      where: { type_period: { type: f.type, period: f.period } },
      update: {},
      create: {
        type: f.type, period: f.period, dueDate: f.dueDate, amount: f.amount, filed: f.filed,
        filedAt: f.filed ? new Date() : null, filedByUserId: f.filed ? users.ACCOUNTANT.id : null,
      },
    });
  }

  console.log('Seeding Credentials Vault (encrypted at rest)...');
  try {
    const vaultDefs = [
      { system: 'Company bank portal', category: 'BANKING', username: 'finance.ops', password: 'B4nk!Kv92Xz' },
      { system: 'GRA e-filing', category: 'GOVERNMENT', username: 'oba-taxadmin', password: 'Gr@Ghana#25' },
      { system: 'SSNIT employer portal', category: 'GOVERNMENT', username: 'oba-ssnit', password: 'Ssn1t-Emp88' },
      { system: 'AWS console', category: 'SOFTWARE', username: 'root-oba-it', password: 'Aw$0perations1' },
      { system: 'Company LinkedIn', category: 'SOCIAL', username: 'oba.social', password: 'link3d1nOBA' },
    ];
    const strengthOf = (pw) => {
      let score = 0;
      if (pw.length >= 12) score += 1;
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
      if (/\d/.test(pw)) score += 1;
      if (/[^A-Za-z0-9]/.test(pw)) score += 1;
      return score >= 4 ? 'Strong' : score >= 2 ? 'Medium' : 'Weak';
    };
    for (const v of vaultDefs) {
      const exists = await prisma.vaultCredential.findFirst({ where: { system: v.system, username: v.username } });
      if (exists) continue;
      const enc = encryptSecret(v.password);
      await prisma.vaultCredential.create({
        data: {
          system: v.system, category: v.category, username: v.username,
          encIv: enc.iv, encTag: enc.tag, encData: enc.data, strength: strengthOf(v.password),
          createdByUserId: users.IT_FACILITIES.id,
        },
      });
    }
  } catch (err) {
    // Never let a missing/misconfigured VAULT_ENCRYPTION_KEY take down the
    // ENTIRE deploy (this seed script's failure is fatal to the whole build
    // per scripts/vercel-build.mjs) — the Vault feature itself already fails
    // loudly and safely at request time (see app/api/vault routes' own 503
    // handling) if this env var isn't set; that's the right place for this
    // to be visible, not here blocking login/payroll/every other feature.
    console.warn(
      '\n[seed] WARNING: could not seed Credentials Vault rows — VAULT_ENCRYPTION_KEY is likely ' +
      'missing or invalid in this environment. The rest of the seed completed fine; the Vault ' +
      'screen will just be empty (and its add/reveal routes will 503) until that env var is set. ' +
      'Error: ' + String((err && err.message) || err) + '\n'
    );
  }

  console.log('\nSeed complete.');
  console.log(`Branches represented: ${BRANCHES.join(', ')}`);
  console.log(`All seeded accounts use password: ${SEED_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
