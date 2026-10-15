import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { feeStructureController as controller } from "../controllers/feeStructure.controller.js";
import { FEE_STRUCTURE_PERMISSIONS as can } from "../permissions/feeStructure.permissions.js";
import { feeStructureValidators as rules } from "../validators/feeStructure.validator.js";

/* /api/v1/finance/fee-structures */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), inYear, controller.create);
router.get("/", authorize(can.read), validate(rules.list), inYear, controller.list);
router.get("/:feeStructureId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:feeStructureId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:feeStructureId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
