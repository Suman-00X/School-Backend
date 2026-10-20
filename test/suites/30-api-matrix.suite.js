import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, person, tokenFor } from "../helpers/harness.js";

/* Every endpoint, for every kind of user: the built-in roles and custom (operator / owner)
   users. Generated from the live route table (test/helpers/route-manifest.js), so a new
   endpoint is covered the day it is added.

   Per protected endpoint:
   - negative: no token, a forged token and an expired token are refused (401)
   - per user: a user whose role or grants hold the route's permission gets past it (the
     request is built to fail validation, so nothing runs: 400); everyone else gets 403
   - GET: every allowed user reads it with real ids without a server error (ADMIN: 200);
     an unknown id is 404; another school's administrator cannot read this school's records

   Runs after every other suite, on the data they created. */

const { routes, permissions } = JSON.parse(
  execFileSync(process.execPath, [path.join(import.meta.dirname, "../helpers/route-manifest.js")], {
    maxBuffer: 64 * 1024 * 1024
  })
);

const AC = "/api/v1/administration/access";
const BAD_ID = "not-a-valid-id";
const SAMPLE_IDS = { uuid: "7d0e5f3c-3b1a-4c2e-9f4d-2a6b8c1d0e9f", objectId: "65f0c0ffee0000000000abcd" };
const DEFAULT_REFUSAL = "You do not have permission to perform this action";
const today = todayIn("Asia/Kolkata");

/* The add-on modules: run by an owner role, with school-defined operator roles (D-51, D-67) */
const OWNER_ROLES = {
  library: "LIBRARIAN",
  transport: "TRANSPORT_MANAGER",
  hostel: "HOSTEL_MANAGER",
  hr: "HR_MANAGER",
  inventory: "INVENTORY_MANAGER"
};
const ASSIGNABLE = [
  "PRINCIPAL",
  "ACCOUNTANT",
  "STAFF",
  "HR_MANAGER",
  "LIBRARIAN",
  "TRANSPORT_MANAGER",
  "HOSTEL_MANAGER",
  "INVENTORY_MANAGER",
  "TEACHER"
];
/* An owner by assignment also reaches the access endpoints (OWNER_ACCESS_KEYS) */
const OWNER_ACCESS_KEYS = [
  "administration.access.read",
  "administration.access.manage",
  "administration.access.handOver"
];

const byKey = new Map(permissions.map(p => [p.key, p]));
const grantable = module => permissions.filter(p => p.module === module && !p.ownerOnly && !p.selfService);
const reads = module => grantable(module).filter(p => p.key.endsWith(".read"));
const ownerKeys = module => [
  ...permissions.filter(p => p.module === module && !p.selfService).map(p => p.key),
  ...OWNER_ACCESS_KEYS
];

/* Built-in accounts: created by earlier suites (02, 03, 09b) */
const BUILT_IN = [
  { key: "admin", label: "ADMIN", role: "ADMIN", account: () => h.admin.id },
  { key: "principal", label: "PRINCIPAL", role: "PRINCIPAL", account: () => world.principal.userId },
  { key: "accountant", label: "ACCOUNTANT", role: "ACCOUNTANT", account: () => world.accountant.userId },
  { key: "office", label: "STAFF", role: "STAFF", account: () => world.office.userId },
  { key: "teacher", label: "TEACHER", role: "TEACHER", account: () => world.teacher.userId },
  { key: "student1", label: "STUDENT", role: "STUDENT", account: () => world.s1.userId },
  { key: "mother", label: "PARENT", role: "PARENT", account: () => world.motherUserId },
  { key: "librarian", label: "LIBRARIAN", role: "LIBRARIAN", account: () => world.librarian.userId },
  {
    key: "transportManager",
    label: "TRANSPORT_MANAGER",
    role: "TRANSPORT_MANAGER",
    account: () => world.transportManager.userId
  },
  { key: "hostelManager", label: "HOSTEL_MANAGER", role: "HOSTEL_MANAGER", account: () => world.hostelManager.userId },
  { key: "hrManager", label: "HR_MANAGER", role: "HR_MANAGER", account: () => world.hrManager.userId },
  {
    key: "inventoryManager",
    label: "INVENTORY_MANAGER",
    role: "INVENTORY_MANAGER",
    account: () => world.inventoryManager.userId
  }
];

/* Custom users: accounts holding school-defined operator roles or module ownership.
   `grants`: the permission keys their live assignments give (beyond their role). */
