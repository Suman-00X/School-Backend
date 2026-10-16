import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every hostel submodule's permissions */
/* Hostels are run by their own module administrator (D-51) */
export const HOSTEL_MANAGERS = [ROLES.ADMIN, ROLES.HOSTEL_MANAGER];
export const HOSTEL_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.HOSTEL_MANAGER];
export const HOSTEL_RESIDENTS = [ROLES.STUDENT, ROLES.PARENT];
