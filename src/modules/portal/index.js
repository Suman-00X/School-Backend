import { createRouter } from "../../common/http/router.js";
import { profileRoutes } from "./profile/index.js";
import { learningRoutes } from "./learning/index.js";

/* Portal module (self-service), mounted at /api/v1/me */
const router = createRouter();

router.use("/", learningRoutes);
router.use("/", profileRoutes);

export default router;
