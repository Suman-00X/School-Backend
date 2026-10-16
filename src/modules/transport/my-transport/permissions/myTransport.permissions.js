import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_RIDERS } from "../../shared/constants/transport.permissions.js";

export const MY_TRANSPORT_PERMISSIONS = definePermissions("transport.myTransport", {
  read: { roles: TRANSPORT_RIDERS, selfService: true, label: "View own (or own children's) transport" }
});
