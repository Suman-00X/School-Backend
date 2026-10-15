import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { announcementController as controller } from "../controllers/announcement.controller.js";
import { ANNOUNCEMENT_PERMISSIONS as can } from "../permissions/announcement.permissions.js";
import { announcementValidators as rules } from "../validators/announcement.validator.js";

/* /api/v1/communication/announcements */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:announcementId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:announcementId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:announcementId", authorize(can.manage), validate(rules.remove), controller.remove);
router.post("/:announcementId/publication", authorize(can.manage), validate(rules.publish), controller.publish);

export default router;
