# Decisions for review

Only **open** items are here: things that need your decision, or that you may want to change. Everything already settled (decided, answered or built) is in [DECISION_LOG.md](DECISION_LOG.md), with its reasoning.

**Legend:** 🔴 needs your decision · 🟡 worth a look (it stays as built unless you say otherwise)

## Start here

| | Item |
|---|---|
| 🟡 | D-63: refunds, now in plain words (six short questions) |
| 🔴 | D-65: library choices (two need you: borrowing blocks, holiday calendar) |
| 🟡 | D-64 hostel; the fee and result choices to confirm (D-17 to D-21, D-09/D-10) |
| 🟡 | D-66 attendance modes and D-67 module owners and operators: built, choices to confirm |
| Later | D-44: restore drill, once there is drill data |

**Before go-live** (checklist; details in OPERATIONS.md):
- **Configuration:** `DATA_ENCRYPTION_KEY`, `REDIS_URL` (you will provide it), `TRUST_PROXY_HOPS`, `METRICS_TOKEN`, `WEB_APP_URL` + SMTP, and the MongoDB app role (`npm run mongo:app-role -- --all --dry-run`, then create it in Atlas).
- **Databases:** `DATABASE_URL` = the Neon **pooled** string to `school_platform`; `POSTGRES_ADMIN_URL` = the Neon **direct** string, used only when creating schools; `MONGO_URI` = the Atlas string to `school_platform`. Check your Neon plan's database limit per branch.
- **Razorpay:** each school's keys and webhooks. The test-mode run is yours (D-20).
- **Hosting:** host and registry (D-42). Try Sentry on staging if you use it.

---

## Needs your decision

### 🔴 D-65: Library: choices made while building it (D-47 to D-50)
Built as a full library system: circulation rules, holds, stock-taking, lost and found, reports. Two choices need you:
- 🔴 **Borrowing blocks are on by default.**
  - A borrower cannot take a book while their unpaid fines are above **100**, or while they have any overdue book.
  - Each school can change both in the library policy, or switch them off.
  - Is that the right default?
- 🔴 **Holidays between academic years.**
  - Fines skip the days the library is closed. Inside an academic year, that means the school calendar (weekly offs, holidays, vacations).
  - **Between two years** (for example a summer gap with no year defined), only the weekly off days are skipped, so a book due before summer collects fines over the break.
  - Is that acceptable, or should the gap count as closed?

The rest stays as built unless you say otherwise:
- 🟡 **Loan terms are fixed at issue.** The loan period, fine per day and renewal limit are copied onto the loan when the book is issued. A later rule change does not alter books already out.
- 🟡 **Which rule applies:** a rule for the borrower's **class** beats one for their **role**, which beats "anyone". Then a rule for a specific item type (reference, magazine) beats "any item".
- 🟡 **Late fines only go up.**
  - A fine shown on a date is never lowered later, even if a holiday is added afterwards. Lowering it is a waiver.
  - A fine never exceeds the book's price (`capFineAtPrice`).
- 🟡 **Lost books:**
  - The charge is the larger of (price + processing fee) and the minimum charge, plus the late fine so far.
  - Money already paid on a lost book stays paid.
  - If the book turns up within **30 days**, the replacement charge is reversed. Anything already paid becomes library credit.
- 🟡 **Holds:**
  - A reader may hold up to **5** titles.
  - A returned copy goes to the first reader in the queue, who has **3 days** to collect it; then it passes to the next.
  - Readers are told when their copy is ready.
- 🟢 **Notifications** go out as general messages with a library tag. Separate notification types (due soon, overdue, hold ready) are an easy follow-up if the app wants its own icons.
- 🟢 **A student who leaves** has their holds cancelled automatically; their loans stay open until returned or written off.

---

## Worth a look

### 🟡 D-66: Three attendance systems: choices to confirm
Built: a school picks **once a day**, **forenoon and afternoon**, or **every period**, for the whole school or per class, starting from a date. How each counts is in API.md › Attendance.
- **Switching modes:** a change starts tomorrow by default. It can start earlier only if no register has been taken in those classes from that date, so old registers keep their meaning.
- **A register not taken:** a session not taken counts as half a day absent, like an untaken day today. For periods, only periods actually taken count as "held".
- **Half day:** cannot be marked in a forenoon or afternoon register (the two sessions already make the halves). In a period register it is worth half that period.
- **Period-wise day:** present when at least 50% of the periods taken were attended. This is one school-wide setting, and it also re-evaluates past days.
- **Period registers follow the timetable:** a period can only be taken if the section has a class then, and the subject comes from the timetable. A one-day substitute is not modelled yet; changing the slot's teacher works.
- **Class teacher away:** only ADMIN or PRINCIPAL can take the daily register. *Option:* a deputy class teacher per section.
- **Last year:** a teacher still sees last year's sections (not its students). *Option:* current year only.
- **Absence alerts:** parents get one alert per missed session; in period mode, one per day at the first missed period.

