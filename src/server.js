import app from "./app.js";
import env from "./config/env.config.js";
import { closePostgres, connectPostgres } from "./database/postgres/client.js";
import { closeMongo, connectMongo } from "./database/mongo/client.js";

const startServer = async () => {
  try {
    await connectPostgres();
    await connectMongo();

    const server = app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });

    const shutdown = signal => {
      console.log(`${signal} received, shutting down`);
      server.close(async () => {
        await Promise.allSettled([closePostgres(), closeMongo()]);
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
