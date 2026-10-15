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

---

## Phase 3: core academics

### 🟡 D-07: How attendance percentage is calculated
| Status | Counts as |
|---|---|
| `LATE` | present |
| `HALF_DAY` | half a day |
| `EXCUSED` | left out of the denominator (doesn't count against the student) |
| `ABSENT` | absent |

Working days are the days in the range, minus weekly off days and HOLIDAY/VACATION calendar events. Days with no register taken are reported as `unmarked` and don't count as absent.

Schools differ on these rules (e.g. some count LATE as half). The weights live in one constant, `ATTENDANCE_WEIGHT` (`academics/shared/constants`), and could become a per-school setting.

### 🟡 D-08: Attendance can be edited for any past date
Future dates, holidays and weekly off days are rejected, but there is no "lock after N days" window. Many schools want registers frozen after a day or two, which would be a per-school setting.

### 🟡 D-09: Report-card result rules
- **PASS** only if every paper is passed, meaning marks ≥ the paper's pass marks *and* the grade band is passing.
- **FAIL** if any paper is failed or missed. A missed paper shows grade `AB`.
- **INCOMPLETE** while any paper has no marks yet.

Not modelled: grace marks, compartment/supplementary exams, best-of-N subjects, weighted exams (e.g. term 1 = 40%).

**Ranks** use standard competition ranking (1, 2, 2, 4) by percentage, failed students included. Some boards (e.g. CBSE) discourage publishing ranks: consider a setting to hide them from students and parents.

### 🟢 D-10: Report cards are computed live, not stored
They're calculated from marks on every request, so they are always consistent with the marks. Publishing results only flips visibility.

If you need a frozen copy of what was published, the planned MongoDB `report_snapshots` collection is the place for it.

### 🟡 D-11: What teachers can access (record-level scope)
A teacher can act on a section if they are its **class teacher** or are **assigned a subject** in it. Inside such a section:
- a subject teacher can take whole-day attendance;
- marks are limited to the teacher's own subjects; class teachers can record marks for any subject in their section.

If whole-day attendance should be **class-teacher-only**, it's a one-word change: `teachingScope.assertSection(..., { classTeacherOnly: true })`.

### 🔴 D-12: The portal needs logins
`/api/v1/me/*` works for STUDENT, PARENT and TEACHER tokens, but those people have no way to sign in until Phase 2 (D-01).

A parent sees only children linked to them. A student sees only themselves. Other students return 404, not 403, so their existence isn't confirmed.

### 🟢 D-13: CSV import semantics
- Each row is admitted in its **own** transaction, so good rows succeed even when others fail. The report lists failures by line number.
- An existing parent with the same email is linked rather than duplicated, so siblings share parents.
- Imports are **not** retried automatically, because a retry would re-admit rows that already succeeded.
- Limits: 5,000 rows and 5 MB.

Row errors and failure reasons go through the same error mapping as HTTP responses, so they never contain SQL.

### 🟢 D-14: Timetable teacher
If `teacherId` is omitted, the teacher assigned to that subject in the section is used. Any existing teacher can be set explicitly (e.g. a substitute). The DB still blocks that teacher being in two places at once.

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

### 🟡 D-17: How installments split a fee
Each installment takes `sharePercent` of every fee line, and the shares must add up to 100%. The **last** installment absorbs rounding, so installments always sum exactly to the annual amount.

Alternative not built: explicit amounts per installment per head (more flexible, more data entry).

### 🟡 D-18: Concession rules
- `PERCENT` takes a percentage off each matching line.
- `FIXED` takes **that amount off each matching line of each invoice**, not once per year.
- Several concessions stack, but a line's discount never exceeds the line.
- Concessions are applied when the invoice is issued. Granting one later doesn't change existing invoices: cancel and re-issue unpaid ones.

### 🟡 D-19: Late fees
Each structure has a late-fee rule: `NONE`, `FIXED`, or `PER_DAY` with a grace period and an optional cap.
- A daily job (00:30 UTC) recomputes `lateFee`, and so `total`, on open overdue invoices. It is idempotent.
- Paid invoices never get late fees.

Not built: waiving a late fee for one student (today: cancel and re-issue).

### 🔴 D-20: Online payments must be verified with real Razorpay before go-live
I implemented Razorpay from its documented API without keys:
- order creation;
- checkout signature `HMAC(order_id|payment_id)`;
- webhook signature `HMAC(raw body)`.

Everything is tested end to end against the `mock` gateway, which follows the same contract. To go live:
1. Set `PAYMENT_PROVIDER=razorpay` and `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
2. Point the Razorpay webhook (`payment.captured`) at `POST /api/v1/public/payments/webhook`.
3. Test in Razorpay **test mode**.

Also needs a decision:
- **Refunds** are not implemented.
- **Overpayment** is possible: if a counter payment and an online payment for the same invoice are in flight together, both are recorded (balance goes negative, i.e. a credit). You need a refund/credit policy.

### 🟡 D-21: Online payment covers the full balance only
A payment order is always for the invoice's full outstanding balance. Partial payments are possible only at the counter.

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

### 🟢 D-24: No push notifications yet
FCM/APNs needs device tokens registered by the mobile app (out of scope). The notification model already has per-channel delivery state, so adding `PUSH` is a new channel driver plus a device-token table.

### 🟢 D-25: Announcement audiences are resolved at send time
The audience is a role list, optionally narrowed by class or section for students and parents. It becomes a snapshot of recipients when sending. The delivery report counts SENT/FAILED/SKIPPED per channel from the notifications.

### 🟢 D-26: Status codes for "action" endpoints
`POST /…/cancellation`, `/result-publication` and `/publication` change an existing resource, so they return **200** with the updated resource. Only real creation returns 201. CSV import returns **202 Accepted**.

### 🟢 D-27: Exactly-once side effects
The tests caught a race: publish, withdraw and re-publish in quick succession notified everyone twice, because two subscriber jobs checked "already sent?" at the same moment.

Fix: `common/jobs/claims.js` `claimOnce(key)`, an atomic insert on a unique index in MongoDB with a 90-day expiry. Results notices, absence alerts and fee reminders all use it, so retries, duplicate events and parallel workers can't double-send.
