import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const ROSTER_PERMISSIONS = definePermissions("transport.roster", {
  read: { roles: TRANSPORT_READERS, label: "View and print route rosters" }
});
