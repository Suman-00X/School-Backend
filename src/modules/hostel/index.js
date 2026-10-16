import { createRouter } from "../../common/http/router.js";
import { hostelRoutes } from "./hostels/index.js";
import { roomRoutes } from "./rooms/index.js";
import { allocationRoutes, availabilityRoutes, rolloverRoutes } from "./allocations/index.js";
import { resourceRoutes } from "./resources/index.js";
import { resourceAssignmentRoutes } from "./resource-assignments/index.js";
import { myHostelRoutes } from "./my-hostel/index.js";

/* Hostel module, mounted at /api/v1/hostel */
const router = createRouter();

router.use("/hostels", hostelRoutes);
router.use("/rooms", roomRoutes);
router.use("/allocations", allocationRoutes);
router.use("/allocation-rollovers", rolloverRoutes);
router.use("/bed-availability", availabilityRoutes);
router.use("/resources", resourceRoutes);
router.use("/resource-assignments", resourceAssignmentRoutes);
router.use("/my-hostel", myHostelRoutes);

export default router;
