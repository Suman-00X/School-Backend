/* The single success envelope:
   { success: true, message, data, meta? } */
const send = (res, status, message, data = null, meta) =>
  res.status(status).json({ success: true, message, data, ...(meta && { meta }) });

export const ok = (res, data, message = "Request successful") => {
  if (data?.id) res.locals.entityId = data.id;
  return send(res, 200, message, data);
};

export const created = (res, data, message = "Created successfully") => {
  if (data?.id) res.locals.entityId = data.id;
  return send(res, 201, message, data);
};

/* `result` is { rows, meta } from a repository list */
export const paginated = (res, result, message = "Request successful") =>
  send(res, 200, message, result.rows, result.meta);

/* Soft deletes and other actions with nothing to return */
export const done = (res, message) => send(res, 200, message, null);

/* 202: accepted for processing (background work, or an answer that must not reveal more) */
export const accepted = (res, data, message) => send(res, 202, message, data);
