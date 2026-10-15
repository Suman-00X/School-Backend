import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { uploadFile } from "../../../../common/http/upload.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { settingsController as controller } from "../controllers/settings.controller.js";
import { SETTINGS_PERMISSIONS as can } from "../permissions/settings.permissions.js";
import { settingsValidators as rules } from "../validators/settings.validator.js";

/* /api/v1/administration/settings: the school's profile */
const router = createRouter();

router.get("/", authorize(can.read), controller.get);
router.patch("/", authorize(can.update), validate(rules.update), controller.update);
router.put(
  "/logo",
  authorize(can.update),
  uploadFile("file", { allowed: ["image/png", "image/jpeg", "image/webp"], maxBytes: 2 * 1024 * 1024 }),
  controller.setLogo
);

export default router;
