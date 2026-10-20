# Operations

How to run, deploy, observe, back up and restore the backend. Decisions behind these choices are in [DECISIONS.md](DECISIONS.md).

## Contents

- [Environments](#environments)
- [A database per school](#a-database-per-school)
- [Processes](#processes)
- [Deployment pipeline](#deployment-pipeline)
- [Migrations](#migrations)
- [Onboarding a school](#onboarding-a-school)
- [Observability](#observability)
- [Logs and debugging](#logs-and-debugging)
- [Access log (API monitoring)](#access-log-api-monitoring)
- [Backups and restore](#backups-and-restore)
- [Academic-year archiving](#academic-year-archiving)
- [Security checklist](#security-checklist)
- [Design notes: languages](#design-note-languages-i18n)

---

## Environments

| Environment | How | Databases | Jobs | Notes |
|---|---|---|---|---|
| Dev, zero install | `npm run dev:memory` | Embedded PostgreSQL 18 + in-memory MongoDB | In-process | Seeds a demo school and prints an admin token. Nothing persists |
| Dev, persistent | `npm run dev` with `.env` | Your local PostgreSQL + MongoDB | In-process (no `REDIS_URL`) | |
| Full stack, one machine | `docker compose up -d --build` | Containers | Separate `worker` container | Also good for demos and on-premises installs |
| Staging | Same image as production | Managed, separate instances | Worker container(s) | Production-like data volume; restore drills run here |
| Production | Container platform (ECS, Cloud Run, Kubernetes, Fly…) | Managed PostgreSQL (PITR on), managed MongoDB (backups on), managed Redis | 1+ worker containers | `REDIS_URL` is **required** with more than one API instance |

Configuration is environment variables only; see `.env.example`. Production must set at least: `NODE_ENV=production`, `DATABASE_URL`, `MONGO_URI`, `REDIS_URL`, `JWT_SECRET` (32+ random bytes), `DATA_ENCRYPTION_KEY` (32 bytes; keep it with the backups, encrypted fields are unreadable without it), `APP_URL`, `ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS` (behind a load balancer), `STORAGE_DRIVER=s3` + bucket settings, email/SMS drivers, payment keys, `METRICS_TOKEN`.

## A database per school

Every school's data is in **its own PostgreSQL database and its own MongoDB database**. No table or collection holds two schools' rows, so a missed filter cannot show one school another's data. A school can be backed up, restored, moved or deleted on its own.

**One connection string per server.** `DATABASE_URL` and `MONGO_URI` point at the **platform registry**: a small database with two tables. `platform_tenants` lists the schools; `platform_account_directory` is the login directory (see below). Each school's database is the same string with the database name swapped for `school_<code>`. For example, `GVS` becomes `school_gvs`.

| | PostgreSQL on Neon | MongoDB Atlas |
|---|---|---|
| `DATABASE_URL` / `MONGO_URI` | The **pooled** string (host has `-pooler`), database `school_platform`: `postgres://app:…@ep-x-pooler.ap-southeast-1.aws.neon.tech/school_platform?sslmode=require` | The official `mongodb+srv://` string with the database before the `?`: `mongodb+srv://app:…@cluster0.abcde.mongodb.net/school_platform?retryWrites=true&w=majority` |
| Creating a school's database | `POSTGRES_ADMIN_URL`: the **direct** (non-pooled) string of a role that may create databases. Roles made in the Neon console can. | Nothing to do. MongoDB creates the database on first write |
| Database user rights | The role owns the databases it creates | The Atlas user needs read/write on `school_*` databases (or on any database) |
| Connections | One pool per school, opened on first use. At most `TENANT_MAX_OPEN` (50) pools per process, `TENANT_POOL_MAX` (5) connections each; the least recently used pool closes first. Neon's pooler absorbs this | One connection pool per process, shared by every school's database |
| Limits to check | Your plan's databases-per-branch limit | None in practice |

**How a request finds its school:**
1. The signed-in user's token carries their school's id.
2. After authentication, `tenantContext` looks the school up in the registry (cached for 60 s).
3. The request then runs inside that school. Repositories, transactions and MongoDB models all use the school's own databases without any code change (`db`, `tenantModel`).
4. A suspended school gets `403 This school's account is suspended`. Its users cannot sign in.

**Sign-in by email (the login directory).** People sign in with email and password; no school code. `platform_account_directory` has one row per account: `HMAC-SHA256(key, lower-cased trimmed email)`, the school id and the user id. The plain email is never stored on the platform. The key is derived (HKDF) from `DATA_ENCRYPTION_KEY`, so there is nothing extra to configure. Without the key, the digests cannot be matched against a list of addresses.
- **Kept in step** by the users module: an account's creation (every path: staff, teachers, parents, admissions, CSV imports) writes its row inside the creating transaction; an email change moves it; a deactivation removes it. Accounts with another status (e.g. `BLOCKED`) stay listed, so sign-in can answer "This account is disabled".
- **A copy, always rebuildable.** The schools' `users` tables are the truth. A creation that rolls back can leave a harmless row (sign-in finds no account there). A failed write after an email change or deactivation is logged as `Login directory not updated`. Signing in with a school code or `schoolId` re-adds a missing row.
- **`npm run directory:rebuild`** (every active school) or `npm run directory:rebuild -- --code GVS` recomputes the rows from the schools' accounts. It is idempotent and safe while the API runs. Run it after restoring or moving a school, after changing `DATA_ENCRYPTION_KEY`, and when the log line above appears. `school:create`, `school:seed-demo` and `dev:memory` run it for the accounts they write directly.

Refresh tokens and password links carry the school id, so they never need the directory.

**Jobs:** every job runs in the school it was queued for. Daily schedules (late fees, reminders, library sweeps) fan out: one run per active school, each in that school's databases.

**A school on its own servers:** pass `--database-url` and `--mongo-url` to `school:create`. The strings are stored encrypted with `DATA_ENCRYPTION_KEY`, and that school ignores the templates. This is useful for a large school, or one that requires data residency.

**Moving a school:**
1. Dump its two databases (see [Backups](#backups-and-restore)).
2. Restore them on the new servers.
3. Point its registry row at the new strings.

## Processes

One image, three commands:

| Process | Command | Scale |
|---|---|---|
| API | `node src/server.js` (default) | Horizontally; stateless when `REDIS_URL` is set |
| Worker | `node src/worker.js` | 1+; BullMQ shares the work. Runs schedules (late fees, fee reminders) |
| One-off | `node scripts/migrate.js` and `node scripts/sync-mongo-indexes.js` (platform and every school), `node scripts/mongo-app-role.js …`, `node scripts/create-school.js …`, `node scripts/rebuild-directory.js` (login directory) | Run before rolling out a release |

Health: `GET /health` (liveness, no dependencies) and `GET /ready` (the platform PostgreSQL database and MongoDB answer; use for load-balancer readiness). The API drains connections for up to 15 s on `SIGTERM`.

## Deployment pipeline

1. **CI** (`.github/workflows/ci.yml`, every push and PR):
   - Prettier check and ESLint.
   - A migration drift check that fails when a model changed without a migration.
   - The full end-to-end suite on Node 22 and 24, using real PostgreSQL 18 and MongoDB, embedded.
   - A Docker image build.
2. **Release** (to add when a registry is chosen, see DECISIONS): build the image once, tag it with the git SHA, and push it.
3. **Staging:**
   - Run the `migrate` one-off with the new image.
   - Roll the API and worker.
   - Run a smoke check: `/ready`, `/api/v1/openapi.json`, and a login once Phase 2 exists.
4. **Production:** the same image digest as staging, then the same steps.

## Migrations

- Two migration sets:
  - `migrations/` holds the school schema, applied to every school's database.
  - `migrations-platform/` holds the registry, applied to the platform database.
- `npm run db:generate` (school tables) or `npm run db:generate:platform` (registry) creates SQL from model changes; commit the file.
- `npm run db:migrate` applies pending migrations: first the platform database, then each school in turn. It is safe to re-run. If a school fails, it carries on with the others, prints which school failed, and exits with code 1. Fix the cause and run it again.
- New schools get every migration when they are created.
- On Neon, migrations run fine through the pooled string. The school migrations need the `btree_gist` extension (hostel bed bookings), which Neon supports.
- Releases must be **backwards compatible for one version** (expand → migrate → contract), because old and new API instances run side by side during a rolling deploy. Examples:
  - Add a column as nullable or with a default.
  - Backfill in a job.
  - Make it `NOT NULL` in a later release.
  - Never rename in place.
- Database rules that must hold for every write path live in migrations as triggers. Example: archived academic years are read-only. A trigger raises SQLSTATE `ZA4xx`, and the API turns it into an HTTP 4xx carrying the trigger's message. Only `ZA4xx` messages ever reach users.

## Onboarding a school

Schools are created by an operator (self-service sign-up is not built). The script creates the school's PostgreSQL database, runs all migrations on it, registers the school, and creates its first admin:

```sh
npm run school:create -- --name "Green Valley School" --code GVS \
  --admin-email principal@gvs.edu --admin-first Asha --admin-last Rao --timezone Asia/Kolkata
# its own servers: add --database-url "postgres://…" --mongo-url "mongodb+srv://…"
# docker compose run --rm api node scripts/create-school.js …   (same flags)
```

It emails the admin, and prints, a 7-day set-password link: `WEB_APP_URL/set-password?token=…`. The web app posts the token to `POST /api/v1/auth/password-resets`. The admin then signs in with their email and password (the script lists the admin in the login directory), and invites everyone else (`POST /api/v1/auth/invitations`).

## Observability

- **Logs:** two streams. The **application log** (pino JSON on stdout) records what the code did and why something failed, with `requestId` (also in the `X-Request-Id` header and every error response), `tenantId` and `userId`. The **access log** has one line for every request, with its latency, status, bytes and database time, for monitoring the API (see [Access log](#access-log-api-monitoring)). Ship both to your log platform; neither logs request bodies.
- **Metrics:** `GET /metrics` in Prometheus format. It is off unless `METRICS_TOKEN` is set, and requires `Authorization: Bearer <METRICS_TOKEN>`. Series:
  - `school_http_requests_total{method,route,status}` and `school_http_request_duration_seconds` (route = template such as `/api/v1/academics/sections/:sectionId`, never raw ids)
  - `school_jobs_total{job,outcome=completed|retried|failed}` and `school_job_duration_seconds`
  - `school_unexpected_errors_total{source=http|job}`
  - `school_pg_pool_connections{state}` (all pools in the process), `school_tenant_databases_open`, memory, uptime, `school_event_loop_delay_p99_seconds`
- **Alerts:** starting rules in `ops/prometheus/alerts.yml`. They cover API down, 5xx rate above 2%, p95 latency, failed jobs, PostgreSQL pool saturation and a blocked event loop.
- **Error tracking:** every unexpected error goes through one function, `reportError`. That covers HTTP 500s and jobs that fail their last attempt. Each is logged and counted. To also send them to Sentry, set `SENTRY_DSN` and `npm install @sentry/node`. Personal data is not sent (`sendDefaultPii: false`, no request bodies).

Note: metrics are kept per process. Prometheus scrapes each API and worker instance; aggregate with `sum by (…)`.

## Logs and debugging

Every process (API and worker) writes its application log as **one JSON object per line to stdout**: no log files to rotate. The platform collects stdout (Docker, ECS/CloudWatch, Cloud Run, Kubernetes + Loki/ELK/Datadog).

| You want | Do |
|---|---|
| Follow the API locally | `docker compose logs -f api` (or `npm run dev`, which prints coloured lines) |
| One user's failing request | Ask for the `requestId` from the error response (also in the `X-Request-Id` header), then search the logs for it |
| Everything a school did | Filter on `tenantId` |
| More detail temporarily | `LOG_LEVEL=debug`, then restart |

**Fields on every line:** `level`, `time` (ISO), `service`, `env`, `version` (`APP_VERSION`), `pid`, `msg`.

**Request lines** (requests that need attention: `warn` for 4xx and slow requests, `error` for 5xx; requests that went fine are only in the [access log](#access-log-api-monitoring). With `ACCESS_LOG=off`, every request gets a line here, `info` when it worked):
- `req.id`, the requestId
- `method`, `route` (the template), `res.statusCode`, `responseTime` (ms)
- `tenantId`, `userId`, `role`
- for failures, `error: { code, message }`: exactly what the client saw

**Other lines worth alerting on:**

| Message | Level | Meaning |
|---|---|---|
| `Unhandled error` | error | A 500. Carries the stack (`err`), the route and the tenant. Also sent to error tracking |
| `Job <name> failed; will retry` / `failed for good` | warn / error | Carries the job name, attempt, tenant and duration |
| `Slow database query` | warn | Query slower than `SLOW_QUERY_MS`. Carries the SQL shape only, never parameter values |
| `PostgreSQL connection error`, `MongoDB disconnected` / `reconnected` | error / warn | Database connectivity |
| `Unhandled promise rejection`, `Uncaught exception; exiting` | error / fatal | A bug outside a request or job. On an uncaught exception the process exits and the orchestrator restarts it |
| `Report snapshot seal mismatch` | error | A published report card was changed outside the application |

**Never logged:** passwords, tokens, cookies, `Authorization` headers, request bodies, query parameter values.

## Access log (API monitoring)

The access log answers "how is the API doing": traffic, latency, error rates, payload sizes and database time per route. It is separate from the application log above, which answers "what happened in the code and why did it fail". Each line is written when the response closes, including when the client gave up (`outcome: "aborted"`).

| `ACCESS_LOG` | Where | Default for |
|---|---|---|
| `file` | `ACCESS_LOG_DIR/access-YYYY-MM-DD.log` (default `./logs`, one file per UTC day). Files older than `ACCESS_LOG_RETENTION_DAYS` (default 14; `0` keeps all) are deleted at start-up and at each new day | development |
| `stdout` | Next to the application log. Every access line has `"log": "access"`, so the log platform can route it to its own index | production |
| `off` | Not written | tests |

`ACCESS_LOG_IGNORE=/health,/ready` leaves out exact paths (e.g. load-balancer probes). Writes are synchronous, so a crash or restart never drops the last lines.

**Fields** (one JSON object per line):

| Field | Meaning |
|---|---|
| `log`, `time`, `service`, `env`, `version`, `pid` | `"access"`; when the response closed (ISO); which process and release |
| `requestId` | Same id as the application log and the `X-Request-Id` header: jump from a slow or failed line to its application-log lines |
| `method`, `route`, `path` | `route` is the template (`/api/v1/users/students/:studentId`, null for paths outside the API router); `path` is the real path without the query string. Signed download tokens are replaced by `[redacted]` |
| `queryKeys` | Names of the query parameters the client sent (never their values) |
| `status`, `outcome` | HTTP status; `success`, `redirect`, `client_error`, `server_error` or `aborted` |
| `durationMs`, `ttfbMs`, `slow` | Total time; time until the response headers were sent; `durationMs > SLOW_REQUEST_MS` |
| `requestBytes`, `responseBytes`, `contentType` | Bytes received (`Content-Length`) and bytes actually sent (including streamed exports) |
| `db.postgres`, `db.mongo` | `{ queries, ms }` the request spent in each database. `ms` is summed across parallel queries; for PostgreSQL it includes waiting for a free pool connection |
| `tenantId`, `userId`, `role` | Who made the request (null before sign-in) |
| `ip`, `userAgent`, `referer`, `origin`, `httpVersion` | The client. `ip` honours `TRUST_PROXY_HOPS`; `referer` is cut at `?` (pages such as `/set-password?token=…`) |
| `rateLimit` | `{ limit, remaining }` of the rate limit that applied last |
| `errorCode` | The error code the client saw (`VALIDATION_ERROR`, `NOT_FOUND`, …); the message is in the application log under the same `requestId` |

**Never logged:** request or response bodies, query parameter values, cookies, the `Authorization` header, signed download tokens.

**Reading it.** `node scripts/access-report.js` summarises today's file: request rate, 4xx/5xx rates, latency percentiles per route, average database time and response size, and the most frequent error codes.

```bash
node scripts/access-report.js                                  # today's file
node scripts/access-report.js logs --sort p95 --top 15         # every file, slowest routes first
node scripts/access-report.js logs --sort db                   # where the database time goes
node scripts/access-report.js logs --tenant <tenantId> --since 60   # one school, last hour
docker compose logs api | node scripts/access-report.js -      # ACCESS_LOG=stdout
```

With `jq`, ad hoc questions:

```bash
jq -c 'select(.status >= 500)' logs/access-2026-10-20.log                               # every 5xx
jq -c 'select(.slow) | {route, durationMs, db}' logs/access-*.log                       # slow requests and their DB time
jq -r 'select(.outcome == "aborted") | .route' logs/access-*.log | sort | uniq -c       # clients giving up
```

In a log platform (Loki, ELK, Datadog, CloudWatch), filter `log = "access"` and build panels on `route`, `status`, `durationMs` and `db.*.ms`. These numbers complement the Prometheus metrics: metrics are cheap aggregates to alert on, and the access log has the individual requests behind them.

## Backups and restore

**Targets** (proposed, confirm in DECISIONS):
- Recovery point objective (RPO): 15 minutes or less, via managed point-in-time recovery.
- Recovery time objective (RTO): 2 hours or less.

**Layers:**
1. **Managed PostgreSQL point-in-time recovery** (primary). Turn it on with 14–35 days of retention.
2. **Managed MongoDB snapshots** (audit log, notifications, announcements, file metadata).
3. **Portable nightly dump** with `npm run backup`. It keeps the data restorable even if you change provider.
   - Contents: for the platform and **each school**, `<name>.postgres.dump` (`pg_dump`, custom format) and `<name>.mongo.archive.gz` (`mongodump`). Also the local-storage files when `STORAGE_DRIVER=local`, and SHA-256 checksums.
   - Location: `$BACKUP_DIR/<UTC timestamp>/`, copied off-site when `BACKUP_S3_URI` is set.
   - Retention: `BACKUP_KEEP_DAYS` (default 14).
   - Tools: needs `pg_dump` at the server's major version or newer (18), plus `mongodump`.
4. **Uploaded files on S3:** turn on bucket versioning, cross-region replication, and a lifecycle rule for old versions.

**Restore** (stop the API and workers first):

```sh
npm run restore -- ./backups/20261016T020000Z       # everything; verifies checksums, asks you to type "restore"
npm run restore -- ./backups/20261016T020000Z GVS   # one school only, the others are untouched
npm run db:migrate                              # bring an older backup up to the current schema
npm run directory:rebuild                       # the login directory follows the restored accounts
```

**Restore drill, monthly, on staging:**
1. Restore last night's dump.
2. Run `npm run db:migrate`.
3. Start the API.
4. Check `/ready`.
5. Compare row counts of `students`, `invoices` and `payments` with production at backup time.
6. Download one stored file.
7. Record the time taken; it is your real RTO.

> The scripts' flow was tested with stand-in tools. A real `pg_dump`/`mongodump` round trip has **not** been run on this machine (no PostgreSQL 18 client or MongoDB tools installed). Do one drill before launch.

## Academic-year archiving

- **Archive:** `POST /api/v1/academics/academic-years/:id/archival` (ADMIN).
  - Only a year that has ended and is not current can be archived.
  - Archiving makes its academic records read-only: sections, subjects, teachers, enrollments, exams, marks, attendance, timetable, calendar and homework.
  - The read-only rule is enforced by database triggers, so jobs, imports and future modules obey it too.
  - Reads keep working.
- **Restore:** `DELETE …/archival` makes the year editable again, for example to correct a mark.
- **Fees are not frozen:** arrears from an archived year stay payable.

## Security checklist

- [ ] `JWT_SECRET` is 32+ random bytes, stored in a secret manager. Rotating it signs out every access token; refresh tokens keep working, because they are opaque and checked in the database.
- [ ] `WEB_APP_URL` points at the real web app, so invitation and reset links work. Email (SMTP) is configured.
- [ ] `REDIS_URL` is set with more than one API instance. Sign-out and revocation markers live in the shared cache.
- [ ] `ALLOWED_ORIGINS` lists only the real frontends; `TRUST_PROXY_HOPS` matches the load balancer.
- [ ] TLS is terminated at the load balancer, with HSTS (helmet sends it).
- [ ] Databases sit on private networks, with TLS in `DATABASE_URL`/`MONGO_URI` (`sslmode=require`, `tls=true`).
- [ ] The app's database user owns nothing it does not need, and cannot create databases.
- [ ] The application's MongoDB user has the `school_app` role, so published report cards are insert-only even for the application. Self-hosted: `npm run mongo:app-role -- --all --user <user> --password …` with `MONGO_ADMIN_URI`. Atlas does not allow creating roles from the driver: run `npm run mongo:app-role -- --all --dry-run` and create the printed custom role in the Atlas UI. Run it again after releases that add collections, and after adding a school.
- [ ] `POSTGRES_ADMIN_URL` (the role that creates databases) is used only by operators, not set on the API and worker.
- [ ] Razorpay webhooks are configured for each school: `payment.captured`, `refund.processed`, `refund.failed`, all pointing at `POST /api/v1/public/payments/razorpay/<schoolId>/webhook`. Settlements are read daily with the school's keys (06:00, the last 7 days); nothing to configure.
- [ ] The S3 bucket is private. Downloads always go through short-lived signed URLs.
- [ ] Mock gateway is off (`PAYMENT_PROVIDER` unset or `razorpay` in production). Each school enters its own Razorpay keys and points its webhook at the URL shown in `GET /finance/payment-settings`. `DATA_ENCRYPTION_KEY` is backed up: without it the stored keys cannot be read.
- [ ] `METRICS_TOKEN` is set, and `/metrics` is reachable only from the monitoring network.
- [ ] Backups are encrypted at rest (bucket encryption), and a restore drill is done.

---

## Design note: why not row-level security

A database per school was chosen over shared tables with row-level security (D-45):
- **Isolation by construction.** The application code has no way to name another school's rows. A missing `tenant_id` filter cannot leak data.
- **Simpler operations per school:** back up, restore, move or delete one school with standard tools.
- **No per-request transaction pinning.** Row-level security would hold one connection for the whole request.

**Cost:**
- Migrations run once per school. That takes minutes with hundreds of schools; `migrate.js` reports each school.
- The open connection pools are capped and evicted per process (`TENANT_MAX_OPEN`).

The `tenant_id` column and repository filter remain as a second safety net.

## Design note: languages (i18n)

**API messages:**
- Today messages are English. Every error also carries a stable machine-readable `error.code` and field-level `details`.
- **Recommendation:** clients localise by `code` and field, and API messages stay English (they are for developers and support).
- If schools need server-side localised messages (for example in SMS and email templates), there are two layers:
  1. Notification templates already live in one file per module (`communication/shared/templates/messages.js`). Make them per-language, picking each recipient's language from a new `users.preferred_language` column.
  2. For API messages, use `Accept-Language` → `Content-Language`, with a message catalogue keyed by code.

**Data:**
- Names and text are stored as UTF-8, so any script works.
- **Gap:** generated PDFs (report cards, receipts) use the built-in Helvetica font. Names in Devanagari, Tamil, Arabic and other scripts will not render.
- **Fix:** embed Noto Sans and the needed Noto script fonts (about 1–5 MB each) and register them in `common/export`. The fonts depend on which regions you target, so this is flagged in DECISIONS.
