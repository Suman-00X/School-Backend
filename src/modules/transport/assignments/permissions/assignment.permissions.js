import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_MANAGERS, TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ASSIGNMENT_PERMISSIONS = definePermissions("transport.assignments", {
  manage: { roles: TRANSPORT_MANAGERS, label: "Assign students to routes, change and end seats" },
  read: { roles: TRANSPORT_READERS, label: "View seat assignments" }
});
