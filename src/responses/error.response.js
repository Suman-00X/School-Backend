export const errorResponse = (res, error, next) => {
  if (error?.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  if (error?.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid ${error.path}`
    });
  }

  if (error?.code === 11000) {
    const fields = Object.keys(error.keyValue ?? {}).join(", ");
    return res.status(409).json({
      success: false,
      message: fields ? `Duplicate record (${fields})` : "Duplicate record"
    });
  }

  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  if (next) return next(error);

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
};
