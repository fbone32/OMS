const SHIFT_TYPES = ['DAY', 'EVENING', 'NIGHT'];

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function entryDate(entry) {
  const d = new Date(entry.weekStart);
  d.setDate(d.getDate() + entry.dayOfWeek);
  return d;
}

/** Ensures a branch/week has all 21 (7 days x 3 shifts) roster rows,
 * auto-assigning active employees at that branch round-robin (mirrors the
 * pre-filled look of the original static demo, minus its fake random gaps —
 * real gaps now only appear when a shift genuinely has nobody assigned, e.g.
 * after a leave approval clears it). */
async function ensureWeekRows(prisma, branch, weekStart) {
  const existing = await prisma.shiftRosterEntry.findMany({ where: { branch, weekStart } });
  if (existing.length >= 21) return existing;

  const employees = await prisma.employee.findMany({ where: { branch, active: true }, orderBy: { id: 'asc' } });
  const have = new Set(existing.map((e) => `${e.dayOfWeek}-${e.shiftType}`));
  const toCreate = [];
  let cursor = 0;
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    for (const shiftType of SHIFT_TYPES) {
      const key = `${dayOfWeek}-${shiftType}`;
      if (have.has(key)) continue;
      const employeeId = employees.length ? employees[cursor % employees.length].id : null;
      cursor++;
      toCreate.push({ branch, weekStart, dayOfWeek, shiftType, employeeId });
    }
  }
  if (toCreate.length) {
    await prisma.shiftRosterEntry.createMany({ data: toCreate, skipDuplicates: true });
  }
  return prisma.shiftRosterEntry.findMany({ where: { branch, weekStart } });
}

module.exports = { SHIFT_TYPES, mondayOf, entryDate, ensureWeekRows };
