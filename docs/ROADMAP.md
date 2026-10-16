# Roadmap

Backend only. **The frontend (web and mobile) is out of scope for now** and will be planned separately.

**Legend:** ✅ done · 🟡 partly done · ⬜ not started

| Phase | Theme | Status |
|---|---|---|
| 0 | Make it run | ✅ Done |
| 1 | Architecture: PostgreSQL + MongoDB, modular structure | ✅ Done |
| 2 | Authentication and foundation | ✅ Done (round 2: sign-in, refresh rotation, invitations, password reset) |
| 3 | Core academics | ✅ Done |
| 4 | Fees and communication | ✅ Done (push notifications later) |
| 5 | Reports and analytics | ✅ Done |
| 6 | Additional modules | ✅ Done |
| 7 | Production readiness | 🟡 Built; needs your choices (host, registry) and a first restore drill |

Status as of 2026-10-16: **156 end-to-end tests** pass on embedded PostgreSQL 18 and in-memory MongoDB. ESLint and Prettier are clean, and a fresh clone passes everything. Review items are in [DECISIONS.md](DECISIONS.md).

---

## Phase 0: Make it run ✅
- ✅ Git repository, `.gitignore`, `.env.example`; dead code removed
- ✅ Startup blockers fixed: dependencies, ES modules, broken imports and calls
- ✅ Validation failures return 4xx instead of 500; `GET /health`

## Phase 1: Architecture ✅
- ✅ PostgreSQL for relational data, MongoDB for documents; Drizzle with versioned SQL migrations
- ✅ Modules → submodules → folders by file type, each with an `index.js`
- ✅ `src/common` framework layer:
  - auth, validation, errors, responses
  - a tenant-scoped repository, CRUD factories
  - audit trail, sequences
- ✅ Privileged staff roles (PRINCIPAL, ACCOUNTANT, STAFF) with per-action permissions
- ✅ REST API v1 with one response/error envelope

## Phase 2: Authentication and foundation ✅
- ✅ **Login:** `POST /auth/login` (school code + email + password), scrypt hashing, 15-minute access tokens, rotating refresh tokens with reuse detection, logout, device list
- ✅ Change, forgot and reset password; invitations by email with single-use links
- ✅ Lockout after repeated failures; strict rate limits on public auth endpoints; sign-ins in the audit trail
- 🟡 **School onboarding:** operator CLI (`npm run school:create`) with an admin invitation. Self-service sign-up still to do
- ⬜ Phone + OTP sign-in for parents (needs an SMS provider)
- ✅ Field whitelisting and Zod validation on every route
- ✅ Helmet, global rate limiting, stricter limits on sign-in
- ✅ ESLint and Prettier
- ✅ Structured logging (pino) with request ids
- ✅ OpenAPI 3.1 generated from the route table, Swagger UI at `/api/docs`, generated [ENDPOINTS.md](ENDPOINTS.md)
- ✅ End-to-end tests (node:test, 156 tests) and GitHub Actions CI
- ✅ `/health` and `/ready`
- 🟡 Demo seed: `dev:memory` seeds a school and admin. A full demo dataset is still to do

## Phase 3: Core academics ✅
- ✅ Calendar: holidays and events, which decide working days
- ✅ Student attendance, daily or per period, with summaries and absence alerts. Staff attendance is in HR
- ✅ Timetable: periods, slots, and clash checks for section, teacher and room; section and teacher views
- ✅ Exam schedule: dates, times, rooms, clash checks; result publication
- ✅ Grade scales and automatic grades
- ✅ Report cards: per exam, totals, percentage, rank, class average; PDF with the school letterhead
- ✅ Bulk promotion of a section, with repeat and leave overrides
- ✅ Record-level scope:
  - teachers see only their sections and subjects
  - students see only themselves
  - parents see only their children
- ✅ CSV student import in the background, with per-row errors

