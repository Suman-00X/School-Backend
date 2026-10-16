import { runInTenant } from "./context.js";

/* After authentication: the rest of the request runs in the signed-in user's school databases */
export const tenantContext = (req, res, next) => runInTenant(req.context.tenantId, () => next());

/* Public routes that name their school in the URL (e.g. a payment gateway's webhook) */
export const tenantFromParam = param => (req, res, next) => runInTenant(req.params[param], () => next());
