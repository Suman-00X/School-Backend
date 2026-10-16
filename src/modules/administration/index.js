import { createRouter } from "../../common/http/router.js";
import { importRoutes } from "./imports/index.js";
import { settingsRoutes } from "./settings/index.js";
import { auditLogRoutes } from "./audit-logs/index.js";
import { accessRoutes } from "./access/index.js";

/* Administration module, mounted at /api/v1/administration */
const router = createRouter();

router.use("/imports", importRoutes);
router.use("/settings", settingsRoutes);
router.use("/audit-logs", auditLogRoutes);
router.use("/access", accessRoutes);

export default router;
