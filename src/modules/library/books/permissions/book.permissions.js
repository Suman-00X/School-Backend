import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const BOOK_PERMISSIONS = definePermissions("library.books", {
  manage: { roles: LIBRARIANS, label: "Add and edit book titles" },
  /* The staff view: internal notes and copy counts by every status */
  read: { roles: LIBRARY_READERS, label: "View titles with staff details" },
  /* GET /library/catalogue: search and availability, open to every role */
  browse: { roles: EVERYONE, selfService: true, label: "Search the catalogue" }
});
