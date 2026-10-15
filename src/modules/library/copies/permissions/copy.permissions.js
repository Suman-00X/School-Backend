import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { EVERYONE, LIBRARIANS } from "../../shared/constants/library.permissions.js";

export const COPY_PERMISSIONS = definePermissions("library.copies", {
  manage: LIBRARIANS,
  /* Which copies are on the shelf is part of browsing the catalogue */
  read: EVERYONE
});
