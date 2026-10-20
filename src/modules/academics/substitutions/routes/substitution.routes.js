import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { substitutionController as controller } from "../controllers/substitution.controller.js";
import { SUBSTITUTION_PERMISSIONS as can } from "../permissions/substitution.permissions.js";
import { substitutionValidators as rules } from "../validators/substitution.validator.js";

/* /api/v1/academics/substitutions: covering absent teachers' lessons, in the academic year
   of the date. Absence comes from staff attendance (approved leave marks it ahead). */
const router = createRouter();

/* Home page: periods still to plan today and on the next working day */
router.get("/summary", authorize(can.read), controller.summary);
/* The signed-in teacher's duties (default: the next 7 days) */
router.get("/mine", authorize(can.mine), validate(rules.mine), controller.mine);
/* Teachers for one lesson, the ones free then first */
router.get("/candidates", authorize(can.read), validate(rules.candidates), controller.candidates);
/* One date's plan (default: today) */
router.get("/", authorize(can.read), validate(rules.plan), controller.plan);
/* Plan a lesson; idempotent per (lesson, date): planning it again replaces its plan */
router.put("/", authorize(can.plan), validate(rules.assign), controller.assign);
router.delete("/:substitutionId", authorize(can.plan), validate(rules.cancel), controller.cancel);

export default router;
