import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES } from "../../../../common/auth/roles.js";

export const PROFILE_PERMISSIONS = definePermissions("portal.profile", { read: ALL_ROLES });
