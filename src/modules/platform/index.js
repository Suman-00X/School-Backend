import { createRouter } from "../../common/http/router.js";
import { catalogueRoutes } from "./catalogue/index.js";
import { schoolRoutes } from "./schools/index.js";
import { authenticateSystemAdmin } from "./shared/middlewares/authenticateSystemAdmin.middleware.js";
import { publicSystemAdminRoutes, systemAdminRoutes } from "./system-admins/index.js";

/* Platform module, mounted at /api/v1/platform before school authentication: the admin
   console (/adminConsole in the web app), used by the system admins who own the platform,
   onboard schools (tenants) and charge them. A system admin's session cookie opens these
   endpoints only; a school token opens none of them. */
const router = createRouter();

const publicRoutes = createRouter();
publicRoutes.__public = true;
publicRoutes.use(publicSystemAdminRoutes);
router.use("/auth", publicRoutes);
router.use("/auth", systemAdminRoutes);

router.use("/modules", authenticateSystemAdmin, catalogueRoutes);
router.use("/schools", authenticateSystemAdmin, schoolRoutes);

export default router;

/* For the application (routes.js): which switchable module a permission belongs to */
export { moduleOfPermission } from "./shared/constants/schoolModules.constants.js";
export { systemAdminService } from "./system-admins/index.js";
