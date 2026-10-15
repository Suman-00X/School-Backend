import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { uploadFile } from "../../../../common/http/upload.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { importController as controller } from "../controllers/import.controller.js";
import { IMPORT_PERMISSIONS as can } from "../permissions/import.permissions.js";
import { importValidators as rules } from "../validators/importRow.validator.js";

const CSV_TYPES = ["text/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"];

/* /api/v1/administration/imports */
const router = createRouter();

router.get("/students/template", authorize(can.create), controller.template);
router.post(
  "/students",
  authorize(can.create),
  uploadFile("file", { allowed: CSV_TYPES, maxBytes: 5 * 1024 * 1024 }),
  validate(rules.createStudents),
  controller.createStudents
);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:importId", authorize(can.read), validate(rules.getById), controller.getById);

export default router;