const CUSTOM = [
  {
    key: "mxLibraryDesk",
    label: "custom STAFF + operator 'Library desk' (every grantable library permission)",
    role: "STAFF",
    operators: [{ module: "library", name: "Matrix library desk", keys: grantable("library") }]
  },
  {
    key: "mxTransportViewer",
    label: "custom STAFF + operator 'Transport viewer' (read-only)",
    role: "STAFF",
    operators: [{ module: "transport", name: "Matrix transport viewer", keys: reads("transport") }]
  },
  {
    key: "mxHostelAssistant",
    label: "custom TEACHER + operator 'Hostel assistant' (reads + one manage)",
    role: "TEACHER",
    operators: [
      {
        module: "hostel",
        name: "Matrix hostel assistant",
        keys: [...reads("hostel"), grantable("hostel").find(p => !p.key.endsWith(".read"))]
      }
    ]
  },
  {
    key: "mxPayrollClerk",
    label: "custom ACCOUNTANT + operator 'HR clerk' (every other grantable HR permission)",
    role: "ACCOUNTANT",
    operators: [{ module: "hr", name: "Matrix HR clerk", keys: grantable("hr").filter((_, i) => i % 2 === 0) }]
  },
  {
    key: "mxStoreKeeper",
    label: "custom STAFF + operator 'Store keeper' (every grantable inventory permission)",
    role: "STAFF",
    operators: [{ module: "inventory", name: "Matrix store keeper", keys: grantable("inventory") }]
  },
  {
    key: "mxMultiOperator",
    label: "custom STAFF + two operator roles (library reader + inventory reader)",
    role: "STAFF",
    operators: [
      { module: "library", name: "Matrix library reader", keys: reads("library") },
      { module: "inventory", name: "Matrix inventory reader", keys: reads("inventory") }
    ]
  },
  {
    key: "mxHostelOwner",
    label: "custom STAFF + owner of the Hostel module",
    role: "STAFF",
    owns: ["hostel"]
  },
  {
    key: "mxHrOwnerPrincipal",
    label: "custom PRINCIPAL + owner of the HR module",
    role: "PRINCIPAL",
    owns: ["hr"]
  },
  {
    key: "mxRevokedOperator",
    label: "custom STAFF whose transport operator role was revoked (role access only)",
    role: "STAFF",
    revoked: [{ module: "transport", name: "Matrix transport desk (revoked)", keys: grantable("transport") }]
  },
  {
    key: "mxScheduledOperator",
    label: "custom STAFF whose library operator role starts tomorrow (role access only)",
    role: "STAFF",
    scheduled: [{ module: "library", name: "Matrix library desk (from tomorrow)", keys: grantable("library") }]
  }
].map(user => ({
  ...user,
  grants: new Set([
    ...(user.operators ?? []).flatMap(op => op.keys.map(p => p.key)),
    ...(user.owns ?? []).flatMap(ownerKeys)
  ])
}));

const USERS = [...BUILT_IN.map(user => ({ ...user, grants: new Set() })), ...CUSTOM];

/* Expected policy: the role is listed, or (never for self-service) the user owns the module
   by role or holds a grant for the permission */
const allows = (user, permission) => {
  if (permission.roles.includes(user.role)) return true;
  if (permission.selfService || !ASSIGNABLE.includes(user.role)) return false;
  return OWNER_ROLES[permission.module] === user.role || user.grants.has(permission.key);
};

/* One token per user. Logout ends the session of the token it is called with, so its calls
   each get a fresh token. */
const tokens = {};
const tokenOf = user => tokens[user.key];
const freshToken = user => tokenFor(user.userId, user.role);

const isRouteRefusal = res => res.status === 403 && res.body?.error?.code === "FORBIDDEN";
const isPermissionRefusal = res => isRouteRefusal(res) && res.body.message === DEFAULT_REFUSAL;
const show = res => `${res.status} ${JSON.stringify(res.body ?? res.buffer.toString().slice(0, 200)).slice(0, 400)}`;

const withQuery = (url, query) => {
  const entries = Object.entries(query ?? {}).filter(([, value]) => value !== undefined);
  return entries.length ? `${url}?${new URLSearchParams(entries)}` : url;
};

/* The request a route's validator rejects (see route-manifest.js) */
const probeOf = route => {
  const url = route.path.replace(/:(\w+)/g, (_, name) =>
    route.probe?.params ? BAD_ID : (SAMPLE_IDS[route.idKinds[name]] ?? "1")
  );
  return {
    url: withQuery(url, route.probe?.query),
    body: route.method === "GET" ? undefined : route.probe?.body
  };
};

const signed = (payload, secret = "test-secret", options = { expiresIn: "1h" }) => jwt.sign(payload, secret, options);
const access = user => ({
  userId: user,
  tenantId: h.tenant.id,
  role: "ADMIN",
  typ: "access",
  sid: crypto.randomUUID()
});

/* ---------- Real ids for GET routes: each id comes from its parent collection ---------- */

const listRoute = new Map(routes.filter(r => r.method === "GET").map(r => [r.path, r]));
/* Ids the earlier suites made (filled in setUp), for parents that have no list endpoint */
const seedIds = new Map();
const lists = new Map();

/* The year-end suite has made next year current; the data lives in the year before */
const yearHeader = () => ({ "x-academic-year-id": world.y1.id });

const queryDefaults = () => ({
  classId: world.c1?.id,
  sectionId: world.s1A?.id,
  studentId: world.s1?.id,
  userId: h.admin.id,
  examId: seedIds.get("examId"),
  from: addDays(today, -60),
  to: today,
  fromDate: addDays(today, -60),
  date: today,
  since: addDays(today, -60),
  /* Certificate drafts */
  type: "BONAFIDE"
});

/* Routes needing one of several optional filters */
const EXTRA_QUERY = {
  "/api/v1/academics/result-policies/resolution": ["sectionId"],
  "/api/v1/academics/class-subjects": ["classId"],
  "/api/v1/me/students/:studentId/report-cards/pdf": ["examId"]
};

const requiredQuery = template =>
  Object.fromEntries(
    [...(listRoute.get(template)?.requiredQuery ?? []), ...(EXTRA_QUERY[template] ?? [])].map(name => [
      name,
      queryDefaults()[name]
    ])
  );

/* A list's records, completed ones first (a receipt needs a successful payment).
   as: whose list (self-service lists show the caller's own records). year: null for the current year. */
const listItems = async (url, { as = h.tokens.admin, year = world.y1.id } = {}) => {
  const key = `${as}|${year}|${url}`;
  if (!lists.has(key)) {
    const res = await request("GET", url, { as, headers: year ? { "x-academic-year-id": year } : {} });
    const items = Array.isArray(res.body?.data) ? res.body.data : [];
    const done = item => item.status === "SUCCEEDED" || Boolean(item.resultsPublishedAt);
    lists.set(key, [...items.filter(done), ...items.filter(item => !done(item))]);
  }
  return lists.get(key);
};

