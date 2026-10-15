import { createRouter } from "../../common/http/router.js";
import { hostelRoutes } from "./hostels/index.js";
import { roomRoutes } from "./rooms/index.js";
import { allocationRoutes } from "./allocations/index.js";
import { myHostelRoutes } from "./my-hostel/index.js";

/* Hostel module, mounted at /api/v1/hostel */
const router = createRouter();

router.use("/hostels", hostelRoutes);
router.use("/rooms", roomRoutes);
router.use("/allocations", allocationRoutes);
router.use("/my-hostel", myHostelRoutes);

export default router;
