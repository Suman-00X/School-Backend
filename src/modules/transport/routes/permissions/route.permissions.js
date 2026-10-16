import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_MANAGERS, TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ROUTE_PERMISSIONS = definePermissions("transport.routes", {
  manage: { roles: TRANSPORT_MANAGERS, label: "Create and edit routes and stops" },
  read: { roles: TRANSPORT_READERS, label: "View routes and stops" }
});
