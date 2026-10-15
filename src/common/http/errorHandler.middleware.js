import { logger } from "../logging/logger.js";
import { AppError, ERROR_CODES } from "./errors.js";

/* PostgreSQL column -> API field name (class_order -> classOrder) */
const toField = column => column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/* Fields named in a PostgreSQL error detail, e.g. "Key (tenant_id, email)=(...)" */
const keyFields = detail => {
  const match = /Key \(([^)]+)\)=/.exec(detail ?? "");
  if (!match) return [];
  return match[1]
    .split(",")
    .map(column => column.trim())
    .filter(column => column !== "tenant_id")
    .map(toField);
};

/* Rules enforced inside the database (triggers) raise SQLSTATE "ZA" + HTTP status,
   e.g. ZA409, with a message written for users. Only these messages are passed through. */
const DATABASE_RULE = /^ZA(4\d\d)$/;
const RULE_CODES = { 403: ERROR_CODES.FORBIDDEN, 409: ERROR_CODES.CONFLICT, 422: ERROR_CODES.UNPROCESSABLE_ENTITY };

/* Translate a PostgreSQL error (drizzle wraps it in `cause`) into an AppError.
   Raw driver messages are never sent: they can contain SQL. */
const fromPostgres = error => {
  const pg = error?.cause?.code ? error.cause : error;
  const code = pg?.code;
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return null;

  const rule = DATABASE_RULE.exec(code);
  if (rule) {
    const status = Number(rule[1]);
    return new AppError(status, RULE_CODES[status] ?? ERROR_CODES.BAD_REQUEST, pg.message);
  }

  const fields = keyFields(pg.detail);
  switch (code) {
    case "23505":
      return new AppError(
        409,
        ERROR_CODES.CONFLICT,
        fields.length ? `A record with this ${fields.join(" and ")} already exists` : "This record already exists"
      );
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
   Also used outside HTTP, e.g. to report per-row errors from background jobs. */
export const toAppError = error => {
  if (error instanceof AppError) return error;

  const fromDb = fromPostgres(error);
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

  const appError = toAppError(err);

  const requestId = req.id;

  if (!appError) {
    (req.log ?? logger).error({ err }, "Unhandled error");
    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
      error: { code: ERROR_CODES.INTERNAL_ERROR, requestId }
    });
  }

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
