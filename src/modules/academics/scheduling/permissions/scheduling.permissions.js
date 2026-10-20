import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";

/* Generating only makes drafts; applying changes the timetable or an exam's papers */
export const SCHEDULING_PERMISSIONS = definePermissions("academics.scheduling", {
  read: { roles: ROLE_GROUPS.MANAGEMENT, label: "View generated timetables" },
  generate: { roles: ROLE_GROUPS.MANAGEMENT, label: "Generate class and exam timetables" },
  apply: { roles: ROLE_GROUPS.MANAGEMENT, label: "Apply or discard generated timetables" }
});
