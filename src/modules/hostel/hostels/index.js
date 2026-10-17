/* hostel/hostels: residence blocks, their wardens and occupancy */
export { default as hostelRoutes } from "./routes/hostel.routes.js";
export { hostelService } from "./services/hostel.service.js";
/* The warden handover, registered with the framework in src/routes.js */
export { wardenHandover } from "./services/hostel.service.js";
