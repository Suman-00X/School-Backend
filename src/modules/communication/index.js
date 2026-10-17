import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { announcementRoutes } from "./announcements/index.js";
import { messageRoutes } from "./notifications/index.js";

/* Communication module, mounted at /api/v1/communication.
   The personal inbox is mounted by the portal at /api/v1/me/notifications. */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("communication"));

router.use("/announcements", announcementRoutes);
router.use("/messages", messageRoutes);

export default router;
