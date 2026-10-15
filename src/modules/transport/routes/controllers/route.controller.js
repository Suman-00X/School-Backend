import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { routeLabel } from "../../shared/utils/format.util.js";
import { routeService } from "../services/route.service.js";

const summary = route => `${routeLabel(route)} (${route.name}) with ${route.stops.length} stop(s)`;

export const routeController = {
  create: async (req, res) => {
    const route = await routeService.create(req.context, req.body);
    return created(res, route, `${summary(route)} created`);
  },

  list: async (req, res) =>
    paginated(res, await routeService.list(req.context, req.query), "Routes retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await routeService.getById(req.context, req.params.routeId), "Route retrieved successfully"),

  update: async (req, res) => {
    const route = await routeService.update(req.context, req.params.routeId, req.body);
    return ok(res, route, `${summary(route)} updated`);
  },

  remove: async (req, res) => {
    const route = await routeService.remove(req.context, req.params.routeId);
    return done(res, `${routeLabel(route)} removed`);
  }
};
