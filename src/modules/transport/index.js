import { createRouter } from "../../common/http/router.js";
import { vehicleRoutes } from "./vehicles/index.js";
import { rosterRoutes } from "./roster/index.js";
import { routeRoutes } from "./routes/index.js";
import { assignmentRoutes } from "./assignments/index.js";
import { myTransportRoutes } from "./my-transport/index.js";

/* Transport module, mounted at /api/v1/transport */
const router = createRouter();

router.use("/vehicles", vehicleRoutes);
router.use("/routes", rosterRoutes);
router.use("/routes", routeRoutes);
router.use("/assignments", assignmentRoutes);
router.use("/my-transport", myTransportRoutes);

export default router;
