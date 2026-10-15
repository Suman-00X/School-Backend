import app from "./app.js";
import env from "./common/config/env.config.js";
import { startDatabases, stopDatabases } from "./bootstrap.js";

const startServer = async () => {
  try {
    await startDatabases();

    const server = app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });

    const shutdown = signal => {
      console.log(`${signal} received, shutting down`);
      server.close(async () => {
        await stopDatabases();
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Server startup failed", error);
    process.exit(1);
  }
};

startServer();
