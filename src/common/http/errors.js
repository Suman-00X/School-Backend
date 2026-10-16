/* Errors carrying an HTTP status and a machine-readable code.
   Throw them anywhere; the error handler turns them into responses. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  INTERNAL_ERROR: "INTERNAL_ERROR"
});

/* Malformed request (bad JSON, bad header) */
export const badRequest = message => new AppError(400, ERROR_CODES.BAD_REQUEST, message);

/* Input failed schema validation */
export const validationError = (message, details) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, details);

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, ERROR_CODES.UNAUTHORIZED, message);

export const forbidden = (message = "You do not have permission to perform this action") =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);

/* notFound("Class") -> "Class not found" */
export const notFound = (entity = "Resource") => new AppError(404, ERROR_CODES.NOT_FOUND, `${entity} not found`);

export const conflict = message => new AppError(409, ERROR_CODES.CONFLICT, message);

export const tooManyRequests = message => new AppError(429, ERROR_CODES.TOO_MANY_REQUESTS, message);

/* Well-formed input that breaks a business rule */
export const unprocessable = message => new AppError(422, ERROR_CODES.UNPROCESSABLE_ENTITY, message);
