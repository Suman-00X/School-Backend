import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { certificateFormatController as controller } from "../controllers/certificateFormat.controller.js";
import { CERTIFICATE_FORMAT_PERMISSIONS as can } from "../permissions/certificate.permissions.js";
import { certificateFormatValidators as rules } from "../validators/certificate.validator.js";

/* Mounted at /api/v1/academics/certificate-formats. One format per document type
   (BONAFIDE, CHARACTER, TRANSFER, REPORT_CARD; any case in the path, "report-card" too),
   as HTML + CSS. Saving makes a
   new version; versions never change, and the highest is used for new certificates. */
const router = createRouter();

router.get("/", authorize(can.read), controller.list);
router.get("/:type", authorize(can.read), validate(rules.current), controller.current);
router.get("/:type/versions", authorize(can.read), validate(rules.versions), controller.versions);
router.post("/:type/versions", authorize(can.manage), validate(rules.save), controller.save);
router.get("/:type/versions/:version", authorize(can.read), validate(rules.version), controller.version);
router.post("/:type/versions/:version/restore", authorize(can.manage), validate(rules.version), controller.restore);
/* An unsaved format, filled with a student's details (studentId) or sample ones */
router.post("/:type/preview", authorize(can.read), validate(rules.preview), controller.preview);
router.post("/:type/preview/pdf", authorize(can.read), validate(rules.preview), controller.previewPdf);

export default router;
