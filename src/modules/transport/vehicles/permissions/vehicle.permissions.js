import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { TRANSPORT_MANAGERS, TRANSPORT_READERS } from "../../shared/constants/transport.permissions.js";

export const VEHICLE_PERMISSIONS = definePermissions("transport.vehicles", {
  manage: { roles: TRANSPORT_MANAGERS, label: "Add, edit and retire vehicles" },
  read: { roles: TRANSPORT_READERS, label: "View vehicles and their compliance dates" }
});
