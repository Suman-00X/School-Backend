import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const COPY_PERMISSIONS = definePermissions("library.copies", {
  manage: { roles: LIBRARIANS, label: "Add, edit and withdraw copies" },
  /* Prices, sources and condition notes are staff-only; borrowers see copies in the catalogue */
  read: { roles: LIBRARY_READERS, label: "View copies with prices and condition" }
});
