import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { roomController as controller } from "../controllers/room.controller.js";
import { ROOM_PERMISSIONS as can } from "../permissions/room.permissions.js";
import { roomValidators as rules } from "../validators/room.validator.js";

/* /api/v1/hostel/rooms */
const router = createRouter();

router.post("/", authorize(can.manage), validate(rules.create), controller.create);
router.get("/", authorize(can.read), validate(rules.list), controller.list);
router.get("/:roomId", authorize(can.read), validate(rules.getById), controller.getById);
router.patch("/:roomId", authorize(can.manage), validate(rules.update), controller.update);
router.delete("/:roomId", authorize(can.manage), validate(rules.remove), controller.remove);

export default router;
