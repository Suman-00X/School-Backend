import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const RESOURCE_PERMISSIONS = definePermissions("hostel.resources", {
  manage: HOSTEL_MANAGERS,
  read: HOSTEL_READERS
});
