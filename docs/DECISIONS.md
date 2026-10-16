# Decisions for review

Only **open** items are here: things that need your decision, or that you may want to change. Everything already settled (decided, answered or built) is in [DECISION_LOG.md](DECISION_LOG.md), with its reasoning.

**Legend:** 🔴 needs your decision · 🟡 worth a look (it stays as built unless you say otherwise)

## Start here

| | Item |
|---|---|
| 🔴 | D-45: build row-level security now, or later? |
| 🟡 | D-11: what teachers can do (you said you will come back to it) |
| 🟡 | The fee and result choices to confirm (D-17 to D-21, D-09/D-10) |
| 🟡 | Library, hostel and finance (refunds, ledger) decisions from this round, added below when those parts are merged |
| Later | D-44: restore drill, once there is drill data |

**Before go-live** (checklist; details in OPERATIONS.md):
- **Configuration:** `DATA_ENCRYPTION_KEY`, `REDIS_URL` (you will provide it), `TRUST_PROXY_HOPS`, `METRICS_TOKEN`, `WEB_APP_URL` + SMTP, and the MongoDB app role (`npm run mongo:app-role`).
- **Razorpay:** each school's keys and webhooks. The test-mode run is yours (D-20).
- **Hosting:** host and registry (D-42). Try Sentry on staging if you use it.

---

## Needs your decision

### 🔴 D-45: Tenant isolation: what exists, and row-level security
**Your question: is RLS, or any multi-tenant isolation, implemented?** Isolation is implemented **in the application, everywhere**. Database-level row-level security (RLS) is **not**.

**What exists today:**
- **Sign-in and tokens:** sign-in is scoped by school code. Every access token carries its school (`tenantId`), and the token is signed.
- **PostgreSQL:** every repository query adds `tenant_id = <token's school>` (`createRepository`, `scoped()`), for reads, writes and soft deletes.
  - Raw SQL (dashboards, exports, analytics) filters `tenant_id` explicitly.
  - Every unique index includes `tenant_id`, or a tenant-scoped parent.
- **MongoDB:** every query (audit, notifications, files, snapshots, imports) filters `tenantId`. File storage keys start with the school id.
- **Webhooks:** each school has its own URL, verified with that school's own secret.
- **Testing:**
  - A cross-tenant test reads another school's records through the API and gets 404.
  - Three security reviews found no cross-tenant leak.

**What RLS would add:** a second, independent layer. Even a bug that forgot the filter could not read another school's rows. The design and cost (3–5 days) are in OPERATIONS.md › row-level security.

**Recommendation:** build it before the first real school's data goes in. **Your call:** whether to do it now.

---

## Worth a look

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

### 🟡 D-09 / D-10: Results: points to confirm
Configurable result policies and frozen, sealed report cards are built (DECISION_LOG.md › D-09, D-10). These choices need your confirmation:
- 🟡 **Grace counts in the total** (`graceCountsInTotal`, default true), and the subject's grade uses the graced marks. Some boards keep grace out of the aggregate: set it to false.
- 🟡 **In assessment schemes, an absence counted as zero is 0% for that exam,** not an automatic fail of the year. The weighted result decides. Excluded absences (exempt, medical when excluded) drop that exam, and the other exams' weights are rescaled. Theory/practical pass rules apply in each exam's own result; the weighted subject is judged on its weighted total.
- 🟡 **Co-scholastic subjects in a scheme show the latest exam's grade.** Grades are not averaged.
- 🟡 **Ranks are hidden on the printed PDF too** when the policy hides them from families, because the card goes home.


### 🟡 D-17 to D-21: Fees: points to confirm
Built as you asked. The details are in DECISION_LOG.md › D-17 to D-21. These choices need your confirmation:
- **Plan changes:** a student's plan can change only while nothing of the year is paid; unpaid invoices are cancelled and re-issued under the new plan. The alternative is to refuse every change once invoices exist.
- **Concessions:**
  - Several concessions **stack**: percentages add up (10% + 20% = 30%), then fixed amounts. The alternative is one per student, or the best one only.
  - One granted mid-year lowers only the **unpaid** installments; paid invoices are never touched.
