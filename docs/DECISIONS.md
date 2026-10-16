# Decisions for review

Design decisions made while building roadmap phases 3–7 without you. Each entry says what I chose, why, and what you might want to change.

**Legend:** 🔴 needs your input before production · 🟡 worth a look · 🟢 FYI, low risk · ✅ resolved after your review

## Start here

**Round 2, after your review of D-01 to D-24:**

| Your request | Status |
|---|---|
| D-01, D-12: login with JWT | ✅ Built and security-reviewed (D-01) |
| D-08: attendance lock; admins can still change | ✅ Built (D-08) |
| D-09, D-10: configurable grading systems, frozen report cards | ✅ Built (D-09, D-10, with review points) |
| D-13: match sheet columns to form fields before import | ✅ Built (D-13) |
| D-17, D-18, D-19, D-21: installment plans per student, concessions on receipts, late-fee slabs, partial online payments | ✅ Built (each entry has review points) |
| D-20: BYOK Razorpay | ✅ Built; 🔴 one real test-mode run needed |
| Questions on D-02, D-03, D-07, D-11, D-14, D-24 | Answered in each entry. D-11 lists what teachers can do today, with options |

**State of the code:**
- 223 end-to-end tests pass on real PostgreSQL 18 and MongoDB.
- Lint is clean.
- A fresh clone passes everything.
- Every change is a local git commit; nothing was pushed.

**Still open (🔴):**

| # | Decision | Area |
|---|---|---|
| D-20 | Run one school through Razorpay test mode (order, checkout, webhook, refund) | Fees |
| D-37 | PDFs cannot print non-Latin names yet; choose the fonts for your regions | Reports |
| D-44 | Confirm backup targets and run one real restore drill | Ops |
| D-45 | Row-level security: designed, build it before the first real school | Security |
| D-47, D-48, D-49 | Library: lost-book charge, when fines are paid, due dates in the past | Library |
| D-51, D-52 | Transport: teachers see parent phones; seats survive year-end and leaving | Transport |
| D-54 | Hostel: one bed per student across years | Hostel |

**Untested here because the tools are missing:**
- the Docker image and compose stack (no Docker on this machine; CI builds the image)
- a real `pg_dump`/`mongodump` round trip
- the Sentry path (no DSN)

**Also set before production:**
- `DATA_ENCRYPTION_KEY` (D-56)
- `METRICS_TOKEN`
- `TRUST_PROXY_HOPS`
- `REDIS_URL` (D-02)
- `WEB_APP_URL` and SMTP
- a host and image registry (D-42)

---|---|---|
| D-01 / D-12 | Phase 2 login is not built; the portal and payments are waiting for it | Scope |
| D-20 | Each school brings its own Razorpay keys; verify one school in Razorpay test mode before go-live | Fees |
| D-37 | PDFs cannot print non-Latin names yet; choose the fonts for your regions | Reports |
| D-44 | Confirm backup targets and run one real restore drill | Ops |
| D-45 | Row-level security: designed, build it before the first real school | Security |
| D-47, D-48, D-49 | Library: lost-book charge, when fines are paid, due dates in the past | Library |
| D-51, D-52 | Transport: teachers see parent phones; seats survive year-end and leaving | Transport |
| D-54 | Hostel: one bed per student across years | Hostel |

**Untested here because the tools are missing:**
- the Docker image and compose stack (no Docker on this machine; CI builds the image)
- a real `pg_dump`/`mongodump` round trip
- the Sentry path (no DSN)

**Also set before production:**
- `DATA_ENCRYPTION_KEY` (D-56)
- `METRICS_TOKEN`
- a host and image registry (D-42)

---

## Scope

### ✅ D-01: Login is built (round 2)
You asked for it after the overnight review. Sign-in is `POST /api/v1/auth/login` with `{ schoolCode, email, password }`.
- **Tokens:**
  - The access token is a JWT valid for 15 minutes.
  - The refresh token is valid for 30 days and **rotates on every use**. Replaying an old refresh token ends that session.
  - `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/sessions` (your devices) and `DELETE /auth/sessions/:id`.
- **Passwords:**
  - Hashed with scrypt, built into Node, so there is no new dependency.
  - Policy: 8–128 characters, with at least one letter and one digit.
  - `PATCH /auth/password` changes it and signs out your other devices.
  - Forgot password: `POST /auth/password-reset-requests` always answers the same, so it reveals nothing. The link it emails is good for 1 hour and works once.
- **Invitations:** `POST /auth/invitations` emails a 7-day set-password link.
  - ADMIN, PRINCIPAL and STAFF can invite.
  - Only ADMIN can invite privileged staff.
  - `npm run school:create` now sends the first admin an invitation.
- **Protection:**
  - **Password guessing:**
    - Each attempt is claimed *before* the password is checked, so parallel bursts count too.
    - Counters live in the shared cache, per account: 5 attempts per 15 minutes from one IP, and 50 from all IPs together.
    - One attacker therefore cannot lock the real owner out; only a distributed attack can, for 15 minutes.
    - Unknown emails are counted the same way, so lockouts reveal nothing.
    - Guessing the current password in "change password" counts too.
  - **Rate limits:** sign-in, refresh (counted per session) and reset requests each have their own limits.
  - **Reset emails** are sent by a background job, so the answer and its timing are the same for every email.
  - **Refresh:**
    - Two tabs refreshing at once is handled: there is a 30-second grace window, and the session stays.
    - Any older refresh token for a live session ends that session (theft).
  - **Ending sessions:** logout, password reset, deactivation and **an email change by the office** end tokens immediately. On an email change, the old address is also notified, so a changed email cannot quietly be used to take an account over.
  - **Accepted tokens:** only real session access tokens open the API.
  - **Audit and secrets:** sign-ins are in the audit trail. Hashes and secret-named fields (passwords, tokens, keys) are stripped from responses, audit records and logs.
  - A security review agent audited all of this, and each finding has a test.
