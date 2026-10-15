import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { bookController as controller } from "../controllers/book.controller.js";
import { BOOK_PERMISSIONS as can } from "../permissions/book.permissions.js";
import { bookValidators as rules } from "../validators/book.validator.js";

/* /api/v1/library/books */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:bookId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:bookId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:bookId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
