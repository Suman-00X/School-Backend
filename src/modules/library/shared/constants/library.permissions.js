import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every library submodule's permissions */

/* Librarians use the STAFF role */
/* The library is run by its own module administrator (D-51) */
export const LIBRARIANS = [ROLES.ADMIN, ROLES.LIBRARIAN];
export const FINE_WAIVERS = [ROLES.ADMIN, ROLES.LIBRARIAN];
/* Anyone signed in may browse the catalogue and see their own loans */
export const EVERYONE = ALL_ROLES;
