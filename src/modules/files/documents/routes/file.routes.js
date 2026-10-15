import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { uploadFile } from "../../../../common/http/upload.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { fileController as controller } from "../controllers/file.controller.js";
import { FILE_PERMISSIONS as can } from "../permissions/file.permissions.js";
import { fileValidators as rules } from "../validators/file.validator.js";
import { ANY_ALLOWED_TYPE } from "../../shared/constants/file.constants.js";

/* /api/v1/files: student and staff records, general documents.
   Other modules attach files through fileService with their own access rules. */
const router = createRouter();

router.post(
  "/",
  authorize(can.upload),
  uploadFile("file", { allowed: ANY_ALLOWED_TYPE }),
  validate(rules.upload),
  controller.upload
);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:fileId", authorize(can.read), validate(rules.byId), controller.getById);
router.get("/:fileId/download-url", authorize(can.read), validate(rules.byId), controller.downloadUrl);
router.delete("/:fileId", authorize(can.remove), validate(rules.byId), controller.remove);

export default router;
