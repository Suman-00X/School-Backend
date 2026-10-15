import { counter, histogram } from "./metrics.js";

const requests = counter("http_requests_total", "HTTP requests", ["method", "route", "status"]);
const duration = histogram("http_request_duration_seconds", "HTTP request duration", ["method", "route"]);

/* Records every request by route template (set by createRouter), never by raw URL */
export const httpMetrics = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const route = req.routePattern ?? "unmatched";
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    requests.inc({ method: req.method, route, status: res.statusCode });
    duration.observe({ method: req.method, route }, seconds);
  });
  next();
};
