import { ALL_ROLES, ROLES } from "../../../../common/auth/roles.js";

/* Role sets reused by every library submodule's permissions */

/* The library is run by its own module administrator */
export const LIBRARIANS = [ROLES.ADMIN, ROLES.LIBRARIAN];
export const FINE_WAIVERS = [ROLES.ADMIN, ROLES.LIBRARIAN];
/* Librarians, plus the principal (loans, fines and reports, read-only) */
export const LIBRARY_READERS = [...LIBRARIANS, ROLES.PRINCIPAL];
/* Anyone signed in may search the public catalogue and use self-service */
export const EVERYONE = ALL_ROLES;
