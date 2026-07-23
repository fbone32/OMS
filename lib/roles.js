// Central role-permission table for Phase 1 (Core HR & Payroll). Every API
// route imports these groups and checks the caller's *server-verified*
// session role against them — the client-supplied role is never trusted.
// Mirrors the OMS Developer Brief section 8B role table.

const ALL_ROLES = [
  'DIRECTOR',
  'HR_OFFICER',
  'BUSINESS_DEVELOPMENT',
  'OPERATIONS_MANAGER',
  'ACCOUNTANT',
  'IT_FACILITIES',
  'SUPERVISOR',
  'TRAINER',
  'QA_ANALYST',
  'EMPLOYEE',
  'CLIENT',
  'BOARD_ADVISOR',
];

// Employee Records — Director full access, HR Officer manages records.
const EMPLOYEES_READ = ['DIRECTOR', 'HR_OFFICER'];
const EMPLOYEES_WRITE = ['DIRECTOR', 'HR_OFFICER'];

// Document Library — Director/HR upload; IT & Facilities + everyone else in
// scope get view-only access. BD/Client/Board Advisor have no Phase 1 access.
const DOCUMENTS_VIEW = [
  'DIRECTOR',
  'HR_OFFICER',
  'OPERATIONS_MANAGER',
  'ACCOUNTANT',
  'IT_FACILITIES',
  'SUPERVISOR',
  'TRAINER',
  'QA_ANALYST',
  'EMPLOYEE',
];
const DOCUMENTS_UPLOAD = ['DIRECTOR', 'HR_OFFICER'];

// Scheduling — Ops Manager runs rosters; Director has full access.
const SCHEDULING_MANAGE = ['DIRECTOR', 'OPERATIONS_MANAGER'];
const SCHEDULING_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR', 'TRAINER', 'QA_ANALYST', 'EMPLOYEE'];

// Attendance — Ops Manager (assigned branches), Supervisor/Trainer/QA (own
// team), Director (everything). Any employee-linked user may clock
// themselves in/out regardless of role.
const ATTENDANCE_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR', 'TRAINER', 'QA_ANALYST'];
const ATTENDANCE_CORRECT = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR', 'TRAINER', 'QA_ANALYST'];

// Leave — HR Officer + Director approve; any employee-linked user requests
// their own leave.
const LEAVE_DECIDE = ['DIRECTOR', 'HR_OFFICER'];

// Payroll — Accountant prepares, Director approves (brief: "including
// approving payroll").
const PAYROLL_VIEW = ['DIRECTOR', 'ACCOUNTANT'];
const PAYROLL_PREPARE = ['DIRECTOR', 'ACCOUNTANT'];
const PAYROLL_APPROVE = ['DIRECTOR'];
// ASSUMPTION (flag for sign-off): only Director may edit statutory settings.
const PAYROLL_SETTINGS_EDIT = ['DIRECTOR'];

// Administration — audit log is Director-only.
const AUDIT_LOG_VIEW = ['DIRECTOR'];

module.exports = {
  ALL_ROLES,
  EMPLOYEES_READ,
  EMPLOYEES_WRITE,
  DOCUMENTS_VIEW,
  DOCUMENTS_UPLOAD,
  SCHEDULING_MANAGE,
  SCHEDULING_VIEW,
  ATTENDANCE_VIEW,
  ATTENDANCE_CORRECT,
  LEAVE_DECIDE,
  PAYROLL_VIEW,
  PAYROLL_PREPARE,
  PAYROLL_APPROVE,
  PAYROLL_SETTINGS_EDIT,
  AUDIT_LOG_VIEW,
};
