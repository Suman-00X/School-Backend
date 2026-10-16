import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const RESOURCE_PERMISSIONS = definePermissions("hostel.resources", {
  manage: { roles: HOSTEL_MANAGERS, label: "Add and edit lockers, mess and laundry plans" },
  read: { roles: HOSTEL_READERS, label: "View lockers, mess and laundry plans" }
});
