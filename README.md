# School-Backend

Multi-tenant school management API: Express 5, MongoDB (Mongoose 9).

## Run

**Quick start, no MongoDB needed** (in-memory DB, wiped on exit):

```bash
npm install
npm run dev:memory
```

It seeds a demo school and admin, and prints a 12-hour admin token. Send it as `Authorization: Bearer <token>`.

**Against a real MongoDB:**

```bash
cp .env.example .env          # set MONGO_URI and JWT_SECRET
npm run sync-indexes          # once, and after index changes
npm run dev                   # or: npm start
```

MongoDB must run as a replica set, because admissions, promotions and bulk marks use transactions.

> There is no login endpoint yet (Phase 1). Until then, tokens come from `dev:memory`.

## API overview

All routes are under `/api` and need a Bearer token. `GET /health` is public.

| Area | Base path |
|---|---|
| Users, teachers, parents | `/api/users`, `/api/teachers`, `/api/parents` |
| Students | `/api/students`, `POST /api/students/admission` |
| Student–parent links | `/api/student-parent-map` |
| Academic years, classes, subjects | `/api/academic/academic-years`, `/classes`, `/subjects` |
| Sections and allocations | `/api/academic/sections`, `/class-section-subject-map`, `/teacher-section-subject-map`, `/student-section-map` |
| Promotion | `POST /api/academic/students/promote` |
| Exams and marks | `/api/academic/exams`, `/exam-section-subject-map`, `/marks` |

Year-scoped routes (sections, allocations, exams, marks) act on the tenant's **current** academic year. To work on another year (for example, setting up next year's sections), send its ID in the `X-Academic-Year-Id` header.

## Layout

```
src/
  config/        env, db, role permissions
  routes/        route definitions + middleware chains
  controllers/   request handling, validation
  queries/       database access
  services/      code generation (IDs, roll numbers), shared lookups
  middlewares/   auth, permissions, academic year, audit, errors
  models/        mongoose schemas
scripts/         dev-memory server, index sync
```
