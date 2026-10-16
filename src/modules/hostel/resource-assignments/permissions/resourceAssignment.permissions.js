import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const RESOURCE_ASSIGNMENT_PERMISSIONS = definePermissions("hostel.resourceAssignments", {
  manage: HOSTEL_MANAGERS,
  read: HOSTEL_READERS
});
