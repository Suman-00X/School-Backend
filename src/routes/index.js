import { Router } from "express";
import userRoutes from "./users.routes.js";
import academicRoutes from "./academic.routes.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

/* /api/users, /api/teachers, /api/parents, /api/students, /api/student-parent-map */
router.use("/", userRoutes);
router.use("/academic", academicRoutes);

export default router;
