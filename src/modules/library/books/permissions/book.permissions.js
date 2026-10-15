import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const BOOK_PERMISSIONS = definePermissions("library.books", {
  manage: LIBRARIANS,
  /* The catalogue is open to every role, students and parents included */
  read: EVERYONE
});
