import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { vendorController as controller } from "../controllers/vendor.controller.js";
import { VENDOR_PERMISSIONS as can } from "../permissions/vendor.permissions.js";
import { vendorValidators as rules } from "../validators/vendor.validator.js";

/* /api/v1/inventory/vendors */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:vendorId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:vendorId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:vendorId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
