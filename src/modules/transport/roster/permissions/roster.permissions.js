import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ROSTER_PERMISSIONS = definePermissions("transport.roster", {
  read: TRANSPORT_READERS
});
