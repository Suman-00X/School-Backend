import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS, LIBRARY_READERS } from "../../shared/constants/library.permissions.js";

export const BOOK_PERMISSIONS = definePermissions("library.books", {
  manage: LIBRARIANS,
  /* The staff view: internal notes and copy counts by every status */
  read: LIBRARY_READERS,
  /* GET /library/catalogue: search and availability, open to every role */
  browse: EVERYONE
});
