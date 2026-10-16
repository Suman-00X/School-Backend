/* hostel/allocations: which student sleeps in which bed, by date range; availability, roll-over, leavers */
export { default as allocationRoutes } from "./routes/allocation.routes.js";
export { default as availabilityRoutes } from "./routes/availability.routes.js";
export { default as rolloverRoutes } from "./routes/rollover.routes.js";
export { allocationService } from "./services/allocation.service.js";
