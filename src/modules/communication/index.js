import { createRouter } from "../../common/http/router.js";
import { announcementRoutes } from "./announcements/index.js";
import { messageRoutes } from "./notifications/index.js";

/* Communication module, mounted at /api/v1/communication.
   The personal inbox is mounted by the portal at /api/v1/me/notifications. */
const router = createRouter();

router.use("/announcements", announcementRoutes);
router.use("/messages", messageRoutes);

export default router;
