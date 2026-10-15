import { createRouter } from "../../common/http/router.js";
import { importRoutes } from "./imports/index.js";

/* Administration module, mounted at /api/v1/administration */
const router = createRouter();

router.use("/imports", importRoutes);

export default router;
