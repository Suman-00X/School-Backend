/* Prints the live route table as JSON for the API matrix suite (30-api-matrix.suite.js).
   Runs in its own process: loading the routes reads config, which must not happen in the
   test process before the harness has set the environment.

     node test/helpers/route-manifest.js

   Per route: method, path, its permission, the schemas' required query fields, and a
   "probe": inputs the route's validator is certain to reject. An allowed user sending the
   probe gets 400 without anything running; a refused user gets 403 first (authorize runs
   before validate on every route; the suite asserts that too). */
process.env.DATABASE_URL ||= "postgres://manifest@localhost/manifest";
process.env.MONGO_URI ||= "mongodb://localhost/manifest";
process.env.JWT_SECRET ||= "manifest";
process.env.LOG_LEVEL = "silent";

const { z } = await import("../../src/common/validation/zod.js");
const { listPermissions } = await import("../../src/common/auth/catalogue.js");
const { default: v1 } = await import("../../src/routes.js");

const BASE = "/api/v1";
const PUBLIC = ["/api/v1/public", "/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/password-reset"];
const BAD_ID = "not-a-valid-id";
const SAMPLE_IDS = { uuid: "7d0e5f3c-3b1a-4c2e-9f4d-2a6b8c1d0e9f", objectId: "65f0c0ffee0000000000abcd" };
const join = (...parts) => `/${parts.join("/").split("/").filter(Boolean).join("/")}`;

const collect = (router, prefix, out = []) => {
  for (const route of router.__routes) out.push({ ...route, path: join(prefix, route.path) });
  for (const mount of router.__mounts) collect(mount.router, join(prefix, mount.path), out);
  return out;
};

const rejects = (schema, value) => !schema.safeParse(value).success;

/* A query that fails validation: a missing required field, or one bad value */
const badQuery = schema => {
  if (rejects(schema, {})) return {};
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  for (const field of Object.keys(json.properties ?? {})) {
    for (const value of [BAD_ID, "-1", "0", "\u0000", "x".repeat(5000), "9".repeat(20)]) {
      if (rejects(schema, { [field]: value })) return { [field]: value };
    }
  }
  return null;
};

const routes = collect(v1, BASE).map(route => {
  const handlers = route.handlers.flat();
  const permissionAt = handlers.findIndex(h => h.__permission);
  const schemasAt = handlers.findIndex(h => h.__schemas);
  const permission = handlers[permissionAt]?.__permission;
  const schemas = handlers[schemasAt]?.__schemas ?? {};
  const paramNames = [...route.path.matchAll(/:(\w+)/g)].map(m => m[1]);
  const method = route.method.toUpperCase();

  /* Probe: bad ids, else a body that is not an object, else a bad query */
  let probe = null;
  const badParams = Object.fromEntries(paramNames.map(name => [name, BAD_ID]));
  if (schemas.params && rejects(schemas.params, badParams)) probe = { params: BAD_ID };
  else if (method !== "GET" && schemas.body && rejects(schemas.body, [])) probe = { body: [] };
  else if (schemas.query) {
    const query = badQuery(schemas.query);
    if (query) probe = { query };
  }

  /* A well-formed id the validator accepts for each param: a uuid, or a MongoDB ObjectId */
  const idKinds = {};
  for (const name of paramNames) {
    idKinds[name] = !schemas.params?.shape?.[name]
      ? "uuid"
      : (Object.keys(SAMPLE_IDS).find(kind => !schemas.params.shape[name].safeParse(SAMPLE_IDS[kind]).error) ??
        "other");
  }

  const queryJson = schemas.query && z.toJSONSchema(schemas.query, { io: "input", unrepresentable: "any" });
  const leaf = paramNames.at(-1);
  return {
    method,
    path: route.path,
    isPublic: PUBLIC.some(prefix => route.path.startsWith(prefix)),
    permission: permission && {
      key: permission.key,
      module: permission.module,
      roles: [...permission.roles],
      selfService: permission.selfService,
      ownerOnly: permission.ownerOnly
    },
    /* Order of the guards, checked by the suite */
    permissionAt,
    schemasAt,
    guards: handlers.filter(h => h.__permission).length,
    probe,
    requiredQuery: queryJson?.required ?? [],
    idKinds,
    /* GET /things/:thingId: the last segment is a record id (uuid or ObjectId) */
    byId: method === "GET" && route.path.endsWith(`:${leaf}`) && ["uuid", "objectId"].includes(idKinds[leaf])
  };
});

const permissions = listPermissions().map(p => ({
  key: p.key,
  module: p.module,
  roles: [...p.roles],
  selfService: p.selfService,
  ownerOnly: p.ownerOnly
}));

/* Exit once the pipe has taken everything (exiting sooner cuts the output short) */
process.stdout.write(JSON.stringify({ routes, permissions }), () => process.exit(0));
