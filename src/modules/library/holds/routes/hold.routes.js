import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { holdController as controller } from "../controllers/hold.controller.js";
import { HOLD_PERMISSIONS as can } from "../permissions/hold.permissions.js";
import { holdValidators as rules } from "../validators/hold.validator.js";

/* /api/v1/library/holds: reservations, at the desk */
export const holdRoutes = createRouter();

holdRoutes.post("/", authorize(can.manage), validate(rules.place), controller.place);
holdRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
holdRoutes.get("/:holdId", authorize(can.read), validate(rules.getById), controller.getById);
holdRoutes.post("/:holdId/cancellation", authorize(can.manage), validate(rules.cancel), controller.cancel);

/* /api/v1/library/my-holds: self-service (students, teachers, staff; parents for their children) */
export const myHoldRoutes = createRouter();

myHoldRoutes.get("/", authorize(can.own), validate(rules.myHolds), controller.myHolds);
myHoldRoutes.post("/", authorize(can.own), validate(rules.placeMine), controller.placeMine);
myHoldRoutes.post("/:holdId/cancellation", authorize(can.own), validate(rules.cancelMine), controller.cancelMine);
