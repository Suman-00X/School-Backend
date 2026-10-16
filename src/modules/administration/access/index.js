/* administration/access: the permission catalogue, module owners and school-defined operator roles */
export { default as accessRoutes } from "./routes/access.routes.js";
/* The grants resolver, registered with the framework in src/routes.js */
export { accessGrants } from "./services/grants.service.js";
export { accessService } from "./services/userAccess.service.js";
