/* Dev/test only: throwaway PostgreSQL (embedded binary) + MongoDB (in-memory).
   One PostgreSQL server holds the platform database (school registry) and, once schools
   are provisioned, one database per school; MongoDB likewise. Nothing persists after stop(). */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { MongoMemoryServer } from "mongodb-memory-server";

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

export const startInMemoryDatabases = async () => {
  const port = await freePort();
  const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "school-pg-"));

  const postgres = new EmbeddedPostgres({
    databaseDir,
    port,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
    onError: () => {}
  });
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("school_platform");

  const mongo = await MongoMemoryServer.create();

  return {
    /* The platform database; schools' databases are created next to it */
    databaseUrl: `postgres://postgres:postgres@localhost:${port}/school_platform`,
    adminUrl: `postgres://postgres:postgres@localhost:${port}/postgres`,
    mongoUri: mongo.getUri("school_platform"),
    stop: async () => {
      await mongo.stop();
      await postgres.stop();
      fs.rmSync(databaseDir, { recursive: true, force: true });
    }
  };
};
