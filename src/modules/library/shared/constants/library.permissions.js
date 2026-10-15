import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every library submodule's permissions */

/* Librarians use the STAFF role */
export const LIBRARIANS = [ROLES.ADMIN, ROLES.STAFF];
export const FINE_WAIVERS = [ROLES.ADMIN, ROLES.PRINCIPAL];
/* Anyone signed in may browse the catalogue and see their own loans */
export const EVERYONE = ALL_ROLES;
