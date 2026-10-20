import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { admitCardController as controller } from "../controllers/admitCard.controller.js";
import { ADMIT_CARD_PERMISSIONS as can } from "../permissions/admitCard.permissions.js";
import { admitCardValidators as rules } from "../validators/admitCard.validator.js";

/* Mounted at /api/v1/academics/exams. POST generates (or regenerates) the exam's cards
   from the eligibility rules; families read theirs at /me/students/:studentId/admit-cards */
const router = createRouter();

router.post("/:examId/admit-cards", authorize(can.generate), validate(rules.generate), controller.generate);
router.get("/:examId/admit-cards", authorize(can.read), validate(rules.list), controller.list);
router.get("/:examId/admit-cards/pdf", authorize(can.read), validate(rules.sectionPdf), controller.sectionPdf);
router.get("/:examId/admit-cards/:admitCardId/pdf", authorize(can.read), validate(rules.card), controller.pdf);

export default router;
