import { createRouter } from "../../common/http/router.js";
import { accountRoutes } from "./accounts/index.js";
import { staffRoutes } from "./staff/index.js";
import { teacherRoutes } from "./teachers/index.js";
import { parentRoutes } from "./parents/index.js";
import { studentRoutes } from "./students/index.js";

/* Users module, mounted at /api/v1/users */
const router = createRouter();

router.use("/staff", staffRoutes);
router.use("/teachers", teacherRoutes);
router.use("/parents", parentRoutes);
router.use("/students", studentRoutes);

/* Last: /:userId would otherwise capture the paths above */
router.use("/", accountRoutes);

export default router;
