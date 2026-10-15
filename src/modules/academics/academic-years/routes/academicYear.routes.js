import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { academicYearController as controller } from "../controllers/academicYear.controller.js";
import { ACADEMIC_YEAR_PERMISSIONS as can } from "../permissions/academicYear.permissions.js";
import { academicYearValidators as rules } from "../validators/academicYear.validator.js";

/* /api/v1/academics/academic-years */
const router = createRouter();

router.post("/", authorize(can.create), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/current", authorize(can.read), controller.getCurrent);
router.get("/:academicYearId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:academicYearId", authorize(can.update), validate(rules.update), controller.update);
router.post("/:academicYearId/archival", authorize(can.archive), validate(rules.getById), controller.archive);
router.delete("/:academicYearId/archival", authorize(can.archive), validate(rules.getById), controller.restore);

export default router;
