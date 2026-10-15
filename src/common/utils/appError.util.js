/* Errors with an HTTP status, turned into responses by errorResponse */
export class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export const badRequest = message => new AppError(message, 400);

export const notFound = (entity = "Resource") => new AppError(`${entity} not found`, 404);

export const conflict = message => new AppError(message, 409);
