import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_RESIDENTS } from "../../shared/constants/hostel.permissions.js";

export const MY_HOSTEL_PERMISSIONS = definePermissions("hostel.myHostel", {
  read: { roles: HOSTEL_RESIDENTS, selfService: true, label: "View own (or own children's) hostel place" }
});
