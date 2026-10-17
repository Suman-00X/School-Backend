import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import {
  assignmentController,
  catalogueController,
  handoverController,
  operatorRoleController,
  userAccessController
} from "../controllers/access.controller.js";
import { ACCESS_PERMISSIONS as can, MANAGE_OWNERS_REFUSAL } from "../permissions/access.permissions.js";
import { accessValidators as rules } from "../validators/access.validator.js";

/* /api/v1/administration/access: the permission catalogue, operator roles, who holds them,
   module owners, handovers, and anyone's effective access. Owners act on their own modules
   (service). */
const router = createRouter();

/* Making someone a module owner, or handing an ownership over, needs the stricter permission
   (it is also what the audit trail records) */
const ownerGuard = authorize(can.manageOwners, { refusal: MANAGE_OWNERS_REFUSAL });
const guardOwners = (req, res, next) => (req.body.kind === "OWNER" ? ownerGuard(req, res, next) : next());
const guardOwnership = (req, res, next) => (req.body.includeOwnership ? ownerGuard(req, res, next) : next());

router.get("/permissions", authorize(can.read), validate(rules.catalogue), catalogueController.list);

router.get("/operator-roles", authorize(can.read), validate(rules.operatorRoles.list), operatorRoleController.list);
router.post(
  "/operator-roles",
  authorize(can.manage),
  validate(rules.operatorRoles.create),
  operatorRoleController.create
);
router.get(
  "/operator-roles/:operatorRoleId",
  authorize(can.read),
  validate(rules.operatorRoles.getById),
  operatorRoleController.getById
);
router.patch(
  "/operator-roles/:operatorRoleId",
  authorize(can.manage),
  validate(rules.operatorRoles.update),
  operatorRoleController.update
);
router.delete(
  "/operator-roles/:operatorRoleId",
  authorize(can.manage),
  validate(rules.operatorRoles.remove),
  operatorRoleController.remove
);

router.get("/assignments", authorize(can.read), validate(rules.assignments.list), assignmentController.list);
router.post(
  "/assignments",
  authorize(can.manage),
  validate(rules.assignments.create),
  guardOwners,
  assignmentController.create
);
router.get(
  "/assignments/:assignmentId",
  authorize(can.read),
  validate(rules.assignments.getById),
  assignmentController.getById
);
router.patch(
  "/assignments/:assignmentId",
  authorize(can.manage),
  validate(rules.assignments.update),
  assignmentController.update
);
/* Revoke: the row stays as history (status REVOKED) */
router.delete(
  "/assignments/:assignmentId",
  authorize(can.manage),
  validate(rules.assignments.revoke),
  assignmentController.revoke
);

/* Someone takes over another person's operator access and duties in a module */
router.post(
  "/handovers",
  authorize(can.handOver),
  validate(rules.handovers.create),
  guardOwnership,
  handoverController.create
);

router.get("/users/:userId/access", authorize(can.read), validate(rules.userAccess), userAccessController.forUser);
router.get("/me/access", authorize(can.readOwn), validate(rules.myAccess), userAccessController.mine);

export default router;
