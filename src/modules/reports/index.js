import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { dashboardRoutes } from "./dashboards/index.js";
import { exportRoutes } from "./exports/index.js";

/* Reports module, mounted at /api/v1/reports */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("reports"));

router.use("/dashboards", dashboardRoutes);
router.use("/exports", exportRoutes);

export default router;
