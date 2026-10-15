# School-Backend

Multi-tenant school management API: Express 5, **PostgreSQL** (Drizzle ORM) for relational data, **MongoDB** (Mongoose) for document data.

- [Roadmap and status](docs/ROADMAP.md)
- [Data model: what lives in PostgreSQL vs MongoDB](docs/DATA_MODEL.md)

## Run

**Quick start, nothing to install** (throwaway PostgreSQL 18 + MongoDB, wiped on exit):

```bash
npm install
npm run dev:memory
```

It seeds a demo school and admin, and prints a 12-hour admin token. Send it as `Authorization: Bearer <token>`.

**Against real databases:**

```bash
cp .env.example .env     # set DATABASE_URL, MONGO_URI, JWT_SECRET
npm run db:migrate       # create/upgrade PostgreSQL tables
npm run dev              # or: npm start
```

Requires PostgreSQL 13+ and MongoDB 6+. No replica set is needed; transactions run in PostgreSQL.

> There is no login endpoint yet (roadmap Phase 2). Until then, tokens come from `dev:memory`.

| Script | Does |
|---|---|
| `npm run db:generate -- --name <change>` | Writes a SQL migration from schema changes |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:studio` | Opens Drizzle Studio to browse PostgreSQL |
| `npm run mongo:sync-indexes` | Builds MongoDB indexes (production) |

## Project structure

Code is organized **by module (feature) first**. Each module owns its routes, controllers, business logic and queries; code shared by several modules lives in `common/`.

```
src/
  server.js, app.js        start-up, Express app
  routes.js                mounts every module's router under /api
  config/                  env, role permissions
  common/                  shared by all modules
    middlewares/           auth, permissions, audit, errors
    responses/             success/error response format, DB error mapping
    services/              code generation (IDs, roll numbers), serial counters, audit log
    utils/                 errors, pagination, input sanitizing, dates, validation
    constants/
  database/
    postgres/              client, helpers, schema/ (tables), migrations/
    mongo/                 client, models/
  modules/
    users/  teachers/  parents/  students/
    academic-years/  classes/  subjects/  sections/
    section-subjects/  teacher-assignments/  enrollments/
    exams/  marks/
```

Inside a module, files are named `<entity>.<layer>.js`:

| File | Responsibility |
|---|---|
| `x.routes.js` | URL paths and middleware chain (permission, academic year, audit) |
| `x.controller.js` | Read the request, call the service or queries, send the response. No SQL |
| `x.service.js` | Multi-step business logic and transactions (optional) |
| `x.queries.js` | Database access for that entity only |
| `x.middleware.js` | Module-specific middleware (optional) |

**Rules**
- A module may import another module's `queries` or `service`, never its controller.
- Only `queries` files talk to the database. Pass `tx` (from `db.transaction`) as the last argument to run inside a transaction.
- New feature → new folder in `modules/`, with its router added in `routes.js` and tables in `database/postgres/schema/`.

## API overview

All routes are under `/api` and need a Bearer token. `GET /health` is public.

| Area | Base path |
|---|---|
| Users, teachers, parents | `/api/users`, `/api/teachers`, `/api/parents` |
| Students | `/api/students`, `POST /api/students/admission` |
| Student–parent links | `/api/student-parent-map` |
| Academic years, classes, subjects | `/api/academic/academic-years`, `/classes`, `/subjects` |
| Sections and allocations | `/api/academic/sections`, `/class-section-subject-map`, `/teacher-section-subject-map`, `/student-section-map` |
| Promotion | `POST /api/academic/student-section-map/promote` |
| Exams and marks | `/api/academic/exams`, `/exam-section-subject-map`, `/marks` |

Year-scoped routes (sections, allocations, exams, marks) act on the school's **current** academic year. To work on another year, send its ID in the `X-Academic-Year-Id` header.

IDs are UUIDs. Related records are embedded by name, e.g. a section returns `classId` plus `class: { className, classOrder }`.
