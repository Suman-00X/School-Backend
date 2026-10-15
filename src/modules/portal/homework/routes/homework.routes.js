import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { uploadFile } from "../../../../common/http/upload.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { ANY_ALLOWED_TYPE } from "../../../files/shared/constants/file.constants.js";
import { portalHomeworkController as controller } from "../controllers/homework.controller.js";
import { PORTAL_HOMEWORK_PERMISSIONS as can } from "../permissions/homework.permissions.js";
import { portalHomeworkValidators as rules } from "../validators/homework.validator.js";

/* /api/v1/me: homework of the signed-in student or a parent's children */
const router = createRouter();

router.get("/students/:studentId/homework", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/students/:studentId/homework/:homeworkId", authorize(can.read), validate(rules.detail), controller.detail);
router.get(
  "/students/:studentId/homework/:homeworkId/attachments/:fileId/download-url",
  authorize(can.read),
  validate(rules.attachment),
  controller.attachmentUrl
);

/* multipart: optional "file" plus optional "content" text */
router.post(
  "/homework/:homeworkId/submission",
  authorize(can.submit),
  uploadFile("file", { allowed: ANY_ALLOWED_TYPE, optional: true }),
  validate(rules.submit),
  controller.submit
);

export default router;
