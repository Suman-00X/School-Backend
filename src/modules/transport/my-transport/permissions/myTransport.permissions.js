import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_RIDERS } from "../../shared/constants/transport.permissions.js";

export const MY_TRANSPORT_PERMISSIONS = definePermissions("transport.myTransport", {
  read: TRANSPORT_RIDERS
});