const idOf = (item, name) => item[name] ?? item.id ?? item._id;

const PER_PARAM = 4;
const SELF_PATH = /\/me\/|\/my-/;
const MAX_CANDIDATES = 40;

/* Records to try for an id with no parent collection, or for a required filter: the seed
   first, then the school's others (a scheme's results need a section that sits its exams) */
const ids = async (url, options) => (await listItems(url, options)).map(item => idOf(item, ""));
const POOLS = {
  /* This year's sections too (only those can be covered by a substitute) */
  sectionId: async () => [
    ...(await ids("/api/v1/academics/sections?limit=100")),
    ...(await ids("/api/v1/academics/sections?limit=100", { year: null }))
  ],
  studentId: () => ids("/api/v1/users/students?limit=100"),
  /* Absent teachers' lessons today (substitution planning; none when today has no classes) */
  timetableSlotId: async () =>
    ((await request("GET", `/api/v1/academics/substitutions?date=${today}`)).body?.data?.absentTeachers ?? []).flatMap(
      teacher => teacher.periods.map(period => period.timetableSlotId)
    ),
  examId: () => ids("/api/v1/academics/exams?limit=100"),
  /* A submission's or a homework's own attachments; else a document uploaded in setUp */
  fileId: async chosen => {
    if (chosen.submissionId) {
      const files = await h.model("StoredFile").find({ ownerType: "SUBMISSION", ownerId: chosen.submissionId }).lean();
      return files.map(file => String(file._id));
    }
    if (chosen.homeworkId) {
      const homework = await request("GET", `/api/v1/academics/homework/${chosen.homeworkId}`);
      return (homework.body?.data?.attachments ?? []).map(file => file.id);
    }
    return [];
  },
  /* Payslips are listed per payroll run */
  payslipId: async () => {
    const [run] = await ids("/api/v1/hr/payroll-runs");
    return run ? ids(`/api/v1/hr/payroll-runs/${run}/payslips`) : [];
  }
};
/* chosen: the ids already picked for the path's earlier params */
const pool = async (name, chosen = {}) => {
  /* A file belongs to the homework or submission in the path */
  if (name === "fileId" && (chosen.submissionId || chosen.homeworkId)) return POOLS.fileId(chosen);
  return [...new Set([seedIds.get(name), ...((await POOLS[name]?.(chosen)) ?? [])].filter(Boolean))];
};

/* More families from the earlier suites' data (setUp), each with records the first student and
   parent lack: fees paid and refunded, published report cards. ids: their records that the
   portal has no list endpoint for. */
const families = [];

const product = (lists, cap) =>
  lists.reduce((combos, values) => combos.flatMap(combo => values.map(value => [...combo, value])).slice(0, cap), [[]]);

/* Required query combinations for a route */
const queryCandidates = async template => {
  const defaults = requiredQuery(template);
  const names = Object.keys(defaults);
  const values = await Promise.all(names.map(async name => (POOLS[name] ? await pool(name) : [defaults[name]])));
  return product(values, MAX_CANDIDATES).map(combo => Object.fromEntries(names.map((name, i) => [name, combo[i]])));
};

/* "/api/v1/library/books/:bookId/copies/:copyId" -> paths with real ids (several, since a given
   record may legitimately not fit: e.g. a deliberately tampered report card). Each id comes
   from its parent collection; seeds only where there is no collection.
   leafId: put this id last instead (an unknown id). */
const candidatePaths = async (template, { leafId, as, pooled = !SELF_PATH.test(template), ownPool } = {}) => {
  let partials = [{ concrete: [], shape: [], chosen: {} }];
  const segments = template.split("/");
  for (const [index, segment] of segments.entries()) {
    if (!segment.startsWith(":")) {
      partials = partials.map(p => ({ ...p, concrete: [...p.concrete, segment], shape: [...p.shape, segment] }));
      continue;
    }
    const name = segment.slice(1);
    const next = [];
    for (const partial of partials) {
      const parent = partial.shape.join("/");
      let values;
      if (leafId && index === segments.length - 1) values = [leafId];
      else if (listRoute.has(parent)) {
        const query = (await queryCandidates(parent))[0];
        const items = await listItems(withQuery(partial.concrete.join("/"), query), { as });
        const listed = items.map(item => idOf(item, name));
        /* Known-good records first (a seed, or the family's own), when the list has them */
        const known = [seedIds.get(name), ...(ownPool?.(name) ?? [])].filter(id => listed.includes(id));
        values = [...new Set([...known, ...listed.slice(0, PER_PARAM)])];
        /* A list scoped to the caller may be empty for them: try the school's records
           (not on self-service paths, where only the caller's own records are theirs) */
        if (!values.length && pooled) values = await pool(name, partial.chosen);
      } else if (pooled) values = await pool(name, partial.chosen);
      /* Self-service: a homework's own attachments are the caller's as much as the homework */
      else if (name === "fileId" && partial.chosen.homeworkId) values = await pool(name, partial.chosen);
      else values = ownPool?.(name) ?? [];
      for (const value of values.filter(Boolean)) {
        next.push({
          concrete: [...partial.concrete, encodeURIComponent(value)],
          shape: [...partial.shape, segment],
          chosen: { ...partial.chosen, [name]: value }
        });
      }
    }
    partials = next.slice(0, MAX_CANDIDATES);
  }
  const queries = await queryCandidates(template);
  return product([partials, queries], MAX_CANDIDATES).map(([p, query]) => withQuery(p.concrete.join("/"), query));
};

