import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { sectionController as controller } from "../controllers/section.controller.js";
import { SECTION_PERMISSIONS as can } from "../permissions/section.permissions.js";
import { sectionValidators as rules } from "../validators/section.validator.js";

/* /api/v1/academics/sections. `inYear`: current year, or X-Academic-Year-Id */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), inYear, controller.create);
router.post("/bulk", authorize(can.create), validate(rules.createMany), inYear, controller.createMany);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:sectionId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:sectionId", authorize(can.update), validate(rules.update), controller.update);

export default router;
