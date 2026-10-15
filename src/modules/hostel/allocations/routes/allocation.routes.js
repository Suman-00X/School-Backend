import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { allocationController as controller } from "../controllers/allocation.controller.js";
import { ALLOCATION_PERMISSIONS as can } from "../permissions/allocation.permissions.js";
import { allocationValidators as rules } from "../validators/allocation.validator.js";

/* /api/v1/hostel/allocations. `inYear`: current year, or X-Academic-Year-Id */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:allocationId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:allocationId", authorize(can.manage), validate(rules.update), controller.update);
router.post("/:allocationId/vacate", authorize(can.manage), validate(rules.vacate), controller.vacate);
router.post("/:allocationId/transfer", authorize(can.manage), validate(rules.transfer), controller.transfer);

export default router;
