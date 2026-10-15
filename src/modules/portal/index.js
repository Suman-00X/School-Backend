import { createRouter } from "../../common/http/router.js";
import { profileRoutes } from "./profile/index.js";
import { learningRoutes } from "./learning/index.js";
import { feesRoutes } from "./fees/index.js";
import { portalHomeworkRoutes } from "./homework/index.js";
import { inboxRoutes } from "../communication/notifications/index.js";

/* Portal module (self-service), mounted at /api/v1/me */
const router = createRouter();

router.use("/", learningRoutes);
router.use("/", feesRoutes);
router.use("/", portalHomeworkRoutes);
router.use("/", inboxRoutes);
router.use("/", profileRoutes);

export default router;
