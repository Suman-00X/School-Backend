import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { myHostelController as controller } from "../controllers/myHostel.controller.js";
import { MY_HOSTEL_PERMISSIONS as can } from "../permissions/myHostel.permissions.js";

/* /api/v1/hostel/my-hostel: the signed-in student's bed, or a parent's children's */
const router = createRouter();

router.get("/", authorize(can.read), validate({}), controller.get);

export default router;
