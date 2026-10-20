/* The modules a school can be given. Core modules are always on: a school cannot run without
   its people, classes and settings. Every other module is switched on or off per school when
   it is onboarded (see tenancy/moduleSwitches.js); a switched-off module is not shown in the
   school's web app and its endpoints refuse every request.

   `extra`: permissions declared by another module that belong to this one (a family's fee
   page in the portal, the fee dashboards in reports). */
export const SCHOOL_MODULES = Object.freeze([
  {
    key: "academics",
    label: "Academics",
    description: "Academic years, classes and sections, subjects, timetable, attendance, exams, results and homework",
    core: true
  },
  {
    key: "users",
    label: "People",
    description: "Students, parents, teachers and staff, admissions and accounts",
    core: true
  },
  {
    key: "administration",
    label: "Administration",
    description: "School settings, access control, imports and the audit log",
    core: true
  },
  {
    key: "portal",
    label: "My school (portal)",
    description: "Self-service pages for students, parents, teachers and staff",
    core: true
  },
  {
    key: "finance",
    label: "Finance",
    description: "Fee structures, invoices, collection, online payments, refunds and the ledger",
    extra: ["portal.fees.", "reports.dashboards.fees", "reports.exports.fees"]
  },
  {
    key: "communication",
    label: "Messages",
    description: "Announcements, SMS and email to families and staff, automatic alerts"
  },
  {
    key: "reports",
    label: "Reports",
    description: "Dashboards and data exports"
  },
  {
    key: "files",
    label: "Files",
    description: "Document storage for students, staff and the school"
  },
  {
    key: "library",
    label: "Library",
    description: "Catalogue, issue and return, holds, fines and stock checks"
  },
  {
    key: "transport",
    label: "Transport",
    description: "Vehicles, routes, stops and seat assignments"
  },
  {
    key: "hostel",
    label: "Hostel",
    description: "Hostels, rooms, bed allocations and resources"
  },
  {
    key: "hr",
    label: "HR & payroll",
    description: "Staff attendance, leave, salaries and payroll"
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Items, stock movements, vendors and stock reports"
  }
]);

export const SWITCHABLE_MODULE_KEYS = SCHOOL_MODULES.filter(module => !module.core).map(module => module.key);

/* Permission key -> switchable module, or null (always on) */
const EXTRA = SCHOOL_MODULES.flatMap(module => (module.extra ?? []).map(prefix => [prefix, module.key]));
const SWITCHABLE = new Set(SWITCHABLE_MODULE_KEYS);

export const moduleOfPermission = permission => {
  const extra = EXTRA.find(([prefix]) => permission.key === prefix || permission.key.startsWith(prefix));
  if (extra) return extra[1];
  return SWITCHABLE.has(permission.module) ? permission.module : null;
};

/* Stored order: the catalogue's, without duplicates */
export const normaliseModules = keys => SWITCHABLE_MODULE_KEYS.filter(key => keys.includes(key));
