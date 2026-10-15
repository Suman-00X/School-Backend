import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const HOSTEL_PERMISSIONS = definePermissions("hostel.hostels", {
  manage: HOSTEL_MANAGERS,
  read: HOSTEL_READERS
});
