export const notFoundMiddleware = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
};

export const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  /* Client errors raised by express itself (e.g. malformed JSON body) */
  const status = err?.statusCode ?? err?.status;
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      success: false,
      message: err.expose ? err.message : "Bad request"
    });
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.error(err);
  } else {
    console.error(err?.message ?? "Internal server error");
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
};
