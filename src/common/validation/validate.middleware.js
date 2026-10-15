import { validationError } from "../http/errors.js";

const LOCATIONS = ["params", "query", "body"];

/* Route guard: validate({ params, query, body }) with zod schemas.
   Valid input replaces the raw input (unknown fields are stripped, values coerced),
   so controllers only ever see validated data. */
export const validate = schemas => (req, res, next) => {
  const details = [];

  for (const location of LOCATIONS) {
    const schema = schemas[location];
    if (!schema) continue;

    const result = schema.safeParse(req[location] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        details.push({ location, field: issue.path.join(".") || location, message: issue.message });
      }
      continue;
    }

    /* Express 5 exposes req.query as a getter */
    Object.defineProperty(req, location, { value: result.data, writable: true, configurable: true, enumerable: true });
  }

  if (details.length) {
    const summary = details.slice(0, 3).map(d => `${d.field} ${d.message}`).join("; ");
    throw validationError(`Invalid request: ${summary}${details.length > 3 ? "; ..." : ""}`, details);
  }

  next();
};
