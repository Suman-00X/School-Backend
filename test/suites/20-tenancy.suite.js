import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, request, get, settleJobs } from "../helpers/harness.js";

/* Database per school (D-45): every school's data lives in its own databases */
describe("tenancy: a database per school", () => {
  it("registers each school with its own PostgreSQL and MongoDB databases", async () => {
    const { rows } = await h.platformPool.query(
      "SELECT code, status, database_name, mongo_database_name FROM platform_tenants ORDER BY code"
    );
    assert.deepEqual(
      rows.map(r => [r.code, r.status, r.database_name, r.mongo_database_name]),
      [
        ["OTH", "ACTIVE", "school_oth", "school_oth"],
        ["TST", "ACTIVE", "school_tst", "school_tst"]
      ]
    );
    const [mine, theirs] = await Promise.all(
      [h.pool, h.otherPool].map(async pool => (await pool.query("SELECT current_database() AS db")).rows[0].db)
    );
    assert.deepEqual([mine, theirs], ["school_tst", "school_oth"]);
    /* The platform database holds no school data at all: the registry, the login
       directory (email digests only, never addresses) and the admin console's system admins */
    const { rows: tables } = await h.platformPool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    assert.deepEqual(
      tables.map(t => t.table_name),
      ["platform_account_directory", "platform_admins", "platform_tenants"]
    );
  });

  it("never puts one school's rows in another school's database", async () => {
    const count = async (pool, sql, params = []) => Number((await pool.query(sql, params)).rows[0].count);
    assert.ok((await count(h.pool, "SELECT count(*) FROM students")) > 0);
    assert.equal(await count(h.otherPool, "SELECT count(*) FROM students"), 0);
    assert.equal(await count(h.otherPool, "SELECT count(*) FROM users WHERE tenant_id = $1", [h.tenant.id]), 0);
    assert.equal(await count(h.pool, "SELECT count(*) FROM users WHERE tenant_id = $1", [h.otherTenant.id]), 0);

    /* MongoDB too: each school's audit trail is in its own database */
    const ours = await h.modules.AuditLog.countDocuments({});
    const theirs = await h.modules.tenancy.runInTenant(h.otherTenant.id, () =>
      h.modules.tenancy.tenantMongo().collection("auditlogs").countDocuments({ tenantId: h.tenant.id })
    );
    assert.ok(ours > 0);
    assert.equal(theirs, 0);
  });

  it("locks out a suspended school, then lets it back in", async () => {
    const suspend = status =>
      h.platformPool.query("UPDATE platform_tenants SET status = $1 WHERE id = $2", [status, h.otherTenant.id]);
    await suspend("SUSPENDED");
    await h.modules.tenancy.refreshTenantRecord(h.otherTenant.id);
    const blocked = await request("GET", "/api/v1/academics/academic-years", { as: h.tokens.otherAdmin });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.message, "This school's account is suspended. Please contact support.");
    const signIn = await request("POST", "/api/v1/auth/login", {
      as: null,
      body: { schoolCode: "OTH", email: "admin@other.school", password: "Whatever1" }
    });
    assert.equal(signIn.status, 401, "same answer as an unknown school");

    await suspend("ACTIVE");
    await h.modules.tenancy.refreshTenantRecord(h.otherTenant.id);
    await get("/api/v1/academics/academic-years", { as: h.tokens.otherAdmin });
  });

  it("runs scheduled work once in every school's own databases", async () => {
    await h.modules.jobs.enqueue("schedule:finance.applyLateFees.daily");
    await settleJobs();
    const metrics = (
      await request("GET", "/metrics", { as: null, headers: { authorization: "Bearer test-metrics-token" } })
    ).buffer.toString();
    assert.match(metrics, /school_jobs_total\{job="schedule:finance\.applyLateFees\.daily",outcome="completed"\} 1/);
    assert.match(metrics, /school_tenant_databases_open \d+/);
  });
});
