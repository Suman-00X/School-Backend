import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every transport submodule's permissions */
export const TRANSPORT_MANAGERS = [ROLES.ADMIN, ROLES.STAFF];
export const TRANSPORT_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF, ROLES.TEACHER];
export const TRANSPORT_RIDERS = [ROLES.STUDENT, ROLES.PARENT];
