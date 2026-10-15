# Decisions for review

Design decisions made while building roadmap phases 3–7 without you. Each entry says what I chose, why, and what you might want to change.

**Legend:** 🔴 needs your input before production · 🟡 worth a look · 🟢 FYI, low risk

---

## Scope

### 🔴 D-01: Phase 2 (login) was not built
You asked for phases 3–7, so there is still **no login endpoint**. Tokens come from `npm run dev:memory` or are signed by hand.

Everything else already assumes standard JWT bearer tokens carrying `{ userId, tenantId, role }`, so login only needs to *issue* such tokens:
- the student/parent portal (D-12)
- payment checkout
- notifications

**Recommendation:** Phase 2 next:
1. bcrypt password hashing
2. `POST /api/v1/auth/login` and refresh-token rotation
3. invitation emails using the messaging layer built tonight (`common/messaging`)

---

## Platform and infrastructure

### 🟡 D-02: Redis is optional
BullMQ (jobs) and the cache both use Redis when `REDIS_URL` is set. Without it they fall back to in-process drivers, so `npm run dev`, tests and single-instance deployments need nothing extra.

**Production with more than one API instance must set `REDIS_URL`**, and run `npm run worker`.

The in-process job queue loses queued jobs on restart.

### 🟢 D-03: Background jobs use one queue
All jobs go to one BullMQ queue (`school-jobs`) with per-job retry settings.

If one job type grows heavy (e.g. bulk SMS), it can get its own queue later without API changes.

### 🟢 D-04: OpenAPI is generated, not hand-written
`createRouter()` records every route. The generator reads the Zod schemas passed to `validate()` and the permissions passed to `authorize()`.

- Live docs: `GET /api/docs` (Swagger UI).
- Spec: `GET /api/v1/openapi.json`.
- Both are **public**. Hide them in production if you prefer: one line in `app.js`.

Swagger UI loads from unpkg (pinned version). If CDNs are not allowed, vendor `swagger-ui-dist`.

### 🟡 D-05: Error tracking is not wired in
Sentry (`@sentry/node` v11) pulls in a large OpenTelemetry tree. I left it out.

Errors are logged as structured JSON (pino) with a `requestId`. That `requestId` is also returned in every error response, so support can find the log line.

If you want Sentry, add the package and initialise it in `server.js`. `SENTRY_DSN` is already read from the environment.

### 🟢 D-06: `uuid` pinned via npm `overrides`
`exceljs` depends on an old `uuid` with a moderate advisory. The advisory doesn't affect how `exceljs` uses it, but I pinned `uuid@^11` anyway, and verified that `exceljs` still works.
