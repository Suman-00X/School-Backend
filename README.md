# School-Backend

Multi-tenant school management API: Express 5, **PostgreSQL** (Drizzle ORM) for relational data, **MongoDB** (Mongoose) for document data.

- [API reference (v1)](docs/API.md): endpoints, roles, response and error formats
- [Data model](docs/DATA_MODEL.md): what lives in PostgreSQL vs MongoDB
- [Roadmap](docs/ROADMAP.md): phases and status

## Run

**Quick start, nothing to install** (throwaway PostgreSQL 18 + MongoDB, wiped on exit):

```bash
npm install
npm run dev:memory
```

It seeds a demo school and admin, and prints a 12-hour admin token. Send it as `Authorization: Bearer <token>` to `http://localhost:3000/api/v1/...`.

**Against real databases:**

```bash
cp .env.example .env     # set DATABASE_URL, MONGO_URI, JWT_SECRET
npm run db:migrate       # create/upgrade PostgreSQL tables
npm run dev              # or: npm start
```

Requires PostgreSQL 13+ and MongoDB 6+.

> There is no login endpoint yet (roadmap Phase 2). Until then, tokens come from `dev:memory`.

| Script | Does |
|---|---|
| `npm run db:generate -- --name <change>` | Writes a SQL migration from model changes |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:studio` | Browse PostgreSQL in Drizzle Studio |
| `npm run mongo:sync-indexes` | Builds MongoDB indexes (production) |

## Project structure

```
src/
  server.js              start-up and shutdown
  app.js                 Express app: security, JSON, /health, /api/v1, errors
  routes.js              API v1: authenticate + audit, then mounts each module
  bootstrap.js           connects PostgreSQL and MongoDB
  database.schema.js     registry of every module's tables (for the ORM)

  common/                FRAMEWORK ONLY: no school/business logic
    config/              environment
    auth/                roles, authenticate (JWT), authorize + definePermissions
    validation/          zod setup, validate() middleware, shared schema building blocks
    http/                AppError + error factories, response helpers, error handler, security
    database/            postgres/mongo clients, base columns, createRepository, platform tables
    crud/                createCrudService, createCrudController
    audit/               audit-trail middleware + MongoDB model
    sequences/           per-tenant number sequences (for generated codes)
    utils/

  modules/
    users/
      index.js           module entry: mounts the submodules' routers
      shared/            code only the users module needs (constants, validators, services, utils, models)
      accounts/  staff/  teachers/  parents/  students/
    academics/
      index.js
      shared/            (constants, middlewares, utils)
      academic-years/  classes/  subjects/  sections/  section-subjects/
      teacher-assignments/  enrollments/  exams/  marks/

migrations/              generated SQL migrations
scripts/                 migrate, dev-memory, Mongo index sync
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
3. Mount the router in `modules/academics/index.js`.
4. Document the endpoints in `docs/API.md` and the tables in `docs/DATA_MODEL.md`.
