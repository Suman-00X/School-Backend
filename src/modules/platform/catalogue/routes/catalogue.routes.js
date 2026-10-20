import { createRouter } from "../../../../common/http/router.js";
import { catalogueController as controller } from "../controllers/catalogue.controller.js";

/* /api/v1/platform/modules (system admins only; see platform/index.js) */
const router = createRouter();

router.get("/", controller.list);

export default router;
