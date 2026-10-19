import { logger } from "../logging/logger.js";
import { reportError } from "../observability/errorReporter.js";
import { duplicateMessage } from "../database/duplicates.js";
import { AppError, ERROR_CODES } from "./errors.js";

/* PostgreSQL column -> API field name (class_order -> classOrder) */
const toField = column => column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/* An index column or expression -> its column: "lower(class_name)" -> "class_name" */
const columnOf = key => key.replace(/^.*\(/, "").replace(/\).*$/, "").trim();

/* The key in a PostgreSQL error detail, by API field, tenant_id left out:
   "Key (tenant_id, lower(name))=(9f…, tuition) already exists." -> { name: "tuition" }.
   Values are undefined when they cannot be told apart (a value containing ", "
   is only recovered when it belongs to the last column). */
const keyOf = detail => {
  const match = /^Key \((.+?)\)=\((.*)\)[^)]*$/s.exec(detail ?? "");
  if (!match) return null;
  const columns = match[1].split(", ").map(columnOf);
  const parts = match[2].split(", ");
  const values =
    parts.length >= columns.length
      ? [...parts.slice(0, columns.length - 1), parts.slice(columns.length - 1).join(", ")]
      : [];
  return Object.fromEntries(
    columns
      .map((column, index) => [column, values[index]])
      .filter(([column]) => column !== "tenant_id")
      .map(([column, value]) => [toField(column), value])
  );
};

const comparable = value => String(value).trim().replace(/\s+/g, " ").toLowerCase();

/* The value as the client sent it: a string under the same field anywhere in the body
   (bulk items and nested lists included) that matches ignoring case and spacing */
const asSent = (input, field, value, depth = 0) => {
  if (!input || typeof input !== "object" || depth > 3) return undefined;
  if (!Array.isArray(input) && typeof input[field] === "string" && comparable(input[field]) === comparable(value)) {
    return input[field].trim().replace(/\s+/g, " ");
  }
  for (const nested of Object.values(input)) {
    const found = asSent(nested, field, value, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
};

const duplicate = (pg, input) => {
  const key = keyOf(pg.detail);
  const fields = Object.keys(key ?? {});
  if (key && pg.constraint && fields.every(field => key[field] !== undefined)) {
    const values = Object.fromEntries(fields.map(field => [field, asSent(input, field, key[field]) ?? key[field]]));
    const message = duplicateMessage(pg.constraint, values);
    if (message) return message;
  }
  return fields.length ? `A record with this ${fields.join(" and ")} already exists` : "This record already exists";
};

/* Rules enforced inside the database (triggers) raise SQLSTATE "ZA" + HTTP status,
   e.g. ZA409, with a message written for users. Only these messages are passed through. */
const DATABASE_RULE = /^ZA(4\d\d)$/;
const RULE_CODES = { 403: ERROR_CODES.FORBIDDEN, 409: ERROR_CODES.CONFLICT, 422: ERROR_CODES.UNPROCESSABLE_ENTITY };

/* Translate a PostgreSQL error (drizzle wraps it in `cause`) into an AppError.
   Raw driver messages are never sent: they can contain SQL. */
const fromPostgres = (error, input) => {
  const pg = error?.cause?.code ? error.cause : error;
  const code = pg?.code;
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return null;

  const rule = DATABASE_RULE.exec(code);
  if (rule) {
    const status = Number(rule[1]);
    return new AppError(status, RULE_CODES[status] ?? ERROR_CODES.BAD_REQUEST, pg.message);
  }

  const fields = Object.keys(keyOf(pg.detail) ?? {});
  switch (code) {
    case "23505":
      return new AppError(409, ERROR_CODES.CONFLICT, duplicate(pg, input));
    case "23503":
      return new AppError(
        422,
        ERROR_CODES.UNPROCESSABLE_ENTITY,
        fields.length ? `The referenced ${fields.join(", ")} does not exist` : "A referenced record does not exist"
      );
    case "23502":
      return new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `${pg.column ? toField(pg.column) : "A required field"} is required`
      );
    /* Exclusion constraint: e.g. two bookings of one resource overlap in time */
    case "23P01":
      return new AppError(409, ERROR_CODES.CONFLICT, "This overlaps an existing booking for the same dates");
    case "23514":
      return new AppError(
        422,
        ERROR_CODES.UNPROCESSABLE_ENTITY,
        `The request breaks the rule "${pg.constraint ?? "check"}"`
      );
    case "22P02":
    case "22007":
    case "22008":
    case "22003":
      return new AppError(400, ERROR_CODES.VALIDATION_ERROR, "One or more values have an invalid format");
    default:
      return null;
  }
};

/* Any error -> AppError (safe to show), or null when it is unexpected.
   Also used outside HTTP, e.g. to report per-row errors from background jobs.
   `input` (the request body) lets duplicate messages quote values as they were sent. */
export const toAppError = (error, { input } = {}) => {
  if (error instanceof AppError) return error;

  const fromDb = fromPostgres(error, input);
  if (fromDb) return fromDb;

  /* Errors raised by express/body-parser (e.g. malformed JSON) */
  const status = error?.status ?? error?.statusCode;
  if (status >= 400 && status < 500) {
    const message =
      error.type === "entity.parse.failed"
        ? "Request body is not valid JSON"
        : error.expose
          ? error.message
          : "Bad request";
    return new AppError(status, ERROR_CODES.BAD_REQUEST, message);
  }

  return null;
};

/* Every error response has the shape
   { success: false, message, error: { code, details? } } */
/* A message that is safe to show a user for any error (never SQL or internals) */
export const safeErrorMessage = (error, fallback = "Unexpected error") => toAppError(error)?.message ?? fallback;

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const appError = toAppError(err, { input: req.body });

  const requestId = req.id;

  if (!appError) {
    res.locals.error = { code: ERROR_CODES.INTERNAL_ERROR, message: err?.message };
    (req.log ?? logger).error({ err, route: req.routePattern, tenantId: req.context?.tenantId }, "Unhandled error");
    reportError(err, { source: "http", requestId, route: req.routePattern, tenantId: req.context?.tenantId });
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
      error: { code: ERROR_CODES.INTERNAL_ERROR, requestId }
    });
  }

  /* What the client was told, for the request log line */
  res.locals.error = { code: appError.code, message: appError.message };
  return res.status(appError.status).json({
    success: false,
    message: appError.message,
    error: { code: appError.code, requestId, ...(appError.details && { details: appError.details }) }
  });
};

export const notFoundHandler = (req, res) =>
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl.split("?")[0]} does not exist`,
    error: { code: ERROR_CODES.NOT_FOUND, requestId: req.id }
  });
