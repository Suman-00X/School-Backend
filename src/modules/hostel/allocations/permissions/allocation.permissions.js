import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { HOSTEL_MANAGERS, HOSTEL_READERS } from "../../shared/constants/hostel.permissions.js";

export const ALLOCATION_PERMISSIONS = definePermissions("hostel.allocations", {
  manage: { roles: HOSTEL_MANAGERS, label: "Allocate, transfer, extend and vacate beds; roll over a year" },
  read: { roles: HOSTEL_READERS, label: "View bed allocations and availability" }
});
