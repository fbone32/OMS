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
    { name: 'Ama Owusu', jobTitle: 'Director', branch: 'Accra HQ', startDate: '2019-01-06', salaryGross: 14000, bankName: 'Ecobank Ghana', bankAccountNumber: '1441220088901', emergencyContactName: 'Kofi Owusu', emergencyContactPhone: '024 111 2233', emergencyContactRelation: 'Spouse' },
    { name: 'Efua Mensah', jobTitle: 'HR Officer', branch: 'Accra HQ', startDate: '2021-03-15', salaryGross: 6200, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 222 3344', emergencyContactName: 'Yaa Mensah', emergencyContactPhone: '024 222 5566', emergencyContactRelation: 'Sister' },
    { name: 'Yaw Boateng', jobTitle: 'Business Development', branch: 'Accra HQ', startDate: '2022-05-02', salaryGross: 4800, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '020 333 4455', emergencyContactName: 'Efua Boateng', emergencyContactPhone: '020 333 6677', emergencyContactRelation: 'Spouse' },
    { name: 'Kwabena Owusu', jobTitle: 'Ops Manager', branch: 'Kumasi', startDate: '2020-02-11', salaryGross: 5600, bankName: 'GCB Bank', bankAccountNumber: '2201004455', emergencyContactName: 'Adjoa Owusu', emergencyContactPhone: '027 444 5566', emergencyContactRelation: 'Spouse' },
    { name: 'Abena Darko', jobTitle: 'Accountant', branch: 'Accra HQ', startDate: '2021-07-19', salaryGross: 5100, bankName: 'Ecobank Ghana', bankAccountNumber: '1441229900', emergencyContactName: 'Kojo Darko', emergencyContactPhone: '020 555 6677', emergencyContactRelation: 'Brother' },
    { name: 'Nana Adjei', jobTitle: 'IT & Facilities Lead', branch: 'Accra HQ', startDate: '2022-01-10', salaryGross: 4700, mobileMoneyProvider: 'Vodafone Cash', mobileMoneyNumber: '050 666 7788', emergencyContactName: 'Esi Adjei', emergencyContactPhone: '050 666 9900', emergencyContactRelation: 'Spouse' },
    { name: 'Yaw Asante', jobTitle: 'Supervisor', branch: 'Accra HQ', startDate: '2022-02-14', salaryGross: 3400, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 777 8899', emergencyContactName: 'Abena Asante', emergencyContactPhone: '024 777 1122', emergencyContactRelation: 'Spouse' },
    { name: 'Kojo Bediako', jobTitle: 'Support Agent', branch: 'Accra HQ', startDate: '2025-03-10', salaryGross: 2300, mobileMoneyProvider: 'MTN MoMo', mobileMoneyNumber: '024 888 9911', emergencyContactName: 'Ama Bediako', emergencyContactPhone: '024 888 2233', emergencyContactRelation: 'Mother' },
    { name: 'Ama Serwaa', jobTitle: 'QA Analyst', branch: 'Accra HQ', startDate: '2024-01-15', salaryGross: 2800 },
    { name: 'Kwame Owusu', jobTitle: 'Team Lead', branch: 'Kumasi', startDate: '2023-06-01', salaryGross: 3600 },
    { name: 'Efua Mensah-Bonsu', jobTitle: 'Support Agent', branch: 'Takoradi', startDate: '2025-09-02', salaryGross: 2250 },
    { name: 'Abena Boateng', jobTitle: 'Support Agent', branch: 'Tema', startDate: '2024-11-11', salaryGross: 2250 },
    { name: 'Kwabena Darko', jobTitle: 'Trainer', branch: 'Tamale', startDate: '2023-04-20', salaryGross: 3100 },
  ];

  // Employee has no @unique field in the schema (name isn't guaranteed
  // globally unique in a real org) but within this fixed seed list names ARE
  // unique, so find-by-name-or-create is a safe idempotency key here
  // specifically — re-running seed reuses the existing row (and refreshes
  // its fields to match this file) instead of creating a duplicate employee
  // every deploy.
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
    const existing = await prisma.employee.findFirst({ where: { name: def.name } });
    const emp = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data })
      : await prisma.employee.create({ data });
    employees[def.name] = emp;
  }

  console.log('Seeding user accounts (all share password: ' + SEED_PASSWORD + ')...');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userDefs = [
    { email: 'admin@openbaseafrica.com', role: 'DIRECTOR', employee: 'Ama Owusu' },
    { email: 'efua.mensah@openbaseafrica.com', role: 'HR_OFFICER', employee: 'Efua Mensah' },
    { email: 'info@openbaseafrica.com', role: 'BUSINESS_DEVELOPMENT', employee: 'Yaw Boateng' },
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
