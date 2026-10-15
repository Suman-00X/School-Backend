import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { hostelController as controller } from "../controllers/hostel.controller.js";
import { HOSTEL_PERMISSIONS as can } from "../permissions/hostel.permissions.js";
import { hostelValidators as rules } from "../validators/hostel.validator.js";

/* /api/v1/hostel/hostels */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:hostelId", authorize(can.read), validate(rules.getById), controller.getById);
router.get("/:hostelId/occupancy", authorize(can.read), validate(rules.occupancy), controller.occupancy);
router.patch("/:hostelId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:hostelId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
