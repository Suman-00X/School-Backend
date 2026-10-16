import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { allocationController as controller } from "../controllers/allocation.controller.js";
import { ALLOCATION_PERMISSIONS as can } from "../permissions/allocation.permissions.js";
import { allocationValidators as rules } from "../validators/allocation.validator.js";

/* /api/v1/hostel/bed-availability?fromDate=&toDate=&hostelId=&roomType= */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.availability), controller.availability);

export default router;
