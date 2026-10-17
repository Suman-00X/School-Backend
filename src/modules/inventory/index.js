import { createRouter } from "../../common/http/router.js";
import { activityRoutes } from "../../common/audit/activity.routes.js";
import { categoryRoutes } from "./categories/index.js";
import { vendorRoutes } from "./vendors/index.js";
import { itemRoutes } from "./items/index.js";
import { itemMovementRoutes, movementRoutes } from "./stock/index.js";
import { inventoryReportRoutes } from "./reports/index.js";

/* Inventory module, mounted at /api/v1/inventory.
   Publishes "inventory.item.lowStock" (see shared/constants/inventory.constants.js). */
const router = createRouter();

/* The module's activity log (first: no other path may capture it) */
router.use("/activity", activityRoutes("inventory"));

router.use("/categories", categoryRoutes);
router.use("/vendors", vendorRoutes);
router.use("/items", itemMovementRoutes);
router.use("/items", itemRoutes);
router.use("/movements", movementRoutes);
router.use("/reports", inventoryReportRoutes);

export default router;
