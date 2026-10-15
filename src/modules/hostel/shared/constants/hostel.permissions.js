import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every hostel submodule's permissions */
export const HOSTEL_MANAGERS = [ROLES.ADMIN, ROLES.STAFF];
export const HOSTEL_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF, ROLES.TEACHER];
export const HOSTEL_RESIDENTS = [ROLES.STUDENT, ROLES.PARENT];
