import { createRouter } from "../../common/http/router.js";
import { catalogueRoutes } from "./catalogue/index.js";
import { operatorRoutes, publicOperatorRoutes } from "./operators/index.js";
import { schoolRoutes } from "./schools/index.js";
import { authenticateOperator } from "./shared/middlewares/authenticateOperator.middleware.js";

/* Platform module, mounted at /api/v1/platform before school authentication: the
   onboarding portal, used by the people who run the service (operators), not by schools.
   An operator token opens these endpoints only; a school token opens none of them. */
const router = createRouter();

const publicRoutes = createRouter();
publicRoutes.__public = true;
publicRoutes.use(publicOperatorRoutes);
router.use("/auth", publicRoutes);
router.use("/auth", operatorRoutes);

router.use("/modules", authenticateOperator, catalogueRoutes);
router.use("/schools", authenticateOperator, schoolRoutes);

export default router;

/* For the application (routes.js): which switchable module a permission belongs to */
export { moduleOfPermission } from "./shared/constants/schoolModules.constants.js";
export { operatorService } from "./operators/index.js";