- **🟡 Production:** set `TRUST_PROXY_HOPS` behind a load balancer (the server warns at startup if it is missing). Otherwise every user shares the balancer's IP for the per-IP limits.
- **🟡 For you:**
  - Should invitations go out automatically on admission? Today the office sends them, in bulk of up to 500.
  - Is phone-number + OTP sign-in needed for parents? It would need an SMS provider.

## Platform and infrastructure

### 🟡 D-02: Redis is optional
BullMQ (jobs) and the cache both use Redis when `REDIS_URL` is set. Without it they fall back to in-process drivers, so `npm run dev`, tests and single-instance deployments need nothing extra.

**Production with more than one API instance must set `REDIS_URL`**, and run `npm run worker`. Sign-out and token revocation also rely on the shared cache.

**Your answer:** you will provide the Redis URL. Set it as `REDIS_URL`; nothing else changes.

### 🟢 D-03: Background jobs use one queue (kept, as you asked)
All jobs go to one BullMQ queue (`school-jobs`) with per-job retry settings.

**Your question: should each service get its own queue?** Not yet. One queue with per-job retries is simpler to run and monitor at this size.

Split when one kind of work starts delaying the others, for example bulk SMS during result day slowing fee receipts. Job names are already prefixed by module (`communication.deliver`, `finance.applyLateFees`, `library.overdueReminders`). Moving to one queue per module, each with its own concurrency, is then a change inside `common/jobs/bullmq.driver.js`, with no change to module code.

### 🟢 D-04: OpenAPI is generated, not hand-written
`createRouter()` records every route. The generator reads the Zod schemas passed to `validate()` and the permissions passed to `authorize()`.

- Live docs: `GET /api/docs` (Swagger UI).
- Spec: `GET /api/v1/openapi.json`.
- Both are **public**. Hide them in production if you prefer: one line in `app.js`.

Swagger UI loads from unpkg (pinned version). If CDNs are not allowed, vendor `swagger-ui-dist`.

### 🟡 D-05: Error tracking: one hook, Sentry optional
Every unexpected error goes through one function, `reportError()` in `common/observability`:
- HTTP 500s
- jobs that fail their **last** attempt (failed attempts that will be retried are only counted)

Each error is logged with its `requestId` and counted in `/metrics`.

Sentry (`@sentry/node`) pulls in a large OpenTelemetry tree, so it is **not** a dependency. It is enabled when you set `SENTRY_DSN` and run `npm install @sentry/node`. Personal data is never sent.

The Sentry path itself is untested (no DSN here). Try it once on staging.

### 🟢 D-06: `uuid` pinned via npm `overrides`
`exceljs` depends on an old `uuid` with a moderate advisory. The advisory doesn't affect how `exceljs` uses it, but I pinned `uuid@^11` anyway, and verified that `exceljs` still works.

---

## Phase 3: core academics

### 🟡 D-07: How attendance percentage is calculated (students)
**Your question:** this is about **student** attendance. Staff attendance (HR) feeds payroll's loss-of-pay rules instead (D-57).

