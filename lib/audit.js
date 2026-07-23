const { prisma } = require('./db');

/** Every write to Employee, Document, Payroll, or Leave records must create
 * an audit entry: actor, action, target, timestamp (per the brief). */
async function logAudit({ session, action, targetType, targetId, detail }) {
  try {
    await prisma.auditLogEntry.create({
      data: {
        actorUserId: session ? session.uid : null,
        actorEmail: session ? session.email : 'system',
        action,
        targetType,
        targetId: targetId ? String(targetId) : null,
        detail: detail || undefined,
      },
    });
  } catch (e) {
    // Never let audit-logging failure break the primary request, but don't
    // swallow it silently either.
    console.error('[audit] failed to write audit entry:', e);
  }
}

module.exports = { logAudit };
