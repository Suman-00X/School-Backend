# Roadmap

Backend only. **The frontend (web and mobile) is out of scope for now** and will be planned separately.

**Legend:** ✅ done · 🟡 partly done · ⬜ not started

| Phase | Theme | Status |
|---|---|---|
| 0 | Make it run | ✅ Done |
| 1 | Architecture: PostgreSQL + MongoDB, modular structure | ✅ Done |
| 2 | Authentication and foundation | ⬜ Next |
| 3 | Core academics | ⬜ |
| 4 | Fees and communication | ⬜ |
| 5 | Reports and analytics | ⬜ |
| 6 | Additional modules | ⬜ |
| 7 | Production readiness | ⬜ |

Effort estimates are rough and assume one developer.

---

## Phase 0: Make it run ✅

**Housekeeping**
- ✅ Git repository with a baseline commit
- ✅ `.gitignore` fixed (was `.gitIgnore`); `.env.example` added
- ✅ Dead code removed (old monolithic controllers, empty files, stray notes, unused config)
- ✅ Duplicate handlers merged

**Startup blockers**
- ✅ Missing dependencies declared; ES modules; `start`/`dev` scripts
- ✅ Missing and empty files implemented (response index, pagination, tenant model)
- ✅ Broken imports and calls to functions that did not exist fixed
- ✅ Student promotion rewritten
- ✅ Missing permission entries added (exam, mappings, enrollments, parent links)
- ✅ Doubled `/api/users/users` paths fixed
- ✅ Validation failures return 400/404/409 instead of 500
- ✅ `GET /health`

---

## Phase 1: Architecture ✅

- ✅ **PostgreSQL for all relational data** (17 tables) with foreign keys, unique, partial-unique and check constraints, and enum types. See [DATA_MODEL.md](DATA_MODEL.md)
- ✅ **MongoDB for document data**, starting with the audit log
- ✅ Drizzle ORM with versioned SQL migrations (`db:generate`, `db:migrate`)
- ✅ Real transactions for admission, promotion, teacher/parent creation and academic-year switching; bulk inserts are all-or-nothing
- ✅ Database errors mapped to clean API errors (duplicate → 409; bad reference, bad UUID, broken rule → 400)
- ✅ **Module-first folder structure:** `src/modules/<feature>/` (routes, controller, service, queries) plus shared `src/common/`. See [README](../README.md#project-structure)
- ✅ `npm run dev:memory`: real PostgreSQL 18 and in-memory MongoDB, no installs needed
- ✅ Verified with a 94-check end-to-end run

---

## Phase 2: Authentication and foundation ⬜ (about 1–2 weeks)

- ⬜ **Login:** `POST /auth/login`, bcrypt password hashing, JWT with `tenantId`, refresh tokens, logout
- ⬜ Change password, forgot/reset password, first-login invite for admitted students and parents
- ⬜ **School onboarding:** create a tenant and its first admin
- 🟡 **Field whitelisting:** protected fields (`id`, `tenantId`, `passwordHash`, timestamps) are already stripped. Still to do: per-route schemas
- ⬜ **Input validation** with Zod on every route (types, required fields, formats)
- ⬜ Helmet and rate limiting (stricter on login)
- ⬜ Delete/deactivate endpoints for every entity
- ⬜ Seed script with a realistic demo school (years, classes, sections, staff, students)
- ⬜ ESLint and Prettier
- ⬜ Structured logging (pino or winston) with request IDs
- ⬜ OpenAPI/Swagger docs
- ⬜ **Tests:** Jest + Supertest against `inMemoryDatabases` (port the 94-check smoke run); GitHub Actions CI
- 🟡 Health check: `/health` exists; add database readiness checks

**Done when:** an admin can log in, set up a school, and admit a student end to end with real credentials.

---

## Phase 3: Core academics ⬜ (about 2–3 weeks)

- ⬜ **Attendance:** daily or per period for students; staff attendance (PostgreSQL)
- ⬜ **Timetable:** periods, slots per section, subject and teacher; clash checks
- 🟡 **Exam schedule:** each paper has `examDate`. Still to do: start/end times and a timetable view
- ⬜ **Grade scales** per school; automatic grade from marks
- ⬜ **Report cards:** results per exam and per year, totals, percentage, rank
- ⬜ **Bulk promotion** of a whole section at year end (single-student promotion exists)
- ⬜ **Role scoping:** teachers see only their sections; students only themselves; parents only their children
- ⬜ Bulk student admission (CSV import with per-row errors)

---

## Phase 4: Fees and communication ⬜ (about 3–4 weeks)

- ⬜ **Fees:** categories, structures per class and year, invoices, payments, receipts, concessions, late fines (PostgreSQL, `numeric` money)
- ⬜ **Payment gateway** (Razorpay, Stripe or similar) with webhooks
- ⬜ **Notifications:** email, SMS and push; announcements and circulars (MongoDB)
- ⬜ **Background jobs:** BullMQ + Redis for bulk messages, reports and reminders

---

## Phase 5: Reports and analytics ⬜ (about 2 weeks)

- ⬜ Dashboard endpoints: attendance %, fee collection, results by class
- ⬜ Exports: report cards as PDF; data as Excel/CSV
- 🟡 **Audit log:** every write is already recorded in MongoDB. Still to do: an admin endpoint to browse and filter it

---

## Phase 6: Additional modules ⬜ (as needed)

- ⬜ Homework/assignments
- ⬜ File uploads to S3 (photos, documents), with metadata in MongoDB
- ⬜ Library
- ⬜ Transport
- ⬜ Hostel
- ⬜ Staff payroll
- ⬜ Inventory

---

## Phase 7: Production readiness ⬜ (about 1–2 weeks, before launch)

- ⬜ Docker images; staging and production environments; deployment pipeline
- ⬜ Managed PostgreSQL and MongoDB, with automated backups and tested restores
- ⬜ PostgreSQL row-level security as a second layer of tenant isolation
- ⬜ Redis caching for hot reads (classes, subjects, current year)
- ⬜ Error tracking (Sentry) and metrics and alerts
- ⬜ Archiving of old academic years
- ⬜ Multi-language support for API messages

---

## Out of scope for now

- Web frontend (admin, teacher, student and parent portals)
- Mobile app