- **Late fees:** the delay is counted **from the end of the grace period**. The alternative is counting from the due date.
- **Online payments:** the minimum part-payment is a fixed **100.00**. The alternative is a per-school setting.
- **Credit:** credit from overpayments is applied to later bills **by an accountant**. The alternative is applying it automatically to the next invoice.

### 🟡 D-16: Money representation
- **Database:** `numeric(12,2)`.
- **API:** plain numbers with 2 decimals (`5400.5`).
- **Arithmetic:** integer paise in `common/money`, so 0.1 + 0.2 issues never happen.
- **Currency:** each school's `tenants.currency` (default INR).

Stripe-style integer minor units in the API would be stricter, but they're awkward for school admin screens. Changing later would be a breaking API change, so decide before launch.

### 🟡 D-28: Reports read other modules' tables directly
`reports/*/repositories` run aggregate SQL straight over academics, finance and users tables. It's a *read model* and a deliberate exception to "other modules only through their `index.js`", because one SQL `GROUP BY` beats loading thousands of rows through services.

**Cost:** renaming a column in another module means updating the report SQL, and the test suite catches it.

At scale, point these queries at a read replica or materialized views.

### 🟡 D-29: Exports are synchronous
Files are built in the request.
- Attendance grids are capped at 62 days.
- Roster, collections and defaulters exports are not capped.

That's fine for a school of a few thousand students. For very large schools, switch to "export job → stored file → signed download link". The storage layer and signed URLs needed for that already exist.

### 🟡 D-31: Report card PDF is a clean default layout
It has the school name, student details, a marks table, totals, grade, result, rank and class average.

**Update (Phase 6):** the school logo (`PUT /administration/settings/logo`) now appears on report cards and fee receipts, with the school's address and contact line in a shared letterhead (`common/export/branding.js`).

Schools usually want their own report-card format. Treat the template as a per-school setting before launch.

### 🟡 D-33: How files are stored and who can reach them
- **Bytes:** in the storage driver (local disk or S3).
- **Metadata:** in MongoDB (`stored_files`): owner, category, type, size, uploader.
- **Downloads:** always through 15-minute signed links. Storage keys are never returned.
- **Owners:** files belong to an owner: school, student, staff member, homework, submission, announcement, or general.
  - `/api/v1/files` is for the office (ADMIN, PRINCIPAL, STAFF upload and delete; every staff role reads): student documents, staff documents, general files.
  - Homework files are reached **only** through homework endpoints, so homework access rules apply. The school logo goes only through settings.
- **Deleting a file removes its bytes immediately.**

If you need retention (for example, admission documents kept for N years), switch to soft delete plus a purge job.

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

### 🟡 D-38: Archived academic years are read-only, enforced in the database
- **Archive:** `POST /academics/academic-years/:id/archival`, ADMIN only. The year must have ended and must not be current. `DELETE …/archival` restores it.
- **Enforcement:** triggers on every academic table reject writes to an archived year with a 409 ("Academic year 2025-26 is archived and read-only"). That covers sections, enrollments, exams, marks, attendance, timetable, calendar and homework, so jobs, imports and future modules cannot bypass it. A middleware also rejects writes early when the year comes from the `X-Academic-Year-Id` header.
- **Fees are not frozen:** arrears from an old year must stay payable.
- **Order of year-end:** archiving is refused while students are still ACTIVE in that year ("12 students are still active in 2025-26. Promote them or mark them as left first."). Once a year is archived, its enrollments cannot be closed.
- **Operations modules are not frozen:** hostel and transport rows belong to a year but are not frozen, so staff can still vacate or end them.

The alternative was "archive = move rows to cold storage". It isn't needed at school-sized data volumes; indexes keep old years cheap.

