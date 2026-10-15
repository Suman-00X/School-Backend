import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_RESIDENTS } from "../../shared/constants/hostel.permissions.js";

export const MY_HOSTEL_PERMISSIONS = definePermissions("hostel.myHostel", {
  read: HOSTEL_RESIDENTS
});
