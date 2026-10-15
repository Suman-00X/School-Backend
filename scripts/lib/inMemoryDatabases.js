/* Dev/test only: throwaway PostgreSQL (embedded binary) + MongoDB (in-memory),
   with migrations applied. Nothing persists after stop(). */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { MongoMemoryServer } from "mongodb-memory-server";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export const migrationsFolder = path.resolve(import.meta.dirname, "../../src/database/postgres/migrations");

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
  await postgres.createDatabase("school");

  const databaseUrl = `postgres://postgres:postgres@localhost:${port}/school`;

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await migrate(drizzle({ client: pool }), { migrationsFolder });
  await pool.end();

  const mongo = await MongoMemoryServer.create();

  return {
    databaseUrl,
    mongoUri: mongo.getUri("school"),
    stop: async () => {
      await mongo.stop();
      await postgres.stop();
      fs.rmSync(databaseDir, { recursive: true, force: true });
    }
  };
};
