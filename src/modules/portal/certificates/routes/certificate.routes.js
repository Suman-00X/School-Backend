import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { portalCertificateController as controller } from "../controllers/certificate.controller.js";
import { PORTAL_CERTIFICATE_PERMISSIONS as can } from "../permissions/certificate.permissions.js";
import { portalCertificateValidators as rules } from "../validators/certificate.validator.js";

/* /api/v1/me: certificates issued to the signed-in student or a parent's children, every
   year's, newest first; the PDF is the one the office prints */
const router = createRouter();

router.get("/students/:studentId/certificates", authorize(can.read), validate(rules.list), controller.list);
router.get(
  "/students/:studentId/certificates/:certificateId/document",
  authorize(can.read),
  validate(rules.get),
  controller.document
);
router.get(
  "/students/:studentId/certificates/:certificateId/pdf",
  authorize(can.read),
  validate(rules.get),
  controller.pdf
);

export default router;
