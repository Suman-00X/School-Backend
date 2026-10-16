# Operations

How to run, deploy, observe, back up and restore the backend. Decisions behind these choices are in [DECISIONS.md](DECISIONS.md).

## Contents

- [Environments](#environments)
- [Processes](#processes)
- [Deployment pipeline](#deployment-pipeline)
- [Migrations](#migrations)
- [Onboarding a school](#onboarding-a-school)
- [Observability](#observability)
- [Backups and restore](#backups-and-restore)
- [Academic-year archiving](#academic-year-archiving)
- [Security checklist](#security-checklist)
- [Design notes: row-level security](#design-note-postgresql-row-level-security)
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

## Processes

One image, three commands:

| Process | Command | Scale |
|---|---|---|
| API | `node src/server.js` (default) | Horizontally; stateless when `REDIS_URL` is set |
| Worker | `node src/worker.js` | 1+; BullMQ shares the work. Runs schedules (late fees, fee reminders) |
| One-off | `node scripts/migrate.js`, `node scripts/sync-mongo-indexes.js` (all models), `node scripts/mongo-app-role.js …`, `node scripts/create-school.js …` | Run before rolling out a release |

Health: `GET /health` (liveness, no dependencies) and `GET /ready` (PostgreSQL and MongoDB answer; use for load-balancer readiness). The API drains connections for up to 15 s on `SIGTERM`.

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

- `npm run db:generate` creates SQL from model changes; commit the file. `npm run db:migrate` applies pending ones (safe to re-run).
- Releases must be **backwards compatible for one version** (expand → migrate → contract), because old and new API instances run side by side during a rolling deploy. Examples:
  - Add a column as nullable or with a default.
  - Backfill in a job.
  - Make it `NOT NULL` in a later release.
  - Never rename in place.
- Database rules that must hold for every write path live in migrations as triggers. Example: archived academic years are read-only. A trigger raises SQLSTATE `ZA4xx`, and the API turns it into an HTTP 4xx carrying the trigger's message. Only `ZA4xx` messages ever reach users.

## Onboarding a school

Schools are created by an operator (self-service sign-up is not built):

```sh
npm run school:create -- --name "Green Valley School" --code GVS \
  --admin-email principal@gvs.edu --admin-first Asha --admin-last Rao --timezone Asia/Kolkata
# docker compose run --rm api node scripts/create-school.js …   (same flags)
```

It emails the admin, and prints, a 7-day set-password link: `WEB_APP_URL/set-password?token=…`. The web app posts the token to `POST /api/v1/auth/password-resets`. The admin then signs in with the school code, email and password, and invites everyone else (`POST /api/v1/auth/invitations`).

## Observability

- **Logs:** pino JSON on stdout, one line per request, with `requestId` (also in the `X-Request-Id` header and every error response), `tenantId` and `userId`. Ship stdout to your log platform; do not log request bodies.
- **Metrics:** `GET /metrics` in Prometheus format. It is off unless `METRICS_TOKEN` is set, and requires `Authorization: Bearer <METRICS_TOKEN>`. Series:
  - `school_http_requests_total{method,route,status}` and `school_http_request_duration_seconds` (route = template such as `/api/v1/academics/sections/:sectionId`, never raw ids)
  - `school_jobs_total{job,outcome=completed|retried|failed}` and `school_job_duration_seconds`
  - `school_unexpected_errors_total{source=http|job}`
  - `school_pg_pool_connections{state}`, memory, uptime, `school_event_loop_delay_p99_seconds`
- **Alerts:** starting rules in `ops/prometheus/alerts.yml`. They cover API down, 5xx rate above 2%, p95 latency, failed jobs, PostgreSQL pool saturation and a blocked event loop.
- **Error tracking:** every unexpected error goes through one function, `reportError`. That covers HTTP 500s and jobs that fail their last attempt. Each is logged and counted. To also send them to Sentry, set `SENTRY_DSN` and `npm install @sentry/node`. Personal data is not sent (`sendDefaultPii: false`, no request bodies).

Note: metrics are kept per process. Prometheus scrapes each API and worker instance; aggregate with `sum by (…)`.

## Backups and restore

**Targets** (proposed, confirm in DECISIONS):
- Recovery point objective (RPO): 15 minutes or less, via managed point-in-time recovery.
- Recovery time objective (RTO): 2 hours or less.

**Layers:**
1. **Managed PostgreSQL point-in-time recovery** (primary). Turn it on with 14–35 days of retention.
2. **Managed MongoDB snapshots** (audit log, notifications, announcements, file metadata).
3. **Portable nightly dump** with `npm run backup`. It keeps the data restorable even if you change provider.
   - Contents: `pg_dump` in custom format, `mongodump` as a gzip archive, the local-storage files when `STORAGE_DRIVER=local`, and SHA-256 checksums.
   - Location: `$BACKUP_DIR/<UTC timestamp>/`, copied off-site when `BACKUP_S3_URI` is set.
   - Retention: `BACKUP_KEEP_DAYS` (default 14).
   - Tools: needs `pg_dump` at the server's major version or newer (18), plus `mongodump`.
4. **Uploaded files on S3:** turn on bucket versioning, cross-region replication, and a lifecycle rule for old versions.

**Restore** (stop the API and workers first):

```sh
npm run restore -- ./backups/20261016T020000Z   # verifies checksums, asks you to type "restore"
npm run db:migrate                              # bring an older backup up to the current schema
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
- [ ] The app's database user owns nothing it does not need. Migrations run as a separate owner role; see the row-level security note.
- [ ] The application's MongoDB user has the `school_app` role from `npm run mongo:app-role -- --db <db> --user <user> --password …`, run with `MONGO_ADMIN_URI`. Published report cards are then insert-only even for the application. Run it again after releases that add collections.
- [ ] Razorpay webhooks are configured for each school: `payment.captured`, `refund.processed`, `refund.failed`, all pointing at `POST /api/v1/public/payments/razorpay/<schoolId>/webhook`.
- [ ] The S3 bucket is private. Downloads always go through short-lived signed URLs.
- [ ] Mock gateway is off (`PAYMENT_PROVIDER` unset or `razorpay` in production). Each school enters its own Razorpay keys and points its webhook at the URL shown in `GET /finance/payment-settings`. `DATA_ENCRYPTION_KEY` is backed up: without it the stored keys cannot be read.
- [ ] `METRICS_TOKEN` is set, and `/metrics` is reachable only from the monitoring network.
- [ ] Backups are encrypted at rest (bucket encryption), and a restore drill is done.

---

## Design note: PostgreSQL row-level security

**Today:**
- Every query is tenant-scoped in one place: `createRepository` adds `tenant_id = $tenant` to every read and write.
- Raw SQL (dashboards, analytics) filters `tenant_id` explicitly.
- A test checks cross-tenant isolation through the API.

**Proposed second layer:** PostgreSQL row-level security, so that a missed filter cannot leak another school's data.

1. Two roles:
   - `school_owner` runs the migrations.
   - `school_app` (NOBYPASSRLS) runs the API and worker.
2. On every table with `tenant_id`, apply:
   ```sql
   ALTER TABLE t ENABLE ROW LEVEL SECURITY; ALTER TABLE t FORCE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON t
     USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
     WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
   ```
3. Every request runs its database work in a transaction that starts with `SELECT set_config('app.tenant_id', $1, true)`.
   - The transaction is carried by `AsyncLocalStorage`, so repositories stay unchanged.
   - `transaction()` joins it.
4. Cross-tenant jobs loop per tenant. Examples: the late-fee sweep and fee reminders.

**Cost and risk:**
- Each request holds one pooled connection for its whole duration, so `PG_POOL_MAX` must be sized for concurrency. PgBouncer in transaction mode works with `set_config(…, true)`.
- About 3–5 days of work, including running the whole test suite as `school_app`.

**Recommendation:** do it right after Phase 2 (login), before the first paying school. It is listed for your decision in DECISIONS.md.

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
