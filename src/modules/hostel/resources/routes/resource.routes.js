import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resourceController as controller } from "../controllers/resource.controller.js";
import { RESOURCE_PERMISSIONS as can } from "../permissions/resource.permissions.js";
import { resourceValidators as rules } from "../validators/resource.validator.js";

/* /api/v1/hostel/resources */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:resourceId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:resourceId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:resourceId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
