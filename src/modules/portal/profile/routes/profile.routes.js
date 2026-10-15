import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { profileController as controller } from "../controllers/profile.controller.js";
import { PROFILE_PERMISSIONS as can } from "../permissions/profile.permissions.js";

/* /api/v1/me */
const router = createRouter();

router.get("/", authorize(can.read), controller.me);

export default router;
