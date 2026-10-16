import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const ROOM_PERMISSIONS = definePermissions("hostel.rooms", {
  manage: { roles: HOSTEL_MANAGERS, label: "Add and edit rooms" },
  read: { roles: HOSTEL_READERS, label: "View rooms" }
});
