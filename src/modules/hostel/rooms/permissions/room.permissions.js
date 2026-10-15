import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const ROOM_PERMISSIONS = definePermissions("hostel.rooms", {
  manage: HOSTEL_MANAGERS,
  read: HOSTEL_READERS
});
