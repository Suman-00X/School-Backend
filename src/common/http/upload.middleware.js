import multer from "multer";
import env from "../config/env.config.js";
import { AppError, ERROR_CODES, badRequest } from "./errors.js";

/* Single-file multipart upload kept in memory (req.file.buffer).
   uploadFile("file", { allowed: ["text/csv"], maxBytes }) */
export const uploadFile = (field, { allowed, maxBytes = env.storage.maxUploadBytes } = {}) => {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (req, file, done) => {
      if (allowed && !allowed.includes(file.mimetype)) {
        return done(badRequest(`File type ${file.mimetype} is not allowed. Allowed: ${allowed.join(", ")}`));
      }
      done(null, true);
    }
  }).single(field);

  const middleware = (req, res, next) =>
    parser(req, res, error => {
      if (!error) {
        if (!req.file) return next(badRequest(`A file is required in the "${field}" form field`));
        return next();
      }
      if (error instanceof AppError) return next(error);
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(
          new AppError(
            413,
            ERROR_CODES.BAD_REQUEST,
            `File is too large. The limit is ${Math.round(maxBytes / 1024 / 1024)} MB`
          )
        );
      }
      return next(badRequest(error.message));
    });

  middleware.__openapi = {
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: { type: "object", required: [field], properties: { [field]: { type: "string", format: "binary" } } }
        }
      }
    }
  };
  return middleware;
};
