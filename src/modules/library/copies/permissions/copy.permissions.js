import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const COPY_PERMISSIONS = definePermissions("library.copies", {
  manage: LIBRARIANS,
  /* Prices, sources and condition notes are staff-only; borrowers see copies in the catalogue */
  read: LIBRARY_READERS
});
