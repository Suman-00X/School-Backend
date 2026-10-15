import { Router } from "express";

const METHODS = ["get", "post", "put", "patch", "delete"];

/* Remember the matched route template (/api/v1/academics/sections/:sectionId)
   for metrics and logs; req.baseUrl changes again once the error path starts */
const markRoute = (req, res, next) => {
  const path = req.route.path === "/" ? "" : req.route.path;
  req.routePattern = req.baseUrl + path || "/";
  next();
};

/* An Express router that also remembers its routes and mounted sub-routers,
   so the OpenAPI document can be generated from the real route table.
   Use it everywhere instead of express.Router(). */
export const createRouter = options => {
  const router = Router(options);
  const routes = [];
  const mounts = [];

  for (const method of METHODS) {
    const register = router[method].bind(router);
    router[method] = (path, ...handlers) => {
      routes.push({ method, path, handlers });
      return register(path, markRoute, ...handlers);
    };
  }

  const use = router.use.bind(router);
  router.use = (...args) => {
    const path = typeof args[0] === "string" ? args[0] : "/";
    for (const handler of args) {
      if (handler?.__routes) mounts.push({ path, router: handler });
    }
    return use(...args);
  };

  router.__routes = routes;
  router.__mounts = mounts;
  return router;
};