| Status | Counts as |
|---|---|
| `LATE` | present |
| `HALF_DAY` | half a day |
| `EXCUSED` | left out of the denominator (doesn't count against the student) |
| `ABSENT` | absent |

Working days are the days in the range, minus weekly off days and HOLIDAY/VACATION calendar events. Days with no register taken are reported as `unmarked` and don't count as absent.

The weights live in one constant (`ATTENDANCE_WEIGHT`). They can become a per-school setting next to the attendance lock (D-08) if schools differ, for example counting LATE as half. Say if you want that.

### ✅ D-08: Attendance registers lock; admins can still change them (round 2)
- **Edit window:** each school sets one (`GET`/`PATCH /academics/attendance/policy`, ADMIN). A register can be taken or changed until N days after its date; the default is 2, and 0 means the same day only.
- **After the window:** the register is **locked**. Teachers get a 403 saying who can change it.
- **Overrides:** the override roles (ADMIN by default; the school may add PRINCIPAL) can still change a locked register, but they must give an `overrideReason`. The reason, the person and the time are stored on the register and shown in the register view, and the change is in the audit trail.
- **Late first entry:** taking a register for the first time after the window also counts as a change.

### 🟡 D-09: Report-card result rules → configurable result policies (done)
Each school defines **result policies** (`/academics/result-policies`): grading mode (marks only, letter grades, GPA on any scale up to 10 with credits, pass/fail), pass criteria (paper pass marks, a minimum % per subject or per policy, an overall minimum %, theory/practical components each passing), compartment (up to N failed subjects), grace marks (per subject and in total, only to pass a subject, and only when the result improves), best N subjects with mandatory ones, co-scholastic subjects graded without marks, absence treatment per reason (ABSENT, MEDICAL, EXEMPT), ranking (competition, dense, none; section and/or class; hidden from families) and rounding.

- **Where a policy applies, most specific first:** exam + class → exam → class → school default → built-in. An exam is a one-off decision (a board exam, a pass/fail unit test), so it beats the class's standing rule.
- **Grade scale:** the exam's own scale, else the policy's, else the school default.
- **Built-in rules = the old behaviour,** so schools without a policy see the same results as before.
- **Weighted exams** are assessment schemes (`/academics/assessment-schemes`). See the review points below.

### 🟢 D-10: Report cards are frozen when published (done)
Live report cards are still computed from marks. Publishing (an exam or an assessment scheme) also stores an immutable snapshot per student in MongoDB `report_snapshots`, as version N (`result_publications`). Re-publishing adds a version, withdrawing hides it from the portal and keeps it, and staff can compare live results with any version. The portal and its PDFs read only snapshots.

- **Hardening after review:**
  - Students with marks still missing are not ranked and don't count in averages.
  - Pass/fail and grade bands use the exact percentage; rounding is for display only.
  - Snapshots left behind by a publication that crashed before committing are cleaned up on the next publish, and are never listed.
- **Tamper-proof (built, round 3):**
  - **Sealing:**
    - Every published report card is sealed with an HMAC of its full content. The key is derived from `DATA_ENCRYPTION_KEY`, which never leaves the application.
    - The seal binds the student and the publication, so copying one student's seal onto another's card fails.
    - The publication row in PostgreSQL lists every student's seal (the manifest).
  - **On every read** (families' list and PDF, staff views and PDF), the card is checked against its seal and the manifest.
    - A card changed directly in MongoDB is **never shown or printed**. Families get "failed its integrity check… the school has been alerted".
    - The alert is logged, counted and sent to error tracking.
  - **Whole-version check:** `GET …/result-publication/versions/:version/integrity` (ADMIN, PRINCIPAL) reports edited, deleted and forged cards. Re-publishing restores clean cards for families.
  - **Write-once storage:**
    - Snapshots are never updated or deleted, even by the application. Withdrawal now lives only in PostgreSQL.
    - `npm run mongo:app-role` creates a MongoDB role in which `report_snapshots` is insert and read only. It was tested against an auth-enabled MongoDB: update, delete and drop are refused.
  - **🟡 For you:** run `mongo:app-role` and use that user in production's `MONGO_URI` (OPERATIONS.md › security checklist).

### Review points for D-09 / D-10
- 🟡 **Grace counts in the total** (`graceCountsInTotal`, default true), and the subject's grade uses the graced marks. Some boards keep grace out of the aggregate: set it to false.
- 🟡 **In assessment schemes, an absence counted as zero is 0% for that exam,** not an automatic fail of the year. The weighted result decides. Excluded absences (exempt, medical when excluded) drop that exam, and the other exams' weights are rescaled. Theory/practical pass rules apply in each exam's own result; the weighted subject is judged on its weighted total.
- 🟡 **Co-scholastic subjects in a scheme show the latest exam's grade.** Grades are not averaged.
- 🟡 **Ranks are hidden on the printed PDF too** when the policy hides them from families, because the card goes home.
- 🟢 **Results published before this change have no snapshot,** so they are not in the portal until they are published again (`POST …/result-publication/versions`). There are no live schools yet.
- 🟢 **Scheme results do not notify families yet.** Exam results still do, once per exam.
- 🟢 **The letterhead on a snapshot PDF is today's** (name, logo); the report body is frozen.
- 🟢 **`npm run mongo:sync-indexes` only loaded the audit-log model.** It now also loads report snapshots (their unique version index matters). Other modules' Mongo models still rely on `autoIndex` outside production.

### 🟡 D-11: What teachers can access (record-level scope)
A teacher can act on a section if they are its **class teacher** or are **assigned a subject** in it. Inside such a section:
- a subject teacher can take whole-day attendance;
- marks are limited to the teacher's own subjects; class teachers can record marks for any subject in their section.

**What teachers can do today, as you asked**, so you can choose:

| Area | Teacher can | Limited to |
|---|---|---|
| Attendance | take and retake registers, view registers and summaries | their sections; locked registers excluded (D-08) |
| Marks | record and update marks, single or bulk | their subjects (class teacher: all subjects of their section) |
| Homework | create, edit and delete homework, add attachments, see submissions, grade or return work | their sections and subjects |
| Report cards | view, and download as PDF | their sections |
| Timetable | view their own and their sections' timetables | — |
| Academics (read) | years, classes, subjects, sections, enrollments, exams, grade scales, periods | — |
| Students (read) | list and view students | currently **all** students of the school |
| HR self-service | apply for and cancel own leave, see own attendance, leave balance and payslips | themselves |
| Read-only elsewhere | transport routes and assignments, hostel rooms and allocations, vehicles | — |

**Options to consider:**
1. Whole-day attendance for the **class teacher only**. This is a one-word change.
2. Limit the student list and student profiles to students in their sections.
3. Hide transport and hostel data from teachers. This includes the parent phone numbers on rosters (D-51).
4. Let teachers publish results, or create exams, for their subjects. Today only ADMIN and PRINCIPAL can.
5. Let class teachers approve leave notes from parents. This is a new feature.

### ✅ D-12: The portal works with real sign-in (round 2)
Students, parents and teachers now sign in (D-01) and use `/api/v1/me/*` with their JWT access token. A test signs a parent in and opens their children's portal.

A parent sees only children linked to them. A student sees only themselves. Other students return 404, not 403, so their existence isn't confirmed.

### ✅ D-13: CSV import: columns are matched to fields first (round 2)
**Your request:** match the form fields to the sheet's columns before importing.
1. **Upload.** The file is stored and nothing is imported yet; the status is `MAPPING`. The response gives:
   - each column header with sample values
   - the 15 form fields (6 required), each with the column it was matched to
   - a dry-run check of the first 20 rows: format errors, unknown class or section
   - matching that ignores case and punctuation, with common names such as "Adm No", "Surname", "Grade", "Div" and "Father's Email"
2. **Correct.** `PATCH /administration/imports/:id { mapping: { admissionNumber: "Pupil Code" } }` changes the mapping, and the preview updates. A column cannot feed two fields, and unknown columns are rejected.
3. **Start.** `POST …/:id/start` refuses (422) until every required field has a column, then queues the import (202). `DELETE …/:id` cancels it.

A mapping can also be sent with the upload, for integrations.

**Unchanged:**
- Each row is admitted in its own transaction, so good rows succeed even when others fail.
- An existing parent with the same email is linked rather than duplicated.
- Imports are not retried automatically.
- Limits: 5,000 rows and 5 MB.

### 🟢 D-14: Timetable teacher
If `teacherId` is omitted, the teacher assigned to that subject in the section is used. Any existing teacher can be set explicitly (e.g. a substitute). The database still blocks a teacher from being in two places at once.

**Your question:** nothing is needed from you. This was only for your information.

### 🟢 D-15: Migrations are incremental from now on
`0000_init` was regenerated while nothing was deployed. Every change since then is a new numbered migration (`0001_core_academics`, …). Never edit an applied migration.

---

## Phase 4: fees and communication

### 🟡 D-16: Money representation
- **Database:** `numeric(12,2)`.
- **API:** plain numbers with 2 decimals (`5400.5`).
- **Arithmetic:** integer paise in `common/money`, so 0.1 + 0.2 issues never happen.
- **Currency:** each school's `tenants.currency` (default INR).

Stripe-style integer minor units in the API would be stricter, but they're awkward for school admin screens. Changing later would be a breaking API change, so decide before launch.

### 🟡 D-17: Installment plans, one per student per year (built after review)
> Product owner: "Installments can be configurable and each student can get any one the configured installments and fee will be scheduled accordingly."

- **Plans** (`/finance/installment-plans`): "Annual" 1×, "Quarterly" 4×, "Monthly" 10×… Each holds ordered installments with a due date and a share. Shares must add up to exactly 100% and due dates must ascend inside the year.
- **Rounding:** every installment but the last is rounded **down** to the paisa; the last takes the remainder. Parts always add up exactly and none is ever negative.
- **Plans belong to an academic year**, not reusable with year-relative dates. Due dates are real dates that schools move every year (holidays, exam weeks), fee structures are per year anyway, and a plan that has invoices is frozen without affecting other years. Alternative: one plan with "month 1, day 10" offsets, reused every year (less typing, less control).
- **Fee structures** list the plans they allow and a default. Amounts on a structure are annual.
- **Assignment** (`/finance/plan-assignments`, also `/bulk` for a section, a class or a list): one plan per student per year; `null` = each structure's default. A plan can only be assigned if some fee structure of the student's class offers it; a structure that doesn't offer the student's plan uses its own default.
- **Billing:** `POST /finance/invoices/generation { feeStructureId, throughDate? }` issues each student's installments due on or before `throughDate` (default: the whole year) under *their* plan. Idempotent per student, structure and installment.
- **Changing a plan** is allowed only while nothing of that year is paid (any invoice with money on it, including applied credit): otherwise **409**. While nothing is paid, the change **cancels the unpaid invoices and re-issues** them under the new plan: the new plan's installments due by the latest cancelled due date (at least its first). A waived late fee on a cancelled invoice is not carried over.
- **Concurrency:** one row per student and year (`student_installment_plans`) is locked by billing, plan changes and concession changes, so they cannot interleave; the student's invoices are locked next, so a payment and a plan change on the same invoice cannot both succeed (tested with a held row lock).

### 🟡 D-18: Concessions: templates, annual fixed amounts, shown on every bill (built after review)
> Product owner: "…each student can get any one the configured [concessions] and fee will be calculated accordingly and this will be mentioned in the fee receipt also."

- **Templates:** `PERCENT` or `FIXED`, a category (`SIBLING`, `STAFF_WARD`, `MERIT`, `SCHOLARSHIP`, `FINANCIAL_AID`, `OTHER`), optionally limited to several fee heads. Type, value and heads are frozen once granted (409); name, category and description can change.
- **FIXED is an amount per year**, split over the matching fee heads in proportion to what is left of them, then over the student's installments by the plan's shares. (It used to come off every line of every invoice.)
- **Several concessions stack**: percentages are taken from the gross and add up (10% + 20% = 30%, not compounded), then fixed amounts; a fee head never goes below zero. Alternative: allow one concession per student per year, or "best of".
- **Invoices** show gross, each concession by name, and net per line, plus a per-invoice summary. The statement lists the year's grants and how much each took off. The **receipt PDF prints the lines and the concessions applied**.
- **Granting or revoking** recalculates the student's invoices of that year **that have nothing paid**. Invoices with any payment are never touched, so a concession granted mid-year only lowers the remaining installments; it is not refunded on paid ones. Alternative: spread the whole annual amount over the remaining installments.

### 🟡 D-19: Late-fee rules with slabs, and waivers (built after review)
> Product owner: "Late fees, also pre defined and auto assigned according to the delay duration."

- **Rules** (`/finance/late-fee-rules`): a grace period, an optional maximum, and slabs by delay that start at day 1 and follow each other without gaps (the last may be open-ended). One rule can be the school's **default**.
- **The delay is counted from the end of the grace period.** A `FIXED` slab's amount *is* the fee (1–7 days 50, 8–30 days 200, 31+ days 500); a `PER_DAY` slab adds its amount for each of its days on top of what was owed when it began (tiers, like tax brackets). Alternative: count slab days from the due date and use grace only as a "free" window.
- **Structures** use their own rule, or the school default, or none (`chargesLateFee: false`). Rules are read when the daily job runs, so a rule edit applies to open invoices from the next run.
- **The daily job** recomputes each open overdue invoice from scratch under its row lock: idempotent, and safe against a payment arriving at the same moment. A late fee never drops below the part of it already paid.
- **Waiver:** `POST /finance/invoices/:id/late-fee-waiver { reason }` (ADMIN, ACCOUNTANT) removes the late fee now and for good; the amount, reason and who are kept. Refused when part of the late fee is already paid (422) or the invoice is paid (409). `DELETE` on the same path reinstates it. Partial waivers are not built.

### 🔴 D-20: Each school brings its own Razorpay keys (built after review); verify with real test keys before go-live
> Product owner: "We will provide BYOK system in which the school will provide their razorpay ids for fee payment and we will use that."

- **Keys:** `PUT /finance/payment-settings { keyId, keySecret, webhookSecret }` (ADMIN only). The secrets are encrypted at rest (AES-256-GCM, `DATA_ENCRYPTION_KEY`), never returned (reads show `****` + last 4) and never written to the audit trail. `DELETE` removes them; `POST …/connection-test` asks Razorpay whether it accepts the keys (in tests the call is stubbed).
- **No keys, no online payments:** order and confirmation endpoints return 422 "Online payments are not set up for this school". Counter payments are unaffected.
- **Webhooks are per school:** `POST /api/v1/public/payments/razorpay/:tenantId/webhook`, verified with that school's webhook secret. The old shared `/public/payments/webhook` is removed: it could not know whose secret to check. The settings response shows the URL to paste into the Razorpay dashboard.
- The gateway takes the credentials on every call; there are no `RAZORPAY_*` environment variables any more. `PAYMENT_PROVIDER=mock` is still a global switch for development and tests (default: `razorpay` in production, `mock` elsewhere); the mock checks signatures with the school's own secrets, so tests exercise the real verification.
- **Still to do before go-live:** run one school through Razorpay **test mode** with real keys (order, checkout, webhook). Refunds through Razorpay are not implemented.

- **Hardening after review:**
  - A webhook is settled only if its amount and currency match the order; otherwise it is logged and left pending.
  - Webhooks are exempt from the global per-IP rate limit, because every school's webhooks arrive from Razorpay's few IPs and are signed.
  - The server refuses to start with `PAYMENT_PROVIDER=mock` in production.
- **Refunds (built, round 3):**
  - **Staff refunds:** `POST /finance/payments/:id/refunds` (ADMIN, ACCOUNTANT), part or all of a payment.
    - Online payments go back through the school's own Razorpay account to the payer's card, UPI or bank.
    - Counter payments record how the money was paid back.
  - **Where the money comes from:** the payment's leftover credit (an overpayment) first, then what it paid on its invoice. The invoice reopens to PARTIALLY_PAID or ISSUED as needed.
  - **Dashboard refunds:**
    - Refunds made in the Razorpay dashboard arrive as `refund.*` webhooks and are recorded automatically. Repeat webhooks change nothing.
    - A **failed** refund is reversed: the money goes back on the invoice, and any surplus becomes credit.
    - A dashboard refund the books cannot cover (its credit was already spent) keeps the rest as `unallocated`. Accountants find these with `GET /finance/refunds?needsReview=true`.
  - **Safety:** refunds of one payment are serialised by a row lock (proved by a test). They appear on statements, as `totals.refunded`, and on the dashboard (`refundedThisYear`, `netCollectedThisYear`). Families are notified in-app and by email.
  - **🟡 For you:**
    - Refund approval: today one ADMIN or ACCOUNTANT can refund on their own. A two-person approval above an amount is easy to add.
    - No refund receipt PDF yet.

### 🟡 D-21: Partial online payments; overpayment becomes student credit (built after review)
> Product owner: "We will allow partial payment online also."

- A payment order takes an optional `amount`, up to the invoice balance (default: all of it). **Minimum 100.00** (in the school's currency), unless the balance itself is smaller, so families aren't charged gateway fees on tiny payments. Alternative: make the minimum a per-school setting.
- **Overpayment** (two payments in flight, or an invoice cancelled while the family was paying) is handled under the invoice's row lock: the invoice gets at most its balance, and the rest is kept as **student credit** (`excessAmount` on the payment, an `OVERPAYMENT` entry in the credit ledger). `amount_paid <= total` is also a database CHECK. Tested by holding the invoice lock while two confirmations arrive.
- **Credit** (`GET /finance/students/:id/credits`) is applied by an accountant to a later invoice (`POST /finance/invoices/:id/credit-application`), or recorded as refunded (`POST /finance/students/:id/credit-refunds`). The balance can never go negative, even with concurrent spenders (a conditional update plus a CHECK). Alternative: apply credit automatically to the next invoice issued.
- Receipts, statements, dashboards and the fee-collections export show the part kept as credit; collections still count money received.

### 🟡 D-22: Which events send which messages
| Event | Channels |
|---|---|
| Student absent | in-app + SMS (parents) |
| Results published | in-app + email |
| Invoice issued | in-app + email |
| Payment received | in-app + email + SMS |
| Fee reminder | in-app + SMS |
| Import finished | in-app (importer) |

There are **no per-user or per-school preferences or opt-outs** yet. SMS costs money, and in India it needs DLT-registered templates, so per-school channel settings should come next. The `http` SMS driver posts generic JSON: put a small adapter in front of the chosen provider (MSG91, Gupshup, Twilio).

### 🟡 D-23: Fee reminder schedule
Reminders go out 3 days before the due date, on the due date, and every 7 days while overdue. The daily run is at 03:30 UTC (09:00 IST), the same time for every school; international schools would need per-time-zone runs.

Duplicate sends are blocked with once-only claims (D-27).

### 🟢 D-24: Push notifications belong to the mobile app
**Your answer:** push is for the mobile app only. When the app exists, it registers device tokens. The notification model already tracks delivery per channel, so `PUSH` becomes one more channel driver plus a device-token table.

### 🟢 D-25: Announcement audiences are resolved at send time
The audience is a role list, optionally narrowed by class or section for students and parents. It becomes a snapshot of recipients when sending. The delivery report counts SENT/FAILED/SKIPPED per channel from the notifications.

### 🟢 D-26: Status codes for "action" endpoints
`POST /…/cancellation`, `/result-publication` and `/publication` change an existing resource, so they return **200** with the updated resource. Only real creation returns 201. CSV import returns **202 Accepted**.

### 🟢 D-27: Exactly-once side effects
The tests caught a race: publish, withdraw and re-publish in quick succession notified everyone twice, because two subscriber jobs checked "already sent?" at the same moment.

Fix: `common/jobs/claims.js` `claimOnce(key)`, an atomic insert on a unique index in MongoDB with a 90-day expiry. Results notices, absence alerts and fee reminders all use it, so retries, duplicate events and parallel workers can't double-send.

---

## Phase 5: reports and analytics

### 🟡 D-28: Reports read other modules' tables directly
`reports/*/repositories` run aggregate SQL straight over academics, finance and users tables. It's a *read model* and a deliberate exception to "other modules only through their `index.js`", because one SQL `GROUP BY` beats loading thousands of rows through services.

**Cost:** renaming a column in another module means updating the report SQL, and the test suite catches it.

At scale, point these queries at a read replica or materialized views.

### 🟡 D-29: Exports are synchronous
Files are built in the request.
- Attendance grids are capped at 62 days.
- Roster, collections and defaulters exports are not capped.

That's fine for a school of a few thousand students. For very large schools, switch to "export job → stored file → signed download link". The storage layer and signed URLs needed for that already exist.

### 🟢 D-30: Two attendance percentages, measured differently
- **Per student** (academics, portal): attended ÷ *working days* in the range. Days nobody marked count against nothing, but they're reported as `unmarked`.
- **Dashboards** (per section, daily trend): attended ÷ *registers taken*. This reflects how attendance actually went where it was recorded.

Both use the same status weights (D-07).

### 🟡 D-31: Report card PDF is a clean default layout
It has the school name, student details, a marks table, totals, grade, result, rank and class average.

**Update (Phase 6):** the school logo (`PUT /administration/settings/logo`) now appears on report cards and fee receipts, with the school's address and contact line in a shared letterhead (`common/export/branding.js`).

Schools usually want their own report-card format. Treat the template as a per-school setting before launch.

### 🟢 D-32: Audit log viewer
`GET /administration/audit-logs` is **ADMIN only**. Filters: user, record, method, date range, and permission, given either exactly or as a prefix such as `finance.`.

---

## Phase 6: additional modules

### 🟡 D-33: How files are stored and who can reach them
- **Bytes:** in the storage driver (local disk or S3).
- **Metadata:** in MongoDB (`stored_files`): owner, category, type, size, uploader.
- **Downloads:** always through 15-minute signed links. Storage keys are never returned.
- **Owners:** files belong to an owner: school, student, staff member, homework, submission, announcement, or general.
  - `/api/v1/files` is for the office (ADMIN, PRINCIPAL, STAFF upload and delete; every staff role reads): student documents, staff documents, general files.
  - Homework files are reached **only** through homework endpoints, so homework access rules apply. The school logo goes only through settings.
- **Deleting a file removes its bytes immediately.**

If you need retention (for example, admission documents kept for N years), switch to soft delete plus a purge job.

### 🟢 D-34: Allowed file types and sizes
| Category | Types | Max |
|---|---|---|
| LOGO | JPEG, PNG, WebP | 2 MB |
| PHOTO | JPEG, PNG, WebP | 5 MB |
| DOCUMENT, ATTACHMENT | PDF, Word, Excel, PowerPoint (old and new), text, CSV, images | 10 MB |

The declared type must also match the file's signature (magic bytes). For example, HTML renamed to `.png` is rejected. Downloads are sent as attachments with `nosniff`. There is no virus scanning; add ClamAV or S3 malware scanning before accepting files from parents at scale.

### 🟡 D-35: Homework rules
- **Who sets it:** a teacher sets homework only for a section and subject they teach (the same scope as marks, D-11). ADMIN and PRINCIPAL can set any homework.
- **Due date:**
  - It cannot be in the past.
  - Late submission is **off by default**; teachers can switch it on per homework. Late work is marked `LATE`.
- **Submitting:**
  - Only the **student** submits. Parents can view but not submit.
  - A submission is text and/or one file.
  - The student can resubmit until it is graded. **Returned** work (`RETURNED`, "redo this") opens it again.
- **Marks** are optional (`maxMarks`). Awarded marks cannot exceed the maximum.
- **Deleting:** homework with submissions cannot be deleted.
- **Notifications:** new homework goes to the section's students and their parents. Graded or returned work goes to the student and their parents. Both are in-app only, to keep SMS costs down.

### 🟢 D-36: The logo uses `PUT`
`PUT /administration/settings/logo` (multipart) replaces the school's one logo. This is the one place the API uses `PUT`. It is correct REST for replacing a singleton, and it is idempotent. `GET /administration/settings` returns a signed `logoUrl`.

### 🔴 D-37: PDFs cannot print non-Latin names yet
Report cards and receipts use PDF's built-in Helvetica. Names in Devanagari, Tamil, Bengali, Arabic and other scripts will print as blanks or boxes.

**Fix:** bundle Noto Sans plus the Noto fonts for the scripts you need (1–5 MB each), and register them in `common/export`.

**Your call:** which regions or languages you are launching in. See OPERATIONS.md › languages.

---

## Phase 7: production readiness

### 🟡 D-38: Archived academic years are read-only, enforced in the database
- **Archive:** `POST /academics/academic-years/:id/archival`, ADMIN only. The year must have ended and must not be current. `DELETE …/archival` restores it.
- **Enforcement:** triggers on every academic table reject writes to an archived year with a 409 ("Academic year 2025-26 is archived and read-only"). That covers sections, enrollments, exams, marks, attendance, timetable, calendar and homework, so jobs, imports and future modules cannot bypass it. A middleware also rejects writes early when the year comes from the `X-Academic-Year-Id` header.
- **Fees are not frozen:** arrears from an old year must stay payable.
- **Order of year-end:** archiving is refused while students are still ACTIVE in that year ("12 students are still active in 2025-26. Promote them or mark them as left first."). Once a year is archived, its enrollments cannot be closed.
- **Operations modules are not frozen:** hostel and transport rows belong to a year but are not frozen, so staff can still vacate or end them.

The alternative was "archive = move rows to cold storage". It isn't needed at school-sized data volumes; indexes keep old years cheap.

### 🟢 D-39: Database rules can return user-facing errors
A trigger can raise SQLSTATE `ZA` + HTTP status (for example `ZA409`). The error handler then returns that status with the trigger's message. No other database message ever reaches a user (D-27).

### 🟢 D-40: What is cached
- **Cached:** the school profile (already) and the current academic year, read on nearly every academic request. Each is cached for 5 minutes and dropped on every change.
- **Not cached:** lists of classes, subjects and so on. They are small indexed queries, and stale lists cause subtle bugs.
- The in-process cache now stores JSON like Redis does, so dev and production behave the same.
- With more than one API instance, Redis is required (D-02); otherwise one instance could serve a stale year for up to 5 minutes.
- **Known narrow race:** a request that read the old year just before a switch can write it back to the cache just after. The current year can then be stale for up to 5 minutes. Switching the current year happens once a year; if that matters, do it outside school hours or flush the key. A versioned key would close the race.

### 🟢 D-41: Metrics without a dependency
`GET /metrics` serves Prometheus metrics: HTTP by route template, jobs, PostgreSQL pool, memory and event loop. It is a 100-line built-in registry instead of `prom-client`.
- It is **off** unless `METRICS_TOKEN` is set.
- Starter alerts are in `ops/prometheus/alerts.yml`.

### 🟡 D-42: Deployment is container-first; registry and host not chosen
- **Built:** a Dockerfile (Node 24, non-root, tini, healthcheck) and `docker-compose.yml` with api, worker, a one-off migrate service, PostgreSQL 18, MongoDB 8 and Redis 8.
- **CI:** GitHub Actions runs format, lint, a migration drift check, the e2e suite on Node 22 and 24, and an image build.
- **Untested here:** Docker is not installed on this machine, so the image and compose file have **not** been built. CI will build the image on the first push.
- **Your call:** the image registry and host (ECS, Cloud Run, Kubernetes, Fly, or a VM), and whether to auto-deploy to staging. Pushing images needs those secrets.

The engines field is now Node ≥ 22, because Node 20 reached end of life in April 2026.

### 🟡 D-43: Schools are onboarded by an operator CLI
`npm run school:create -- --name … --code … --admin-email …` creates the school and its first admin, and prints a one-hour token.

Self-service sign-up and invitations belong to Phase 2 (D-01).

### 🔴 D-44: Backup targets and the first restore drill
- **Proposed targets:**
  - Recovery point objective (RPO, maximum data loss) of 15 minutes or less, using managed point-in-time recovery.
  - Recovery time objective (RTO, maximum downtime) of 2 hours or less.
  - Nightly portable dumps kept for 14 days.
- **Scripts:** `npm run backup` and `npm run restore` (checksummed, with a confirmation prompt).
  - Their flow was tested with stand-in tools only. This machine has no PostgreSQL 18 client or MongoDB tools.
  - **Run one real restore drill on staging before launch** (steps in OPERATIONS.md).
- Confirm the targets match what you promise schools.

### 🔴 D-45: Row-level security is designed, not built
Tenant isolation today is one layer: every repository query filters `tenant_id`, and there is a cross-tenant test.

PostgreSQL row-level security would be a second layer, but it changes the request lifecycle: one transaction and one connection per request. The design and cost (3–5 days) are in OPERATIONS.md.

**Recommendation:** build it right after Phase 2, before the first real school's data goes in.

### 🟡 D-46: API messages stay English; clients localise by error code
Every error has a stable `error.code` and field-level details. Localising server messages is only worth it for notification templates (SMS and email to parents). The plan is in OPERATIONS.md › languages.

---

## Phase 6: operations modules

Built by parallel sub-agents against one brief: the same framework, rules and test harness. I reviewed and merged each one, then tightened two things noted below.

### Library

#### 🔴 D-47: A lost book costs its price plus the late fine
- The charge is the copy's price plus the late fine up to the day it is reported lost. A copy with no price adds 0.
- **Alternatives:** a minimum replacement charge in the library policy, or no late fine on lost books.

#### 🔴 D-48: Fines are settled after the return
Fines can be paid or waived only once the book is back (422 while it is out). Open loans show `fineAccrued` so far. The alternative is part-payment while the book is still out.

#### 🔴 D-49: Librarians can set a due date in the past
- This lets staff record loans after the fact, up to 365 days ahead. It also lets them create overdue loans at will.
- **Alternative:** an explicit `issuedOn`, plus the rule due ≥ issue.

#### 🟡 D-50: Library loan rules
- **Renewals:**
  - An overdue loan cannot be renewed.
  - A renewal must actually extend the due date: the new due date is today + the loan days.
- **Waivers:** a waiver clears the whole remaining fine. There are no partial waivers.
- **Copies per borrower:** one copy of the same book at a time.
- **Unpaid fines:** they do **not** block borrowing. A "block above X" policy setting is easy to add.
- **Reminders:** overdue reminders go to the borrower only, in-app. Parents are not told.
- **Who reads what:**
  - Librarians are ADMIN and STAFF; there is no LIBRARIAN role yet.
  - The principal can see all loans.
  - The catalogue, including copy price and condition notes, is readable by every role, students and parents included.

### Transport

#### 🔴 D-51: Teachers see parents' phone numbers on route rosters
The spec gave TEACHER read access, and rosters list the primary parent's phone. Alternatives: a roster permission for ADMIN and STAFF only, or hide the phone column from teachers.

#### 🔴 D-52: Year-end and leavers do not touch transport seats
- Assignments are per year. Last year's rows don't use this year's seats, but nothing ends them or copies them forward.
- A student who leaves mid-year keeps their seat until staff end it.
- **Proposal:**
  - a subscriber that ends transport and hostel rows when an enrollment closes
  - a "copy to next year" action

#### 🟡 D-53: Transport capacity rules
- A route with no vehicle takes no assignments, because capacity is unknown.
- Pick-up-only and drop-only riders take a full seat.
- Ending an assignment frees the seat at once, even with a future end date.
- Registration numbers are compared without spaces or hyphens.
- Stop fees are stored but **do not create invoices**. Linking them to finance's Transport fee head is a natural next step.

### Hostel

#### 🔴 D-54: One bed per student at a time, across years
- A student must be vacated or transferred before getting another bed, even in the next year. Beds are physical.
- At merge I made this a **unique index**, which closes a race between two years.
- **Alternative:** beds per year, with overlaps allowed during the changeover.

#### 🟡 D-55: Hostel rules
- **Transfers:** a transfer closes the old allocation and creates a new one linked to it (201), which keeps a full residence history.
- **Dates:** no future dates, so beds cannot be pre-booked for next year.
- **Gender:**
  - BOYS takes only MALE, and GIRLS only FEMALE.
  - OTHER is refused by both.
  - A student with no recorded gender is allowed.
- **Rooms:**
  - MAINTENANCE keeps residents but takes no new ones.
  - CLOSED requires an empty room.
  - Occupancy ignores the academic year.
- **Wardens** can be ADMIN, PRINCIPAL, STAFF or TEACHER.

### HR and payroll

#### 🟢 D-56: Bank account and PAN are encrypted at rest (fixed at merge)
- The module stored them in plain text but always returned them masked. At merge I added framework field encryption (`common/crypto`, AES-256-GCM, versioned format), and these fields now use it.
- **🟡 Your action:**
  - set `DATA_ENCRYPTION_KEY` in production (startup fails without it)
  - keep the key with your backups; the data is unreadable without it

#### 🟡 D-57: How loss of pay (LOP) is calculated
- **The charge:** gross pay (basic plus every earning line, including HRA as a percent of basic) ÷ days in the month × LOP days.
  - The alternative is basic plus fixed components only, a one-line change in `payrollMath.util.js`.
- **Absent and half days:** they cost the unworked part, minus any approved paid leave.
- **Leave:** approved unpaid leave costs pay. A LEAVE mark entered by hand with no request costs nothing.
- **Unmarked working days cost nothing.**
  - The alternative is to treat them as absent.

#### 🟡 D-58: Payroll and leave rules
- **Finalized month:**
  - Once a month's payroll is finalized, that month is closed: attendance and leave changes touching it are refused.
  - Finalization does not recompute; recalculate first.
  - Later corrections would be arrears (not built).
- **Salary revisions:**
  - They start on the 1st of a month.
  - No pro-rating for joiners or changes mid-month.
  - A revision cannot be edited; you add a new one.
- **Leave quotas:**
  - Quotas are per calendar year, so a request must stay inside one.
  - There is no unlimited leave type (use a large quota).
  - Days outside any academic year count as calendar days.
- **Net pay** cannot go below 0. A deduction larger than pay is not carried forward.
- **Who decides:**
  - Nobody approves their own leave.
  - Rejecting needs a note.
  - Applicants can cancel while the request is pending; ADMIN can cancel after approval.

### Inventory

#### 🟡 D-59: Inventory rules
- **Discontinued items:** "inactive" from the spec became `discontinued`, because `isActive` means soft-deleted here. Discontinued items stay visible and issuable, take no receipts, and are left out of low-stock.
- **Valuation:** average cost is kept to 2 decimals, so valuation can be a few paise off. The alternative is a running stock value.
- **Movements:**
  - An ISSUE needs a recipient (a user or free text).
  - A RETURN is not linked to an issue and not capped at what was issued.
  - A RECEIPT may have no vendor (donations, opening stock).
- **Low stock:** an item is low when stock ≤ its reorder level. The `inventory.item.lowStock` event fires only when an item crosses that level. It now notifies ADMIN and STAFF in-app, once per movement (added at merge).
- **GSTIN:** checked for format only, when the school's country is IN.
- **Unit:** whole units (PCS, BOX…) take whole quantities, and an item's unit cannot change once it has stock movements.

#### 🟢 D-60: The stock ledger is append-only, enforced in the database
Movements are never edited or deleted; a correction is an ADJUSTMENT movement (ADMIN only). At merge I added a trigger that rejects UPDATE and DELETE on `stock_movements`.

### Cross-cutting

#### 🟢 D-61: Action endpoints are named in two styles
- **Older modules** use nouns: `/result-publication`, `/cancellation`, `/finalization`, `/archival`.
- **Some new ones** use verbs: `/loans/:id/return`, `/allocations/:id/vacate`, `/assignments/:id/end`.
- Both are common REST practice, and all are `POST` returning 200 or 201. I left them as built rather than churn the API.
- If you want one style, it's a mechanical rename. It is breaking, so do it before any client exists.

---

## Fixed during the night (for your information)

A review agent audited tonight's code. Every finding was fixed and covered by a test:
- **Files:**
  - `/files` could list and serve homework, submission and logo files to any staff role. It now serves only student, staff and general files.
  - A teacher could reach another section's submission file through their own homework URL.
- **Submissions:**
  - A rejected upload wiped an earlier submission's text.
  - A resubmission racing with grading could erase the grade. Both paths now lock the row.
  - Students who had left could still submit.
- **Error reporting and metrics:**
  - Sentry would have received database query values (personal data). They are scrubbed now.
  - `/metrics` returned a 500 for some tokens.
- **Archiving:**
  - Archiving is refused while students are still active in the year.
  - Homework attachments of an archived year are frozen.
- **Smaller fixes:** the logo link's content type, deleting replaced logos, and backup pruning that could touch other folders.
- **Repository hygiene:**
  - `.gitignore` had `storage/` and `.env.*`. These silently left `src/common/storage/` and `.env.example` **out of git**, so a fresh clone could not start.
  - Both are fixed, and a fresh clone now passes all tests.
