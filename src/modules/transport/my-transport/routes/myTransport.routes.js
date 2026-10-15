import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { resolveAcademicYear as inYear } from "../../../academics/academic-years/index.js";
import { myTransportController as controller } from "../controllers/myTransport.controller.js";
import { MY_TRANSPORT_PERMISSIONS as can } from "../permissions/myTransport.permissions.js";
import { myTransportValidators as rules } from "../validators/myTransport.validator.js";

/* /api/v1/transport/my-transport: the signed-in student's, or a parent's children's, transport */
const router = createRouter();

router.get("/", authorize(can.read), validate(rules.forMe), inYear, controller.forMe);

export default router;
