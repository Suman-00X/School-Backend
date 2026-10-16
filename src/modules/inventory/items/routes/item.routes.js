import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { itemController as controller } from "../controllers/item.controller.js";
import { ITEM_PERMISSIONS as can } from "../permissions/item.permissions.js";
import { itemValidators as rules } from "../validators/item.validator.js";

/* /api/v1/inventory/items */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:itemId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:itemId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:itemId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
