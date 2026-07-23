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

// Onboarding a brand-new person (Employee row + their login/User row +
// a generated temporary password) is a more sensitive action than editing an
// existing employee's record fields, so it gets its own permission constant
// even though the allowed roles happen to match EMPLOYEES_WRITE today — this
// lets the two diverge later (e.g. if HR gains record-edit rights but not
// account-creation rights) without a silent behavior change.
const ACCOUNT_CREATE = ['DIRECTOR', 'HR_OFFICER'];

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

// ---- Phase 2 (Operations & Performance) ----

// Recruitment — HR Officer owns the pipeline; Director has full access.
const RECRUITMENT_VIEW = ['DIRECTOR', 'HR_OFFICER'];
const RECRUITMENT_MANAGE = ['DIRECTOR', 'HR_OFFICER'];

// KPI Scorecard — Operations Manager for their branches, Director for all.
const KPI_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER'];
// ASSUMPTION (flag for sign-off, mirrors PAYROLL_SETTINGS_EDIT's pattern):
// only Director may edit KPI targets.
const KPI_TARGET_EDIT = ['DIRECTOR'];

// Incidents & handover — Ops Manager (assigned branches) and Supervisor (own
// team) log/close; Director sees and can act on everything.
const INCIDENTS_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR'];
const INCIDENTS_LOG = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR'];
const INCIDENTS_CLOSE = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR'];

// Training — broadly viewable (own progress matters to everyone); recording
// a completion is a Trainer/Supervisor action per the brief's role table.
// TRAINER is included for when that becomes an assignable system role (see
// ONBOARDING_ASSIGNABLE_ROLES's note above) — today only Director/Supervisor
// logins can actually exercise it.
const TRAINING_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER', 'HR_OFFICER', 'SUPERVISOR', 'TRAINER', 'QA_ANALYST', 'EMPLOYEE'];
const TRAINING_RECORD = ['DIRECTOR', 'TRAINER', 'SUPERVISOR'];
const TRAINING_MANAGE_CATALOGUE = ['DIRECTOR', 'TRAINER'];

// Quality (QA) — entry is a QA Analyst/Supervisor action per the brief's role
// table (same TRAINER/QA_ANALYST note as above — real today for Supervisor).
const QA_VIEW = ['DIRECTOR', 'OPERATIONS_MANAGER', 'SUPERVISOR', 'QA_ANALYST', 'TRAINER'];
const QA_ENTRY = ['DIRECTOR', 'QA_ANALYST', 'SUPERVISOR'];

// ---- Phase 3 (Client Portal & Assets) ----
// Client Portal itself stays out of scope (see brief) — everything below is
// Asset Tracking / IT & Facilities / Board Dashboard, per the brief's role
// table: "IT & Facilities role owns Facilities/Procurement/Vault/Document-
// Library-adjacent stuff; Director sees everything; Board Advisor is
// read-only across whatever it's scoped to."

// Asset register — IT & Facilities runs it day to day, Director full access.
const ASSETS_VIEW = ['DIRECTOR', 'IT_FACILITIES'];
const ASSETS_MANAGE = ['DIRECTOR', 'IT_FACILITIES'];

// IT ticket queue — same ownership as assets.
const TICKETS_VIEW = ['DIRECTOR', 'IT_FACILITIES'];
const TICKETS_MANAGE = ['DIRECTOR', 'IT_FACILITIES'];

// Branch systems status — IT & Facilities is the one maintaining it by hand
// (no real infra to poll for uptime — see SystemStatus model comment).
const SYSTEMS_VIEW = ['DIRECTOR', 'IT_FACILITIES'];
const SYSTEMS_MANAGE = ['DIRECTOR', 'IT_FACILITIES'];

// Maintenance schedule.
const MAINTENANCE_VIEW = ['DIRECTOR', 'IT_FACILITIES'];
const MAINTENANCE_MANAGE = ['DIRECTOR', 'IT_FACILITIES'];

// Procurement — IT & Facilities (and Director) can raise a request; only
// Director decides (matches the existing UI's `procApprover` flag, which is
// true only for the director persona).
const PROCUREMENT_VIEW = ['DIRECTOR', 'IT_FACILITIES'];
const PROCUREMENT_REQUEST = ['DIRECTOR', 'IT_FACILITIES'];
const PROCUREMENT_DECIDE = ['DIRECTOR'];

// Board Dashboard — company-wide *aggregates only* (no per-employee detail),
// for the Director and the read-only Board Advisor.
const BOARD_VIEW = ['DIRECTOR', 'BOARD_ADVISOR'];

// Roles offerable in the ordinary "new hire" onboarding form (see
// app/api/employees/onboard/route.js). DIRECTOR and BOARD_ADVISOR are
// deliberately excluded — those are top-of-org/no-employee-record accounts
// that should stay seed/admin-only, never spun up through a routine hiring
// flow. CLIENT is a different account type entirely (external client portal
// access, not an employee). TRAINER/QA_ANALYST are offered as *job titles* in
// this same form but not as separate system-access roles — functionally
// they get EMPLOYEE-level access unless/until a Director/HR Officer decides
// otherwise via a follow-up role change.
const ONBOARDING_ASSIGNABLE_ROLES = [
  'EMPLOYEE',
  'SUPERVISOR',
  'OPERATIONS_MANAGER',
  'ACCOUNTANT',
  'IT_FACILITIES',
  'HR_OFFICER',
  'BUSINESS_DEVELOPMENT',
];

// Human-friendly labels for the Role enum — used anywhere a role needs to be
// shown to a person (e.g. the login screen's "Signing in as ... · <role>"
// hint) rather than compared against the permission tables above.
const ROLE_LABELS = {
  DIRECTOR: 'Director',
  HR_OFFICER: 'HR Officer',
  BUSINESS_DEVELOPMENT: 'Business Development',
  OPERATIONS_MANAGER: 'Ops Manager',
  ACCOUNTANT: 'Accountant',
  IT_FACILITIES: 'IT & Facilities',
  SUPERVISOR: 'Supervisor',
  TRAINER: 'Trainer',
  QA_ANALYST: 'QA Analyst',
  EMPLOYEE: 'Employee',
  CLIENT: 'Client',
  BOARD_ADVISOR: 'Board Advisor',
};

module.exports = {
  ALL_ROLES,
  ROLE_LABELS,
  EMPLOYEES_READ,
  EMPLOYEES_WRITE,
  ACCOUNT_CREATE,
  ONBOARDING_ASSIGNABLE_ROLES,
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
  RECRUITMENT_VIEW,
  RECRUITMENT_MANAGE,
  KPI_VIEW,
  KPI_TARGET_EDIT,
  INCIDENTS_VIEW,
  INCIDENTS_LOG,
  INCIDENTS_CLOSE,
  TRAINING_VIEW,
  TRAINING_RECORD,
  TRAINING_MANAGE_CATALOGUE,
  QA_VIEW,
  QA_ENTRY,
  ASSETS_VIEW,
  ASSETS_MANAGE,
  TICKETS_VIEW,
  TICKETS_MANAGE,
  SYSTEMS_VIEW,
  SYSTEMS_MANAGE,
  MAINTENANCE_VIEW,
  MAINTENANCE_MANAGE,
  PROCUREMENT_VIEW,
  PROCUREMENT_REQUEST,
  PROCUREMENT_DECIDE,
  BOARD_VIEW,
};
