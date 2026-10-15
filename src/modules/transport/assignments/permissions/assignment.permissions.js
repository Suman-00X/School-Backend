import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_MANAGERS, TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ASSIGNMENT_PERMISSIONS = definePermissions("transport.assignments", {
  manage: TRANSPORT_MANAGERS,
  read: TRANSPORT_READERS
});
