import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { fileRoutes } from "./documents/index.js";

/* Files module, mounted at /api/v1/files */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("files"));

router.use("/", fileRoutes);

export default router;