### 🟡 D-67: Module owners and operators: choices to confirm
Built under `/administration/access`:
- **Owners:** the built-in managers (librarian, transport, hostel, HR, inventory) own their module. ADMIN can also make any staff member the owner of a module.
- **Operators:** an owner creates operator roles by ticking the actions of their module (for example "Issue, return and renew books"), and assigns them to one or more people, optionally between two dates.
- **Changes** take effect on the next request.

To confirm:
- **Owner powers:** an owner gets what the built-in manager can do in that module, plus managing its operators. Anything that is ADMIN-only stays ADMIN-only.
- **Never given to operators (owner-only):**
  - library: fine waivers, library policy;
  - inventory: stock adjustments;
  - HR: approving leave, cancelling anyone's leave, finalising payroll;
  - every module: managing operators.

  Everything else, salary and bank details included, can be ticked into an operator role.
- **The HR manager can now cancel approved leave**, as "admin inside the module". Before, only ADMIN could.
- **Granularity:** actions are as fine as the module's permissions today. For example, "manage seat assignments" covers assigning, changing and ending a seat. Finer ticks mean splitting permissions per module; say where you want them.
- **Who can be an operator:** any active employee, teachers included. Not students, parents or ADMIN.
- **History:** removing someone keeps the record as revoked. An operator role that someone holds cannot be deleted until they are removed.

### 🟡 D-63: Refunds, in plain words
Refunds work as you asked: the accountant requests, the admin approves, a refund receipt is printed, and the books (double-entry ledger) are updated. Six small questions remain. Reply with the numbers you want changed; the rest stays as it is.

1. **Small refunds.** Today every refund an accountant asks for waits for an admin, even ₹50. *Option:* an amount (say ₹500) below which the accountant can refund alone. **As built: always the admin.**
2. **Who checks the admin?** When an admin makes a refund themselves, nobody else approves it. *Option:* a second admin must approve. **As built: the admin alone.**
3. **Paying back extra money.** When a parent pays too much, the extra is kept as credit for the student. Handing that credit back as cash happens at once, without approval. *Option:* the same request-and-approve step as refunds. **My recommendation: yes, add it.**
4. **Gaps in refund numbers.** A refund gets its number (for example RF-0005) when it is requested. If the admin rejects it, that number is never used. *Option:* give the number only on approval, so there are no gaps. **As built: numbered at request.**
5. **Razorpay money reaching the bank.** Razorpay sends online fee payments to the school's bank a few days later, minus its fee. Today the accountant records that deposit in the books by hand. *Option:* fetch it from Razorpay automatically. **My recommendation: by hand now, automatic later.**
6. **Concessions in the books.** A ₹10,000 fee with a ₹1,000 concession is recorded as ₹10,000 income and ₹1,000 concession, not as ₹9,000 income. This is what accountants and Tally expect. **My recommendation: keep it.**

### 🟡 D-64: Hostel, flexible assignments: points to confirm
- **Pre-booking:** a student with an active enrollment in any year can be booked, so next year's room can be booked in March. Leavers' bookings are cancelled automatically.
- **Dates:** `toDate` is the last night. A transfer from day D ends the old bed on D−1. A booking that has not started can be cancelled; a stay that has started must be vacated, and a future move-out date is allowed.
- **Roll-over at year end** continues each resident in the same bed for the new year, as a new linked booking. It skips leavers, beds already taken and residents who no longer fit the hostel's gender rule, with a reason each. It is best-effort, not all-or-nothing.
- **Resources tied to a bed** (locker, cupboard) move and shrink with it. On a transfer, hostel-wide items (mess plan, laundry plan) continue and room items end. A student has at most one mess plan and one laundry plan per day.
- **Fees:** the monthly fee of a resource is stored on the resource only, and nothing is invoiced yet. When hostel fees are invoiced, the fee will be copied onto each assignment so later price changes do not rewrite history.
- **Old allocation data** was dropped by the migration, not converted. That is safe only because no school is live. Tell me if any real data exists.

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
`npm run school:create -- --name … --code … --admin-email …`:
- creates the school's databases and migrates them;
- registers the school;
- invites its first admin with a 7-day set-password link.

Self-service sign-up (a school registering itself) is not built.

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
