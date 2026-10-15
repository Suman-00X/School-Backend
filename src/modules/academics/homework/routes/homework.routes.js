import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { uploadFile } from "../../../../common/http/upload.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { ANY_ALLOWED_TYPE } from "../../../files/shared/constants/file.constants.js";
import { resolveAcademicYear as inYear } from "../../shared/middlewares/academicYear.middleware.js";
import { homeworkController as controller } from "../controllers/homework.controller.js";
import { HOMEWORK_PERMISSIONS as can } from "../permissions/homework.permissions.js";
import { homeworkValidators as rules } from "../validators/homework.validator.js";

/* /api/v1/academics/homework */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:homeworkId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:homeworkId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:homeworkId", authorize(can.manage), validate(rules.getById), controller.remove);

router.post(
  "/:homeworkId/attachments",
  authorize(can.manage),
  validate(rules.getById),
  uploadFile("file", { allowed: ANY_ALLOWED_TYPE }),
  controller.addAttachment
);
router.get(
  "/:homeworkId/attachments/:fileId/download-url",
  authorize(can.read),
  validate(rules.attachment),
  controller.attachmentUrl
);
router.delete(
  "/:homeworkId/attachments/:fileId",
  authorize(can.manage),
  validate(rules.attachment),
  controller.removeAttachment
);

router.get("/:homeworkId/submissions", authorize(can.read), validate(rules.submissions), controller.submissions);
router.post(
  "/:homeworkId/submissions/:submissionId/grading",
  authorize(can.grade),
  validate(rules.grade),
  controller.grade
);
router.get(
  "/:homeworkId/submissions/:submissionId/attachments/:fileId/download-url",
  authorize(can.read),
  validate(rules.submissionAttachment),
  controller.submissionAttachmentUrl
);

export default router;
