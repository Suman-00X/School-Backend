import app from "./app.js";
import env from "./common/config/env.config.js";
import { logger } from "./common/logging/logger.js";
import { startInfrastructure, stopInfrastructure } from "./bootstrap.js";

try {
  await startInfrastructure();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "API listening");
  });

  const shutdown = signal => {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await stopInfrastructure();
      process.exit(0);
    });
    /* Force exit if connections do not drain in time */
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  logger.fatal({ err: error }, "Startup failed");
  process.exit(1);
}
