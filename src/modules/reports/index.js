import { createRouter } from "../../common/http/router.js";
import { dashboardRoutes } from "./dashboards/index.js";
import { exportRoutes } from "./exports/index.js";

/* Reports module, mounted at /api/v1/reports */
const router = createRouter();

router.use("/dashboards", dashboardRoutes);
router.use("/exports", exportRoutes);

export default router;
