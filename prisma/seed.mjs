// Seeds a local dev database with enough Phase 1 (Core HR & Payroll) data to
// exercise every screen: PayrollSettings, employees across 5 branches, one
// real login per Phase-1-relevant role (+ BD/Board Advisor so the existing
// role picker keeps working end to end), a couple of attendance records, one
// pending leave request, and one draft payroll run with payslips.
//
// All seeded accounts share the password documented below and in the final
// report — this is what you actually type in to test the app.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SEED_PASSWORD = 'Demo1234!';

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
  const settings = await prisma.payrollSettings.create({
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

  const employees = {};
  for (const def of employeeDefs) {
    const emp = await prisma.employee.create({
      data: {
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
      },
    });
    employees[def.name] = emp;
  }

  console.log('Seeding user accounts (all share password: ' + SEED_PASSWORD + ')...');
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userDefs = [
    { email: 'ama.owusu@openbaseafrica.com', role: 'DIRECTOR', employee: 'Ama Owusu' },
    { email: 'efua.mensah@openbaseafrica.com', role: 'HR_OFFICER', employee: 'Efua Mensah' },
    { email: 'yaw.boateng@openbaseafrica.com', role: 'BUSINESS_DEVELOPMENT', employee: 'Yaw Boateng' },
    { email: 'kwabena.owusu@openbaseafrica.com', role: 'OPERATIONS_MANAGER', employee: 'Kwabena Owusu' },
    { email: 'abena.darko@openbaseafrica.com', role: 'ACCOUNTANT', employee: 'Abena Darko' },
    { email: 'nana.adjei@openbaseafrica.com', role: 'IT_FACILITIES', employee: 'Nana Adjei' },
    { email: 'yaw.asante@openbaseafrica.com', role: 'SUPERVISOR', employee: 'Yaw Asante' },
    { email: 'kwesi.amankwah@openbaseafrica.com', role: 'BOARD_ADVISOR', employee: null },
    { email: 'kojo.bediako@openbaseafrica.com', role: 'EMPLOYEE', employee: 'Kojo Bediako' },
  ];
  const users = {};
  for (const def of userDefs) {
    const user = await prisma.user.create({
      data: {
        email: def.email,
        passwordHash,
        role: def.role,
        employeeId: def.employee ? employees[def.employee].id : null,
      },
    });
    users[def.role] = user;
  }

  console.log('Seeding attendance records...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const clockIn = new Date(today);
  clockIn.setHours(7, 52);
  await prisma.attendanceRecord.create({
    data: { employeeId: employees['Kojo Bediako'].id, date: today, clockIn, status: 'ON_TIME' },
  });
  const lateClockIn = new Date(today);
  lateClockIn.setHours(8, 24);
  await prisma.attendanceRecord.create({
    data: { employeeId: employees['Yaw Asante'].id, date: today, clockIn: lateClockIn, status: 'LATE' },
  });

  console.log('Seeding one pending leave request...');
  const leaveStart = new Date(today);
  leaveStart.setDate(leaveStart.getDate() + 7);
  const leaveEnd = new Date(today);
  leaveEnd.setDate(leaveEnd.getDate() + 9);
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

  console.log('Seeding one draft payroll run with payslips...');
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const run = await prisma.payrollRun.create({
    data: { period, createdByUserId: users.ACCOUNTANT.id },
  });
  for (const emp of Object.values(employees)) {
    const figures = computePayslip(emp.salaryGross, settings);
    await prisma.payslip.create({
      data: {
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

  console.log('Seeding one company-wide document (SOP)...');
  await prisma.document.create({
    data: {
      employeeId: null,
      category: 'SOP',
      fileName: 'SOP - Escalations.txt',
      mimeType: 'text/plain',
      sizeBytes: 512,
      fileDataUrl: 'data:text/plain;base64,' + Buffer.from('Standard procedure for escalating unresolved tickets.').toString('base64'),
      signed: false,
      notes: 'Standard procedure for escalating unresolved tickets.',
      uploadedByUserId: users.HR_OFFICER.id,
    },
  });
  await prisma.document.create({
    data: {
      employeeId: employees['Kojo Bediako'].id,
      category: 'CONTRACT',
      fileName: 'Employment Contract - Kojo Bediako.txt',
      mimeType: 'text/plain',
      sizeBytes: 256,
      fileDataUrl: 'data:text/plain;base64,' + Buffer.from('Signed employment contract on file.').toString('base64'),
      signed: true,
      notes: 'Signed employment contract on file.',
      uploadedByUserId: users.HR_OFFICER.id,
    },
  });

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
