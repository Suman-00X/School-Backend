# School-Backend

Multi-tenant school management API: Express 5, **PostgreSQL** (Drizzle ORM) for relational data, **MongoDB** (Mongoose) for document data. Each school has its own PostgreSQL and MongoDB databases, reached from one connection string per server (Neon and MongoDB Atlas work as-is).

Covers academics (attendance, timetable, exams, report cards, homework), fees with online payments, communication, reports, a student and parent portal, library, transport, hostel, HR and payroll, and inventory. There are 300+ endpoints, all role-checked and tenant-isolated, verified by an end-to-end suite against real databases.

- [API guide (v1)](docs/API.md): conventions, roles, response and error formats, workflows
- [Endpoints](docs/ENDPOINTS.md): every endpoint with its roles (generated), plus live docs at `/api/docs`
- [Data model](docs/DATA_MODEL.md): what lives in PostgreSQL and what lives in MongoDB
- [Operations](docs/OPERATIONS.md): deploy, observe, back up and restore
- [Decisions for review](docs/DECISIONS.md) (open items), the [Decision log](docs/DECISION_LOG.md) (settled, with reasoning) and the [Roadmap](docs/ROADMAP.md)

## Run

**Quick start, nothing to install** (throwaway PostgreSQL 18 + MongoDB, wiped on exit):

```bash
npm install
npm run dev:memory
```

It seeds a demo school (code `DEMO`) and an admin who can sign in: `POST /api/v1/auth/login {"schoolCode":"DEMO","email":"admin@demo.school","password":"Admin12345"}`. It also prints a 12-hour admin token. Send the access token as `Authorization: Bearer <token>`.

**Against real databases:**

```bash
cp .env.example .env     # set DATABASE_URL, MONGO_URI (the platform database), JWT_SECRET, WEB_APP_URL
npm run db:migrate       # create/upgrade the platform database and every school's
npm run school:create -- --name "Demo School" --code DEMO \
  --admin-email admin@demo.school --admin-first Demo --admin-last Admin   # creates school_demo
npm run dev              # or: npm start
```

Requires Node 22+, PostgreSQL 13+ (18 in CI and compose) and MongoDB 6+.

**Whole stack in containers** (API, worker, PostgreSQL, MongoDB, Redis):

```bash
cp .env.example .env     # set JWT_SECRET (and DATA_ENCRYPTION_KEY for production)
docker compose up -d --build
docker compose run --rm api node scripts/create-school.js --name "Demo School" --code DEMO \
  --admin-email admin@demo.school --admin-first Demo --admin-last Admin
```

`school:create` prints and emails a set-password invitation for the school's first admin.