## Phase 4: Fees and communication ✅
- ✅ Fee heads, structures per class and year, installments, concessions, invoices, late fees (daily job), statements
- ✅ Payments at the counter and online (Razorpay, or mock) with an idempotent webhook; receipt PDFs
- ✅ Notifications: in-app inbox, email (SMTP), SMS (HTTP provider); announcements to audiences
- ⬜ Push notifications (D-24)
- ✅ Background jobs (BullMQ with Redis, or in-process), domain events, exactly-once side effects
- ✅ Installment plans per student, annual concessions on every bill, late-fee slabs and waivers, schools' own Razorpay keys, partial online payments with credit for overpayments (D-17 to D-21)
- ⬜ Verify Razorpay with real test keys before go-live (D-20)

## Phase 5: Reports and analytics ✅
- ✅ Dashboards: overview, attendance, fees (with defaulters), academics (toppers, pass rates)
- ✅ Exports: students, attendance register, fee collections, defaulters and results as XLSX or CSV
- ✅ Audit log viewer with filters

## Phase 6: Additional modules ✅
- ✅ Files: student, staff and general documents with type, size and signature checks, and signed downloads (S3 or local)
- ✅ School logo on report cards and receipts
- ✅ Homework: attachments, submissions, late rules, grading and returns, notifications
- ✅ Library:
  - catalogue with ISBN checks and a public catalogue, copies, loans, renewals
  - circulation rules per borrower category and item type; due dates on open days; back-dated loans
  - fines that accrue daily, part-payments, partial waivers, library credit; blocks with override
  - lost and damaged copies, lost-and-found reversal
  - holds with a queue, pickup window and expiry
  - stock-taking, reports, self-service
  - reminders: due soon, overdue (parents too), hold ready, fine charged
- ✅ Transport: vehicles with compliance expiry dates, routes and stops, seat capacity under lock, rosters
- ✅ Hostel: hostels, rooms, bed allocations by date range with gender rules (pre-booking, transfers, extensions, roll-over, leavers), availability, occupancy, assignable resources
- ✅ HR and payroll:
  - staff attendance
  - leave types, requests, approvals and balances
  - salary structures
  - payroll runs with loss of pay and payslip PDFs
  - bank details encrypted
- ✅ Inventory: items, vendors, append-only stock ledger with weighted average cost, low-stock, valuation and consumption reports

## Phase 7: Production readiness 🟡
- ✅ Dockerfile (non-root, healthcheck), and docker-compose with api, worker, migrate, PostgreSQL, MongoDB and Redis. *Not built on this machine (no Docker); CI builds it*
- ✅ CI: format, lint, migration drift check, endpoint-doc freshness, tests on Node 22 and 24, image build
- 🟡 Staging and production: documented in [OPERATIONS.md](OPERATIONS.md). **Choose a registry and host** (D-42)
- 🟡 Backups:
  - ✅ `npm run backup` / `npm run restore`, with checksums and retention, plus the runbook
  - ⬜ a real restore drill (D-44)
- 🟡 PostgreSQL row-level security: designed, not built (D-45)
- ✅ Caching of hot reads: the current year and the school profile
- ✅ Prometheus metrics, alert rules, and an error-reporting hook (Sentry optional)
- ✅ Read-only archiving of past academic years, enforced by database triggers
- ✅ Encryption of sensitive fields at rest
- 🟡 Multiple languages:
  - plan written
  - ✅ Unicode fonts in every PDF: Indian scripts, Arabic/Urdu, ₹ (D-37)
- ✅ Logging for operations: request lines with user, route, timing and the error shown; slow requests and queries; job failures; database connection events; crash guards
- ✅ Module administrator roles for HR, library, transport, hostel and inventory (D-51)

---

## Suggested next steps

1. **Row-level security** (D-45), before real schools' data goes in.
2. Go-live checks:
   - test Razorpay with real test keys (D-20)
   - run a restore drill (D-44)
   - choose a host and registry (D-42)
3. **Frontend** (web portals, then mobile).
4. Product extensions:
   - push notifications (mobile app)
   - transport and hostel fees on invoices
   - library fines and payroll posted to the general ledger