### 🟡 D-42: Deployment is container-first; registry and host not chosen
- **Built:** a Dockerfile (Node 24, non-root, tini, healthcheck) and `docker-compose.yml` with api, worker, a one-off migrate service, PostgreSQL 18, MongoDB 8 and Redis 8.
- **CI:** GitHub Actions runs format, lint, a migration drift check, the e2e suite on Node 22 and 24, and an image build.
- **Untested here:** Docker is not installed on this machine, so the image and compose file have **not** been built. CI will build the image on the first push.
- **Your call:** the image registry and host (ECS, Cloud Run, Kubernetes, Fly, or a VM), and whether to auto-deploy to staging. Pushing images needs those secrets.

The engines field is now Node ≥ 22, because Node 20 reached end of life in April 2026.

### 🟡 D-43: Schools are onboarded by an operator CLI
`npm run school:create -- --name … --code … --admin-email …` creates the school and its first admin, and prints a one-hour token.

Self-service sign-up and invitations belong to Phase 2 (D-01).

### 🟡 D-46: API messages stay English; clients localise by error code
Every error has a stable `error.code` and field-level details. Localising server messages is only worth it for notification templates (SMS and email to parents). The plan is in OPERATIONS.md › languages.

---

### 🟡 D-53: Transport capacity rules
- A route with no vehicle takes no assignments, because capacity is unknown.
- Pick-up-only and drop-only riders take a full seat.
- Ending an assignment frees the seat at once, even with a future end date.
- Registration numbers are compared without spaces or hyphens.
- Stop fees are stored but **do not create invoices**. Linking them to finance's Transport fee head is a natural next step.

### 🟡 D-57: How loss of pay (LOP) is calculated
- **The charge:** gross pay (basic plus every earning line, including HRA as a percent of basic) ÷ days in the month × LOP days.
  - The alternative is basic plus fixed components only, a one-line change in `payrollMath.util.js`.
- **Absent and half days:** they cost the unworked part, minus any approved paid leave.
- **Leave:** approved unpaid leave costs pay. A LEAVE mark entered by hand with no request costs nothing.
- **Unmarked working days cost nothing.**
  - The alternative is to treat them as absent.

### 🟡 D-58: Payroll and leave rules
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

### 🟡 D-59: Inventory rules
- **Discontinued items:** "inactive" from the spec became `discontinued`, because `isActive` means soft-deleted here. Discontinued items stay visible and issuable, take no receipts, and are left out of low-stock.
- **Valuation:** average cost is kept to 2 decimals, so valuation can be a few paise off. The alternative is a running stock value.
- **Movements:**
  - An ISSUE needs a recipient (a user or free text).
  - A RETURN is not linked to an issue and not capped at what was issued.
  - A RECEIPT may have no vendor (donations, opening stock).
- **Low stock:** an item is low when stock ≤ its reorder level. The `inventory.item.lowStock` event fires only when an item crosses that level. It now notifies ADMIN and STAFF in-app, once per movement (added at merge).
- **GSTIN:** checked for format only, when the school's country is IN.
- **Unit:** whole units (PCS, BOX…) take whole quantities, and an item's unit cannot change once it has stock movements.

### 🟢 D-61: Action endpoints are named in two styles
- **Older modules** use nouns: `/result-publication`, `/cancellation`, `/finalization`, `/archival`.
- **Some new ones** use verbs: `/loans/:id/return`, `/allocations/:id/vacate`, `/assignments/:id/end`.
- Both are common REST practice, and all are `POST` returning 200 or 201. I left them as built rather than churn the API.
- If you want one style, it's a mechanical rename. It is breaking, so do it before any client exists.

---

### 🟡 D-44: Backups: targets and the first restore drill (later, with drill data)
**Your question: is this scheduled work?** Not inside the application. `npm run backup` is a script that the host's scheduler runs:
- **On a VM:** a cron line, e.g. `0 2 * * * cd /srv/school && npm run backup`.
- **On Kubernetes:** a CronJob.
- **On ECS:** a scheduled task.

With managed databases, their **automatic backups and point-in-time recovery are the primary protection**: they are scheduled by the provider, and you only switch them on. The script is the portable, provider-independent copy.

**Agreed:** run the restore drill once there is drill data. The steps are in OPERATIONS.md › backups. Still to confirm then: the targets (at most 15 minutes of data lost, at most 2 hours to restore).
