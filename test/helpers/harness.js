import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import { startInMemoryDatabases } from "../../scripts/lib/inMemoryDatabases.js";

/* One running API + databases shared by every suite (see test/e2e.test.js) */
export const h = {
  /* filled by startHarness() */
  base: null,
  db: null,
  pool: null,
  schema: null,
  tenant: null,
  otherTenant: null,
  admin: null,
  tokens: {},
  modules: {}
};

/* Values created by earlier suites, read by later ones (suites run in order) */
export const world = {};

let databases;
let server;
let storageDir;

export const startHarness = async () => {
  databases = await startInMemoryDatabases();
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "school-files-"));

  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databases.databaseUrl,
    MONGO_URI: databases.mongoUri,
    JWT_SECRET: "test-secret",
    EMAIL_DRIVER: "memory",
    SMS_DRIVER: "memory",
    PAYMENT_PROVIDER: "mock",
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: storageDir,
    RATE_LIMIT_MAX: "100000",
    METRICS_TOKEN: "test-metrics-token"
  });
  delete process.env.REDIS_URL;

  const { startInfrastructure } = await import("../../src/bootstrap.js");
  await startInfrastructure();

  const postgres = await import("../../src/common/database/postgres.js");
  h.db = postgres.db;
  h.pool = postgres.db.$client;
  h.schema = await import("../../src/database.schema.js");
  h.modules.jobs = await import("../../src/common/jobs/queue.js");
  h.modules.outbox = (await import("../../src/common/messaging/outbox.js")).outbox;
  h.modules.gateway = await import("../../src/common/payments/gateway.js");
  h.modules.AuditLog = (await import("../../src/common/audit/auditLog.model.js")).default;

  const app = (await import("../../src/app.js")).default;
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  h.base = `http://127.0.0.1:${server.address().port}`;

  const { tenants, users } = h.schema;
  [h.tenant] = await h.db.insert(tenants).values({ name: "Test School", code: "TST" }).returning();
  [h.otherTenant] = await h.db.insert(tenants).values({ name: "Other School", code: "OTH" }).returning();
  [h.admin] = await h.db
    .insert(users)
    .values({ tenantId: h.tenant.id, firstName: "Ada", lastName: "Admin", email: "admin@test.school", role: "ADMIN" })
    .returning();

  h.tokens.admin = tokenFor(h.admin.id, "ADMIN");
  h.tokens.otherAdmin = tokenFor(h.admin.id, "ADMIN", h.otherTenant.id);
};

export const stopHarness = async () => {
  server?.close();
  const { stopInfrastructure } = await import("../../src/bootstrap.js");
  await stopInfrastructure();
  await databases?.stop();
  fs.rmSync(storageDir, { recursive: true, force: true });
};

export const tokenFor = (userId, role, tenantId = h.tenant.id) =>
  jwt.sign({ userId, tenantId, role }, "test-secret", { expiresIn: "1h" });

/* HTTP client. `as` is a token (default admin); null sends no Authorization. */
export const request = async (method, url, { body, as = h.tokens.admin, headers = {}, raw, form } = {}) => {
  const response = await fetch(h.base + url, {
    method,
    headers: {
      ...(!form && { "content-type": "application/json" }),
      ...(as && { authorization: `Bearer ${as}` }),
      ...headers
    },
    body: form ?? raw ?? (body === undefined ? undefined : JSON.stringify(body))
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  let json = null;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) json = JSON.parse(buffer.toString());
  return { status: response.status, headers: response.headers, body: json, buffer };
};

const describeResponse = res => JSON.stringify(res.body ?? res.buffer.toString().slice(0, 300)).slice(0, 1500);

/* await call("POST", url, { body }, 201) -> response body (asserts the status) */
export const call = async (method, url, options = {}, expectedStatus = 200) => {
  const res = await request(method, url, options);
  assert.equal(res.status, expectedStatus, `${method} ${url} -> ${res.status}: ${describeResponse(res)}`);
  return res.body;
};

export const get = (url, options, status) => call("GET", url, options, status);
export const post = (url, body, options = {}, status = 201) => call("POST", url, { ...options, body }, status);
export const patch = (url, body, options = {}, status = 200) => call("PATCH", url, { ...options, body }, status);
export const del = (url, options, status = 200) => call("DELETE", url, options, status);

export const count = async table => Number((await h.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

export const uuid = () => crypto.randomUUID();

export const person = key => ({ firstName: `F${key}`, lastName: `L${key}`, email: `${key}@test.school` });

/* Wait for background jobs queued by the requests so far */
export const settleJobs = () => h.modules.jobs.drainJobs();
