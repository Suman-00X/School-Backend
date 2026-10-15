/* API field name for a column: class_order -> classOrder */
const toField = column => column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/* Fields named in a PostgreSQL error detail, e.g. "Key (tenant_id, email)=(...)" */
const keyColumns = detail => {
  const match = /Key \(([^)]+)\)=/.exec(detail ?? "");
  if (!match) return "";
  return match[1]
    .split(",")
    .map(column => column.trim())
    .filter(column => column !== "tenant_id")
    .map(toField)
    .join(", ");
};

/* Map a PostgreSQL error (drizzle wraps it in `cause`) to [status, message] */
const fromPostgres = error => {
  const pgError = error?.cause?.code ? error.cause : error;
  const code = pgError?.code;
  if (typeof code !== "string" || code.length !== 5) return null;

  switch (code) {
    case "23505": {
      const columns = keyColumns(pgError.detail);
      return [409, columns ? `Duplicate record (${columns})` : "Duplicate record"];
    }
    case "23503": {
      const columns = keyColumns(pgError.detail);
      return [400, columns ? `Invalid reference (${columns})` : "Invalid reference"];
    }
    case "23502":
      return [400, `${pgError.column ? toField(pgError.column) : "A required field"} is required`];
    case "23514":
      return [400, `Value violates rule ${pgError.constraint ?? ""}`.trim()];
    case "22P02":
    case "22007":
    case "22008":
    case "22003":
      /* invalid uuid / enum / date / out-of-range number; message names the bad value */
      return [400, pgError.message];
    case "21000":
      return [400, "Duplicate entries in request"];
    default:
      return null;
  }
};

export const errorResponse = (res, error, next) => {
  const mapped = fromPostgres(error);
  if (mapped) {
    const [status, message] = mapped;
    return res.status(status).json({ success: false, message });
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
