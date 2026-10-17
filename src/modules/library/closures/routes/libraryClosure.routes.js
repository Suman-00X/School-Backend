import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { libraryClosureController as controller } from "../controllers/libraryClosure.controller.js";
import { LIBRARY_CLOSURE_PERMISSIONS as can } from "../permissions/libraryClosure.permissions.js";
import { libraryClosureValidators as rules } from "../validators/libraryClosure.validator.js";

/* /api/v1/library/closures: days closed outside the school calendar, entered by hand */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.delete("/:closureId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
