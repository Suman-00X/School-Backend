import { Router } from "express";
import userRoutes from "./users.routes.js";
import academicRoutes from "./academic.routes.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.use("/users", authMiddleware, userRoutes);
router.use("/academic", authMiddleware, academicRoutes);

export default router;