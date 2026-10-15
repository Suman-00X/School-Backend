export const errorMiddleware = (err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    console.error(err);
  } else {
    console.error(err?.message ?? "Internal server error");
  }

  if (res.headersSent) return next(err);

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
};