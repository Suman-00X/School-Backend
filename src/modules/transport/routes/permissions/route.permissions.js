import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_MANAGERS, TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ROUTE_PERMISSIONS = definePermissions("transport.routes", {
  manage: TRANSPORT_MANAGERS,
  read: TRANSPORT_READERS
});
