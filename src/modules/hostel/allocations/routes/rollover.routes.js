import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { allocationController as controller } from "../controllers/allocation.controller.js";
import { ALLOCATION_PERMISSIONS as can } from "../permissions/allocation.permissions.js";
import { allocationValidators as rules } from "../validators/allocation.validator.js";

/* /api/v1/hostel/allocation-rollovers: year-end, residents keep their beds into the next year.
   `inYear`: the year they come from (current year, or X-Academic-Year-Id) */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.rollover), inYear, controller.rollover);

export default router;
