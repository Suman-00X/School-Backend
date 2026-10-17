import { ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";

/* Add-on modules run by an owner, with school-defined operator roles (single source for
   tables and validators). The owner role is the module's built-in administrator. */
export const ACCESS_MODULES = Object.freeze({
  library: { label: "Library", ownerRole: ROLES.LIBRARIAN },
  transport: { label: "Transport", ownerRole: ROLES.TRANSPORT_MANAGER },
  hostel: { label: "Hostel", ownerRole: ROLES.HOSTEL_MANAGER },
  hr: { label: "HR", ownerRole: ROLES.HR_MANAGER },
  inventory: { label: "Inventory", ownerRole: ROLES.INVENTORY_MANAGER }
});
export const ACCESS_MODULE_KEYS = Object.keys(ACCESS_MODULES);

/* OPERATOR: holds one operator role. OWNER: acts as the module's administrator. */
export const ASSIGNMENT_KINDS = ["OPERATOR", "OWNER"];

/* Why a revoked assignment ended: REVOKED by hand, or HANDOVER (passed on to someone else) */
export const REVOKE_REASONS = ["REVOKED", "HANDOVER"];

/* Derived from the dates, today and revocation (never stored) */
export const ASSIGNMENT_STATUSES = ["SCHEDULED", "ACTIVE", "EXPIRED", "REVOKED"];

/* Accounts that can be given module access: employees. Administrators already hold everything. */
export const ASSIGNABLE_ROLES = ROLE_GROUPS.ALL_EMPLOYEES.filter(role => role !== ROLES.ADMIN);

export const MAX_ROLE_PERMISSIONS = 100;
