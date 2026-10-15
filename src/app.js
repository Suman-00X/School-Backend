import express from "express";
import morgan from "morgan";
import env from "./common/config/env.config.js";
import { securityMiddlewares } from "./common/http/security.js";
import { errorHandler, notFoundHandler } from "./common/http/errorHandler.middleware.js";
import v1 from "./routes.js";

const app = express();

app.use(securityMiddlewares());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.isProduction ? "combined" : "dev"));

/* Public liveness check */
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Service is healthy", data: { timestamp: new Date().toISOString() } });
});

app.use("/api/v1", v1);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
