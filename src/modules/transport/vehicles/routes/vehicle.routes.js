import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { vehicleController as controller } from "../controllers/vehicle.controller.js";
import { VEHICLE_PERMISSIONS as can } from "../permissions/vehicle.permissions.js";
import { vehicleValidators as rules } from "../validators/vehicle.validator.js";

/* /api/v1/transport/vehicles */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:vehicleId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:vehicleId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:vehicleId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