| Script | Does |
|---|---|
| `npm test` | End-to-end suite on embedded PostgreSQL 18 + in-memory MongoDB (about 10 s) |
| `npm run lint`, `npm run format` | ESLint, Prettier |
| `npm run db:generate -- --name <change>` | Writes a SQL migration from school-table changes (`db:generate:platform` for the registry) |
| `npm run db:migrate` | Applies pending migrations to the platform database and every school |
| `npm run db:studio` | Browse PostgreSQL in Drizzle Studio (set `DATABASE_URL` to a school's database) |
| `npm run mongo:sync-indexes` | Builds MongoDB indexes in every school's database (production) |
| `npm run worker` | Background job worker (with `REDIS_URL`) |
| `npm run school:create -- …` | Creates a school's databases, migrates them, and invites its first admin |
| `npm run backup`, `npm run restore -- <dir>` | Portable backups (see OPERATIONS.md) |
| `npm run docs:endpoints` | Regenerates docs/ENDPOINTS.md |

## Project structure

```
src/
  server.js              API start-up and graceful shutdown
  worker.js              background job worker (BullMQ, needs REDIS_URL)
  app.js                 Express app: logging, metrics, security, /health, /ready, docs, /api/v1, errors
  routes.js              API v1: public webhooks, then authenticate + audit, then each module
  bootstrap.js           connects PostgreSQL, MongoDB, cache, jobs, error reporting
  jobs.js                registry of job and event-subscriber files
  database.schema.js     registry of every module's tables (for the ORM)

  common/                FRAMEWORK ONLY: no school/business logic
    config/              environment
    auth/                roles, authenticate (JWT), authorize + definePermissions, permission catalogue, grants hook
    validation/          zod setup, validate() middleware, shared schema building blocks
    http/                AppError + error factories, response helpers, error handler, security
    database/            postgres/mongo clients, base columns, createRepository, platform tables
    crud/                createCrudService, createCrudController
    audit/               audit-trail middleware + MongoDB model, log filters, each module's /activity route
    handover/            registry of what a module hands over when someone takes over a person's work
    sequences/           per-tenant number sequences (for generated codes)
    jobs/  events/       background jobs (BullMQ or in-process), domain events, once-only claims
    cache/  storage/     cache (Redis or memory), file storage (S3 or local) with signed links
    messaging/  payments/  email/SMS drivers, payment gateway (Razorpay or mock; each school's own keys per call)
    money/  export/  import/  money in paise; CSV/XLSX/PDF exporters, branding; CSV import
    openapi/             OpenAPI 3.1 generated from the route table
    observability/       Prometheus metrics, error reporting
    crypto/              field encryption for sensitive values
    tenancy/  logging/  utils/

  modules/
    users/
      index.js           module entry: mounts the submodules' routers
      shared/            code only the users module needs (constants, validators, services, utils, models)
      accounts/  staff/  teachers/  parents/  students/
    academics/           academic-years classes subjects sections section-subjects teacher-assignments
                         enrollments calendar attendance timetable grading exams marks result-policies
                         report-cards assessment-schemes homework
    portal/              /me: profile, learning, fees, homework (students, parents, teachers)
    administration/      settings, imports, audit-logs, access (permission catalogue, owners, operator roles, handovers)
    finance/             fee-heads installment-plans late-fee-rules fee-structures concessions invoices
                         payments credits payment-settings ledger
    communication/       notifications announcements subscribers (event → message)
    reports/             dashboards exports
    files/               documents
    library/             policy circulation-rules books copies loans holds stock-checks reports
    transport/           vehicles routes assignments
    hostel/              hostels rooms allocations
    hr/                  staff-attendance leaves payroll
    inventory/           categories vendors items stock

migrations/              SQL migrations (generated, plus triggers for database-enforced rules)
scripts/                 migrate, dev-memory, Mongo index sync, create-school, backup/restore, docs
test/                    e2e.test.js + suites/ (one per area) + helpers/harness.js
ops/                     Prometheus alert rules
Dockerfile, docker-compose.yml, .github/workflows/ci.yml
```

### Inside a submodule

Every submodule has the same layout:

```
students/
  index.js               public entry: exports the router and services other code may use
  routes/                URL → authorize → validate → controller
  controllers/           HTTP in/out only: calls a service, sends a response
  services/              business rules and transactions
  repositories/          database access (built on createRepository)
  validators/            zod schemas for params, query and body
  permissions/           which roles may do what (definePermissions)
  models/                table definitions (Drizzle) or collections (Mongoose)
```

### Rules

1. **`common/` is framework only.** It never imports from `modules/`. Anything specific to one module lives in that module (its `shared/` folder if several submodules use it).
2. **Every route has the same chain:** `authorize(permission)` → `validate(schema)` → (optional module middleware) → controller. Authentication, auditing, security headers, rate limiting and error handling are applied once, globally.
3. **Controllers** never touch the database and never `try/catch`. They throw `AppError`s (`notFound`, `conflict`, `unprocessable`…), and the central error handler formats every error the same way.
4. **Services** receive the request context (`ctx = { tenantId, userId, role, academicYearId? }`) first.
5. **Repositories** are always tenant-scoped (`createRepository` adds `tenant_id` and `is_active` to every query). Pass `{ dbc: tx }` to join a transaction.
6. **Cross-module imports** go through a submodule's `index.js`. The exceptions are `models/` (needed for foreign keys) and `shared/constants/`, which are leaf files and may be imported directly.
7. **Enum values** live once in `shared/constants` and are used by both the table and the validator.

### Adding a submodule (e.g. `academics/attendance`)

1. Create `models/`, `repositories/`, `services/`, `controllers/`, `validators/`, `permissions/`, `routes/` and `index.js` (copy `academics/classes` as a template).
2. Register the model in `src/database.schema.js` and run `npm run db:generate -- --name attendance`.
3. Mount the router in `modules/academics/index.js`. For a new module, mount it in `src/routes.js`, give it an activity tab (`router.use("/activity", activityRoutes("<module>"))`, first in its router), and register any jobs in `src/jobs.js`.
4. Add a test suite in `test/suites/` and import it in `test/e2e.test.js`.
5. Run `npm run docs:endpoints`, and describe the tables in `docs/DATA_MODEL.md`.
