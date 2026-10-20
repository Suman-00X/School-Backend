import { createRouter } from "../../../../common/http/router.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { schoolController as controller } from "../controllers/school.controller.js";
import { schoolValidators as rules } from "../validators/school.validator.js";

/* /api/v1/platform/schools (operators only; see platform/index.js) */
const router = createRouter();

router.get("/", validate(rules.list), controller.list);
router.get("/code-availability", validate(rules.codeAvailability), controller.codeAvailability);
router.post("/", validate(rules.onboard), controller.onboard);
router.get("/:schoolId", validate(rules.get), controller.get);
router.put("/:schoolId/modules", validate(rules.setModules), controller.setModules);
router.patch("/:schoolId/status", validate(rules.setStatus), controller.setStatus);
router.post("/:schoolId/admins/:userId/invitations", validate(rules.invite), controller.inviteAdmin);

export default router;
