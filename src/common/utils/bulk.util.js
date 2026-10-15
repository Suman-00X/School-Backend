import { badRequest } from "./appError.util.js";

const MAX_BULK_ITEMS = 200;

/* Validate a bulk request array */
export const requireItems = (items, name, max = MAX_BULK_ITEMS) => {
  if (!Array.isArray(items) || !items.length) throw badRequest(`${name} must be a non-empty array`);
  if (items.length > max) throw badRequest(`At most ${max} ${name} per request`);
  return items;
};
