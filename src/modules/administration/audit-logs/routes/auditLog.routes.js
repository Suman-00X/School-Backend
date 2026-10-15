import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { auditLogController as controller } from "../controllers/auditLog.controller.js";
import { AUDIT_LOG_PERMISSIONS as can } from "../permissions/auditLog.permissions.js";
import { auditLogValidators as rules } from "../validators/auditLog.validator.js";

/* /api/v1/administration/audit-logs */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:auditLogId", authorize(can.read), validate(rules.getById), controller.getById);

export default router;
