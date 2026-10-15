import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { leaveBalanceController, leaveRequestController as controller } from "../controllers/leave.controller.js";
import { LEAVE_BALANCE_PERMISSIONS, LEAVE_REQUEST_PERMISSIONS as can } from "../permissions/leave.permissions.js";
import { leaveBalanceValidators, leaveRequestValidators as rules } from "../validators/leave.validator.js";

/* /api/v1/hr/leave-requests */
export const leaveRequestRoutes = createRouter();

/* An employee applies for themselves */
leaveRequestRoutes.post("/", authorize(can.apply), validate(rules.apply), controller.apply);
leaveRequestRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
leaveRequestRoutes.get("/:requestId", authorize(can.read), validate(rules.getById), controller.getById);
leaveRequestRoutes.post("/:requestId/decision", authorize(can.decide), validate(rules.decide), controller.decide);
leaveRequestRoutes.post("/:requestId/cancellation", authorize(can.cancel), validate(rules.cancel), controller.cancel);

/* /api/v1/hr/leave-balances?userId= */
export const leaveBalanceRoutes = createRouter();
leaveBalanceRoutes.get(
  "/",
  authorize(LEAVE_BALANCE_PERMISSIONS.read),
  validate(leaveBalanceValidators.list),
  leaveBalanceController.list
);

/* /api/v1/hr/me/leave-requests, /api/v1/hr/me/leave-balances */
export const myLeaveRoutes = createRouter();
myLeaveRoutes.get("/leave-requests", authorize(can.readOwn), validate(rules.mine), controller.mine);
myLeaveRoutes.get(
  "/leave-balances",
  authorize(LEAVE_BALANCE_PERMISSIONS.readOwn),
  validate(leaveBalanceValidators.mine),
  leaveBalanceController.mine
);
