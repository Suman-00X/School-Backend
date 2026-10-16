import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const RESOURCE_ASSIGNMENT_PERMISSIONS = definePermissions("hostel.resourceAssignments", {
  manage: { roles: HOSTEL_MANAGERS, label: "Give and release lockers and plans" },
  read: { roles: HOSTEL_READERS, label: "View who holds lockers and plans" }
});
