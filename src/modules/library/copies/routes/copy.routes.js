import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { copyController as controller } from "../controllers/copy.controller.js";
import { COPY_PERMISSIONS as can } from "../permissions/copy.permissions.js";
import { copyValidators as rules } from "../validators/copy.validator.js";

/* /api/v1/library/books/:bookId/copies */
export const bookCopyRoutes = createRouter();

bookCopyRoutes.post("/:bookId/copies", authorize(can.manage), validate(rules.addCopies), controller.addCopies);
bookCopyRoutes.get("/:bookId/copies", authorize(can.read), validate(rules.listForBook), controller.listForBook);

/* /api/v1/library/copies */
export const copyRoutes = createRouter();

copyRoutes.get("/", authorize(can.read), validate(rules.list), controller.list);
copyRoutes.get("/:copyId", authorize(can.read), validate(rules.getById), controller.getById);
copyRoutes.patch("/:copyId", authorize(can.manage), validate(rules.update), controller.update);