/* The path ADMIN read successfully (other users and schools read the same record), else the first */
const readable = new Map();
const realPath = async (route, as) => readable.get(route.path) ?? (await candidatePaths(route.path, { as }))[0] ?? null;

/* ---------- Custom users: created through the API, as a school would ---------- */

const setUp = async () => {
  /* A family with a successful payment that was refunded: their receipts and invoice are
     theirs to read (the portal has no list endpoints to find them) */
  const { rows } = await h.pool.query(
    `SELECT s.id AS student_id, s.user_id AS student_user, r.id AS refund_id,
            (SELECT p.user_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
              WHERE sp.student_id = s.id ORDER BY sp.created_at LIMIT 1) AS parent_user,
            (SELECT py.id FROM payments py WHERE py.student_id = s.id AND py.status = 'SUCCEEDED'
              ORDER BY py.created_at LIMIT 1) AS payment_id,
            (SELECT py.invoice_id FROM payments py WHERE py.student_id = s.id AND py.status = 'SUCCEEDED'
              ORDER BY py.created_at LIMIT 1) AS invoice_id
       FROM payment_refunds r
       JOIN students s ON s.id = r.student_id
      WHERE r.status = 'PROCESSED'
      ORDER BY 4 IS NULL, 5 IS NULL, r.created_at
      LIMIT 1`
  );
  if (rows[0]?.parent_user && rows[0].payment_id) {
    families.push({
      STUDENT: rows[0].student_user,
      PARENT: rows[0].parent_user,
      ids: {
        studentId: rows[0].student_id,
        invoiceId: rows[0].invoice_id,
        paymentId: rows[0].payment_id,
        refundId: rows[0].refund_id
      }
    });
  }
  /* A family whose child has published report cards (15-results) */
  const { rows: graded } = await h.pool.query(
    `SELECT s.user_id AS student_user,
            (SELECT p.user_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
              WHERE sp.student_id = s.id ORDER BY sp.created_at LIMIT 1) AS parent_user
       FROM exams x
       JOIN student_enrollments e ON e.academic_year_id = x.academic_year_id
       JOIN students s ON s.id = e.student_id
      WHERE x.results_published_at IS NOT NULL
      ORDER BY 2 IS NULL, x.results_published_at
      LIMIT 1`
  );
  if (graded[0]?.parent_user)
    families.push({ STUDENT: graded[0].student_user, PARENT: graded[0].parent_user, ids: {} });

  /* The Reports module only reads, and only writes are audited, so its activity log stays
     empty; one entry filed under it checks the endpoint reads entries back */
  await h.modules.AuditLog.create({
    tenantId: h.tenant.id,
    userId: h.admin.id,
    role: "ADMIN",
    module: "reports",
    action: "export",
    summary: "Matrix fixture entry",
    method: "POST",
    path: "/api/v1/reports/exports",
    statusCode: 200
  });

  world.motherUserId ??= (await get(`/api/v1/users/parents/${world.motherId}`)).data.userId;
  /* Fresh tokens: earlier suites end sessions (a password reset revokes older tokens) */
  for (const user of USERS.filter(u => u.account)) {
    user.userId = user.account();
    tokens[user.key] = tokenFor(user.userId, user.role);
  }

  /* The matrix expects role-only access from the built-in accounts. An earlier suite may have
     given one module access (the office clerk runs a hostel desk): use a new account instead. */
  for (const user of USERS.filter(u => u.account && ASSIGNABLE.includes(u.role))) {
    const held = await get(`${AC}/assignments?userId=${user.userId}&status=ACTIVE&limit=1`);
    if (!held.meta.total) continue;
    const fresh =
      user.role === "TEACHER"
        ? (await post("/api/v1/users/teachers", { user: person(`mx-${user.key}`) })).data
        : (await post("/api/v1/users/staff", { role: user.role, user: person(`mx-${user.key}`) })).data;
    user.userId = fresh.userId;
    tokens[user.key] = tokenFor(user.userId, user.role);
  }

  /* Ids the earlier suites made, for routes whose parent collection cannot be listed */
  for (const [name, value] of Object.entries({
    studentId: world.s1?.id,
    sectionId: world.s1A?.id,
    classId: world.c1?.id,
    academicYearId: world.y1?.id,
    teacherId: world.teacher?.id,
    parentId: world.motherId,
    staffId: world.principal?.id,
    userId: h.admin.id
  })) {
    if (value) seedIds.set(name, value);
  }
  /* The other school runs a year too, so its year-scoped routes reach the record lookup */
  const otherYears = await get("/api/v1/academics/academic-years", { as: h.tokens.otherAdmin });
  if (otherYears.data.length && !otherYears.data.some(year => year.isCurrent)) {
    await patch(
      `/api/v1/academics/academic-years/${otherYears.data[0].id}`,
      { isCurrent: true },
      { as: h.tokens.otherAdmin }
    );
  }
  if (!otherYears.data.length) {
    await post(
      "/api/v1/academics/academic-years",
      { yearName: "2026-27", startDate: "2026-06-01", endDate: "2027-03-31", isCurrent: true },
      { as: h.tokens.otherAdmin }
    );
  }

  /* A school document to read back (the earlier suites' ones are deleted by then) */
  const form = new FormData();
  form.append(
    "file",
    new Blob([Buffer.from("%PDF-1.4\n%matrix document\n")], { type: "application/pdf" }),
    "Matrix.pdf"
  );
  for (const [key, value] of Object.entries({ ownerType: "GENERAL", category: "DOCUMENT" })) form.append(key, value);
  const uploaded = await request("POST", "/api/v1/files", { form });
  assert.equal(uploaded.status, 201, show(uploaded));
  seedIds.set("fileId", uploaded.body.data.id);

  /* A homework submission with an attached answer */
  const answer = await h.model("StoredFile").findOne({ ownerType: "SUBMISSION" }).lean();
  if (answer) {
    const submission = (
      await h.pool.query("SELECT id, homework_id FROM homework_submissions WHERE id = $1", [answer.ownerId])
    ).rows[0];
    if (submission) {
      seedIds.set("submissionId", submission.id);
      seedIds.set("homeworkId", submission.homework_id);
    }
  }

  const [exam] = await listItems("/api/v1/academics/exams");
  if (exam) seedIds.set("examId", exam.id);

  const accountFor = async user => {
    const created =
      user.role === "TEACHER"
        ? (await post("/api/v1/users/teachers", { user: person(user.key) })).data
        : (await post("/api/v1/users/staff", { role: user.role, user: person(user.key) })).data;
    return created.userId;
  };
  const operatorRole = async ({ module, name, keys }) =>
    (await post(`${AC}/operator-roles`, { module, name, permissions: keys.map(p => p.key) })).data;

  for (const user of CUSTOM) {
    user.userId = await accountFor(user);
    tokens[user.key] = tokenFor(user.userId, user.role);
    for (const spec of user.operators ?? []) {
      const role = await operatorRole(spec);
      await post(`${AC}/assignments`, { kind: "OPERATOR", operatorRoleId: role.id, userId: user.userId });
    }
    for (const module of user.owns ?? []) {
      await post(`${AC}/assignments`, { kind: "OWNER", module, userId: user.userId });
    }
    for (const spec of user.revoked ?? []) {
      const role = await operatorRole(spec);
      const made = await post(`${AC}/assignments`, { operatorRoleId: role.id, userId: user.userId });
      await del(`${AC}/assignments/${made.data.id}`);
    }
    for (const spec of user.scheduled ?? []) {
      const role = await operatorRole(spec);
      await post(`${AC}/assignments`, {
        operatorRoleId: role.id,
        userId: user.userId,
        validFrom: addDays(today, 1)
      });
    }
  }
};

