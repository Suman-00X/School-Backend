import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { concessionController as controller } from "../controllers/concession.controller.js";
import { CONCESSION_PERMISSIONS as can } from "../permissions/concession.permissions.js";
import { concessionValidators as rules } from "../validators/concession.validator.js";

/* /api/v1/finance/concessions and /api/v1/finance/concession-grants */
export const concessionRoutes = createRouter();
concessionRoutes.post("/", authorize(can.manage), validate(rules.create), controller.create);
concessionRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
concessionRoutes.get("/:concessionId", authorize(can.read), validate(rules.getById), controller.getById);
concessionRoutes.patch("/:concessionId", authorize(can.manage), validate(rules.update), controller.update);
concessionRoutes.delete("/:concessionId", authorize(can.manage), validate(rules.remove), controller.remove);

export const concessionGrantRoutes = createRouter();
concessionGrantRoutes.post("/", authorize(can.manage), validate(rules.grant), controller.grant);
concessionGrantRoutes.get("/", authorize(can.read), validate(rules.listGrants), controller.listGrants);
concessionGrantRoutes.delete("/:grantId", authorize(can.manage), validate(rules.revoke), controller.revoke);
