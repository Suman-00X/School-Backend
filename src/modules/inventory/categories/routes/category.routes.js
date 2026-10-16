import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { categoryController as controller } from "../controllers/category.controller.js";
import { CATEGORY_PERMISSIONS as can } from "../permissions/category.permissions.js";
import { categoryValidators as rules } from "../validators/category.validator.js";

/* /api/v1/inventory/categories */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:categoryId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:categoryId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:categoryId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
