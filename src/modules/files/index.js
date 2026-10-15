import { createRouter } from "../../common/http/router.js";
import { fileRoutes } from "./documents/index.js";

/* Files module, mounted at /api/v1/files */
const router = createRouter();

router.use("/", fileRoutes);

export default router;