describe("API matrix", () => {
  before(setUp, { timeout: 120_000 });

  /* ---------- Policy: the route table itself ---------- */

  describe("API matrix: route table and policy", () => {
    const protectedRoutes = routes.filter(r => !r.isPublic);

    it("guards every protected endpoint with exactly one permission", () => {
      const unguarded = protectedRoutes.filter(r => r.guards !== 1).map(r => `${r.method} ${r.path}`);
      assert.deepEqual(unguarded, []);
    });

    it("checks the permission before validation and before any other middleware", () => {
      const late = protectedRoutes
        .filter(r => r.permissionAt !== 0 || (r.schemasAt >= 0 && r.schemasAt < r.permissionAt))
        .map(r => `${r.method} ${r.path}`);
      assert.deepEqual(late, []);
    });

    it("documents every endpoint in docs/ENDPOINTS.md", () => {
      const doc = fs.readFileSync(path.join(import.meta.dirname, "../../docs/ENDPOINTS.md"), "utf8");
      const missing = routes
        .filter(r => !doc.includes(`| ${r.method} | \`${r.path}\` |`))
        .map(r => `${r.method} ${r.path}`);
      assert.deepEqual(missing, []);
    });

    it("D-51: teachers hold nothing in the non-academic modules beyond self-service and leave types", () => {
      const held = permissions
        .filter(p => OWNER_ROLES[p.module] && p.roles.includes("TEACHER") && !p.selfService)
        .map(p => p.key);
      assert.deepEqual(held, ["hr.leaveTypes.read"]);
    });

    it("students and parents change nothing outside their own sign-in, portal and self-service", () => {
      const writes = protectedRoutes
        .filter(r => r.method !== "GET" && r.permission.roles.some(role => role === "STUDENT" || role === "PARENT"))
        .filter(
          r => !r.path.startsWith("/api/v1/auth/") && !r.path.startsWith("/api/v1/me/") && !r.permission.selfService
        )
        .map(r => `${r.method} ${r.path}`);
      assert.deepEqual(writes, []);
    });

    it("only an administrator can make module owners or see everyone's access", () => {
      assert.deepEqual(byKey.get("administration.access.manageOwners").roles, ["ADMIN"]);
      assert.deepEqual(byKey.get("administration.access.readAll").roles, ["ADMIN"]);
    });

    it("each module's operator management is owner-only and never given to operators", () => {
      for (const module of Object.keys(OWNER_ROLES)) {
        const manage = byKey.get(`${module}.access.manage`);
        assert.deepEqual([manage.ownerOnly, manage.roles], [true, ["ADMIN", OWNER_ROLES[module]]], module);
      }
    });

    it("the catalogue offers operators exactly the grantable permissions this suite expects", async () => {
      for (const module of Object.keys(OWNER_ROLES)) {
        const [catalogue] = (await get(`${AC}/permissions?module=${module}`)).data;
        const offered = catalogue.resources
          .flatMap(r => r.permissions)
          /* Keys only earlier suites register at run time (testOnly) are not in the route table */
          .filter(p => p.grantable && byKey.has(p.key))
          .map(p => p.key)
          .sort();
        assert.deepEqual(
          offered,
          grantable(module)
            .map(p => p.key)
            .sort(),
          module
        );
      }
    });
  });

  /* ---------- Custom roles: how operator roles and ownership are given and taken ---------- */

  describe("API matrix: custom role rules", () => {
    const status = async (method, url, as, body) => (await request(method, url, { as, body })).status;

    it("refuses an operator role carrying an owner-only permission", async () => {
      const res = await request("POST", `${AC}/operator-roles`, {
        body: { module: "library", name: "Matrix bad role", permissions: ["library.access.manage"] }
      });
      assert.equal(res.status, 422, show(res));
    });

    it("refuses an operator role carrying another module's permission", async () => {
      const res = await request("POST", `${AC}/operator-roles`, {
        body: { module: "library", name: "Matrix bad role 2", permissions: [grantable("hr")[0].key] }
      });
      assert.equal(res.status, 422, show(res));
    });

    it("refuses an operator role with an unknown permission or none", async () => {
      const unknown = await request("POST", `${AC}/operator-roles`, {
        body: { module: "library", name: "Matrix bad role 3", permissions: ["library.nothing.here"] }
      });
      assert.equal(unknown.status, 422, show(unknown));
      const empty = await request("POST", `${AC}/operator-roles`, {
        body: { module: "library", name: "Matrix bad role 4", permissions: [] }
      });
      assert.equal(empty.status, 400, show(empty));
    });

    it("refuses module access for students, parents and administrators", async () => {
      const [role] = (await get(`${AC}/operator-roles?module=library&search=Matrix library reader`)).data;
      for (const userId of [world.s1.userId, h.admin.id]) {
        const res = await request("POST", `${AC}/assignments`, { body: { operatorRoleId: role.id, userId } });
        assert.equal(res.status, 422, show(res));
      }
    });

    it("an operator cannot manage operator roles, even in their own module", async () => {
      const as = tokens.mxLibraryDesk;
      assert.equal(await status("GET", `${AC}/operator-roles`, as), 403);
      assert.equal(
        await status("POST", `${AC}/operator-roles`, as, {
          module: "library",
          name: "Mine",
          permissions: [reads("library")[0].key]
        }),
        403
      );
    });

    it("an owner by assignment manages their own module but not another, and cannot make owners", async () => {
      const as = tokens.mxHostelOwner;
      const own = await request("POST", `${AC}/operator-roles`, {
        as,
        body: { module: "hostel", name: "Matrix owner-made role", permissions: [reads("hostel")[0].key] }
      });
      assert.equal(own.status, 201, show(own));
      const other = await request("POST", `${AC}/operator-roles`, {
        as,
        body: { module: "library", name: "Matrix owner-made role", permissions: [reads("library")[0].key] }
      });
      assert.equal(other.status, 403, show(other));
      const makeOwner = await request("POST", `${AC}/assignments`, {
        as,
        body: { kind: "OWNER", module: "hostel", userId: world.office.userId }
      });
      assert.equal(makeOwner.status, 403, show(makeOwner));
    });

    it("an operator loses access the moment the assignment is revoked", async () => {
      const user = (await post("/api/v1/users/staff", { role: "STAFF", user: person("mxRevokeNow") })).data;
      const as = tokenFor(user.userId, "STAFF");
      const url = "/api/v1/transport/routes";
      assert.equal(await status("GET", url, as), 403);
      const [role] = (await get(`${AC}/operator-roles?module=transport&search=Matrix transport viewer`)).data;
      const made = await post(`${AC}/assignments`, { operatorRoleId: role.id, userId: user.userId });
      assert.equal(await status("GET", url, as), 200);
      await del(`${AC}/assignments/${made.data.id}`);
      assert.equal(await status("GET", url, as), 403);
    });

    it("a deleted operator role stops granting (after its holders are revoked)", async () => {
      const user = (await post("/api/v1/users/staff", { role: "STAFF", user: person("mxRoleGone") })).data;
      const as = tokenFor(user.userId, "STAFF");
      const role = (
        await post(`${AC}/operator-roles`, {
          module: "inventory",
          name: "Matrix short-lived role",
          permissions: reads("inventory").map(p => p.key)
        })
      ).data;
      const made = await post(`${AC}/assignments`, { operatorRoleId: role.id, userId: user.userId });
      assert.equal(await status("GET", "/api/v1/inventory/items", as), 200);
      /* A role still held cannot be deleted */
      const held = await request("DELETE", `${AC}/operator-roles/${role.id}`);
      assert.ok([409, 422].includes(held.status), show(held));
      await del(`${AC}/assignments/${made.data.id}`);
      await del(`${AC}/operator-roles/${role.id}`);
      assert.equal(await status("GET", "/api/v1/inventory/items", as), 403);
    });
  });

  /* ---------- Public endpoints ---------- */

  describe("API matrix: public endpoints", () => {
    it("POST /api/v1/auth/login: refuses an empty body (400) and wrong credentials (401)", async () => {
      assert.equal((await request("POST", "/api/v1/auth/login", { as: null, body: {} })).status, 400);
      const wrong = await request("POST", "/api/v1/auth/login", {
        as: null,
        body: { schoolCode: "TST", email: "admin@test.school", password: "wrong-password-123" }
      });
      assert.equal(wrong.status, 401, show(wrong));
    });

    it("POST /api/v1/auth/refresh: refuses an empty body (400) and an unknown token (401)", async () => {
      assert.equal((await request("POST", "/api/v1/auth/refresh", { as: null, body: {} })).status, 400);
      const unknown = await request("POST", "/api/v1/auth/refresh", {
        as: null,
        body: { refreshToken: "x".repeat(64) }
      });
      assert.equal(unknown.status, 401, show(unknown));
    });

    it("POST /api/v1/auth/password-reset-requests: refuses an empty body (400)", async () => {
      assert.equal((await request("POST", "/api/v1/auth/password-reset-requests", { as: null, body: {} })).status, 400);
    });

    it("POST /api/v1/auth/password-resets: refuses an empty body (400) and an unknown reset token", async () => {
      assert.equal((await request("POST", "/api/v1/auth/password-resets", { as: null, body: {} })).status, 400);
      const unknown = await request("POST", "/api/v1/auth/password-resets", {
        as: null,
        body: { token: "x".repeat(64), password: "A-good-new-password-1" }
      });
      assert.ok([400, 401, 422].includes(unknown.status), show(unknown));
    });

    it("POST /api/v1/public/payments/razorpay/:tenantId/webhook: refuses an unsigned webhook", async () => {
      const res = await request("POST", `/api/v1/public/payments/razorpay/${h.tenant.id}/webhook`, {
        as: null,
        body: { event: "payment.captured" }
      });
      assert.ok([400, 401, 403, 422].includes(res.status), show(res));
    });
  });

  /* ---------- Tokens ---------- */

  describe("API matrix: token handling", () => {
    const url = "/api/v1/users";
    const statusWith = async token => (await request("GET", url, { as: token })).status;

    it("accepts a valid administrator token (200)", async () => {
      assert.equal(await statusWith(h.tokens.admin), 200);
    });
    it("refuses a malformed Authorization header (401)", async () => {
      assert.equal((await request("GET", url, { as: null, headers: { authorization: "Token abc" } })).status, 401);
    });
    it("refuses an unsigned (alg none) token (401)", async () => {
      assert.equal(await statusWith(jwt.sign(access(h.admin.id), null, { algorithm: "none" })), 401);
    });
    it("refuses a refresh-type token used as an access token (401)", async () => {
      assert.equal(await statusWith(signed({ ...access(h.admin.id), typ: "refresh" })), 401);
    });
    it("refuses a token with an unknown role (401)", async () => {
      assert.equal(await statusWith(signed({ ...access(h.admin.id), role: "SUPERUSER" })), 401);
    });
    it("refuses a token without a session id (401)", async () => {
      const { sid, ...rest } = access(h.admin.id);
      void sid;
      assert.equal(await statusWith(signed(rest)), 401);
    });
    it("refuses a token for a school that does not exist", async () => {
      const res = await request("GET", url, { as: signed({ ...access(h.admin.id), tenantId: crypto.randomUUID() }) });
      assert.ok([401, 403, 404].includes(res.status), show(res));
    });
    it("refuses a token after its session has logged out (401)", async () => {
      const token = tokenFor(h.admin.id, "ADMIN");
      assert.equal((await request("POST", "/api/v1/auth/logout", { as: token })).status, 200);
      assert.equal(await statusWith(token), 401);
    });
    it("a role claim in the token cannot reach another school's data", async () => {
      const res = await request("GET", `/api/v1/users/${h.admin.id}`, { as: h.tokens.otherAdmin });
      assert.equal(res.status, 404, show(res));
    });
  });

  /* ---------- Every endpoint ---------- */

  const byModule = new Map();
  for (const route of routes.filter(r => !r.isPublic)) {
    const module = route.path.split("/")[3];
    if (!byModule.has(module)) byModule.set(module, []);
    byModule.get(module).push(route);
  }

  /* Data a route's real reads need on the test date only. The cover screen exists on days the
   school takes attendance by period; a mode can only be scheduled from tomorrow (D-66), so
   today's is seeded as if scheduled earlier (as 22-attendance-modes does), then removed. */
  const withPeriodModeToday = {
    setUp: async () => {
      const client = await h.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE attendance_mode_rules DISABLE TRIGGER attendance_mode_rules_future_only");
        await client.query(
          "INSERT INTO attendance_mode_rules (tenant_id, mode, effective_from, set_by) VALUES ($1, 'PERIOD_WISE', $2, $3)",
          [h.tenant.id, today, h.admin.id]
        );
        await client.query("ALTER TABLE attendance_mode_rules ENABLE TRIGGER attendance_mode_rules_future_only");
        await client.query("COMMIT");
      } finally {
        client.release();
      }
    },
    tearDown: () =>
      h.pool.query(
        "DELETE FROM attendance_mode_rules WHERE tenant_id = $1 AND effective_from = $2 AND mode = 'PERIOD_WISE'",
        [h.tenant.id, today]
      )
  };
  /* A section's admit card PDF needs issued cards: generated for every exam of the year that
     has papers (no eligibility rule is on, so every student gets one), then removed */
  const withAdmitCards = {
    setUp: async () => {
      for (const exam of await listItems("/api/v1/academics/exams")) {
        await request("POST", `/api/v1/academics/exams/${exam.id}/admit-cards`, { body: {}, headers: yearHeader() });
      }
    },
    tearDown: () => h.pool.query("DELETE FROM admit_cards WHERE tenant_id = $1", [h.tenant.id])
  };
  const FIXTURES = {
    "GET /api/v1/academics/attendance/cover/:sectionId": withPeriodModeToday,
    "GET /api/v1/academics/exams/:examId/admit-cards/pdf": withAdmitCards
  };

  /* Routes the probe cannot reach without running them (no validator to fail) */
  const special = {
    "POST /api/v1/auth/logout": { fresh: true },
    "DELETE /api/v1/finance/payment-settings": { real: true },
    "POST /api/v1/finance/payment-settings/connection-test": { real: true }
  };

  for (const [module, moduleRoutes] of byModule) {
    describe(`API matrix: ${module}`, () => {
      for (const route of moduleRoutes) {
        const name = `${route.method} ${route.path}`;
        const permission = route.permission;
        const probe = probeOf(route);
        const send = (as, url = probe.url) => request(route.method, url, { as, body: probe.body });

        describe(name, () => {
          it("negative: no token → 401", async () => {
            const res = await send(null);
            assert.equal(res.status, 401, show(res));
          });
          it("negative: forged token (wrong signing key) → 401", async () => {
            const res = await send(signed(access(h.admin.id), "not-the-secret"));
            assert.equal(res.status, 401, show(res));
          });
          it("negative: expired token → 401", async () => {
            const res = await send(signed(access(h.admin.id), "test-secret", { expiresIn: -60 }));
            assert.equal(res.status, 401, show(res));
          });

          for (const user of USERS) {
            const allowed = allows(user, permission);
            const as = () => (special[name]?.fresh ? freshToken(user) : tokenOf(user));

            if (!allowed) {
              it(`negative: ${user.label} → 403`, async () => {
                const res = await send(as());
                assert.ok(isRouteRefusal(res), `expected 403, got ${show(res)}`);
              });
              continue;
            }

            if (route.probe && !special[name]) {
              it(`positive: ${user.label} passes the permission check (invalid input → 400)`, async () => {
                const res = await send(as());
                assert.equal(res.status, 400, `expected 400 (allowed, input rejected), got ${show(res)}`);
              });
            } else {
              it(`positive: ${user.label} is allowed (no 401/403, no server error)`, async () => {
                const res = await send(as());
                assert.ok(res.status !== 401 && !isPermissionRefusal(res) && res.status < 500, show(res));
              });
            }
          }

          if (route.method !== "GET") return;

          /* Real reads, with ids from the earlier suites' data */
          const self = SELF_PATH.test(route.path) && /:\w+/.test(route.path);
          for (const user of USERS.filter(u => allows(u, permission))) {
            const isFamily = user.role === "STUDENT" || user.role === "PARENT";
            const title = self
              ? `positive: ${user.label} reads their own record; negative: never someone else's`
              : `positive: ${user.label} reads it with real data${user.role === "ADMIN" ? " (200)" : " without error"}`;
            it(title, async t => {
              const as = tokenOf(user);
              const read = url => request("GET", url, { as, headers: yearHeader() });
              const fixture = FIXTURES[name];
              await fixture?.setUp();
              try {
                if (self) {
                  /* Their own records, from their own lists (students and parents: this
                     account, else another family's account of the same role) */
                  const accounts = [
                    { token: as, ids: {} },
                    ...(isFamily ? families.map(f => ({ token: tokenFor(f[user.role], user.role), ids: f.ids })) : [])
                  ];
                  let tried = 0;
                  let res;
                  for (const account of accounts) {
                    const own = await candidatePaths(route.path, {
                      as: account.token,
                      ownPool: name => [account.ids[name]].filter(Boolean)
                    });
                    for (const url of own) {
                      tried++;
                      res = await request("GET", url, { as: account.token, headers: yearHeader() });
                      /* Any of their records (a child who has left has no timetable): 200 */
                      if (res.status === 200) return;
                    }
                  }
                  if (tried) assert.fail(`${tried} own record(s) tried, last: ${show(res)}`);
                  /* None of their own: someone else's record is hidden from them */
                  const mine = isFamily ? (await listItems("/api/v1/me/students", { as })).map(c => c.id) : [];
                  const other = (await candidatePaths(route.path, { pooled: true })).find(
                    url => !mine.some(id => url.includes(id))
                  );
                  if (!other) return t.skip("no record of someone else's to try");
                  const hidden = await read(other);
                  assert.ok([403, 404].includes(hidden.status), `someone else's ${other}: ${show(hidden)}`);
                  return;
                }
                if (user.role === "ADMIN") {
                  /* Any of a few real records: 200 */
                  const urls = await candidatePaths(route.path);
                  if (!urls.length) return t.skip("no record to read");
                  let res;
                  for (const url of urls) {
                    res = await read(url);
                    if (res.status === 200) {
                      readable.set(route.path, url);
                      return;
                    }
                  }
                  assert.fail(`${urls.length} record(s) tried, last ${urls.at(-1)}: ${show(res)}`);
                }
                const url = await realPath(route, as);
                if (!url) return t.skip("no record to read");
                const res = await read(url);
                assert.ok(res.status !== 401 && !isPermissionRefusal(res) && res.status < 500, `${url}: ${show(res)}`);
              } finally {
                await fixture?.tearDown();
              }
            });
          }

          if (!route.byId) return;
          const reader = USERS.find(u => allows(u, permission));
          if (!reader) return;

          it(`negative: unknown ${route.path.split(":").at(-1)} → 404`, async t => {
            const unknownId = SAMPLE_IDS[route.idKinds[route.path.split(":").at(-1)]];
            const as = tokenOf(reader);
            const [url] = await candidatePaths(route.path, { leafId: unknownId, as });
            if (!url) return t.skip("no parent record");
            const res = await request("GET", url, { as, headers: yearHeader() });
            assert.equal(res.status, 404, `${url}: ${show(res)}`);
          });

          if (permission.roles.includes("ADMIN")) {
            it("negative: another school's administrator cannot read this school's record → 404", async t => {
              const url = readable.get(route.path) ?? (await candidatePaths(route.path, { pooled: true }))[0];
              if (!url) return t.skip("no record to read");
              const res = await request("GET", url, { as: h.tokens.otherAdmin });
              assert.equal(res.status, 404, `${url}: ${show(res)}`);
            });
          }
        });
      }
    });
  }
});
