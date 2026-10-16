import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const HOSTEL_PERMISSIONS = definePermissions("hostel.hostels", {
  manage: { roles: HOSTEL_MANAGERS, label: "Add and edit hostels and their wardens" },
  read: { roles: HOSTEL_READERS, label: "View hostels and occupancy" }
});
