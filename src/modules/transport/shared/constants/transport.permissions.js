import { ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every transport submodule's permissions */
/* Transport is run by its own module administrator; teachers have no part in it (D-51) */
export const TRANSPORT_MANAGERS = [ROLES.ADMIN, ROLES.TRANSPORT_MANAGER];
export const TRANSPORT_READERS = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.TRANSPORT_MANAGER];
export const TRANSPORT_RIDERS = [ROLES.STUDENT, ROLES.PARENT];
