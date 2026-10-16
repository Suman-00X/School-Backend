import app from "./app.js";
import env from "./common/config/env.config.js";
import { logger } from "./common/logging/logger.js";
import { startInfrastructure, stopInfrastructure } from "./bootstrap.js";

try {
  await startInfrastructure();
  /* Behind a load balancer every client would share the balancer's IP, and the
     per-IP sign-in limits would throttle the whole school */
  if (env.isProduction && !Number(process.env.TRUST_PROXY_HOPS)) {
    logger.warn(
      "TRUST_PROXY_HOPS is 0: set it to the number of proxies in front of the API, or per-IP limits see one IP"
    );
  }

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
