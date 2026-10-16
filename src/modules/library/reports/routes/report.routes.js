import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { reportController as controller } from "../controllers/report.controller.js";
import { LIBRARY_REPORT_PERMISSIONS as can } from "../permissions/report.permissions.js";
import { reportValidators as rules } from "../validators/report.validator.js";

/* /api/v1/library/reports/* (JSON, or ?format=csv|xlsx) */
const router = createRouter();

router.get("/current-loans", authorize(can.read), validate(rules.currentLoans), controller.currentLoans);
router.get("/overdue", authorize(can.read), validate(rules.overdue), controller.overdue);
router.get("/fines-collected", authorize(can.read), validate(rules.finesCollected), controller.finesCollected);
router.get("/fines-outstanding", authorize(can.read), validate(rules.finesOutstanding), controller.finesOutstanding);
router.get("/most-borrowed", authorize(can.read), validate(rules.mostBorrowed), controller.mostBorrowed);
router.get("/inactive-borrowers", authorize(can.read), validate(rules.inactiveBorrowers), controller.inactiveBorrowers);
router.get("/acquisitions", authorize(can.read), validate(rules.acquisitions), controller.acquisitions);

export default router;
