import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { certificateController as controller } from "../controllers/certificate.controller.js";
import { CERTIFICATE_PERMISSIONS as can } from "../permissions/certificate.permissions.js";
import { certificateValidators as rules } from "../validators/certificate.validator.js";

/* Mounted at /api/v1/academics/certificates. Issued certificates, newest first; issuing
   freezes the student's details with the format version in use, so the PDF printed
   later is the same certificate. */
const router = createRouter();

router.get("/types", authorize(can.read), controller.catalog);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/draft", authorize(can.issue), validate(rules.draft), controller.draft);
router.post("/preview", authorize(can.issue), validate(rules.preview), controller.preview);
router.post("/", authorize(can.issue), validate(rules.issue), controller.issue);
router.get("/:certificateId", authorize(can.read), validate(rules.get), controller.get);
router.get("/:certificateId/document", authorize(can.read), validate(rules.get), controller.document);
router.get("/:certificateId/pdf", authorize(can.read), validate(rules.get), controller.pdf);
router.post("/:certificateId/cancel", authorize(can.cancel), validate(rules.cancel), controller.cancel);

export default router;
