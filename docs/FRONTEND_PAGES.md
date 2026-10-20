# Frontend pages (v1)

Every page the product needs, built on the existing backend (`/api/v1`). For each page: the data it shows, the actions on it, the APIs behind it, and how the data is laid out.

**Status:** proposal. The backend is done; the frontend has not been planned yet ([ROADMAP.md](ROADMAP.md)). Page names, routes and grouping are suggestions to change freely. The APIs, permission keys and field names are taken from the code. Where a page needs something the backend does not have, the page says **Gap**.

**Related:** [API.md](API.md) (conventions, workflows), [ENDPOINTS.md](ENDPOINTS.md) (every route with its roles), `/api/docs` (request and response schemas).

## Contents

- [How the app is organised](#how-the-app-is-organised)
- [Rules every page follows](#rules-every-page-follows)
- [Page templates](#page-templates)
- [Page index](#page-index)
- Pages: [Shared](#shared-pages-everyone) · [Administration](#administration) · [People](#people) · [Academics](#academics) · [Finance](#finance) · [Communication](#communication) · [Reports](#reports) · [Files](#files) · [Portal](#portal-students-and-parents) · [Library](#library) · [Transport](#transport) · [Hostel](#hostel) · [HR](#hr) · [Inventory](#inventory) · [Shared components](#shared-components)
- [Gaps found](#gaps-found) · [Endpoints not on a page](#endpoints-not-on-a-page)

---

## How the app is organised

**One web app, two kinds of user.** The same app serves both; what someone sees depends on their role and permissions.

| Who | What they see |
|---|---|
| School staff (ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, TEACHER, module owners, operators) | Shared pages, plus the module pages their permissions open |
| Students and parents | Shared pages, plus the Portal. A parent switches between linked children with a dropdown |

**Sidebar.** One group per module. Inside each module, pages are split into two groups:

- **Setup:** how the module works, set up once or a few times a year (fee structures, circulation rules, classes and sections, leave types). Usually ADMIN or the module owner.
- **Operations:** daily work (collect a payment, issue a book, mark attendance, admit a student).

Each page is marked with its **Type:** Setup, Operations, Self-service (the signed-in person's own records) or Shared (everyone).

**Permissions decide what is shown, not what data comes back.** The backend checks every endpoint on its own:

- It either allows the call or returns **403**. It never removes fields from a response based on permission.
- It does limit **rows**: a teacher sees only their own sections, a parent only their linked children, `my-…` endpoints only the caller's own records.

So the frontend:

1. Calls `GET /administration/access/me/access` after sign-in. It returns every permission the user holds, grouped by module, with an `owner` flag per module.
2. Shows a sidebar item only when the user holds that page's **read** permission (listed under **Who** on each page).
3. Shows edit buttons only when the user holds the matching **manage** or action permission (listed in each page's **Actions** table).
4. Never calls an endpoint the user lacks the permission for. It would only get a 403.

Operator roles (named permission sets given to individual users) exist only in the add-on modules: library, transport, hostel, HR and inventory. Users, academics and finance follow the account's role only.

---

## Rules every page follows

| Topic | Rule |
|---|---|
| **Responses** | `{ success, message, data, meta }`. `message` is written for people and can be shown as is, for example in a toast after a write ("Book issued to Asha Rao. Due 2026-11-02") |
| **Errors** | Branch on `error.code`. Show `message`. For `VALIDATION_ERROR`, put each `details[].message` next to its `details[].field` in the form. 409 (conflict) and 422 (business rule) messages are meant for the user: show them as they are |
| **403 / 404** | 403: show "You don't have access to this". 404 on a detail page: show "Not found". Never retry |
| **Lists** | Paginated with `?page=` and `?limit=` (default 20, max 100). Totals are in `meta` (`page`, `limit`, `total`, `totalPages`). Filters are query params; keep them in the page URL so a refresh or a shared link keeps them |
| **Academic year** | Year-scoped endpoints use the current year. The year switcher in the header sends `X-Academic-Year-Id` on every request. Archived years are read-only (writes return 409), so hide write buttons when an archived year is selected |
| **Dates** | `YYYY-MM-DD`, in the school's time zone (from settings) |
| **Money** | JSON numbers with at most 2 decimals, in the school's currency (from settings) |
| **Uploaded files** (documents, homework attachments) | Call the `…/download-url` endpoint, then open the signed link it returns. The link needs no token and works for 15 minutes |
| **Generated files** (report cards, receipts, refund receipts, payslips, exports) | The `…/pdf` and export endpoints return the file itself and need the bearer token, so a plain link or new tab won't work. Fetch the file with the token, then open or save the blob. The file name comes from `Content-Disposition` |
| **Exports** | `?format=xlsx` (default) or `?format=csv` |
| **Destructive actions** | Cancel, revoke, archive, deactivate, delete and finalize all need a confirm dialog that names the record |
| **Sessions** | The access token lasts 15 minutes. On 401, call `POST /auth/refresh` once, store the **new** refresh token, then retry. If the refresh fails, go to sign-in |

---

## Page templates

Most pages use one of these six templates. Build them once.

| Template | Used for | Parts |
|---|---|---|
| **List + drawer** | Masters and simple records (fee heads, vendors, vehicles, leave types) | Filter bar, paginated table, row click opens a side drawer to view and edit, "New" button opens the same drawer empty |
| **List + detail page** | Records with a lot of related data (student, invoice, payroll run, hostel) | Table, then a full page with a header (key facts + action buttons) and tabs |
| **Wizard** | Multi-step creation (admission, import, handover) | Numbered steps, review step, one API call at the end where the backend supports it |
| **Grid editor** | Bulk entry (attendance register, marks entry, timetable, staff attendance) | Rows × columns, keyboard entry, save the whole grid, show per-row errors |
| **Dashboard** | Home, reports | KPI tiles, charts, short lists that link to the full pages |
| **Settings form** | Singletons (school settings, library policy, payment settings) | One form, grouped fields, save button, last-updated info |

---

## Page index

**94 pages:** 42 Operations, 31 Setup, 12 Self-service, 9 Shared. A few pages reuse a shared component and only describe what differs.

Pages are numbered by area. Each row links to the page.

| Area | ID | Page | Type |
|---|---|---|---|
| Shared pages (everyone) | SH-01 | [Sign in](#sh-01--sign-in) | Shared |
|  | SH-02 | [Forgot and reset password](#sh-02--forgot-and-reset-password) | Shared |
|  | SH-03 | [Accept invitation (set first password)](#sh-03--accept-invitation-set-first-password) | Shared |
|  | SH-04 | [App shell and navigation](#sh-04--app-shell-and-navigation) | Shared |
|  | SH-05 | [Home dashboard](#sh-05--home-dashboard) | Shared |
|  | SH-06 | [Notification inbox](#sh-06--notification-inbox) | Self-service |
|  | SH-07 | [My account](#sh-07--my-account) | Self-service |
| Administration | AD-01 | [School settings and logo](#ad-01--school-settings-and-logo) | Setup |
|  | AD-02 | [CSV imports (students)](#ad-02--csv-imports-students) | Setup |
|  | AD-03 | [Audit log](#ad-03--audit-log) | Operations |
|  | AD-04 | [Operator roles](#ad-04--operator-roles) | Setup |
|  | AD-05 | [Access assignments and handovers](#ad-05--access-assignments-and-handovers) | Operations |
|  | AD-06 | [User accounts](#ad-06--user-accounts) | Operations |
| People | PE-01 | [Students list](#pe-01--students-list) | Operations |
|  | PE-02 | [Student profile](#pe-02--student-profile) | Operations |
|  | PE-03 | [Admission wizard](#pe-03--admission-wizard) | Operations |
|  | PE-04 | [Parents](#pe-04--parents) | Operations |
|  | PE-05 | [Teachers](#pe-05--teachers) | Setup |
|  | PE-06 | [Staff](#pe-06--staff) | Setup |
| Academics | AC-01 | [Academic years](#ac-01--academic-years) | Setup |
|  | AC-02 | [Classes and sections](#ac-02--classes-and-sections) | Setup |
|  | AC-03 | [Subjects and section subjects](#ac-03--subjects-and-section-subjects) | Setup |
|  | AC-04 | [Teacher assignments](#ac-04--teacher-assignments) | Setup |
|  | AC-05 | [School calendar](#ac-05--school-calendar) | Setup |
|  | AC-06 | [Grading setup](#ac-06--grading-setup) | Setup |
|  | AC-07 | [Timetable builder](#ac-07--timetable-builder) | Setup |
|  | AC-07b | [Timetable generator](#ac-07b--timetable-generator) | Setup |
|  | AC-08 | [Attendance policy](#ac-08--attendance-policy) | Setup |
|  | AC-08b | [NEP 2020 policy](#ac-08b--nep-2020-policy) | Setup |
|  | AC-09 | [Attendance register](#ac-09--attendance-register) | Operations |
|  | AC-10 | [Cover and substitute](#ac-10--cover-and-substitute) | Operations |
|  | AC-10b | [Substitution planning](#ac-10b--substitution-planning) | Operations |
|  | AC-11 | [Missing registers](#ac-11--missing-registers) | Operations |
|  | AC-12 | [Enrollments and promotion](#ac-12--enrollments-and-promotion) | Operations |
|  | AC-13 | [Exams and papers](#ac-13--exams-and-papers) | Operations |
|  | AC-14 | [Marks entry](#ac-14--marks-entry) | Operations |
|  | AC-15 | [Report cards and result publishing](#ac-15--report-cards-and-result-publishing) | Operations |
|  | AC-16 | [Homework](#ac-16--homework) | Operations |
|  | AC-17 | [Academics activity](#ac-17--academics-activity) | Shared |
|  | AC-20 | [Daily diary](#ac-20--daily-diary) | Operations |
| Finance | FI-01 | [Fee heads](#fi-01--fee-heads) | Setup |
|  | FI-02 | [Installment plans and plan assignments](#fi-02--installment-plans-and-plan-assignments) | Setup |
|  | FI-03 | [Fee structures](#fi-03--fee-structures) | Setup |
|  | FI-04 | [Late-fee rules](#fi-04--late-fee-rules) | Setup |
|  | FI-05 | [Concessions](#fi-05--concessions) | Setup |
|  | FI-06 | [Finance and payment settings](#fi-06--finance-and-payment-settings) | Setup |
|  | FI-07 | [Invoices](#fi-07--invoices) | Operations |
|  | FI-08 | [Collect payment (counter)](#fi-08--collect-payment-counter) | Operations |
|  | FI-09 | [Payments and receipts](#fi-09--payments-and-receipts) | Operations |
|  | FI-10 | [Refunds](#fi-10--refunds) | Operations |
|  | FI-11 | [Student account: statement and credit](#fi-11--student-account-statement-and-credit) | Operations |
|  | FI-12 | [Gateway settlements](#fi-12--gateway-settlements) | Operations |
|  | FI-13 | [General ledger](#fi-13--general-ledger) | Operations |
|  | FI-14 | [Finance activity](#fi-14--finance-activity) | Shared |
| Communication | CO-01 | [Announcements](#co-01--announcements) | Operations |
|  | CO-02 | [Send message](#co-02--send-message) | Operations |
| Reports | RP-01 | [Dashboards](#rp-01--dashboards) | Operations |
|  | RP-02 | [Exports](#rp-02--exports) | Operations |
| Files | FL-01 | [Documents](#fl-01--documents) | Operations |
| Portal (students and parents) | PO-01 | [Child switcher and portal home](#po-01--child-switcher-and-portal-home) | Self-service |
|  | PO-02 | [Timetable](#po-02--timetable) | Self-service |
|  | PO-03 | [Attendance](#po-03--attendance) | Self-service |
|  | PO-04 | [Homework](#po-04--homework) | Self-service |
|  | PO-05 | [Results and report cards](#po-05--results-and-report-cards) | Self-service |
|  | PO-06 | [Fees and online payment](#po-06--fees-and-online-payment) | Self-service |
|  | PO-07 | [Library](#po-07--library) | Self-service |
|  | PO-08 | [Transport and hostel](#po-08--transport-and-hostel) | Self-service |
|  | PO-09 | [Calendar](#po-09--calendar) | Shared |
|  | PO-10 | [Teacher: my sections and my timetable](#po-10--teacher-my-sections-and-my-timetable) | Self-service |
|  | PO-11 | [Staff self-service](#po-11--staff-self-service) | Self-service |
|  | PO-15 | [Daily diary](#po-15--daily-diary) | Self-service |
| Library | LB-01 | [Policy and circulation rules](#lb-01--policy-and-circulation-rules) | Setup |
|  | LB-02 | [Closures](#lb-02--closures) | Setup |
|  | LB-03 | [Catalogue](#lb-03--catalogue) | Setup (staff view), Shared (browse view) |
|  | LB-04 | [Circulation desk](#lb-04--circulation-desk) | Operations |
|  | LB-05 | [Loans and fines](#lb-05--loans-and-fines) | Operations |
|  | LB-06 | [Holds](#lb-06--holds) | Operations |
|  | LB-07 | [Stock checks](#lb-07--stock-checks) | Operations |
|  | LB-08 | [Library reports](#lb-08--library-reports) | Operations |
| Transport | TR-01 | [Vehicles](#tr-01--vehicles) | Setup |
|  | TR-02 | [Routes and stops](#tr-02--routes-and-stops) | Setup |
|  | TR-03 | [Seat assignments](#tr-03--seat-assignments) | Operations |
|  | TR-04 | [Rosters](#tr-04--rosters) | Operations |
| Hostel | HO-01 | [Hostels and rooms](#ho-01--hostels-and-rooms) | Setup |
|  | HO-02 | [Bed allocations](#ho-02--bed-allocations) | Operations |
|  | HO-03 | [Resources](#ho-03--resources) | Setup |
|  | HO-04 | [Resource assignments](#ho-04--resource-assignments) | Operations |
| HR | HR-01 | [Leave types](#hr-01--leave-types) | Setup |
|  | HR-02 | [Salary setup](#hr-02--salary-setup) | Setup |
|  | HR-03 | [Staff attendance](#hr-03--staff-attendance) | Operations |
|  | HR-04 | [Leave requests and balances](#hr-04--leave-requests-and-balances) | Operations |
|  | HR-05 | [Payroll runs](#hr-05--payroll-runs) | Operations |
|  | HR-06 | [Payslip](#hr-06--payslip) | Operations |
| Inventory | IN-01 | [Categories](#in-01--categories) | Setup |
|  | IN-02 | [Vendors](#in-02--vendors) | Setup |
|  | IN-03 | [Items](#in-03--items) | Setup |
|  | IN-04 | [Stock movements](#in-04--stock-movements) | Operations |
|  | IN-05 | [Inventory reports](#in-05--inventory-reports) | Operations |
| Shared components | MA-01 | [Module activity tab](#ma-01--module-activity-tab) | Shared |

---

## Shared pages (everyone)

These pages are used by every role: signing in, setting and resetting a password, the app shell that builds the menu, the home dashboard, the notification inbox and the person's own account. The sign-in and password-link pages are public (no token). Everything else needs a signed-in session. There is no Setup here; it is all Self-service or Shared.

### SH-01 · Sign in
**Route:** `/sign-in` · **Type:** Shared · **Who:** public (no token)

**Data shown**
- Form: `email`, `password` (no school code: the API finds the person's schools from the email)
- Step 2, only when the password is right in several schools: "Choose a school" list, one row per school with its logo (`logoUrl`, may be null: show initials), name, code and the person's role there
- Error banner with the API `message`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Sign in | Public | `POST /auth/login { email, password }` |
| Choose a school (step 2) | Public | `POST /auth/login { email, password, schoolId }` |
| Go to "Forgot password" | Public | (link to SH-02) |
| "First time here?" help | Public | (text: ask the school office for an invitation; link to SH-02 to request a link if the invitation expired) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| POST | `/auth/login` | Body `{ email, password }` → **201** with `accessToken`, `expiresIn`, `refreshToken`, `refreshTokenExpiresAt`, `user { id, firstName, lastName, email, role }`, `school { id, name, code }`; or **200** "Choose a school to continue" with `{ chooseSchool: true, schools: [{ id, name, code, role, logoUrl }] }` and no tokens |
| POST | `/auth/login` | Step 2: body `{ email, password, schoolId }` → 201 as above, signed in to that school |

**Layout**
- Single centred card: email, password (show/hide toggle), "Sign in" button, links "Forgot password?" and "First time here?".
- On 201: store both tokens and `school` (name and code for the header; see SH-04), then go to the page the person was sent from, else Home (SH-05).
- On 200 with `chooseSchool`: replace the form with the school list (keep the email and password in memory only, never on the device); a click signs in with that `schoolId`; "Back" returns to the form and forgets the password. Only schools where the password was right are listed.
- 401: show "The email or password is incorrect" (the same for every kind of mistake; do not hint which field).
- 403: "This account is disabled. Please contact the school office." (no retry).
- 429: show the message ("Too many sign-in attempts. Try again in N minute(s), or reset your password.") and disable the button until `Retry-After` passes; offer the reset link.
- 400 `VALIDATION_ERROR`: mark fields from `error.details[].field`.

**Notes / Gap:**
- Passwords are not checked against the policy at sign-in (old passwords still work); policy hints appear only on SH-02, SH-03 and SH-07.
- `schoolCode` is still accepted instead of `schoolId` (older clients); the app does not need it. A deep link `/sign-in?school=CODE` (e.g. from a reset email) may send it to skip the choice.

---

### SH-02 · Forgot and reset password
**Route:** `/forgot-password` and `/reset-password?token=&school=` (link from email) · **Type:** Shared · **Who:** public (no token)

**Data shown**
- Request form: `email` only
- Reset form: new `password`, confirm password (client-side), live policy checklist: 8–128 characters, at least one letter and one digit
- The school code from the link's `school` parameter, read-only, as context

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Send me a reset link | Public | `POST /auth/password-reset-requests` |
| Set the new password | Public | `POST /auth/password-resets` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| POST | `/auth/password-reset-requests` | `{ email }` → always 202 "If an account matches, we have emailed a link to reset the password." Every school with an active account for the email sends its own email; each names its school, and its link carries that school's code (`school=`) |
| POST | `/auth/password-resets` | `{ token, password }` (token from the link) → 200 "Password changed. Please sign in again." |

**Layout**
- Step 1 (`/forgot-password`): one card with the email field. After submit, replace the form with the API message, the same whether or not the account exists. Note "The link expires in 1 hour" and "If you have accounts in more than one school, each school sends its own email; use the link from the school whose password you want to reset".
- Step 2 (`/reset-password`): password + confirm with the checklist; on 200 show the message and a "Sign in" button that opens SH-01 (`/sign-in?school=<code from the link>`, so this school is chosen without the list).
- 422 "This link is invalid or has expired. Ask for a new one.": show it with a button back to step 1.
- 429 on either step: show the message, disable the button until `Retry-After`.
- 400 on the password: show the field message from `details` ("must contain at least one letter and one digit").
- A reset signs out every device of the account, so do not try to reuse any stored tokens afterwards; clear them.

---

### SH-03 · Accept invitation (set first password)
**Route:** `/set-password?token=&school=` (link from the invitation email) · **Type:** Shared · **Who:** public (no token)

**Data shown**
- School code (from `school`), read-only
- New `password`, confirm password, policy checklist (as SH-02)
- Note: the link works once and lasts 7 days

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Set my password | Public | `POST /auth/password-resets` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| POST | `/auth/password-resets` | `{ token, password }` → 200 "Password set. You can now sign in." (the same endpoint as a reset; the token says which) |

**Layout**
- Same card as SH-02 step 2, with a welcome title ("Set your password for <school code>").
- On 200: show the message and "Sign in" (SH-01 with the school code filled in). The API returns no tokens here, so the person signs in once.
- 422 invalid or expired link: explain "Ask the school office to send a new invitation", and offer "Forgot password" (SH-02), which also works for an account that never had a password.

**Notes / Gap:**
- The email address is not shown: the API takes only the token, and there is no endpoint to read who a link belongs to. **Gap:** no "peek" endpoint to show the account name or email before the password is set.

---

### SH-04 · App shell and navigation
**Route:** every signed-in route (layout) · **Type:** Shared · **Who:** everyone signed in (`portal.profile.read`, `administration.access.readOwn`, `communication.notifications.inbox`)

**Data shown**
- Header: school name and code (from the sign-in response `school`, kept on the device), school logo for staff roles (`logoUrl` from `GET /administration/settings`), the person's name and role (`account.firstName`, `account.lastName`, `role` from `GET /me`), unread notifications badge (`unread`)
- Academic-year switcher for employees: `yearName`, current year marked (`isCurrent`), archived years marked (`archivedAt`)
- Sidebar: one group per module the person can reach, one item per resource, built from `GET /administration/access/me/access` → `modules[] { module, label, owner, resources[] { resource, label, permissions[] { key, action, label, sources[] } } }`
- For STUDENT and PARENT: a child switcher (`GET /me/students`) used by the portal pages

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Load my profile and role | `portal.profile.read` (everyone) | `GET /me` |
| Load my access (menu, buttons) | `administration.access.readOwn` (everyone) | `GET /administration/access/me/access` |
| Keep the session alive | Public (refresh token) | `POST /auth/refresh` |
| Switch academic year | Employees (`academics.academicYears.read`) | `GET /academics/academic-years` + header `X-Academic-Year-Id` |
| Sign out | `auth.sessions.manageOwn` (everyone) | `POST /auth/logout` |
| Open inbox | `communication.notifications.inbox` | `GET /me/notifications/unread-count` (badge), SH-06 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me` | `{ role, account, profile }`: name, email, role for the header and SH-07; `profile` is the role profile (student, parent, teacher or staff member) or null |
| GET | `/administration/access/me/access?module=` | Every permission the person holds now, with its source (`ROLE`, `OPERATOR`, `OWNER`); `assignments` (live and upcoming); `asOf` |
| POST | `/auth/refresh` | `{ refreshToken }` → new `accessToken` and a **new** `refreshToken` |
| POST | `/auth/logout` | End this device's session |
| GET | `/academics/academic-years` | Years for the switcher |
| GET | `/administration/settings` | `name`, `logoUrl` (staff roles only; see Gap) |
| GET | `/me/notifications/unread-count` | Badge (`unread`) |
| GET | `/me/students` | Child switcher (STUDENT, PARENT) |

**Layout**
- **Boot order** after sign-in or reload: `GET /me` and `GET /administration/access/me/access` in parallel; show a full-page loader until both return. Cache the access result in memory for the session.
- **Menu rules:** a resource item appears when the person holds any key of that resource (normally `<module>.<resource>.read`). Inside pages, `read` shows the page and `manage`/`create`/`update`/action keys show the buttons; check exact keys from the access result, never the role name. A module group with `owner: true` also shows its "Access" (AD-04/AD-05, filtered to the module) and "Activity" items. Self-service keys (`portal.*`, `library.loans.readOwn`, `hr.*` "own" keys, `transport.myTransport.*`, `hostel.myHostel.*`) go in a "My" group at the top.
- **Suggested groups:** Home, My (portal and self-service), People (users), Academics, Finance, Communication, Reports, Files, Library, Transport, Hostel, HR, Inventory, Administration. Hide empty groups.
- **Access changes apply on the next request.** Re-fetch `me/access` when the window regains focus (at most every few minutes) and after any 403, then redraw the menu.
- **Token refresh rotation:** the access token lasts `expiresIn` seconds (15 min). Refresh shortly before expiry, or on a 401 from any call, then retry that call once. Only one refresh may run at a time across all tabs (single-flight with a cross-tab lock, e.g. BroadcastChannel or a storage lock); store the new refresh token at once and drop the old one.
  - 401 "This refresh token was just replaced. Use the newest one.": another tab won the race; read the newest token from shared storage and retry.
  - 401 "This sign-in was ended for your security…" or "Your session has ended…": clear tokens and go to SH-01 with that message.
  - Also go to SH-01 when any call returns 401 after a successful refresh (signed out remotely, password changed, account deactivated).
- **Academic year:** shown to employees only. Default is the school's current year (`isCurrent`). Picking another year stores its id per device and sends `X-Academic-Year-Id: <id>` on every request; reset to current on sign-out. An archived year shows a yellow bar "2025-26 is archived and read-only" and hides write buttons on year-scoped pages; if a write still returns 409, show the message. STUDENT and PARENT do not get the switcher (their portal endpoints take their own `academicYearId` query where offered).
- **Error handling (global):**
  - 403: keep the shell, show an inline "You do not have access to this" panel with the API `message` (it can say why, e.g. "Only an administrator can …"); re-fetch access.
  - 404: a not-found page ("This record does not exist or is not visible to you"); the API also uses 404 for records outside a teacher's sections or another family's child.
  - 409 and 422: show `message` as a toast or inline error on the form; never retry automatically.
  - 400 `VALIDATION_ERROR`: map `details[].field` to form fields.
  - 429: toast with the message; back off until `Retry-After`.
  - 500: "Something went wrong" with `error.requestId` and a copy button.
- **Sign out** (avatar menu): `POST /auth/logout`, clear tokens, go to SH-01.

**Notes / Gap:**
- **Gap:** `GET /administration/settings` is limited to staff roles, so teachers, students and parents cannot get the school logo (or settings changes after sign-in). The header falls back to the `school.name` from the sign-in response.
- **Gap:** the refresh response returns `user` but not `school`; keep `school` from sign-in.

---

### SH-05 · Home dashboard
**Route:** `/` · **Type:** Shared · **Who:** everyone signed in; each widget appears only when its key is in `me/access`

**Data shown**
- A greeting with the person's name and today's date (school time zone `today` from the overview, else the device date)
- Role-based widgets (see Layout); each one is a card linking to its full page (Reports, Academics, Finance, portal pages are documented elsewhere)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Open the full page behind a widget | the widget's key | (navigation) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/reports/dashboards/overview` | ADMIN, PRINCIPAL, ACCOUNTANT (`reports.dashboards.overview`): `headcounts`, `attendanceToday`, `fees { netCollectedThisYear, collectionRate, … }`, `exams.papersInNext14Days`, `academicYear`, `currency` |
| GET | `/reports/dashboards/attendance?from=&to=&threshold=&minDays=` | ADMIN, PRINCIPAL (`reports.dashboards.attendance`): low-attendance list widget |
| GET | `/reports/dashboards/fees?from=&to=&defaulterLimit=` | ADMIN, PRINCIPAL, ACCOUNTANT (`reports.dashboards.fees`): collections and top defaulters |
| GET | `/academics/attendance/missing-registers?from=&to=` | ADMIN, PRINCIPAL, TEACHER (`academics.attendance.readMissingRegisters`): registers not taken |
| GET | `/academics/attendance/cover` | ADMIN, PRINCIPAL, TEACHER (`academics.attendance.record`): sections to cover today (period-wise days) |
| GET | `/academics/attendance/low-attendance` | TEACHER (`academics.attendance.readLowAttendance`): red highlight "N students are below 75% attendance", shown only when N > 0. It opens a dialog by section (role badge, roll, name, percentage bar, "N school days in a row to reach 75%"); a student opens the AC-09 student drawer (D-85) |
| GET | `/me/attendance-alerts` | PARENT, STUDENT (`portal.learning.students`): amber warning box, one line per child below the threshold, each linking to PO-03 attendance; shown only when someone is below (D-85) |
| GET | `/finance/refunds?status=REQUESTED` | ADMIN (`finance.payments.approveRefund` to act; `finance.payments.read` to list): refunds waiting for approval |
| GET | `/administration/imports?status=PROCESSING` | ADMIN, STAFF (`administration.imports.read`): imports running |
| GET | `/hr/leave-requests?status=PENDING` | ADMIN, PRINCIPAL, HR_MANAGER (`hr.leaveRequests.read`; deciding is `hr.leaveRequests.decide`): leave to decide |
| GET | `/library/reports/overdue` | ADMIN, PRINCIPAL, LIBRARIAN (`library.reports.read`): overdue count |
| GET | `/inventory/reports/low-stock` | ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER (`inventory.reports.read`): low-stock items |
| GET | `/me/teaching/timetable` | TEACHER (`portal.learning.teaching`): today's classes |
| GET | `/me/teaching/sections` | TEACHER: my sections |
| GET | `/hr/me/leave-balances` | Employees (`hr.leaveBalances.readOwn`): leave left |
| GET | `/me/students` | STUDENT, PARENT (`portal.learning.students`): child cards |
| GET | `/me/students/:studentId/timetable` | STUDENT, PARENT: today's timetable |
| GET | `/me/students/:studentId/attendance?from=&to=` | STUDENT, PARENT: attendance percentage |
| GET | `/me/students/:studentId/fees` | STUDENT, PARENT (`portal.fees.read`): amount due, next due date |
| GET | `/me/students/:studentId/homework` | STUDENT, PARENT (`portal.homework.read`): homework due |
| GET | `/me/calendar?from=&to=&eventType=` | Everyone (`portal.learning.calendar`): upcoming holidays and events |
| GET | `/library/my-loans` | Everyone (`library.loans.readOwn`): books out, due dates |
| GET | `/transport/my-transport` | STUDENT, PARENT (`transport.myTransport.read`): route and stop |
| GET | `/hostel/my-hostel` | STUDENT, PARENT (`hostel.myHostel.read`): room and bed |
| GET | `/me/notifications?unread=true&limit=5` | Everyone: latest unread notifications |

**Layout**
- Grid of cards, 3 columns on desktop, 1 on phone. Order by role:
  - **ADMIN, PRINCIPAL:** KPI row from the overview (students, teachers, attendance today %, fee collection rate %, net collected this year), then cards: low attendance (top 5), missing registers today (count + "Open"), refunds waiting (ADMIN), leave to decide, upcoming exam papers (14 days), imports running (ADMIN).
  - **ACCOUNTANT:** fee KPIs from the overview and fees dashboard (billed, collected, outstanding, collection rate), top defaulters, my refund requests.
  - **STAFF:** imports running, quick links (Admit a student PE-03, Import students AD-02, Students PE-01).
  - **TEACHER:** today's classes (from `me/teaching/timetable`, each opens the register), cover today, missing registers I answer for, my sections.
  - **Module owners (LIBRARIAN, INVENTORY_MANAGER, HR_MANAGER, HOSTEL_MANAGER, TRANSPORT_MANAGER):** their module's headline card (overdue loans, low stock, pending leave, link to hostel occupancy or transport vehicles) plus quick links.
  - **Every employee:** my leave balance, my library loans, calendar (next 14 days).
  - **STUDENT, PARENT:** one card per child (parent) with today's timetable, attendance %, fees due, homework due; then transport, hostel, library loans, calendar.
  - **Everyone:** latest 5 unread notifications.
- Each card loads on its own (skeleton, then data); a failed card shows a small retry and does not block the page. A 403 on a card hides it.
- Empty states: "No missing registers today", "No fees due", "Nothing due this week".

**Notes / Gap:**
- **Gap:** no per-role summary endpoint for teachers, staff or families; the home page makes several calls. Acceptable, but consider `GET /me/home` later.

---

### SH-06 · Notification inbox
**Route:** `/me/notifications` · **Type:** Self-service · **Who:** everyone (`communication.notifications.inbox`)

**Data shown**
- Per notification: `title`, `body`, `type`, `createdAt`, read state (`readAt`), `data` (links such as `studentId`, `invoiceId`, `examId`, `announcementId`)
- Unread count (`unread`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Mark one read or unread | `communication.notifications.inbox` | `PATCH /me/notifications/:notificationId` `{ read: true|false }` |
| Mark all read | `communication.notifications.inbox` | `POST /me/notifications/read-all` |
| Open the linked record | the target page's key | (navigation from `type` + `data`) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/notifications?unread=&type=&page=&limit=` | The list, newest first (paginated) |
| GET | `/me/notifications/unread-count` | Badge in the shell and the "Unread" tab count |
| PATCH | `/me/notifications/:notificationId` | Read / unread toggle |
| POST | `/me/notifications/read-all` | Mark every notification read |

**Layout**
- Tabs "All" and "Unread (n)" → `unread=true`. A type filter dropdown → `type` (`ANNOUNCEMENT`, `MESSAGE`, `ATTENDANCE_ABSENT`, `ATTENDANCE_MISSED`, `RESULTS_PUBLISHED`, `INVOICE_ISSUED`, `PAYMENT_RECEIVED`, `REFUND_PROCESSED`, `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `FEE_REMINDER`, `IMPORT_COMPLETED`), showing only types relevant to the role.
- List rows: unread dot, icon by type, title (bold if unread), first line of body, relative time. Clicking a row marks it read and opens the target: e.g. `INVOICE_ISSUED` → the child's fees page, `RESULTS_PUBLISHED` → report cards, `REFUND_REQUESTED` → the refund (ADMIN), `IMPORT_COMPLETED` → the import (AD-02), `ATTENDANCE_MISSED` → missing registers. Types without a target open a detail drawer with the full body.
- "Mark all read" button in the header (no confirmation). Row menu: "Mark as unread".
- The shell badge also opens a dropdown with the latest 5 and "See all".
- Empty state: "You're all caught up".
- Poll `unread-count` every 60 s while the app is visible (there is no push channel).

---

### SH-07 · My account
**Route:** `/me/account` · **Type:** Self-service · **Who:** everyone (`portal.profile.read`, `auth.credentials.changeOwn`, `auth.sessions.manageOwn`)

**Data shown**
- Profile (`GET /me`): `account.firstName`, `middleName`, `lastName`, `email`, `phone`, `gender`, `dob`, `address`, `role`, `lastLoginAt`; `profile` by role: student (`studentCode`, `admissionNumber`), parent (`parentCode`, `occupation`), teacher (`employeeCode`, `qualification`, `joiningDate`), staff (`employeeCode`, `designation`, `department`)
- Signed-in devices: `userAgent` (shown as browser + OS), `ipAddress`, `createdAt`, `lastUsedAt`, `expiresAt`, `current`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Change password | `auth.credentials.changeOwn` (everyone) | `PATCH /auth/password` |
| Sign out another device | `auth.sessions.manageOwn` (everyone) | `DELETE /auth/sessions/:sessionId` |
| Sign out this device | `auth.sessions.manageOwn` | `POST /auth/logout` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me` | Profile panel |
| PATCH | `/auth/password` | `{ currentPassword, newPassword }` → 200 "Password changed; N other device(s) signed out" |
| GET | `/auth/sessions` | Devices list |
| DELETE | `/auth/sessions/:sessionId` | Sign out one device |
| POST | `/auth/logout` | Sign out here |

**Layout**
- Three sections on one page (or tabs on phone): **Profile** (read-only card), **Password**, **Devices**.
- Profile is read-only with the note "To change your details, contact the school office." (see Gap).
- Password form: current, new, confirm, with the policy checklist. On success show the message (other devices were signed out) and refresh the devices list. 422 "The current password is incorrect" / "The new password must be different from the current one" on the matching field; 429 after repeated wrong current passwords.
- Devices table: device, IP, signed in, last active, "This device" badge on `current`. Row button "Sign out" (confirm "Sign out this device?"); the current row's button is "Sign out here" and calls logout. 404 on a device already gone: refresh the list.

**Notes / Gap:**
- **Gap:** there is no self-service profile edit (phone, address); `PATCH /users/:userId` is ADMIN only.
- **Gap:** there is no "sign out all other devices" endpoint; changing the password does it, or the person signs out each row.

---

## Administration

Administration is where the school is set up and watched over: the school profile and logo, CSV imports of students, the central audit log, and access control for the add-on modules (operator roles, operator and owner assignments, handovers), plus user accounts. Settings, roles and imports are Setup work done by ADMIN (imports also by STAFF); the audit log, assignments, handovers and accounts are Operations. Module owners (LIBRARIAN, TRANSPORT_MANAGER, HOSTEL_MANAGER, HR_MANAGER, INVENTORY_MANAGER, or a staff member made owner) reach AD-04 and AD-05 for their own modules only.

### AD-01 · School settings and logo
**Route:** `/administration/settings` · **Type:** Setup · **Who:** read: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, module owners (`administration.settings.read`); edit: ADMIN (`administration.settings.update`)

**Data shown**
- School profile: `name`, `code` (read-only, used at sign-in), `address`, `contactEmail`, `contactPhone`, `description`
- Regional: `timezone` (IANA), `currency` (ISO 4217), `country` (ISO 3166 alpha-2)
- Logo: `logoUrl` (signed link, 1 hour), `updatedAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Edit profile and regional settings | `administration.settings.update` (ADMIN) | `PATCH /administration/settings` |
| Upload or replace the logo | `administration.settings.update` (ADMIN) | `PUT /administration/settings/logo` (multipart `file`) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/administration/settings` | Page data |
| PATCH | `/administration/settings` | Save changed fields only (at least one) |
| PUT | `/administration/settings/logo` | Replace the logo (PNG, JPEG or WebP, up to 2 MB) |

**Layout**
- Form in two cards: "School" and "Region". Read-only for non-ADMIN (no Save button, fields disabled).
- Time zone: searchable select of IANA zones; currency and country: selects. Warn under time zone: "Changes what 'today' means for attendance, fees and due dates."
- Logo card: preview from `logoUrl` (re-fetch settings when the link has expired), "Upload new logo" (file picker, client-side type and 2 MB check), note "Shown on report cards and fee receipts". 400 on wrong type or bad file signature: show the message.
- Validation errors from `details` on the fields (e.g. "must be an IANA time zone such as Asia/Kolkata").

**Notes / Gap:**
- **Gap:** no endpoint to remove the logo (only replace).

---

### AD-02 · CSV imports (students)
**Route:** `/administration/imports` (list), `/administration/imports/:importId` (mapping, progress, result) · **Type:** Setup · **Who:** ADMIN, STAFF (`administration.imports.read`, `administration.imports.create`)

**Data shown**
- List: `fileName`, `type` (`STUDENTS`), `status` (`MAPPING`, `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`), `totalRows`, `processedRows`, `succeeded`, `failed`, `createdAt`, `startedAt`, `finishedAt`
- Mapping (status `MAPPING`): `fields[] { field, label, required, column }`, `columns[] { header, mapped, samples[] }`, `missingRequired[]`, `preview[] { row, ok, message }` (first 20 rows), `options.academicYearId`. There is no admission-number field: every imported student gets a generated one (`ADM26-0001`), so a sheet's "Admission No" column stays unmapped and is listed under "Ignored columns". Build the field list from `fields[]`, never from a fixed list
- Progress and result: `processedRows` / `totalRows`, `succeeded`, `failed`, `rowErrors[] { row, message }` (up to 1000), `failureReason`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Download the CSV template | `administration.imports.create` | `GET /administration/imports/students/template` |
| Upload a file | `administration.imports.create` | `POST /administration/imports/students?academicYearId=` (multipart `file`, optional `mapping` JSON) |
| Change the column for a field (or unmap) | `administration.imports.create` | `PATCH /administration/imports/:importId` `{ mapping: { field: "Column" | null } }` (a field not in `fields[]`, e.g. `admissionNumber`, is refused with 400) |
| Start the import | `administration.imports.create` | `POST /administration/imports/:importId/start` |
| Cancel (before start) | `administration.imports.create` | `DELETE /administration/imports/:importId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/administration/imports?status=&page=&limit=` | List (paginated) |
| GET | `/administration/imports/students/template` | CSV template download |
| POST | `/administration/imports/students?academicYearId=` | Upload → 201, status `MAPPING`, with the mapping view |
| GET | `/administration/imports/:importId` | Mapping view (while `MAPPING`), else progress and row errors |
| PATCH | `/administration/imports/:importId` | Correct the mapping; returns the refreshed view and preview |
| POST | `/administration/imports/:importId/start` | Queue the import → 202 |
| DELETE | `/administration/imports/:importId` | Cancel a `MAPPING` import |
| GET | `/academics/academic-years` | Year picker on upload (default: current year) |

**Layout**
- **List page:** header buttons "Download template" and "Import students". Table columns: file, status badge, rows (succeeded / failed / total), started by date, finished. Filter: status → `status`. Row click opens the import.
- **Upload dialog:** year select (default current; sent as `academicYearId`), file drop zone (CSV, up to 5 MB, up to 5000 rows). On 201 go to the import page. 422 "No academic year to admit students into…": link to Academics years setup.
- **Import page, step "Match columns" (`MAPPING`):** two-column grid. Left: each field with label and a "required" tag; right: a select of the sheet's columns (with up to 3 sample values shown under the select) or "Not in file". Changing a select calls PATCH and redraws the preview. Columns not used are listed below as "Ignored columns". A banner lists `missingRequired`.
- **Dry-run preview:** table of the first 20 rows: row number, OK tick or the `message` (e.g. "No section Class 1-A in the academic year"). Note: "This checks the first 20 rows only. Rows with problems are skipped during the import and listed afterwards."
- Buttons: "Start import" (disabled while `missingRequired` is not empty; 422 lists the fields) and "Cancel import" (confirm, then back to list).
- **Step "Importing" (`QUEUED`/`PROCESSING`):** progress bar `processedRows / totalRows`, counts, "You can leave this page; we will notify you" (the importer gets an `IMPORT_COMPLETED` notification). Poll `GET /administration/imports/:importId` every 3 s while queued or processing.
- **Step "Done" (`COMPLETED`/`FAILED`):** summary cards (imported, failed), `failureReason` for FAILED, row errors table (row, message) with client-side CSV download of the errors, and "Open students" (PE-01).
- 409 "This import has already been started or cancelled" / "…its mapping can no longer change": reload the page.
- Matching rules worth a help tooltip: a parent email that already belongs to a parent links that parent (sibling); an email of a non-parent account fails that row.

---

### AD-03 · Audit log
**Route:** `/administration/audit-logs` (list), entry in a side drawer · **Type:** Operations · **Who:** ADMIN (`administration.auditLogs.read`)

**Data shown**
- Per entry: `createdAt`, `module`, `actor { name, role }`, `action` (catalogue label), `permission`, `summary`, `entityId`, `method`, `statusCode`
- Entry detail: also `userId`, `role`, `path`, `payload` (secrets removed, long lists summarised), `ipAddress`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Filter and search | `administration.auditLogs.read` | `GET /administration/audit-logs?…` |
| Open an entry | `administration.auditLogs.read` | `GET /administration/audit-logs/:auditLogId` |
| See a record's history | `administration.auditLogs.read` | `GET /administration/audit-logs?entityId=` |
| See a person's actions | `administration.auditLogs.read` | `GET /administration/audit-logs?userId=` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/administration/audit-logs?module=&userId=&permission=&entityId=&method=&from=&to=&search=&page=&limit=` | Table rows, newest first (paginated) |
| GET | `/administration/audit-logs/:auditLogId` | Entry drawer |
| GET | `/administration/activity?…` | The Administration module's own activity tab (same filters, module fixed) |
| GET | `/administration/activity/:auditLogId` | One entry in that tab |

**Layout**
- Uses the shared **activity log component** (documented with the module activity tabs). This page is that component with the extra `module` filter and no module lock.
- Filters bar: module (select: `auth`, `users`, `academics`, `administration`, `finance`, `communication`, `reports`, `files`, `library`, `transport`, `hostel`, `hr`, `inventory`) → `module`; person (user search) → `userId`; permission (text, exact key or prefix ending in a dot such as `finance.`; offer the catalogue as suggestions) → `permission`; method (POST, PUT, PATCH, DELETE) → `method`; date range → `from`, `to` (inclusive, UTC days); search box → `search` (words in the summary); record id → `entityId`.
- Table columns: time, who (name + role badge), module, action label, summary, method badge.
- Row click opens a right drawer with all fields and `payload` as a formatted JSON viewer; buttons "History of this record" (sets `entityId`) and "More by this person" (sets `userId`).
- Read-only: there is nothing to edit or delete.
- Sign-in events (`auth.login`, `auth.login.failed`) appear only here, under module `auth`.
- **Module activity tabs:** every module also has `GET /<module>/activity` and `GET /<module>/activity/:auditLogId` (ADMIN and the module's owners), shown as an "Activity" tab inside the module and built from the same component with `module` locked. The Administration module's tab (`/administration/activity`) sits on this page as a second tab "Administration activity"; the Users tab is on AD-06.

**Notes / Gap:**
- **Gap:** no export of audit log results (CSV/XLSX).

---

### AD-04 · Operator roles
**Route:** `/administration/access/operator-roles` (list), `/administration/access/operator-roles/new`, `/administration/access/operator-roles/:operatorRoleId` · **Type:** Setup · **Who:** ADMIN (all add-on modules) and module owners (their modules): `administration.access.read`, `administration.access.manage` and `<module>.access.manage` (e.g. `library.access.manage`)

**Data shown**
- List: `name`, `module` / `moduleLabel`, `description`, number of permissions, `holders` (live or upcoming assignments), `updatedAt`
- Role detail: `name`, `description`, `module`, `permissionDetails[] { key, label, available }`, `holders`
- Editor: the module's grantable permissions from the catalogue: `modules[].resources[] { resource, label, permissions[] { key, action, label, grantable } }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a role | `administration.access.manage` + `<module>.access.manage` | `POST /administration/access/operator-roles` |
| Edit name, description, permissions | same | `PATCH /administration/access/operator-roles/:operatorRoleId` |
| Delete a role | same | `DELETE /administration/access/operator-roles/:operatorRoleId` |
| See who holds it | `administration.access.read` | link to AD-05 with `operatorRoleId` |
| Assign it to someone | `administration.access.manage` | AD-05 "Add operator" prefilled |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/administration/access/operator-roles?module=&search=&page=&limit=` | List; only modules the person administers |
| GET | `/administration/access/operator-roles/:operatorRoleId` | Detail and editor load |
| GET | `/administration/access/permissions?module=&grantable=true` | Checkbox tree for the editor |
| POST | `/administration/access/operator-roles` | `{ module, name, description?, permissions[] }` (1–100 keys) |
| PATCH | `/administration/access/operator-roles/:operatorRoleId` | Any of `name`, `description`, `permissions` (module never changes) |
| DELETE | `/administration/access/operator-roles/:operatorRoleId` | Remove a role nobody holds |

**Layout**
- List: module tabs or a module filter (`library`, `transport`, `hostel`, `hr`, `inventory`, only those the person owns) → `module`; search by name → `search`. Columns: name, module, permissions (count), holders, updated. "New role" button when the person holds `manage`.
- Editor (full page): module select (create only; locked after), name, description, then the permission tree grouped by resource (resource label as a heading with a "select all" box, one checkbox per permission with its `label`, key in small grey text). Build it from `GET /administration/access/permissions?module=<module>&grantable=true` so owner-only and self-service keys never appear.
- Detail view: description, list of permissions; a permission with `available: false` is shown struck through with "No longer grants anything" (removed from the catalogue or made owner-only) and is dropped on next save. Holders count links to AD-05.
- Changes apply on every holder's next request: say so under the Save button.
- Delete: confirm dialog. 409 "<name> is held by N user(s)… revoke those assignments before removing it": show it with a link to the holders.
- 409 duplicate name in the module; 422 "An operator role cannot include: …" listing refused keys.
- Read-only (no buttons) for anyone with `read` only.

---

### AD-05 · Access assignments and handovers
**Route:** `/administration/access/assignments` (list + drawer), `/administration/access/handovers/new` (wizard and result) · **Type:** Operations · **Who:** ADMIN and module owners for their modules: `administration.access.read`, `administration.access.manage`, `administration.access.handOver`; owner assignments and `includeOwnership`: ADMIN only (`administration.access.manageOwners`)

**Data shown**
- Assignment row: `user { firstName, lastName, email, role, status }`, `kind` (`OPERATOR`, `OWNER`), `operatorRole { name }` or "Owner", `module` / `moduleLabel`, `validFrom`, `validTo`, `status` (`SCHEDULED`, `ACTIVE`, `EXPIRED`, `REVOKED`), `note`
- Drawer: also `assigner`, `createdAt`, `revokedAt`, `revoker`, `revokeReason` (`REVOKED`, `HANDOVER`)
- Handover result: `moduleLabel`, `from`, `to`, `note`, `assignments[] { kind, label, operatorRole, endedAssignmentId, assignmentId, validFrom, validTo }`, `records[] { kind, label, count, records[] { id, name } }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add an operator (role to a person, with dates) | `administration.access.manage` | `POST /administration/access/assignments` `{ operatorRoleId, userId, validFrom?, validTo?, note? }` |
| Make someone a module owner | `administration.access.manageOwners` (ADMIN) | `POST /administration/access/assignments` `{ kind: "OWNER", module, userId, validFrom?, validTo?, note? }` |
| Change dates or note | `administration.access.manage` (owner rows: ADMIN) | `PATCH /administration/access/assignments/:assignmentId` |
| Revoke | `administration.access.manage` (owner rows: ADMIN) | `DELETE /administration/access/assignments/:assignmentId` |
| Hand over work | `administration.access.handOver` (+ `manageOwners` for `includeOwnership`) | `POST /administration/access/handovers` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/administration/access/assignments?module=&kind=&userId=&operatorRoleId=&status=&page=&limit=` | Table rows (paginated) |
| GET | `/administration/access/assignments/:assignmentId` | Drawer |
| POST | `/administration/access/assignments` | Create (operator or owner) |
| PATCH | `/administration/access/assignments/:assignmentId` | `{ validFrom?, validTo?, note? }`; `null` clears a date or the note |
| DELETE | `/administration/access/assignments/:assignmentId` | Revoke (row stays with status `REVOKED`) |
| POST | `/administration/access/handovers` | `{ module, fromUserId, toUserId, note?, includeOwnership? }` → 201 with what moved |
| GET | `/administration/access/operator-roles?module=` | Role select in the "Add operator" form |
| GET | `/users/staff`, `/users/teachers` | Person picker (ADMIN, PRINCIPAL; teachers also STAFF) |

**Layout**
- Tabs: "Operators" (`kind=OPERATOR`) and "Owners" (`kind=OWNER`, ADMIN only). Filters: module → `module`, status → `status` (default `ACTIVE` + `SCHEDULED` shown, others on request), role → `operatorRoleId`, person → `userId`.
- Table columns: person (name, role, inactive badge if `user.status` is not `ACTIVE`), role or "Owner", module, from, to ("no end"), status badge, note. Row actions: "Edit dates", "Revoke" (confirm "Revoke <role> from <name>? Takes effect at once."). Revoked and expired rows are read-only.
- "Add operator" drawer: module (owned modules only), operator role, person picker, from and to dates (inclusive; blank = from today / no end), note. "Make owner" drawer (ADMIN): module, person, dates, note.
- Errors to surface: 422 "<name> is an administrator and already has full access", "…has a student account; module access is for staff accounts only", "…is the Hostel module's administrator (HOSTEL_MANAGER) and already owns it", "validTo … is in the past; revoke the assignment instead"; 409 "<name> already holds <role> …" (overlap), "This assignment has been revoked and can no longer be changed"; 403 "Only an administrator can make someone a module owner or change their ownership".
- **Handover wizard** (button "Hand over work", 4 steps):
  1. Module (owned modules).
  2. From: the person leaving; pick from the module's current assignments (`GET /administration/access/assignments?module=&status=ACTIVE`) so a deactivated person can still be chosen, or from the person picker.
  3. To: an active employee (person picker). ADMIN sees "Also hand over ownership" → `includeOwnership`.
  4. Note (optional; default "Handed over from …") and a confirm screen: "All of <from>'s operator access in <module> moves to <to> from today. History is not changed."
- **Result screen:** the API `message` as the title, then two lists: assignments moved (label, new dates, link to the new assignment) and records reassigned per kind (e.g. "Hostels (warden): Boys Hostel (HST-001)"). Note: "If <from>'s own role still gives access, change their role or deactivate them" with a link to AD-06.
- Handover errors: 400 same person on both sides; 422 "<name> has nothing to hand over in the <module> module…", "<name>'s account is inactive", non-employee target; 409 overlapping role on the target. Nothing moves on any error.

**Notes / Gap:**
- **Gap:** module owners (LIBRARIAN, TRANSPORT_MANAGER, HOSTEL_MANAGER, HR_MANAGER, INVENTORY_MANAGER) cannot list or search employees: `GET /users`, `/users/staff` are ADMIN/PRINCIPAL and `/users/teachers` adds STAFF only. The person picker needs an employee search endpoint open to holders of `administration.access.manage`.

---

### AD-06 · User accounts
**Route:** `/users` (list), `/users/:userId` (detail) · **Type:** Operations · **Who:** read: ADMIN, PRINCIPAL (`users.accounts.read`); edit and deactivate: ADMIN (`users.accounts.update`, `users.accounts.deactivate`); invite: ADMIN, PRINCIPAL, STAFF (`auth.credentials.invite`)

**Data shown**
- List: `firstName`, `lastName`, `email`, `phone`, `role`, `status`, `lastLoginAt`, `passwordChangedAt` (empty = never set a password, so invitable)
- Detail, "Account" tab: also `middleName`, `gender`, `dob`, `address`, `createdAt`
- Detail, "Access" tab: `GET /administration/access/users/:userId/access` → `asOf`, `modules[] { label, owner, resources[] { label, permissions[] { key, label, sources[] { type: ROLE|OPERATOR|OWNER, operatorRoleName, validFrom, validTo } } } }`, `assignments[] { kind, module, operatorRole, validFrom, validTo, status }`
- Detail, "Activity" tab: the person's actions (audit log filtered by `userId`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Edit personal details | `users.accounts.update` (ADMIN) | `PATCH /users/:userId` |
| Deactivate | `users.accounts.deactivate` (ADMIN) | `DELETE /users/:userId` |
| Send invitation (one or many) | `auth.credentials.invite` | `POST /auth/invitations` `{ userIds }` (up to 500) |
| See effective access | `administration.access.read` (ADMIN: every module; owners: their modules) | `GET /administration/access/users/:userId/access?module=` |
| Add operator / owner assignment | `administration.access.manage` / `manageOwners` | AD-05 prefilled with `userId` |
| See their actions | `administration.auditLogs.read` (ADMIN) | `GET /administration/audit-logs?userId=` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users?role=&status=&page=&limit=` | Table rows (paginated) |
| GET | `/users/:userId` | Detail |
| PATCH | `/users/:userId` | `firstName`, `middleName`, `lastName`, `email`, `phone`, `gender`, `dob`, `address` (any subset) |
| DELETE | `/users/:userId` | Deactivate (signs out every device now) |
| POST | `/auth/invitations` | `{ userIds }` → `{ invited[], skipped[] { userId, reason } }` |
| GET | `/administration/access/users/:userId/access?module=` | Access tab |
| GET | `/administration/audit-logs?userId=` | Activity tab |
| GET | `/users/activity?…` | The Users module's activity tab (shared activity component, ADMIN) |
| GET | `/users/activity/:auditLogId` | One entry of that tab |

**Layout**
- List: filters role (all 12 roles) → `role`, status (`ACTIVE`, `INACTIVE`, `BLOCKED`) → `status`. Columns: name, email, role badge, status, last sign-in, "Password set" (yes/no). Checkbox selection with a bulk "Send invitation" button (shows `invited` count and a table of `skipped` with reasons such as "The account already has a password; use password reset").
- Page header has a second tab "Users activity" (shared activity component on `/users/activity`).
- Detail page with tabs Account, Access, Activity. Account tab: read-only card; ADMIN sees "Edit" (form drawer) and "Deactivate".
- Email change warning in the edit form: "Changing the email signs this person out everywhere, cancels their open links and tells the old address." 409 "A record with this email already exists".
- Deactivate: confirm dialog "Deactivate <name>? They are signed out at once and can no longer sign in." 422 "You cannot deactivate your own account".
- Access tab: grouped accordion per module with an "Owner" badge where `owner` is true; each permission shows source chips (Role, Operator: <role name> until <date>, Owner). Upcoming assignments listed below. Owners see only their modules.
- Invite: 403 "Only an administrator can invite staff with privileged roles" for PRINCIPAL/STAFF selecting staff accounts.

**Notes / Gap:**
- **Gap:** reads only return active accounts, so a deactivated account drops out of the list and its detail returns 404; `?status=INACTIVE` lists nothing in practice. There is no reactivation endpoint and no way to set `BLOCKED`.
- **Gap:** no endpoint to change a person's role (e.g. STAFF to ACCOUNTANT); a new account is needed.
- **Gap:** no search by name or email on `GET /users`.
- **Gap:** an account does not link to its role profile (student, teacher, staff, parent id); going from AD-06 to PE pages needs a lookup by `userId`.

---

## People

People covers the school's records of students, parents, teachers and staff (the users module). Admission (PE-03) is the main Operations flow for the office: one step creates the student account, profile, parents and enrollment. Lists and profiles are read by most employees; teachers see only students of their current sections (others 404). Creating and editing is split: office (ADMIN, STAFF) for students and parents, management (ADMIN, PRINCIPAL) for teachers, ADMIN only for staff accounts. Personal details (name, email, phone) live on the account and are edited on AD-06 by ADMIN; each profile page edits only its profile fields.

### PE-01 · Students list
**Route:** `/users/students` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, module owners, TEACHER (own sections only) (`users.students.read`)

**Data shown**
- Per student: `studentCode`, `admissionNumber`, `user.firstName`, `user.lastName`, `user.email`, `user.phone`, `admissionDate`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Admit a student | `users.students.admit` (ADMIN, STAFF) | PE-03 |
| Import students from CSV | `administration.imports.create` (ADMIN, STAFF) | AD-02 |
| Export the student list | `reports.exports.students` (ADMIN, PRINCIPAL, STAFF) | `GET /reports/exports/students?format=xlsx|csv` |
| Invite selected students | `auth.credentials.invite` (ADMIN, PRINCIPAL, STAFF) | `POST /auth/invitations` `{ userIds: [student.user.id…] }` |
| Browse one section | `academics.enrollments.read` | `GET /academics/enrollments?sectionId=` |
| Open a profile | `users.students.read` | PE-02 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/students?page=&limit=` | Table rows (paginated); teachers get only their sections' students |
| GET | `/reports/exports/students?format=` | File download (XLSX default, CSV) |
| POST | `/auth/invitations` | Bulk invite (up to 500) |
| GET | `/academics/classes`, `/academics/sections?classId=` | Section picker for "Browse by section" |
| GET | `/academics/enrollments?sectionId=` | Section roster (enrollments with `studentId`, `rollNumber`) |

**Layout**
- Header buttons: "Admit student" (PE-03), "Import" (AD-02), "Export" (menu: Excel, CSV). Buttons hidden without the key.
- Table columns: student code, admission no., name, email, phone, admission date. Checkbox selection → "Send invitations" (result toast "N invitation(s) sent, M skipped" with a "View skipped" dialog).
- "Browse by section" toggle: class and section selects; shows the enrollment roster (roll no., student) for the selected year (shell's `X-Academic-Year-Id`).
- Row click opens PE-02.
- Empty state: "No students yet" with "Admit student" and "Import from CSV".

**Notes / Gap:**
- **Gap:** `GET /users/students` takes no filters at all: no search (name, code, admission number), no class or section filter, no status. The list also does not return the current class and section. A search box and a section filter need API support (a section roster is only possible through `/academics/enrollments?sectionId=`).

---

### PE-02 · Student profile
**Route:** `/users/students/:studentId` · **Type:** Operations · **Who:** read: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, module owners, TEACHER (own sections) (`users.students.read`); edit: ADMIN, STAFF (`users.students.update`, `users.students.manageParents`)

**Data shown**
- Header: name (`user.firstName`, `user.lastName`), `studentCode`, `admissionNumber`, `user.email`, `user.phone`
- **Overview tab:** `admissionDate`, `bloodGroup`, `category`, `religion`, `description`; account details from `GET /users/:userId` for ADMIN/PRINCIPAL (`gender`, `dob`, `address`, `status`, `lastLoginAt`, `passwordChangedAt`)
- **Parents tab:** rows `relation` (`FATHER`, `MOTHER`, `GUARDIAN`), `isPrimaryContact`, `parent { parentCode, occupation, user { firstName, lastName, email, phone } }`
- **Enrollment tab:** current year roster entry (`rollNumber`, section) when known (see Gap)
- **Documents tab:** files with `ownerType=STUDENT`: name, `category` (`PHOTO`, `DOCUMENT`), `description`, size, uploaded date
- **Fees tab:** statement for the year: `installmentPlan`, `concessions[]`, `totals { gross, concessions, lateFees, billed, paid, refunded, balance, overdue }`, `credit.balance`, `invoices[]`, `payments[]`, `refunds[]`
- **Attendance tab:** summary for a date range (day percentage, per-subject figures on period-wise ranges)
- **Results tab:** report cards / published snapshots per exam

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Edit profile fields | `users.students.update` (ADMIN, STAFF) | `PATCH /users/students/:studentId` |
| Edit name, email, phone | `users.accounts.update` (ADMIN) | `PATCH /users/:userId` (AD-06) |
| Link an existing parent | `users.students.manageParents` (ADMIN, STAFF) | `POST /users/students/:studentId/parents` `{ parentId, relation, isPrimaryContact }` |
| Add a new parent and link | `users.parents.create` + `users.students.manageParents` | `POST /users/parents`, then `POST /users/students/:studentId/parents` |
| Unlink a parent | `users.students.manageParents` | `DELETE /users/students/:studentId/parents/:parentId` |
| Invite student or parent | `auth.credentials.invite` | `POST /auth/invitations` |
| Upload a document or photo | `files.documents.upload` (ADMIN, STAFF) | `POST /files` (multipart `file`, `ownerType=STUDENT`, `ownerId`, `category`, `description`) |
| Download a document | `files.documents.read` | `GET /files/:fileId/download-url` |
| Delete a document | `files.documents.remove` (ADMIN, STAFF) | `DELETE /files/:fileId` |
| Open fees in Finance | `finance.invoices.read` | (link to the Finance student pages) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/students/:studentId` | Header and Overview |
| PATCH | `/users/students/:studentId` | `admissionNumber`, `admissionDate`, `bloodGroup`, `category`, `religion`, `description` |
| GET | `/users/:userId` | Account details (ADMIN, PRINCIPAL) |
| GET | `/users/students/:studentId/parents?page=&limit=` | Parents tab |
| POST | `/users/students/:studentId/parents` | Link a parent |
| DELETE | `/users/students/:studentId/parents/:parentId` | Unlink |
| GET | `/users/parents?page=&limit=` | Picker for "Link existing parent" |
| POST | `/users/parents` | New parent from this page |
| GET | `/files?ownerType=STUDENT&ownerId=:studentId` | Documents tab (staff roles; not teachers) |
| GET | `/files/:fileId` | File details |
| POST | `/files` | Upload |
| GET | `/files/:fileId/download-url` | Signed download (15 min) |
| DELETE | `/files/:fileId` | Remove |
| GET | `/finance/students/:studentId/statement?academicYearId=` | Fees tab (`finance.invoices.read`: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF) |
| GET | `/finance/students/:studentId/credits` | Credit balance and entries (`finance.credits.read`) |
| GET | `/academics/attendance/students/:studentId?from=&to=&academicYearId=` | Attendance tab (`academics.attendance.read`) |
| GET | `/academics/report-cards/students/:studentId` | Results tab (`academics.reportCards.read`: ADMIN, PRINCIPAL, STAFF, class teacher) |
| GET | `/academics/report-cards/students/:studentId/pdf` | Report card PDF |
| GET | `/academics/enrollments?sectionId=` | Roll number in a known section |

**Layout**
- Full page. Header card with photo (latest `PHOTO` file, if any), name, codes, contact, and buttons "Edit", "Send invitation". Tabs below; each tab appears only with its key (teachers see Overview, Parents, Attendance, and Results if class teacher).
- Overview: two-column read-only details; "Edit" opens a drawer with the profile fields (409 on a duplicate admission number). Name/email/phone show "Edit account" only for ADMIN (opens AD-06 edit).
- Parents: table (name, relation, primary contact star, phone, email, parent code). Buttons "Link existing parent" (searchable picker, relation select, primary contact switch) and "Add new parent" (person form + occupation, annual income, then relation). Row action "Unlink" (confirm). 409 "This parent is already linked to the student"; 422 unknown `parentId`. Parent name links to PE-04.
- Documents: list with category filter; "Upload" (PHOTO up to 5 MB images; DOCUMENT up to 10 MB PDF/Office/text/images). Delete with confirm.
- Fees: totals as KPI tiles (billed, paid, balance, overdue, credit), invoices table (number, due date, total, paid, balance, status), payments and refunds lists; year select → `academicYearId`. "Open in Finance" link.
- Attendance: date range (default this year to today) → `from`, `to`; tiles for day percentage; per-subject table when present.
- Results: list of exams with result and a PDF button.

**Notes / Gap:**
- **Gap:** no per-student enrollment endpoint: the student's current class and section, and enrollment history across years, cannot be read (`GET /academics/enrollments` requires `sectionId`). The Enrollment tab needs `GET /academics/enrollments?studentId=` (all years) or the current enrollment in `GET /users/students/:studentId`.
- **Gap:** a parent link cannot be edited (relation, primary contact): only unlink and link again.
- **Gap:** STAFF can admit a student but cannot fix the student's name, email or phone afterwards (`PATCH /users/:userId` is ADMIN only).
- **Gap:** no parent search for the picker (`GET /users/parents` has no filters).

---

### PE-03 · Admission wizard
**Route:** `/users/students/new` · **Type:** Operations · **Who:** ADMIN, STAFF (`users.students.admit`)

**Data shown**
- Step 1 Student: `user { firstName, middleName, lastName, email, phone, gender, dob, address }`, `profile { admissionDate, bloodGroup, category, religion, description }` (all optional; `profile` may be left out). **The admission number is generated by the server** (`ADM26-0001`: the admitting year's start year and a per-year serial): no field for it; one sent is ignored
- Step 2 Parents (0–4): each either existing (`parentId`) or new (`user { … }`, `profile { occupation, annualIncome, description }`), plus `relation` and `isPrimaryContact`
- Step 3 Enrollment: `enrollment { academicYearId, sectionId, admissionType }` (`NEW` default, `PROMOTED`, `REPEAT`)
- Step 4 Review: everything above, read-only; "Admission number: Generated on admission" in place of a value
- Result: generated `admissionNumber`, `studentCode`, enrollment `rollNumber` (the next number at the end of the section), parent links

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Admit | `users.students.admit` | `POST /users/students` |
| Pick an existing parent (sibling) | `users.parents.read` / `users.students.readParents` | `GET /users/parents`, `GET /users/students/:studentId/parents` |
| Send invitations after admission | `auth.credentials.invite` | `POST /auth/invitations` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/academic-years` | Year select (default current; archived years excluded) |
| GET | `/academics/classes` | Class select |
| GET | `/academics/sections?classId=` | Section select, sent with `X-Academic-Year-Id: <chosen year>` |
| GET | `/users/parents?page=&limit=` | Existing parent picker |
| GET | `/users/students?page=&limit=` + `/users/students/:studentId/parents` | "Same parents as a sibling": pick the sibling, then reuse its parents' `parentId`s |
| POST | `/users/students` | `{ user, profile, parents[], enrollment }` → 201 with student, `user`, `parents` (links), `enrollment` |
| POST | `/auth/invitations` | Invite the new student (and parents) |

**Layout**
- Four-step wizard with a step bar; Back keeps entered data; Next validates the step client-side (required: first name, last name, email; phone pattern; dates `YYYY-MM-DD`).
- **Prerequisite check on open:** if there is no academic year or the chosen year has no sections, show an empty state "Set up the academic year and its sections first" with a link to Academics setup, and do not start the wizard.
- Step 2: "Add parent" offers "New parent" (person form) or "Existing parent" (picker), or "Copy from a sibling" (student picker, then tick their parents). Each card has relation select and a "Primary contact" switch (suggest exactly one). Up to 4 cards; the step can be skipped.
- Step 3: year select, class, then section (shows section name and class teacher if returned), admission type.
- Step 4: summary cards with "Edit" links back to each step; "Admit student" button.
- Success screen: "Asha Rao admitted. Admission no. ADM26-0042, student code STU26-1-000001, roll no. 1A-012", buttons "Open profile" (PE-02), "Send invitations" (student `user.id`; parents' user ids from `GET /users/students/:studentId/parents`), "Admit another".
- Errors: 409 "A record with this email already exists" (student or a new parent; jump to that step and field), 409 archived year ("Academic year … is archived and read-only"), 422 "parents[1].parentId does not refer to an existing parent", 422/404 when the section is not in the year. Nothing is saved on any error (single transaction).

**Notes / Gap:**
- **Gap:** no parent search by name, email or phone, which is what an office needs to find a sibling's parent; the sibling route works only when the sibling is known.

---

### PE-04 · Parents
**Route:** `/users/parents` (list + detail drawer), `/users/parents/new` · **Type:** Operations · **Who:** read: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, module owners (`users.parents.read`); create and edit: ADMIN, STAFF (`users.parents.create`, `users.parents.update`)

**Data shown**
- List: `parentCode`, `user.firstName`, `user.lastName`, `user.email`, `user.phone`, `occupation`
- Drawer: also `annualIncome`, `description`; account details for ADMIN/PRINCIPAL (`GET /users/:userId`)
- Linked children: see Gap

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a parent | `users.parents.create` | `POST /users/parents` `{ user, profile }` |
| Edit profile fields | `users.parents.update` | `PATCH /users/parents/:parentId` |
| Edit name, email, phone | `users.accounts.update` (ADMIN) | `PATCH /users/:userId` |
| Invite | `auth.credentials.invite` | `POST /auth/invitations` |
| Link to a student | `users.students.manageParents` | from PE-02 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/parents?page=&limit=` | Table rows (paginated) |
| GET | `/users/parents/:parentId` | Drawer |
| POST | `/users/parents` | Create (person fields + `occupation`, `annualIncome`, `description`) |
| PATCH | `/users/parents/:parentId` | Edit `occupation`, `annualIncome`, `description` |
| GET | `/users/:userId` | Account details |

**Layout**
- Table columns: parent code, name, phone, email, occupation; checkbox selection → "Send invitations".
- Row click opens a right drawer: contact block, profile fields, "Children" section, buttons "Edit" and "Send invitation".
- "New parent" opens a form page (person + profile). 409 "A record with this email already exists".
- Annual income formatted in the school currency.

**Notes / Gap:**
- **Gap:** no endpoint lists a parent's linked children (`GET /users/parents/:parentId` returns the profile only; links are readable only from the student side). The drawer's "Children" section needs `GET /users/parents/:parentId/students` or the links in the parent detail.
- **Gap:** no search or filters on `GET /users/parents`.

---

### PE-05 · Teachers
**Route:** `/users/teachers` (list), `/users/teachers/:teacherId` (detail), `/users/teachers/new` · **Type:** Setup · **Who:** read: ADMIN, PRINCIPAL, STAFF (`users.teachers.read`); create and edit: ADMIN, PRINCIPAL (`users.teachers.create`, `users.teachers.update`)

**Data shown**
- List: `employeeCode`, `user.firstName`, `user.lastName`, `user.email`, `user.phone`, `qualification`, `joiningDate`, `employmentType`
- Detail: also `experienceYears`, `bloodGroup`, `description`; teaching assignments (section, subject, class teacher / deputy); weekly timetable

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a teacher | `users.teachers.create` (ADMIN, PRINCIPAL) | `POST /users/teachers` `{ user, profile }` |
| Edit profile fields | `users.teachers.update` (ADMIN, PRINCIPAL) | `PATCH /users/teachers/:teacherId` |
| Edit name, email, phone | `users.accounts.update` (ADMIN) | `PATCH /users/:userId` |
| Invite | `auth.credentials.invite` (ADMIN, PRINCIPAL, STAFF) | `POST /auth/invitations` |
| Deactivate | `users.accounts.deactivate` (ADMIN) | `DELETE /users/:userId` (AD-06) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/teachers?page=&limit=` | Table rows (paginated) |
| GET | `/users/teachers/:teacherId` | Detail |
| POST | `/users/teachers` | Create (person fields + `qualification`, `experienceYears`, `joiningDate`, `employmentType`, `bloodGroup`, `description`) |
| PATCH | `/users/teachers/:teacherId` | Edit profile fields |
| GET | `/academics/teacher-assignments?teacherId=` | Assignments panel (`academics.teacherAssignments.read`) |
| GET | `/academics/timetable/teachers/:teacherId` | Timetable panel (`academics.timetable.read`) |

**Layout**
- List table: code, name, phone, email, qualification, joined, type (Full time / Part time). Selection → "Send invitations". "New teacher" button for ADMIN/PRINCIPAL.
- Detail page: profile card (edit drawer), "Assignments" table (links to Academics), "Timetable" week grid (read-only), "Account" link to AD-06 for ADMIN/PRINCIPAL.
- Create form: person fields + employment fields; `employeeCode` is generated (shown after save). 409 duplicate email.

**Notes / Gap:**
- **Gap:** no search or filters on `GET /users/teachers` (name, subject, employment type).

---

### PE-06 · Staff
**Route:** `/users/staff` (list), `/users/staff/:staffId` (detail), `/users/staff/new` · **Type:** Setup · **Who:** read: ADMIN, PRINCIPAL (`users.staff.read`); create and edit: ADMIN (`users.staff.create`, `users.staff.update`)

**Data shown**
- List: `employeeCode`, `user.firstName`, `user.lastName`, `user.email`, `user.phone`, `user.role`, `designation`, `department`
- Detail: also `qualification`, `joiningDate`, `employmentType`, `bloodGroup`, `description`; effective access summary; documents (`ownerType=STAFF`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a staff account | `users.staff.create` (ADMIN) | `POST /users/staff` `{ role, user, profile }` |
| Edit profile fields | `users.staff.update` (ADMIN) | `PATCH /users/staff/:staffId` |
| Edit name, email, phone | `users.accounts.update` (ADMIN) | `PATCH /users/:userId` |
| Invite | `auth.credentials.invite` (only ADMIN for these privileged roles) | `POST /auth/invitations` |
| Make module owner / add operator role | `administration.access.manageOwners` / `manage` | AD-05 prefilled |
| View effective access | `administration.access.read` | `GET /administration/access/users/:userId/access` |
| Upload / download / delete documents | `files.documents.upload` / `read` / `remove` | `POST /files`, `GET /files/:fileId/download-url`, `DELETE /files/:fileId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/staff?role=&page=&limit=` | Table rows (paginated) |
| GET | `/users/staff/:staffId` | Detail |
| POST | `/users/staff` | Create |
| PATCH | `/users/staff/:staffId` | `designation`, `department`, `qualification`, `joiningDate`, `employmentType`, `bloodGroup`, `description` |
| GET | `/administration/access/users/:userId/access` | Access panel |
| GET | `/files?ownerType=STAFF&ownerId=:staffId` | Documents panel |

**Layout**
- List: filter role → `role` (`ADMIN`, `PRINCIPAL`, `ACCOUNTANT`, `STAFF`, `HR_MANAGER`, `LIBRARIAN`, `TRANSPORT_MANAGER`, `HOSTEL_MANAGER`, `INVENTORY_MANAGER`). Columns: code, name, role badge, designation, department, phone, email. "New staff member" (ADMIN only).
- Create form: role select first (with a one-line description of each; module manager roles labelled "Owner of Library/Transport/Hostel/HR/Inventory"), then person and employment fields. Role cannot be changed after creation: say so under the select.
- Detail page: profile card (edit drawer, ADMIN), "Access" panel (modules and sources, as AD-06) with "Manage access" link to AD-05, "Documents" panel, "Account" link to AD-06.
- 409 duplicate email; 403 "Only an administrator can invite staff with privileged roles" if a non-ADMIN tries to invite.

**Notes / Gap:**
- **Gap:** no endpoint to change a staff member's role (API.md's handover notes say "change their role", but nothing does it).
- **Gap:** no search on `GET /users/staff` (only `role`).

---

## Academics

The academic side of the school: years, classes, sections, subjects, who teaches what, the calendar, the timetable, attendance, enrollments and promotion, exams, marks, report cards and homework. ADMIN and PRINCIPAL set it up (Setup pages, AC-01 to AC-08) at the start of each year. Teachers do the daily work on the Operations pages (AC-09 to AC-16): taking registers, covering periods, entering marks, setting homework. STAFF reads most of it and manages enrollments. Teachers only reach **their sections of the current academic year** (class teacher, deputy class teacher or subject teacher; last year's sections stay theirs for one month after the year changes). Lists leave other sections out, and naming one returns 403. Each page below says what a teacher sees compared with ADMIN and PRINCIPAL. Most endpoints act on the year chosen in the header year switcher (`X-Academic-Year-Id`). Classes, subjects, grade scales and result policies are school-wide.

---

### AC-01 · Academic years
**Route:** `/academics/academic-years` · **Type:** Setup · **Who:** every employee role reads (`academics.academicYears.read`). ADMIN and PRINCIPAL create and edit (`academics.academicYears.create`, `academics.academicYears.update`). Only ADMIN archives (`academics.academicYears.archive`). TEACHER: read-only list.

**Data shown**
- Years table: `yearName`, `startDate`, `endDate`, `isCurrent`, `weeklyOffDays` (0 = Sunday … 6 = Saturday), `offSaturdays` (Saturdays of the month that are off: 1 = first … 5 = fifth, e.g. `[2]` = second Saturday), `archivedAt`, `description`
- `currentUntil`: when the year stopped being current. Teachers keep last year's sections for one month after this date
- Year-end checklist card on a year that is current or recently ended: promote sections (AC-12), make the next year current, archive this one

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a year (optionally current) | `academics.academicYears.create` (ADMIN, PRINCIPAL) | `POST /academics/academic-years` |
| Edit dates (renames the year), weekly off days, off Saturdays | `academics.academicYears.update` (ADMIN, PRINCIPAL) | `PATCH /academics/academic-years/:academicYearId` |
| Make current | `academics.academicYears.update` | `PATCH /academics/academic-years/:academicYearId` `{ isCurrent: true }` |
| Archive (read-only) | `academics.academicYears.archive` (ADMIN) | `POST /academics/academic-years/:academicYearId/archival` |
| Unarchive | `academics.academicYears.archive` (ADMIN) | `DELETE /academics/academic-years/:academicYearId/archival` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/academic-years?page=&limit=` | Table rows; also feeds the header year switcher |
| GET | `/academics/academic-years/current` | Default year of the switcher; highlights the current row |
| GET | `/academics/academic-years/:academicYearId` | Drawer |

**Layout**
- List + drawer. Badges: Current (green), Archived (grey), "Teacher access until …" while `currentUntil` is less than a month ago.
- Form: `startDate`, `endDate` (must be after the start), `weeklyOffDays` as seven day checkboxes (Sun–Sat), `offSaturdays` as five checkboxes (1st–5th Saturday; disabled when every Saturday is off), `description`. Create has a "Make this the current year" switch (`isCurrent`). **No name field**: the server names the year from its dates. Show the name the dates give as a read-only preview next to the dates: `2026-27` when the start and end fall in different calendar years (last two digits of the end year), `2026` when both fall in the same one. Do not send `yearName` (if sent, it must equal that name, else 422 "yearName must be 2026-27 for 2026-06-01 to 2027-03-31: it is derived from the dates. Leave it out.").
- Date rules to mirror in the form (the server enforces them): at most 13 months (end by start + 13 months − 1 day: start 2026-06-01 → end by 2027-06-30) and at most two calendar years. Show the 422s as they are: "An academic year lasts at most 13 months: starting …, it must end by …", "An academic year spans at most two calendar years: …". A year may not share a day with another year (archived ones included): 409 "2026-06-01 to 2027-03-31 overlaps academic year 2025-26 (2025-06-01 to 2026-03-31). Academic years cannot overlap." Two same-calendar-year years with the same name: 409 "An academic year named 2026 already exists".
- Editing dates re-derives the name (the response carries the new `yearName`). An archived year's dates cannot change: 409 "Academic year … is archived and read-only. Restore it first." Years created before names were derived keep their old name until their dates are edited (or `PATCH { yearName: "<the derived name>" }` renames them).
- **Make current** confirm: "2026-27 becomes the current year. 2025-26 stops being current. Teachers keep their 2025-26 sections for one month."
- **Archive** confirm: names the year and says academic records become read-only and fees stay payable. Show the 422 messages as they are: "… is the current year. Make another year current first.", "… ends on …. Archive it after it has ended.", "N students are still active in …. Promote them or mark them as left first." (link to AC-12). 409: already archived / not archived.
- Year end has no single roll-over endpoint. The checklist card links the three steps from the "Year end" workflow: AC-12 bulk promotion, then Make current, then Archive.
- Read-only for anyone without `update`: no edit buttons, no checklist actions.

**Notes / Gap:**
- **Gap:** no copy-forward for a new year. Sections, section subjects, teacher assignments, periods and timetable slots belong to one year and must be created again. Sections have a bulk endpoint. Section subjects, teacher assignments, periods and slots are created one at a time.

---

### AC-02 · Classes and sections
**Route:** `/academics/classes` · **Type:** Setup · **Who:** every employee role reads (`academics.classes.read`, `academics.sections.read`). ADMIN and PRINCIPAL manage (`academics.classes.create|update`, `academics.sections.create|update`). TEACHER: read-only, and only the classes and sections they teach in.

**Data shown**
- Classes (school-wide): `level`, `className`, `classOrder`, `description`. Classes are fixed levels: Nursery, LKG, UKG, Class 1 … Class 12 (`level` NURSERY, LKG, UKG, GRADE_1 … GRADE_12); `className` and `classOrder` come from the level. A class created before levels existed may have `level: null` (its name matched no level): flag it "Pick a level" and offer the level picker in its edit form
- Sections of the selected class (selected year): `sectionName`, `class.className`, `capacity`, `classTeacher.employeeCode`, `deputyClassTeacher.employeeCode`, `description`
- Section drawer tabs: Details, Subjects (AC-03), Teachers (AC-04), Students (AC-12 roster, with "Renumber roll numbers"), Timetable (AC-07)
- Class row menu (ADMIN, PRINCIPAL): "Renumber roll numbers" for every section of the class in the selected year (AC-12, `{ classId }`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a class | `academics.classes.create` (ADMIN, PRINCIPAL) | `POST /academics/classes` |
| Add many classes | `academics.classes.create` | `POST /academics/classes/bulk` `{ classes: [{ level }, …] }` |
| Edit a class (description; level only while it has no sections) | `academics.classes.update` | `PATCH /academics/classes/:classId` `{ level?, description? }` |
| Add a section | `academics.sections.create` (ADMIN, PRINCIPAL) | `POST /academics/sections` |
| Add many sections | `academics.sections.create` | `POST /academics/sections/bulk` |
| Edit section, set class teacher / deputy (`null` removes the deputy) | `academics.sections.update` | `PATCH /academics/sections/:sectionId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/classes?page=&limit=` | Class list, in level order (teacher: only their classes) |
| GET | `/academics/classes/levels` | The 15 levels in order, each `{ level, className, classOrder, created, classId }`: the "Add class" picker offers the ones with `created: false` (teacher: `classId` only for their own classes) |
| GET | `/academics/classes/:classId` | Class drawer |
| GET | `/academics/sections?classId=&page=&limit=` | Sections of the class in the selected year (teacher: only theirs) |
| GET | `/academics/sections/:sectionId` | Section drawer (teacher outside it: 403) |
| GET | `/users/teachers` | Class teacher and deputy pickers (ADMIN, PRINCIPAL, STAFF only) |

**Layout**
- Master-detail. Left: classes ordered by `classOrder`. Right: sections table with columns Section, Class teacher, Deputy, Capacity. Row click opens the section drawer.
- "Add class" is a picker of the levels not created yet (`GET /academics/classes/levels`), never a free-text name; "Bulk add" for classes is the same picker with several ticks (one `…/bulk` request). The form sends `{ level, description }`. 409 "A class named Class 1 already exists" if someone created it meanwhile. Changing a class's level is refused once it has sections: 409 "Class 1 has 2 sections, so it cannot become Class 3. Create Class 3 as a new class instead."
- "Bulk add" for sections is a small generator: pick classes and type section letters (A, B, C), preview the rows, then send one `…/bulk` request (all-or-nothing, max 200). Repeats within the request are refused per row: 400 with `details[].field` `sections.1.sectionName` and message "repeats sections.0 in this request" (letters are upper-cased first, so "a" repeats "A"). A section that already exists: 409 "Section A already exists in this class for this academic year".
- Section form: `classId`, `sectionName` (1–5 letters or digits, upper-cased), `capacity` (optional, max 500), `classTeacherId`, `deputyClassTeacherId`, `description`. The deputy picker leaves out the chosen class teacher. Show 422s: "classTeacherId does not refer to an existing teacher", "The deputy class teacher must be a different teacher from the class teacher".
- Teacher view: same layout, no New/Edit buttons. Their sections can also come from `GET /me/teaching/sections` (role per section).

**Notes / Gap:**
- **Gap:** sections return only `employeeCode` for the class teacher and deputy, not names. Admins can map them via `GET /users/teachers`, but TEACHER cannot call it, so the teacher view shows codes only.
- **Gap:** no delete or deactivate for classes and sections. A wrongly created row cannot be removed.
- **Gap:** `capacity` is stored but not enforced, and no endpoint gives a section's student count. A "28 / 40" badge would need one roster call per section.

---

### AC-03 · Subjects and section subjects
**Route:** `/academics/subjects` · **Type:** Setup · **Who:** every employee role reads (`academics.subjects.read`, `academics.sectionSubjects.read`). ADMIN and PRINCIPAL manage (`academics.subjects.create|update`, `academics.sectionSubjects.create|remove`). TEACHER: read-only, only subjects and sections they teach.

**Data shown**
- Subject master tab: `subjectName`, `subjectCode`, `subjectType` (THEORY, PRACTICAL), `isOptional`, `description`
- By section tab: `subject.subjectName`, `subject.subjectCode`, `displayCode`, `weeklyNoOfClasses`, `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a subject | `academics.subjects.create` (ADMIN, PRINCIPAL) | `POST /academics/subjects` |
| Add many subjects | `academics.subjects.create` | `POST /academics/subjects/bulk` |
| Edit a subject | `academics.subjects.update` | `PATCH /academics/subjects/:subjectId` |
| Add a subject to a section | `academics.sectionSubjects.create` | `POST /academics/section-subjects` |
| Remove a subject from a section | `academics.sectionSubjects.remove` | `DELETE /academics/section-subjects/:sectionSubjectId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/subjects?page=&limit=` | Master table (teacher: subjects of their sections) |
| GET | `/academics/subjects/:subjectId` | Drawer |
| GET | `/academics/section-subjects?sectionId=&page=&limit=` | Subjects of one section (`sectionId` required) |
| GET | `/academics/sections?classId=` | Section picker |

**Layout**
- Tab 1, List + drawer. Columns: Code, Name, Type, Optional. `subjectCode` is 2–10 letters or digits, stored upper-case.
- Tab 2: class and section pickers, then a table of the section's subjects with "Add subject" (subject select + `weeklyNoOfClasses`) and a remove icon (confirm names the subject and section). 409 "This subject is already assigned to the section".
- Teacher view: both tabs read-only.

**Notes / Gap:**
- **Gap:** no delete or deactivate for subjects.

---

### AC-04 · Teacher assignments
**Route:** `/academics/teacher-assignments` · **Type:** Setup · **Who:** every employee role reads (`academics.teacherAssignments.read`). ADMIN and PRINCIPAL assign and remove (`academics.teacherAssignments.create|remove`). TEACHER: read-only, assignments of their sections only.

**Data shown**
- `teacher.employeeCode`, `teacher.user.firstName`, `teacher.user.lastName`, `section.sectionName`, `subject.subjectName`, `subject.subjectCode`, `description`
- By section: each section subject with its teacher, or "Unassigned"
- By teacher: their assignments, plus `weeklyLessons` from their timetable

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Assign a teacher to a subject in a section | `academics.teacherAssignments.create` (ADMIN, PRINCIPAL) | `POST /academics/teacher-assignments` |
| Remove an assignment | `academics.teacherAssignments.remove` | `DELETE /academics/teacher-assignments/:assignmentId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/teacher-assignments?sectionId=&teacherId=&page=&limit=` | Table rows (teacher: only their sections) |
| GET | `/academics/section-subjects?sectionId=` | Subjects to fill in the By section view |
| GET | `/users/teachers` | Teacher picker (ADMIN, PRINCIPAL, STAFF) |
| GET | `/academics/timetable/teachers/:teacherId` | `weeklyLessons` in the By teacher view |

**Layout**
- Two views with a toggle. **By section**: section picker, then one row per section subject with the assigned teacher, or an "Assign" button. **By teacher**: teacher picker (`teacherId` filter), then their assignments and weekly lesson count.
- Filters: section (`sectionId`), teacher (`teacherId`).
- There is no edit: to change a teacher, remove the assignment and add a new one. The UI can offer "Change teacher" that does both, with a confirm.
- Errors: 422 "This subject is not taught in the section. Add it to the section first." (link to AC-03). 409 "This subject already has a teacher in the section".

---

### AC-05 · School calendar
**Route:** `/academics/calendar` · **Type:** Setup · **Who:** everyone reads, students and parents included (`academics.calendar.read`). ADMIN and PRINCIPAL manage (`academics.calendar.create|update|remove`). TEACHER: read-only.

**Data shown**
- Events: `title`, `eventType` (HOLIDAY, VACATION, EXAM, EVENT, MEETING, OTHER), `startDate`, `endDate`, `isHoliday`, `description`
- Working days for the visible range: `workingDays`, `closedDays` (`date`, `reason`: WEEKLY_OFF or the event type, `title`)
- Header: number of working days this month

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add an event or holiday | `academics.calendar.create` (ADMIN, PRINCIPAL) | `POST /academics/calendar/events` |
| Edit | `academics.calendar.update` | `PATCH /academics/calendar/events/:eventId` |
| Delete | `academics.calendar.remove` | `DELETE /academics/calendar/events/:eventId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/calendar/events?from=&to=&eventType=&page=&limit=` | Events in the visible month, or list view |
| GET | `/academics/calendar/events/:eventId` | Event drawer |
| GET | `/academics/calendar/working-days?from=&to=` | Shade closed days, count working days (`from`, `to` required) |

**Layout**
- Month grid by default, list view as a second tab. Event chips coloured by `eventType`. Closed days (weekly off, holiday, vacation) shaded, with the reason on hover.
- Click a day (with `create`) to open the event drawer pre-filled with that date. `endDate` defaults to `startDate`. `isHoliday` defaults to on for HOLIDAY and VACATION. Show it as a "School closed" switch for the other types.
- 422: "Event dates must fall within the academic year (… to …)". Delete confirm names the event.
- Filter: event type (`eventType`). Students and parents see the same calendar read-only. A shared or portal calendar page can reuse this view.

---

### AC-06 · Grading setup
**Route:** `/academics/grading` · **Type:** Setup · **Who:** every employee role reads grade scales and result policies (`academics.gradeScales.read`, `academics.resultPolicies.read`). ADMIN, PRINCIPAL, STAFF and TEACHER read assessment schemes (`academics.assessmentSchemes.read`). ADMIN and PRINCIPAL manage all of it (`academics.gradeScales.manage`, `academics.resultPolicies.manage`, `academics.assessmentSchemes.manage`). TEACHER: read-only.

**Data shown**
- **Grade scales tab:** `name`, `description`, `isDefault`, `bands` (`grade`, `minPercent`, `maxPercent`, `gradePoint`, `remark`, `isPassing`). Templates: `key`, `name`, `description`, `bands`
- **Result policies tab:** `name`, `description`, `isDefault`, `gradingMode` (MARKS, GRADES, GPA, PASS_FAIL), `gradeScaleId`, `coScholasticScaleId`, `gpaScale`. Pass rules: `usePaperPassMarks`, `subjectMinPercent`, `requirePassingGrade`, `requireComponentPass`, `overallMinPercent`. Compartment: `maxCompartmentSubjects`. Grace: `graceMaxPerSubject`, `graceMaxTotal`, `graceCountsInTotal`. `bestOfSubjects`. Absences: `absentTreatment`, `medicalTreatment`, `exemptTreatment` (ZERO_FAIL, EXCLUDE). Ranking: `rankingMethod`, `rankScope`, `rankFailedStudents`, `showRankToStudents`. Rounding: `percentageDecimals`, `gpaDecimals`, `roundingMode`. Per-subject rules: `subjects` (`subjectId`, `category`, `credits`, `isMandatory`, `minPercent`)
- **Policy assignments tab:** `policyId`, `examId`, `classId` (exam + class, exam only, or class only)
- **Which rules apply?** box: `source` (EXAM_CLASS, EXAM, CLASS, SCHOOL_DEFAULT, BUILT_IN), `assignmentId`, `policy`
- **Assessment schemes tab:** `name`, `description`, `policyId`, `exams` (`examId`, `weight`), `resultsPublishedAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a grade scale (bands or `templateKey`) | `academics.gradeScales.manage` (ADMIN, PRINCIPAL) | `POST /academics/grade-scales` |
| Edit a scale / set default | `academics.gradeScales.manage` | `PATCH /academics/grade-scales/:gradeScaleId` |
| Delete a scale | `academics.gradeScales.manage` | `DELETE /academics/grade-scales/:gradeScaleId` |
| Create a result policy | `academics.resultPolicies.manage` | `POST /academics/result-policies` |
| Edit a policy / set school default | `academics.resultPolicies.manage` | `PATCH /academics/result-policies/:policyId` |
| Delete a policy | `academics.resultPolicies.manage` | `DELETE /academics/result-policies/:policyId` |
| Apply a policy to an exam / class | `academics.resultPolicies.manage` | `POST /academics/result-policy-assignments` |
| Change the policy of an assignment | `academics.resultPolicies.manage` | `PATCH /academics/result-policy-assignments/:assignmentId` |
| Remove an assignment | `academics.resultPolicies.manage` | `DELETE /academics/result-policy-assignments/:assignmentId` |
| Test a policy on real marks | `academics.reportCards.preview` (ADMIN, PRINCIPAL) | `POST /academics/report-cards/previews` (see AC-15) |
| Create an assessment scheme | `academics.assessmentSchemes.manage` | `POST /academics/assessment-schemes` |
| Edit a scheme | `academics.assessmentSchemes.manage` | `PATCH /academics/assessment-schemes/:schemeId` |
| Delete a scheme | `academics.assessmentSchemes.manage` | `DELETE /academics/assessment-schemes/:schemeId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/grade-scales?page=&limit=` | Scales with their bands |
| GET | `/academics/grade-scales/templates` | "Start from a template" picker |
| GET | `/academics/grade-scales/:gradeScaleId` | Scale editor |
| GET | `/academics/result-policies?gradingMode=&page=&limit=` | Policy list |
| GET | `/academics/result-policies/:policyId` | Policy editor |
| GET | `/academics/result-policy-assignments?policyId=&examId=&classId=&page=&limit=` | Assignments table |
| GET | `/academics/result-policy-assignments/:assignmentId` | Assignment drawer |
| GET | `/academics/result-policies/resolution?examId=&classId=&sectionId=` | "Which rules apply?" (at least one of the three) |
| GET | `/academics/assessment-schemes?page=&limit=` | Schemes of the selected year |
| GET | `/academics/assessment-schemes/:schemeId` | Scheme editor |
| GET | `/academics/exams`, `/academics/classes` | Pickers |

**Layout**
- Four tabs. Each is List + drawer.
- **Grade scale editor:** band rows table (grade, from %, to %, grade point, remark, passing). Show a live 0–100 bar that must be covered with no gaps. 422s: "The lowest band must start at 0%", "The highest band must end at 100%", overlaps or gaps. "From template" sends `templateKey` only.
- **Policy editor:** a long form in sections: Grading, Pass rules, Compartment and grace, Best of N, Absences, Ranking, Rounding, Subject rules (a table of subjects with category, credits, mandatory, own min %). Hide GPA fields unless `gradingMode` is GPA. Hide ranking for PASS_FAIL. Footer: "Preview on an exam" opens the AC-15 preview with this policy inline. 409 on delete: "Result policy … is assigned to N exam or class target(s). Remove those assignments first."
- **Assignments:** table Target (exam + class / exam / class), Policy. Add: policy, exam (optional), class (optional), at least one. 409 "… already uses result policy …. Change that assignment instead." The "Which rules apply?" box sits above the table: pick an exam and/or class or section and see the winning policy and why.
- **Scheme editor:** name, own policy (optional), and rows of exam + weight with a running total that must reach 100. 422 "… belongs to another academic year". 409 on delete when results are published.
- Teacher, STAFF and others: all tabs read-only.

---

### AC-07 · Timetable builder
**Route:** `/academics/timetable` · **Type:** Setup · **Who:** every employee role reads (`academics.timetable.read`). ADMIN and PRINCIPAL edit (`academics.timetable.manage`). TEACHER: a section's grid only as its class teacher or deputy (else 403), and a teacher grid only for themselves. Their own week comes from `GET /me/teaching/timetable`.

**Data shown**
- **Bell schedule tab:** periods `periodNumber`, `name`, `startTime`, `endTime`, `isBreak`
- **Section timetable tab:** `section.name`, `periods` (rows), `days` (`weekday`, `name`; weekly off days left out), each cell's `subject.subjectName`, `teacher.name`, `room`
- **Teacher timetable tab:** same grid for one teacher, cells show `section.name`, and `weeklyLessons`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a period or break | `academics.timetable.manage` (ADMIN, PRINCIPAL) | `POST /academics/periods` |
| Edit a period | `academics.timetable.manage` | `PATCH /academics/periods/:periodId` |
| Delete a period | `academics.timetable.manage` | `DELETE /academics/periods/:periodId` |
| Place a lesson in a cell | `academics.timetable.manage` | `POST /academics/timetable/slots` |
| Change a lesson (subject, teacher, room, day, period) | `academics.timetable.manage` | `PATCH /academics/timetable/slots/:slotId` |
| Clear a cell | `academics.timetable.manage` | `DELETE /academics/timetable/slots/:slotId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/periods?limit=100` | Bell schedule of the selected year |
| GET | `/academics/timetable/sections/:sectionId` | Section grid |
| GET | `/academics/timetable/teachers/:teacherId` | Teacher grid |
| GET | `/academics/section-subjects?sectionId=` | Subject choices in a cell |
| GET | `/academics/teacher-assignments?sectionId=` | Default teacher per subject (shown in the cell popover) |
| GET | `/users/teachers` | Teacher picker (ADMIN, PRINCIPAL, STAFF) |

**Layout**
- Grid editor. Rows are periods in bell order (breaks shown as thin grey rows, not clickable). Columns are the days in `days`.
- Empty cell click: popover with subject (required), teacher (defaults to the subject's assigned teacher; change it only for an exception), room (optional). Filled cell: edit or clear (confirm).
- Clash errors (409) are shown on the cell, word for word: "The section already has Maths on Monday Period 2", "The teacher is already teaching 6-A on Monday Period 2", "Room Lab 1 is already in use on …". 422s: break period, weekly off day, subject not taught in the section, "No teacher is assigned to this subject in the section; send teacherId".
- Bell schedule tab: List + drawer. 409 on overlapping times ("This time overlaps Period 3 (09:40–10:20)").
- Teacher tab: teacher picker, then the read-only grid with lesson count.
- Without `manage`: grids are read-only.

---

### AC-07b · Timetable generator
**Route:** `/academics/timetable/generate` (from AC-07), and a dialog on the exam page (AC-13) · **Type:** Setup · **Who:** ADMIN and PRINCIPAL (`academics.scheduling.read`, `.generate`, `.apply`). API.md › Generating timetables has the rules.

**Steps (class timetable)**
1. **Check:** `GET /academics/scheduling/class-timetable/inputs`. Sections with periods needed vs available, teachers by weekly load, ERROR/WARNING `issues` (messages as given) with links to AC-03 and AC-04 and the bell schedule.
2. **Rules:** sections (all or some), mode (RadioGroup FILL / REPLACE), teacher limits a day and in a row, subject rules (doubles, most a day, preferred/avoided periods, shared room), teacher unavailability, closed periods, and an Advanced section (weights, attempts, seed). It starts from the last draft's `request`.
3. **Draft:** `POST /academics/scheduling/class-timetable/runs`. Shows the summary, `score.complete`, issues, unplaced classes with their reasons, and a section or teacher preview (`GET …/runs/:runId/sections/:sectionId`, `…/teachers/:teacherId`, the usual week grid with NEW/KEPT/PINNED/OTHER). Actions: Try another (new seed), Apply (confirm with `report.changes`; for an incomplete draft, "Apply anyway" sends `allowIncomplete`), Discard. 409 and 422 messages are shown as given.
- **Recent drafts:** `GET /academics/scheduling/runs?kind=CLASS_TIMETABLE`, with status and an "AI agent" badge for `origin: AGENT_TOOL`.

**Exam timetable (AC-13 dialog):** `POST /academics/scheduling/exam-timetable/runs` with the window, sittings (1–3), papers a day, free days between papers, alignment, spread, rest-day subjects and keep-scheduled. The draft is shown as days → sittings → subject → sections. Apply needs a complete draft; afterwards the papers and the calendar are refreshed.

### AC-08 · Attendance policy
**Route:** `/academics/attendance/policy` · **Type:** Setup · **Who:** every employee role reads (`academics.attendance.read`). Only ADMIN edits (`academics.attendance.managePolicy`). PRINCIPAL and TEACHER: read-only (useful to know the edit window and the mode).

**Data shown**
- `mode` in force today (DAILY, TWO_SESSIONS, PERIOD_WISE) and `scheduled` changes (`mode`, `effectiveFrom`)
- `editWindowDays` (registers lock this many days after their date), `overrideRoles` (who may change a locked register), `periodPresenceThreshold` (period-wise: % of periods for a present day), `lowAttendanceThreshold` (default 75) and `lowAttendanceMinDays` (default 10): the low-attendance alert (D-85)
- After a save: `change` (`mode`, `effectiveFrom`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Change edit window, override roles, thresholds, low-attendance alert | `academics.attendance.managePolicy` (ADMIN) | `PATCH /academics/attendance/policy` |
| Schedule a mode change | `academics.attendance.managePolicy` | `PATCH /academics/attendance/policy` `{ mode, modeEffectiveFrom }` |
| Cancel a scheduled change | `academics.attendance.managePolicy` | `PATCH /academics/attendance/policy` with the mode in force and the change's date |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/attendance/policy` | The form |

**Layout**
- Settings form, two groups.
- **Mode:** three radio cards with one line each ("One register a day", "Forenoon and afternoon; each is half a day", "One register per timetabled period"). "Starts on" date picker, minimum and default tomorrow. 422 for today or earlier. Below: the scheduled changes, each with a Cancel link. Confirm text: "From 2026-11-01 every class takes attendance by period. Registers already taken keep their meaning."
- **Rules:** `editWindowDays` (0–365), `overrideRoles` (ADMIN always ticked and locked, PRINCIPAL optional), `periodPresenceThreshold` (1–100%, shown when the current or a scheduled mode is PERIOD_WISE).
- Read-only for everyone but ADMIN.

---

### AC-08b · NEP 2020 policy
**Route:** `/academics/nep-policy` (Setup › Policy › NEP 2020) · **Type:** Setup · **Who:** every employee role reads (`academics.nepPolicy.read`). ADMIN and PRINCIPAL change it (`academics.nepPolicy.manage`). See D-82.

**Data shown**
- `holisticProgressCard`, `hpcStages`, `udiseExport`, `apaarExport`, `udiseCode`, `stages` (`stage`, `label`, `classes`), `updatedAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Opt into the Holistic Progress Card, pick stages | `academics.nepPolicy.manage` (ADMIN, PRINCIPAL) | `PATCH /academics/nep-policy` |
| Switch the UDISE+ / APAAR exports, set the UDISE code | `academics.nepPolicy.manage` | `PATCH /academics/nep-policy` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/nep-policy` | The form |

**Layout**
- Settings form, two cards, Save and Discard at the bottom with "Last changed …".
- **Holistic Progress Card:** a switch, then a checkbox per stage with its classes (disabled while the switch is off). "Pick at least one stage" under the list.
- **UDISE+ and APAAR:** UDISE code (digits only, 11), a switch per export. "Needed for the UDISE+ export" under the code while that switch is on without one. A note that PEN, APAAR id and consent date are entered on each student's profile.
- Read-only (disabled, with a note) for everyone but ADMIN and PRINCIPAL. What is switched on shows up as tabs in AC-15.

---

### AC-09 · Attendance register
**Route:** `/academics/attendance` · **Type:** Operations · **Who:** every employee role reads (`academics.attendance.read`). ADMIN, PRINCIPAL and TEACHER take registers (`academics.attendance.record`).
- TEACHER: only their sections. Daily and half-day registers only as class teacher or deputy. Period registers as the timetabled teacher or any teacher of the section (counted as a substitute). A teacher timetabled in a section without teaching a subject there sees only their own period.
- STAFF and the other employee roles: read-only, every section.
- ADMIN and PRINCIPAL: every section and register.

**Data shown**
- **Register tab** (one section, one day): `section`, `date`, `mode`, `taken`, `locked`, `editableUntil`, `lockOverride`
- Register strip: `registers` (`label`, `kind`, `periodNumber`, `subject`, `teacher.name`, `taken`, `takenAt`, `takenBy`, `substitute`, `free` with `reason`, `lockOverride`)
- Students: `rollNumber`, `firstName`, `lastName`, and either `status` and `remarks` (one register) or `marks` per register key (`FN`, `AN`, `P1` …) and the day `status` (whole day)
- **Summary tab** (date range): `workingDays`, `modes` (`mode`, `from`, `to`), `basis` (DAYS or PERIODS), `periodPresenceThreshold`, `averagePercentage`. Per student: `rollNumber`, name, `marked`, `unmarked`, `counts`, `attendedDays`, `dayPercentage`, `periods`, `subjects` (`name`, `held`, `attended`, `excused`, `percentage`, `daysAttended`), `percentage`
- **Student drawer:** the same totals, plus `days` (`date`, `status`, `attended`, `periods`, `breakdown` with `label`, `subject`, `status`, `remarks`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Take or retake a register | `academics.attendance.record` (ADMIN, PRINCIPAL, TEACHER, scoped as above) | `POST /academics/attendance` |
| Change a locked register (with `overrideReason`) | Roles in the policy's `overrideRoles` | `POST /academics/attendance` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/attendance/register?sectionId=&date=&kind=&periodNumber=` | The day (no `kind`) or one register |
| GET | `/academics/attendance/summary?sectionId=&from=&to=` | Summary tab |
| GET | `/academics/attendance/students/:studentId?from=&to=&academicYearId=` | Student drawer |
| GET | `/academics/calendar/working-days?from=&to=` | Disable closed days in the date picker |
| GET | `/academics/section-subjects?sectionId=` | Subject override for a period (`subjectId`) |
| GET | `/me/teaching/sections` | Teacher's section picker with `isClassTeacher`, `isDeputyClassTeacher` |
| GET | `/academics/sections` | Section picker for other roles |

**Layout**
- Grid editor. Top bar: section, date (max today, closed days disabled), and register chips from `registers` (Day / Forenoon / Afternoon / Period n with subject). Chip colours: taken, not taken, free (with reason), substitute.
- Open a register: a student list with one-tap status buttons (PRESENT, ABSENT, LATE, HALF_DAY, EXCUSED), "Mark all present", an optional remark per student, and Save. The save sends `sectionId`, `date`, `kind`, `periodNumber`, `subjectId?`, `remarks`, `records`. Toast from `message`. Show `summary.unmarked` when it is not 0.
- Whole-day view (no chip selected): read-only matrix, students × registers, plus the day status column.
- Lock: when `locked`, show "Locked after {editableUntil}". Users outside `overrideRoles` see it read-only. Override roles get a required "Reason for change" field (`overrideReason`).
- Period register with nothing timetabled, or a substitute teaching their own subject: a subject select appears.
- Errors shown as they are: 422 "On … the school takes attendance by period: record …", future date, closed day, students not enrolled. 403 "Only the class teacher of 6-A or its deputy can take its Forenoon register", "Only a teacher of 6-A can take its Period 2 register; otherwise mark the period free". 409 free period ("remove the free period first").
- Summary tab: date range (defaults to year start → today), table of students with percentage bars. Per-subject columns when `basis` is PERIODS. Row click opens the student drawer.
- Read-only roles see the same screens without Save.

---

### AC-10 · Cover and substitute
**Route:** `/academics/attendance/cover` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, TEACHER (`academics.attendance.record`). Marking periods free: `academics.attendance.manageFreePeriods`, as the section's class teacher or deputy, ADMIN or PRINCIPAL. The free periods list is readable by every employee role (`academics.attendance.read`). TEACHER: their own sections. ADMIN and PRINCIPAL: every section.

**Data shown**
- Step 1, sections: `date`, `mode`, `workingDay`, `sections` (`id`, `label`, `className`)
- Step 2, periods today: `section.label`, `periods` (`periodNumber`, `name`, `startTime`, `endTime`, `timetabled.subject`, `timetabled.teacher.name`, `taken`, `takenBy`, `substitute`, `subjectTaught`, `free` with `reason`, `markedBy`, `markedAt`), `subjects` for the subject picker
- Free periods tab: `section.label`, `date`, `periodNumber`, `label`, `reason`, `markedBy`, `markedAt`, `lockOverride`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Take a period's register (as substitute) | `academics.attendance.record` | `POST /academics/attendance` `{ kind: "PERIOD", periodNumber, subjectId? }` |
| Mark a period free | `academics.attendance.manageFreePeriods` (class teacher, deputy, ADMIN, PRINCIPAL) | `POST /academics/attendance/free-periods` |
| Remove a free period | `academics.attendance.manageFreePeriods` | `DELETE /academics/attendance/free-periods/:freePeriodId?overrideReason=` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/attendance/cover` | Step 1 |
| GET | `/academics/attendance/cover/:sectionId` | Step 2 |
| GET | `/academics/attendance/register?sectionId=&date=&kind=PERIOD&periodNumber=` | Step 3, the student list |
| GET | `/academics/attendance/free-periods?sectionId=&from=&to=&page=&limit=` | Free periods tab |
| GET | `/me/teaching/timetable` | "My classes today" shortcut (teacher) |
| GET | `/me/teaching/sections` | Show "Mark free" only where the teacher leads the section |

**Layout**
- Mobile-first, three steps: **section → period → student list**. Step 3 is the AC-09 register, opened on that period, with the subject pre-filled from the timetable and changeable.
- Period cards: Taken (by whom, "Substitute" badge), Free (reason, Remove), Not taken (buttons "Take register" and, for leads, "Mark free").
- Mark free dialog: `reason` (required, e.g. "Science teacher on leave"), plus `overrideReason` when the date is locked. Response 201, or 200 when it was already free (reason updated).
- Empty state when `mode` is not PERIOD_WISE: "Today attendance is taken daily (or by session). The class teacher, deputy or an administrator takes it." Banner when `workingDay` is false.
- Errors: 422 "Only sections of the current academic year can be covered". 409 "a period whose register was taken cannot be freed". 403 "Only the class teacher of 6-A, its deputy, ADMIN or PRINCIPAL can mark its periods free".
- Free periods tab: filters section (`sectionId`), `from`, `to`. Teachers see their sections' rows.

---

### AC-10b · Substitution planning
**Route:** none. An overlay opens from the home page highlight (SH-05). **Type:** Operations · **Who:** ADMIN plans (`academics.substitutions.plan`); PRINCIPAL reads (`academics.substitutions.read`); a TEACHER sees their own duties on the home page (`academics.substitutions.mine`).

**Data shown**
- Home highlight: `GET /academics/substitutions/summary`. Today's `needed` count in a warning banner, with `absentTeachers`. With today all planned and `next.needed > 0`, a quieter line for the next working day. With nothing to plan, nothing is shown. It refreshes every minute.
- Overlay: `GET /academics/substitutions?date=`, with day navigation (‹ ›, Today) and badges from `counts`. One card per absent teacher (name, code, "On leave" / "Absent" / "Half day · in at 10:00", remarks). Each card has one row per period: time, section, subject, room, a status badge, and what happens (substitute and subject, activity and teacher in charge, leisure). "Plans no longer needed" lists `noLongerNeeded`.
- Teacher home: the "Your substitutions" card, from `GET /academics/substitutions/mine` (shown only when there are duties).

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Plan or change a period (substitute, activity, leisure, teacher takes it) | `academics.substitutions.plan` | `GET …/candidates?date&timetableSlotId`, then `PUT /academics/substitutions` |
| Clear a plan, or remove one no longer needed | `academics.substitutions.plan` | `DELETE /academics/substitutions/:substitutionId` |

- The editor is inline under the row. A RadioGroup picks the kind. A searchable Select picks the teacher: unavailable teachers are disabled with the reason, and the best free one is preselected and marked "Suggested". The subject Select defaults to the timetabled subject. The activity Select is creatable. A note is optional.
- Past days and closed days are read-only. The messages of 409 (teacher busy) and 422 are shown as they are.

### AC-11 · Missing registers
**Route:** `/academics/attendance/missing-registers` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, TEACHER (`academics.attendance.readMissingRegisters`). TEACHER: only the registers they answer for. Sending another teacher's `teacherId` returns 403. ADMIN and PRINCIPAL: every section, with a teacher filter.

**Data shown**
- KPIs: `total`, `unassigned`, the range `from` – `to`
- By teacher (ADMIN, PRINCIPAL): `byTeacher` (`name`, `missing`), most missed first
- Rows: `registers` (`date`, `section.name`, `mode`, `kind`, `periodNumber`, `label`, `subject`, `responsible.name`, `responsibleAs`, `reason`)
- `freePeriods`: expected periods marked free (same fields plus `free`), shown apart

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Take the missing register now | `academics.attendance.record` (scoped, lock rules apply) | `POST /academics/attendance` (via AC-09) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/attendance/missing-registers?from=&to=&sectionId=&teacherId=` | Everything on the page (`from`, `to` required, at most 92 days, up to today) |

**Layout**
- Filters: date range (default the last 7 days), section, teacher (ADMIN and PRINCIPAL only).
- KPI tiles, then a ranked "By teacher" list (click filters by that teacher), then the table grouped by date. Columns: Date, Section, Register, Subject, Answerable, Why.
- Row action "Take now" opens AC-09 on that section, date and register. It is disabled with a tooltip when the register is past `editableUntil` and the user is not an override role.
- A collapsed "Marked free" block lists `freePeriods`.
- Teacher view: no teacher filter and no By teacher list. Title: "Registers you have not taken".

---

### AC-12 · Enrollments and promotion
**Route:** `/academics/enrollments` · **Type:** Operations · **Who:** every employee role reads (`academics.enrollments.read`, `academics.enrollments.readPolicy`). ADMIN, PRINCIPAL and STAFF enroll and edit (`academics.enrollments.create|update`). ADMIN and PRINCIPAL promote (`academics.enrollments.promote`), choose the roll-number rule (`academics.enrollments.managePolicy`) and renumber sections (`academics.enrollments.assignRollNumbers`). TEACHER: roster of their sections only, read-only.

**Data shown**
- Roster of a section: `rollNumber`, `student.studentCode`, `student.admissionNumber`, `student.user.firstName`, `student.user.lastName`, `status` (ACTIVE, LEFT), `admissionType` (NEW, PROMOTED, REPEAT), `section.sectionName`, `description`
- Bulk promotion result: `promoted`, `repeated`, `left`, `skipped` (`studentId`, `reason`), `enrollments`
- Roll-number rule: `rollNumberOrder` (`ALPHABETICAL` default: first, middle, last name, ignoring case and accents; `RESULT_RANK`: the previous year's published final result, best first, students without one after them alphabetically), `updatedAt`
- Renumbering result: `rule`, `academicYear`, `previousAcademicYear` (RESULT_RANK), `dryRun`, `totals { sections, students, changed }`, `sections[] { sectionId, sectionName, classId, students, changed, ranked?, unranked?, left, nextRollNumber, order? }`; `order[] { enrollmentId, studentId, name, admissionNumber, currentRollNumber, rollNumber, previousResult? { percentage, result, source } }` in a preview only

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Enroll an existing student in a section | `academics.enrollments.create` (ADMIN, PRINCIPAL, STAFF) | `POST /academics/enrollments` |
| Edit: move section (same year), roll number, mark left, admission type | `academics.enrollments.update` | `PATCH /academics/enrollments/:enrollmentId` |
| Promote one student | `academics.enrollments.promote` (ADMIN, PRINCIPAL) | `POST /academics/enrollments/promotions` |
| Promote a whole section, with per-student overrides | `academics.enrollments.promote` | `POST /academics/enrollments/promotions/bulk` |
| Choose the roll-number rule | `academics.enrollments.managePolicy` (ADMIN, PRINCIPAL) | `PATCH /academics/enrollments/policy` `{ rollNumberOrder }` |
| Preview renumbering (section, class or whole year) | `academics.enrollments.assignRollNumbers` (ADMIN, PRINCIPAL) | `POST /academics/enrollments/roll-number-assignments` `{ sectionId | classId | all: true, dryRun: true }` → 200 |
| Renumber | `academics.enrollments.assignRollNumbers` | the same without `dryRun` → 200 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/enrollments?sectionId=&page=&limit=` | Roster (`sectionId` required; teacher outside it: 403) |
| GET | `/academics/enrollments/policy` | The roll-number rule (every employee) |
| PATCH | `/academics/enrollments/policy` | Change the rule (ADMIN, PRINCIPAL) |
| POST | `/academics/enrollments/roll-number-assignments` | Renumber, or preview with `dryRun: true`; year from `X-Academic-Year-Id` |
| GET | `/academics/sections` | Source section picker; with `X-Academic-Year-Id: <next year>` for target sections |
| GET | `/academics/academic-years` | Target year picker |
| GET | `/users/students` | Student search for "Enroll" (People module) |

**Layout**
- Section picker, then the roster table. Columns: Roll, Code, Name, Admission no., Type, Status. Filter: section. Row click opens a drawer with the edit form.
- "Mark as left" (PATCH `status: LEFT`) needs a confirm: it ends the student's transport seat and hostel bed (the leaving event frees them).
- **Bulk promotion wizard** (ADMIN, PRINCIPAL):
  1. Source section (selected year), target year, default target section.
  2. One row per active student: action PROMOTE (default), REPEAT or LEAVE, and an optional target section (required for REPEAT).
  3. Review the counts.
  4. Submit. The result screen lists promoted, repeated, left and skipped (with reason, e.g. "Already enrolled in the target academic year").
- Single promotion: a dialog from a roster row (`toAcademicYearId`, `toSectionId`, `admissionType`, default PROMOTED).
- **Roll numbers** (ADMIN, PRINCIPAL):
  - A "Roll-number rule" card (settings area of the page): radio Alphabetical / By last year's result, saved with PATCH; the message reads "Roll numbers will be assigned alphabetically". Changing it renumbers nobody.
  - "Renumber roll numbers" on the roster (this section), on a class (AC-02) or for the whole year: first call with `dryRun: true` and show a confirm dialog listing the new order (current → new roll number; under RESULT_RANK the previous percentage, "No result" for the rest, and the year it came from), with "N roll numbers will change". Confirm sends the same body without `dryRun`; the toast is the response message.
  - Explain on the card: new admissions and transfers get the next number at the end of the section until the section is renumbered; bulk promotion numbers a new section by the rule; students who left are numbered after the current ones.
  - Errors: 409 archived year (previews too), 422 "The section does not belong to academic year …" / "The class has no sections in academic year …", 400 when not exactly one of section, class or whole year.
- Errors: 409 "The student is already enrolled in this academic year", "This roll number is already taken in the section", "already been promoted". 422 "Students must be promoted into a different academic year", "N override(s) name students who are not active in the section".
- Teacher view: roster only, no buttons.

**Notes / Gap:**
- **Gap:** no year-end overview of students still active in the old year across all sections. Archiving (AC-01) only reports a count. Admins must check section by section.

---

### AC-13 · Exams and papers
**Route:** `/academics/exams` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, STAFF and TEACHER read (`academics.exams.read`). ADMIN and PRINCIPAL create and edit exams (`academics.exams.create|update`) and papers (`academics.exams.managePapers`). TEACHER: sees every exam, but only the papers of their sections. Read-only.

**Data shown**
- Exams list: `examName`, `examType` (INTERNAL, FINAL), `startDate`, `endDate`, `gradeScaleId` (scale name), `resultsPublishedAt`, `description`
- Exam detail, Papers tab: `displayCode`, `section.sectionName`, `subject.subjectName`, `subject.subjectCode`, `component`, `gradingType` (MARKS, GRADE), `examDate`, `startTime`, `endTime`, `room`, `maxMarks`, `passMarks`
- Date sheet tab: the same papers laid out by `examDate` per section

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create an exam | `academics.exams.create` (ADMIN, PRINCIPAL) | `POST /academics/exams` |
| Create several exams | `academics.exams.create` | `POST /academics/exams/bulk` |
| Edit an exam | `academics.exams.update` | `PATCH /academics/exams/:examId` |
| Remove an exam (and its papers) | `academics.exams.remove` (ADMIN, PRINCIPAL) | `DELETE /academics/exams/:examId` |
| Add a paper | `academics.exams.managePapers` | `POST /academics/exams/:examId/papers` |
| Edit a paper (date, time, room, marks) | `academics.exams.managePapers` | `PATCH /academics/exams/:examId/papers/:paperId` |
| Delete a paper | `academics.exams.managePapers` | `DELETE /academics/exams/:examId/papers/:paperId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/exams?page=&limit=` | Exams of the selected year |
| GET | `/academics/exams/:examId` | Detail header |
| GET | `/academics/exams/:examId/papers?sectionId=&page=&limit=` | Papers tab (teacher: their sections only) |
| GET | `/academics/grade-scales` | Grade scale picker |
| GET | `/academics/section-subjects?sectionId=` | Subject choices when adding a paper |

**Layout**
- List + detail page. Exam header: name, type, dates, a "Results published" badge (link to AC-15), Edit.
- Papers tab: grouped by section, filter section (`sectionId`). Add paper form: section, subject, `gradingType` toggle (GRADE hides max and pass marks), `component` (THEORY, PRACTICAL, INTERNAL, PROJECT, ORAL), `examDate`, `startTime`, `endTime`, `room`, `maxMarks`, `passMarks`. When editing, section, subject, grading type and component are fixed.
- Errors: 409 "The section already sits Science (…) on … from … to …", "This exam already has a theory paper for Maths in the section". 422 "every component must be graded the same way", "maxMarks cannot be below the highest recorded mark (…)". 409 on delete: "This paper already has recorded marks and cannot be removed". 409 on removing an exam: "… has published results. Withdraw them before removing the exam.", "… already has recorded marks and cannot be removed", "… is part of <scheme>. Take it out of the scheme before removing the exam."
- Teacher view: no buttons. Papers limited to their sections, with links to AC-14 for papers they mark.

**Notes / Gap:**
- **Gap:** no bulk endpoint for papers. "Add this paper to every section of Class 6" must send one request per section.

---

### AC-14 · Marks entry
**Route:** `/academics/marks` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, TEACHER (`academics.marks.record`, `academics.marks.read`). STAFF has no access. TEACHER: only the subjects they teach in their sections. A class teacher can mark every subject of their section. A deputy can mark only the subjects they are assigned.

**Data shown**
- Paper header: `displayCode`, `subject`, `component`, `gradingType`, `maxMarks`, `passMarks`, `examDate`
- Grid rows (from the section roster): `rollNumber`, name, and per student `marksObtained` (or `grade` for a GRADE paper), `isAbsent`, `absenceReason` (ABSENT, MEDICAL, EXEMPT), `remarks`
- Student view: that student's marks in an exam: `examPaper.displayCode`, `examPaper.subject`, `examPaper.maxMarks`, `marksObtained`, `grade`, `gradeIsManual`, `isAbsent`, `absenceReason`, `remarks`, `evaluatedAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Save the grid (up to 500 entries, all-or-nothing) | `academics.marks.record` (ADMIN, PRINCIPAL, TEACHER, scoped) | `POST /academics/marks/bulk` |
| Save one cell | `academics.marks.record` | `POST /academics/marks` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/exams` | Exam picker |
| GET | `/academics/exams/:examId/papers?sectionId=` | Paper picker |
| GET | `/me/teaching/sections` | Teacher: which sections and `subjectIds` they may mark |
| GET | `/academics/enrollments?sectionId=&limit=100` | Grid rows |
| GET | `/academics/marks?studentId=&examId=` | Student view (and existing marks, one student at a time) |
| GET | `/academics/report-cards/sections/:sectionId?examId=` | Pre-fill existing marks (class teacher, ADMIN, PRINCIPAL only) |
| GET | `/academics/result-policies/resolution?examId=&sectionId=` | Which scale grades a GRADE paper (`coScholasticScaleId`) |
| GET | `/academics/grade-scales/:gradeScaleId` | Grade dropdown values |

**Layout**
- Pickers: exam → section → paper. For teachers, papers are filtered to their subjects using `subjectIds`.
- Grid editor with keyboard entry (Enter moves down). Columns: Roll, Name, Marks (out of `maxMarks`) or Grade, Absent with a reason select, Remarks. Client checks: marks ≤ `maxMarks`; GRADE papers take a grade, never marks.
- Save sends `{ marks: [{ studentId, examPaperId, marksObtained | grade, isAbsent, absenceReason, remarks }] }`. The response has `created` and `updated` counts. A 422 names the row ("marks[3]: marksObtained cannot exceed the paper's maximum of 80"). Highlight that row.
- If the exam has `resultsPublishedAt`, show a banner: "Results are published. Changes reach families only after a new version is published (AC-15)."
- Student view: from a roster row, the student's marks for the exam.

**Notes / Gap:**
- **Gap:** no way to load the marks already entered for a paper or section. `GET /academics/marks` needs `studentId`, and the section result sheet is for class teachers only. A subject teacher cannot pre-fill the grid without one call per student. Needed: `GET /academics/marks?examPaperId=` (or `?examId=&sectionId=`), scoped like recording.
- **Gap:** no progress view (papers with all marks entered) for the exam.

---

### AC-14b · Teacher assessments
**Route:** `/academics/assessments` (in Exams & results), one item at `/academics/assessments/:assessmentId` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL and TEACHER (`academics.assessments.read`, `academics.assessments.manage`). Teachers see and change only the subjects they teach (a class teacher: every subject of the section).

**Purpose:** teachers' own tests, assignments, projects and homework, counted in a scheme bucket set by an admin (AC-06, D-77).

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/assessments/buckets` | The year's buckets (`locked` once the scheme is published) |
| GET | `/academics/assessments?sectionId=&subjectId=&bucketId=` | The list |
| POST / PATCH / DELETE | `/academics/assessments[/:assessmentId]` | Add, edit, switch `counts`, remove (homework items: only `bucketId` and `counts`) |
| GET / POST | `/academics/assessments/:assessmentId/marks` | The section's students with their entries; save entries |
| POST / PATCH | `/academics/homework` with `bucketId` | Homework that counts ("Counts toward") |

**Layout**
- List: item, type, "Not counted", section, subject, bucket (weight, scheme, published), out of, entries. Filters: section, subject, bucket.
- Drawer: bucket, section, subject, type (radio), title, out of, date, notes, "Counts toward the final result".
- Item page: details and a grid (Roll, Student, Marks, Status, Remarks, %). Status: Marked, Absent (0%), Exempt, Medical (left out). Homework rows show the graded marks; only a status can be set. Locked once the scheme's results are published.
- Scheme results (AC-15) show each bucket as one more column next to the exams.

---

### AC-15 · Report cards and result publishing
**Route:** `/academics/results` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, STAFF and TEACHER read (`academics.reportCards.read`, `academics.resultPublications.read`, `academics.assessmentSchemes.read`). ADMIN and PRINCIPAL preview (`academics.reportCards.preview`, `academics.assessmentSchemes.preview`) and publish (`academics.resultPublications.publish`, `academics.assessmentSchemes.publish`).
- TEACHER: only as **class teacher** of the section, not as deputy. That covers the class sheet, student report cards, PDFs, snapshots, scheme results and the change comparison. No preview, publish, withdraw or integrity check.
- STAFF: read everything, no actions.

**Data shown**
- Source switcher: **Exam** or **Assessment scheme** (term or annual result)
- **Class sheet:** `exam` (`examName`, `examType`, `resultsPublishedAt`), `section.name`, `policy` (name, `source`), `gradeScale`, `display` flags, `papers` (`displayCode`, `subject`, `component`, `maxMarks`, `passMarks`). Per student: `rollNumber`, `firstName`, `lastName`, `admissionNumber`, `enrollmentStatus`, `totalObtained`, `percentage`, `grade`, `gpa`, `result` (PASS, FAIL, COMPARTMENT, INCOMPLETE), `failedSubjects`, `compartmentSubjects`, `rank`, `classRank`, `subjects` lines. `statistics` (`students`, `appeared`, `passed`, `compartment`, `failed`, `incomplete`, `passPercentage`, `averagePercentage`, `highestPercentage`, `averageGpa`, per subject). Scheme sheets add `cgpa` and a per-exam breakdown in `subjects[].exams`
- **Student report card:** `student` (`rollNumber`, `section`), `reports` per exam (or one scheme result)
- **Publication:** versions (`version`, `publishedAt`, `publishedBy`, `reportCount`, `changedCount`, `supersededAt`, `withdrawnAt`, `status`: CURRENT, SUPERSEDED, WITHDRAWN). Integrity of a version: `expected`, `verified`, `intact`, `tampered`, `missing`, `unexpected`
- **Changes since publishing:** `publication`, `summary` (`students`, `unchanged`, `changed`, `notPublished`, `noLongerListed`), `students` (`status`, `changes`: `field`, `published`, `live`)
- **Preview rules:** `policy`, `summary` (`students`, `changed`, `resultChanged`, `current`, `preview`), `changes` (student, `section`, `current`, `preview`), `sections`
- **Snapshots:** published report cards with `version`, `publishedAt`, `integrity` (VERIFIED, TAMPERED), `publicationStatus`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Publish exam results (version 1, notifies families) | `academics.resultPublications.publish` (ADMIN, PRINCIPAL) | `POST /academics/exams/:examId/result-publication` |
| Publish a corrected version | `academics.resultPublications.publish` | `POST /academics/exams/:examId/result-publication/versions` |
| Withdraw from the portal | `academics.resultPublications.publish` | `DELETE /academics/exams/:examId/result-publication` |
| Check a version's integrity | `academics.resultPublications.publish` | `GET /academics/exams/:examId/result-publication/versions/:version/integrity` |
| Preview a policy on an exam | `academics.reportCards.preview` (ADMIN, PRINCIPAL) | `POST /academics/report-cards/previews` |
| Publish scheme results | `academics.assessmentSchemes.publish` | `POST /academics/assessment-schemes/:schemeId/result-publication` |
| Publish a corrected scheme version | `academics.assessmentSchemes.publish` | `POST /academics/assessment-schemes/:schemeId/result-publication/versions` |
| Withdraw scheme results | `academics.assessmentSchemes.publish` | `DELETE /academics/assessment-schemes/:schemeId/result-publication` |
| Check a scheme version's integrity | `academics.assessmentSchemes.publish` | `GET /academics/assessment-schemes/:schemeId/result-publication/versions/:version/integrity` |
| Preview a policy on a scheme | `academics.assessmentSchemes.preview` | `POST /academics/assessment-schemes/:schemeId/previews` |
| Download a live report card PDF | `academics.reportCards.read` (teacher: class teacher) | `GET /academics/report-cards/students/:studentId/pdf?examId=` |
| Download a published snapshot PDF | `academics.reportCards.read` | `GET /academics/report-cards/snapshots/:snapshotId/pdf` |
| Download a scheme result PDF | `academics.assessmentSchemes.read` | `GET /academics/assessment-schemes/:schemeId/students/:studentId/pdf` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/report-cards/sections/:sectionId?examId=` | Class sheet (exam) |
| GET | `/academics/report-cards/students/:studentId?examId=&academicYearId=` | Student report card (one exam, or every exam of the year) |
| GET | `/academics/exams/:examId/result-publication/versions?page=&limit=` | Versions table |
| GET | `/academics/exams/:examId/result-publication/comparison?sectionId=&version=` | Changes since publishing |
| GET | `/academics/report-cards/snapshots?examId=&schemeId=&studentId=&sectionId=&version=&page=&limit=` | Snapshot browser |
| GET | `/academics/report-cards/snapshots/:snapshotId` | One published report card |
| GET | `/academics/assessment-schemes/:schemeId/results?sectionId=` | Class sheet (scheme) |
| GET | `/academics/assessment-schemes/:schemeId/students/:studentId` | Student scheme result |
| GET | `/academics/assessment-schemes/:schemeId/result-publication/versions?page=&limit=` | Scheme versions |
| GET | `/academics/assessment-schemes/:schemeId/result-publication/comparison?sectionId=&version=` | Scheme changes since publishing |
| GET | `/academics/exams`, `/academics/assessment-schemes` | Source pickers |

**Layout**
- Header: source switcher, exam or scheme picker, section picker (teacher: only sections they are class teacher of). Status badge: Not published / Published v2 / Withdrawn.
- Tabs:
  - **Class sheet:** KPI tiles from `statistics`, then a wide table (Roll, Name, a column per paper, Total, %, Grade/GPA, Result, Rank). Columns follow the `display` flags (no marks columns for PASS_FAIL). Result coloured. Row click opens the Student tab.
  - **Student:** report card layout with a PDF button.
  - **Publication** (ADMIN, PRINCIPAL): status card with Publish, New version and Withdraw, a versions table, and "Check integrity" per version (red alert when `intact` is false).
  - **Changes since publishing:** summary tiles, then a table filtered by `status`. Expand a row to see field changes (published → live).
  - **Preview rules** (ADMIN, PRINCIPAL): pick a saved policy (`policyId`) or edit settings inline (`policy`), optional section. Shows the summary and a change table. Nothing is saved.
  - **Snapshots:** list with filters (student, section, version). Opens the snapshot or its PDF.
  - **Holistic progress** (only when the NEP policy has `holisticProgressCard`; exams only; `academics.holisticProgress.read`): `GET /academics/holistic-progress/exams/:examId/sections/:sectionId`. Tiles (stage and its levels, complete n/N, started), then a table (Roll, Student, Subjects assessed n/N, Reflections, Status: Complete / In progress / Not started). A row opens a wide drawer (`?card=<studentId>`): Part A (details, attendance, interests), Part B (one block per subject: a three-level segmented control for each ability and for self and peer assessment, clicking the chosen level clears it; a note), Part C (four text boxes), the exam's result read-only. Footer: PDF (disabled while there are unsaved changes), Save and next / Next student, Save (`PUT …/students/:studentId`, ADMIN, PRINCIPAL, TEACHER). A 409 (class's stage not covered) shows as an empty state with the message.
  - **UDISE+ / APAAR** (only when `udiseExport` or `apaarExport`; `reports.governmentExports.read`: ADMIN, PRINCIPAL, STAFF; needs no exam): `GET /reports/government-exports/readiness?sectionId=`. Tiles (students; ready for UDISE+; APAAR ids generated, consented, awaiting consent), format radio (Excel, CSV), buttons UDISE+ student profile (checkbox "Include the result of <exam>" when an exam is picked), APAAR: all students, APAAR: ids still to generate. A table of students with gaps links to their profiles.
- Confirms: Publish ("Students and parents of N sections are notified once and see these results"), New version, Withdraw ("Results disappear from the portal; staff keep every version").
- Errors: 409 "Results for … are already published. To publish changes, add a new version." (offer the New version button), 409 "are not published. Publish them first.", 409 on a tampered snapshot. 422 "The exam and the section are in different academic years", "The section sits none of the exams in …".

**Notes / Gap:**
- Merged with scheme results: exam and scheme results have the same set of endpoints (sheet, preview, publication, versions, comparison, integrity, PDF), so one page with a source switcher.

---

### AC-16 · Homework
**Route:** `/academics/homework` · **Type:** Operations · **Who:** every employee role reads (`academics.homework.read`). ADMIN, PRINCIPAL and TEACHER create and edit (`academics.homework.manage`) and grade (`academics.homework.grade`). TEACHER: only their subjects in their sections (class teacher: every subject of their section). Lists show only their sections. Other employee roles: read-only.

**Data shown**
- List: `title`, `subject.subjectName`, `sectionId` (shown as section name), `assignedOn`, `dueDate`, `maxMarks`, `allowLateSubmission`, `submissions` (`submitted`, `graded`)
- Detail: the same plus `description` and `attachments`
- Submissions: `homework` (`title`, `dueDate`, `maxMarks`). Per student: `rollNumber`, `firstName`, `lastName`, `status` (NOT_SUBMITTED, SUBMITTED, LATE, GRADED, RETURNED), `submission` (`content`, `submittedAt`, `isLate`, `marksAwarded`, `feedback`, `gradedAt`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Set homework | `academics.homework.manage` (ADMIN, PRINCIPAL, TEACHER, scoped) | `POST /academics/homework` |
| Edit title, description, due date, marks, late rule | `academics.homework.manage` | `PATCH /academics/homework/:homeworkId` |
| Delete (only before any submission) | `academics.homework.manage` | `DELETE /academics/homework/:homeworkId` |
| Attach a file (multipart `file`) | `academics.homework.manage` | `POST /academics/homework/:homeworkId/attachments` |
| Remove an attachment | `academics.homework.manage` | `DELETE /academics/homework/:homeworkId/attachments/:fileId` |
| Download an attachment | `academics.homework.read` | `GET /academics/homework/:homeworkId/attachments/:fileId/download-url` |
| Grade or return a submission | `academics.homework.grade` | `POST /academics/homework/:homeworkId/submissions/:submissionId/grading` |
| Download a student's file | `academics.homework.read` | `GET /academics/homework/:homeworkId/submissions/:submissionId/attachments/:fileId/download-url` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/homework?sectionId=&subjectId=&from=&to=&page=&limit=` | List (`from`, `to` filter on due date) |
| GET | `/academics/homework/:homeworkId` | Detail with attachments |
| GET | `/academics/homework/:homeworkId/submissions` | Submissions tab |
| GET | `/me/teaching/sections` | Teacher's section and subject pickers |
| GET | `/academics/section-subjects?sectionId=` | Subject picker for other roles |

**Layout**
- List + detail page. Filters: section, subject, due from–to. Columns: Title, Section, Subject, Due, Submitted / Graded, Late allowed.
- Create form: section, subject, `title`, `description`, `dueDate` (not in the past), `maxMarks` (optional; without it the work gets feedback only), `allowLateSubmission`. Attachments are uploaded after the first save.
- Detail tabs: **Details** (attachments with download and remove) and **Submissions** (table by status, filter chips). Row click opens the review drawer: content, files, marks (≤ `maxMarks`), feedback, and the buttons "Grade" (`status: GRADED`) and "Return for resubmission" (`status: RETURNED`).
- Errors: 409 on delete "Students have already submitted this homework; it cannot be deleted". 422 "This homework is not marked; send feedback only", "marksAwarded cannot exceed …". 409 for an archived year.
- Read-only roles see the list, detail and submissions without buttons.

**Notes / Gap:**
- **Gap:** `GET …/submissions` does not return each submission's attachment ids, so staff cannot call the submission `download-url`. The portal's homework detail already lists them. The staff list should include `attachments` per submission.

---

### AC-17 · Academics activity
**Route:** `/academics/activity` · **Type:** Shared · **Who:** ADMIN (`academics.activity.read`). Uses the shared Module activity component with `GET /academics/activity` and `GET /academics/activity/:auditLogId`.

### AC-19 · Certificates
**Route:** `/academics/certificates` (`?tab=formats&format=TRANSFER` opens a format) · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, STAFF read and issue (`academics.certificates.read`, `.issue`); ADMIN, PRINCIPAL cancel (`.cancel`) and edit formats (`academics.certificateFormats.manage`; STAFF read them).

**Issued certificates** (tab): bonafide, character and transfer certificates, newest first, with search (student name, admission number, certificate number) and filters (type, status). A row opens the certificate as it prints, its details and what was entered, **Open PDF**, **Download PDF** and **Cancel certificate…** (a reason; it stays listed and prints with CANCELLED across it). **Generate certificate**: pick the type (radios) and the student; the inputs come prefilled from `GET …/draft` (today, the type's defaults, a TC's working days and days present); the certificate previews live; a TC can mark the student as left (on by default while they are enrolled). A TC already in force blocks another until it is cancelled.

**Formats** (tab): one per type, HTML + CSS edited side by side with a live preview (sample details, or a chosen student's). **Insert a field** puts a `{{placeholder}}` at the cursor; unknown placeholders and unclosed `{{#if}}` are reported over the preview. **Save as version N** asks what changed; a save made by someone else meanwhile is refused (409). **Versions** lists every version: open one in the editor, or restore it (saved again as the next version). **Preview PDF** prints the unsaved format.

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/certificates/types` | Types, their inputs and placeholders |
| GET | `/academics/certificates?type=&status=&search=&page=&limit=` | The list |
| GET | `/academics/certificates/draft?type=&studentId=` | The inputs' starting values, earlier certificates, `blocked` |
| POST | `/academics/certificates/preview` | Live preview `{ html }` |
| POST | `/academics/certificates` | Issue `{ type, studentId, inputs, markLeft }` |
| GET | `/academics/certificates/:id/document`, `/:id/pdf` | As issued (HTML, PDF) |
| POST | `/academics/certificates/:id/cancel` | `{ reason }` |
| GET | `/academics/certificate-formats`, `/:type`, `/:type/versions`, `/:type/versions/:version` | Formats and versions |
| POST | `/academics/certificate-formats/:type/versions` | Save `{ name, html, css, note, baseVersion }` |
| POST | `/academics/certificate-formats/:type/versions/:version/restore` | Restore |
| POST | `/academics/certificate-formats/:type/preview`, `/preview/pdf` | Preview an unsaved format |

### AC-20 · Daily diary
**Route:** `/academics/diary?sectionId=&date=` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, TEACHER read (`academics.diary.read`) and write (`academics.diary.write`). TEACHER: sections they teach. A subject teacher writes lines for their subjects; the class teacher reaches every subject, and the class teacher or deputy also writes lines without a subject. Only the author, PRINCIPAL or ADMIN edits or removes a line (`canEdit`). See D-86.

**Data shown**
- Day: `entries[]` (`kind` CLASSWORK, HOMEWORK, REMINDER or NOTE; `subject`, `student` for a note to one family, `body`, `writer`, `canEdit`), `homework[]` (online homework set that day: `title`, `subject`, `dueDate`), `signatures { students, signed, notes }`
- Signatures: per student `rollNumber`, names, `signature` (`signedAt`, `signer`, `parentNote`) or null, `changedSinceSigned`
- Week strip: per day `entries`, `signed`

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/diary/sections/:sectionId/day?date=` | The day |
| GET | `/academics/diary/sections/:sectionId/signatures?date=` | Who signed, parents' notes |
| GET | `/academics/diary/sections/:sectionId/days?from=&to=` | The week strip (at most 92 days) |
| POST | `/academics/diary/entries` | Write `{ sectionId, entryDate, kind, subjectId?, studentId?, body }` |
| PATCH | `/academics/diary/entries/:entryId` | `{ kind, subjectId (null clears), body }` |
| DELETE | `/academics/diary/entries/:entryId` | Remove |

**Layout**
- Section picker, ‹ date › with Today (inside the year, never past today), and a Mon–Sun strip with lines and signatures per day.
- Left: the day, grouped like a printed diary: For everyone, then each subject, then online homework (links to AC-16), then notes to one family. A line opens the drawer: editable for its author, PRINCIPAL and ADMIN, otherwise read-only.
- Right: "Signed by parents" n of N, tabs All / Not signed / With a note; "Signed before a change" when a line changed after the signature.
- Drawer: kind (radios), subject (required for classwork and homework, and always for a subject teacher), for a note: every family or one student (the section's roster), the line. Errors: 403 "Only the class teacher or the deputy can write a line without a subject…", 422 "The diary can't be written for a day that hasn't come yet".

---

## Finance

Finance runs school fees from setup to the books. Accountants and administrators set up what the school charges: fee heads, the year's installment plans, fee structures per class, late-fee rules and concessions. Then they bill students, take payments at the counter (cash, cheque, UPI, card, bank transfer, or a gateway checkout), handle student credit and refunds, and read the double-entry general ledger. Office staff (`STAFF`) can read most of it and collect payments. The principal reads it, including the ledger. Only an administrator holds the Razorpay keys, the refund approval limit and refund approvals. Pages FI-01 to FI-06 are **Setup** (done once a year or rarely). FI-07 to FI-13 are **Operations** (daily work). Year-scoped pages (installment plans, plan assignments, fee structures, invoices) use the shared academic-year picker, which sends `X-Academic-Year-Id` (default: the current year). Families pay online from the portal (`/me`), which is covered in the portal section.

---

### FI-01 · Fee heads
**Route:** `/finance/fee-heads` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.feeHeads.read`); ADMIN, ACCOUNTANT edit (`finance.feeHeads.manage`)

**Data shown**
- Fee heads: `name`, `code` (upper case, 2–20 characters), `description`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a fee head | `finance.feeHeads.manage` | `POST /finance/fee-heads` |
| Edit name, code or description | `finance.feeHeads.manage` | `PATCH /finance/fee-heads/:feeHeadId` |
| Remove a fee head | `finance.feeHeads.manage` | `DELETE /finance/fee-heads/:feeHeadId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/fee-heads?page=&limit=` | Table rows (paginated) |
| GET | `/finance/fee-heads/:feeHeadId` | Edit drawer prefill |
| POST | `/finance/fee-heads` | Create (`name`, `code`, `description`) |
| PATCH | `/finance/fee-heads/:feeHeadId` | Update |
| DELETE | `/finance/fee-heads/:feeHeadId` | Soft delete |

**Layout**
- A simple table with columns Name, Code and Description, plus row actions. Add and edit open in a side drawer.
- Users with `read` only see the table with no buttons.
- Empty state: "Add fee heads such as Tuition, Transport, Exam".
- 409 when the code or name is already used: show the message on the field.
- Ask for confirmation before removing.

**Notes**
- The server lets you remove a fee head that fee structures still use. Warn about this in the confirmation dialog.
- Each fee head gets its own income account (41xx) in the ledger the first time it is posted to (FI-13).

---

### FI-02 · Installment plans and plan assignments
**Route:** `/finance/installment-plans` (tab **Plans**), `/finance/plan-assignments` (tab **Student plans**) · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.installmentPlans.read`); ADMIN, ACCOUNTANT edit plans (`finance.installmentPlans.manage`) and assign them (`finance.installmentPlans.assign`)

**Data shown**
- **Plans tab** (the selected year): `name`, `description`, `installmentCount`, and `installments[]` (`name`, `dueDate`, `sharePercent`, `sequence`).
- **Student plans tab:** students with an assigned plan. Each row shows `student` (`studentCode`, `admissionNumber`, `user.firstName`, `user.lastName`), `plan` (`id`, `name`), `assignedBy` and `updatedAt`. Students who are not listed pay each fee structure's default plan.
- **Assign result:** `changed`, `invoicesCancelled[]`, `invoicesIssued[]`, `installmentPlan`, and either `studentName` (single) or `students` with `scope` (bulk).

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a plan | `finance.installmentPlans.manage` | `POST /finance/installment-plans` |
| Edit a plan | `finance.installmentPlans.manage` | `PATCH /finance/installment-plans/:installmentPlanId` |
| Remove a plan | `finance.installmentPlans.manage` | `DELETE /finance/installment-plans/:installmentPlanId` |
| Assign a plan to one student (or `installmentPlanId: null` to go back to the default) | `finance.installmentPlans.assign` | `POST /finance/plan-assignments` |
| Assign a plan to a section, a class or a list of students | `finance.installmentPlans.assign` | `POST /finance/plan-assignments/bulk` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/installment-plans?page=&limit=` | Plans of the year (with installments) |
| GET | `/finance/installment-plans/:installmentPlanId` | Plan drawer |
| POST | `/finance/installment-plans` | Create (`name`, `description`, `installments[{ name, dueDate, sharePercent }]`) |
| PATCH | `/finance/installment-plans/:installmentPlanId` | Update |
| DELETE | `/finance/installment-plans/:installmentPlanId` | Soft delete |
| GET | `/finance/plan-assignments?installmentPlanId=&studentId=` | Student plans table (paginated) |
| POST | `/finance/plan-assignments` | `{ studentId, installmentPlanId }` |
| POST | `/finance/plan-assignments/bulk` | `{ installmentPlanId, sectionId \| classId \| studentIds[] }` (send exactly one scope) |
| GET | `/academics/classes`, `/academics/sections`, `/academics/enrollments?sectionId=` | Pickers for the bulk scope and for students (academics) |

**Layout**
- **Plans tab:** cards, one per plan, each with the plan name, the number of installments and a small timeline of due dates and shares. Create and edit use a drawer with a repeatable installment grid (Name, Due date, Share %), up to 24 rows. A running total must reach 100% before saving. The page can check that shares add up to 100% and that dates ascend, but the server is the authority (422 messages such as "Installment shares must add up to 100% (they add up to 90%)" or "Term 2 must be due after Term 1").
- Once invoices exist under a plan, its installments are locked (409). Show the installment grid read-only and keep name and description editable.
- **Remove:** 409 when a fee structure offers the plan or students are assigned to it. Show the server message, which names the structures or the number of students.
- **Student plans tab:** a table with columns Student, Admission no., Plan, Assigned by and Updated, filtered by plan (`installmentPlanId`). The **Assign plan** button opens a dialog. Step 1: choose the scope (one student, a section, a class, or several students). Step 2: choose a plan, or "Structure default" (`null`). Step 3: confirm. After saving, show `changed` and the counts of cancelled and re-issued invoices.
- Errors to show: 409 when the student has already paid towards the year's invoices (a plan can no longer change); 422 "The Quarterly plan is not offered by any fee structure of Class 5"; 422 when a student is not active in the year.
- The dialog warns before confirming: "Unpaid invoices under the old plan will be cancelled and re-issued".

**Notes**
- Plan assignment lives here because it is a Setup step done per class at the start of the year. A one-student change is also available from the student account (FI-11).
- **Gap:** there is no student search by name or admission number (`GET /users/students` takes only `page` and `limit`). Students are picked by class, then section, then roster.

---

### FI-03 · Fee structures
**Route:** `/finance/fee-structures`, `/finance/fee-structures/:feeStructureId` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.feeStructures.read`); ADMIN, ACCOUNTANT edit (`finance.feeStructures.manage`)

**Data shown**
- List (the selected year): `name`, `class.className` (empty means every class), `totalAmount` (annual), the offered plans with the default marked, `chargesLateFee` and `lateFeeRule.name` (empty means the school default).
- Detail: `description`, `items[]` (`feeHead.name`, `feeHead.code`, `amount`, annual), `installmentPlans[]` (each `name` with `installments[]`, and `isDefault`), `defaultInstallmentPlanId`, `lateFeeRuleId`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a structure | `finance.feeStructures.manage` | `POST /finance/fee-structures` |
| Edit a structure | `finance.feeStructures.manage` | `PATCH /finance/fee-structures/:feeStructureId` |
| Remove a structure | `finance.feeStructures.manage` | `DELETE /finance/fee-structures/:feeStructureId` |
| Generate invoices from this structure | `finance.invoices.issue` | Opens the FI-07 wizard with `feeStructureId` set |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/fee-structures?classId=&page=&limit=` | Table rows |
| GET | `/finance/fee-structures/:feeStructureId` | Detail page |
| POST | `/finance/fee-structures` | `{ name, classId?, description, items[{ feeHeadId, amount }], installmentPlanIds[], defaultInstallmentPlanId, chargesLateFee, lateFeeRuleId? }` |
| PATCH | `/finance/fee-structures/:feeStructureId` | Update (no `classId`; `lateFeeRuleId: null` goes back to the school default) |
| DELETE | `/finance/fee-structures/:feeStructureId` | Soft delete |
| GET | `/finance/fee-heads`, `/finance/installment-plans`, `/finance/late-fee-rules`, `/academics/classes` | Form pickers |

**Layout**
- Table columns: Name, Class, Annual total, Plans (as chips, with the default starred) and Late fee ("School default", a rule name, or "None"). There is a class filter (`classId`).
- The detail page is a full page with three panels:
  - **Items:** a grid editor with Fee head and Annual amount. Each fee head can appear only once. The total is shown at the bottom.
  - **Plans:** multi-select from the year's plans, with a radio button to pick the default.
  - **Late fee:** a toggle for `chargesLateFee`, then a rule picker. Leaving the picker empty uses the school default.
- Users with `read` see the same panels read-only.
- Once invoices exist, items are frozen. Show them read-only with the message "Invoices have been issued from this structure; its items can no longer change" (409). Plans can still be added, but a plan that already has invoices cannot be removed (409, which names the plan).
- Remove: 409 when the structure has invoices ("cancel them before removing it"). Ask for confirmation before removing.
- 422 when `defaultInstallmentPlanId` is not among the offered plans, or when a structure with `chargesLateFee: false` also has a rule.

---

### FI-04 · Late-fee rules
**Route:** `/finance/late-fee-rules` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.lateFeeRules.read`); ADMIN, ACCOUNTANT edit (`finance.lateFeeRules.manage`)

**Data shown**
- Rules: `name`, `description`, `graceDays`, `maxAmount` (optional cap) and `isDefault` (one per school).
- `slabs[]`: `fromDay`, `toDay` (empty on the last slab means "and beyond"), `chargeType` (`FIXED` or `PER_DAY`) and `amount`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a rule | `finance.lateFeeRules.manage` | `POST /finance/late-fee-rules` |
| Edit, or make the school default | `finance.lateFeeRules.manage` | `PATCH /finance/late-fee-rules/:lateFeeRuleId` |
| Remove a rule | `finance.lateFeeRules.manage` | `DELETE /finance/late-fee-rules/:lateFeeRuleId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/late-fee-rules?page=&limit=` | Table rows with slabs |
| GET | `/finance/late-fee-rules/:lateFeeRuleId` | Edit drawer |
| POST | `/finance/late-fee-rules` | `{ name, description, graceDays, maxAmount?, isDefault, slabs[] }` |
| PATCH | `/finance/late-fee-rules/:lateFeeRuleId` | Update (`maxAmount: null` removes the cap) |
| DELETE | `/finance/late-fee-rules/:lateFeeRuleId` | Soft delete |

**Layout**
- Table columns: Name, Grace days, Slabs (shown as a summary such as "1–7 d: 50 · 8–30 d: 200 · 31+ d: 500"), Cap and Default badge.
- The drawer holds a slab grid editor (From day, To day, Type, Amount), up to 20 rows. The first slab starts at day 1, each slab starts the day after the previous one ends, and only the last may be open-ended. Show the server's 422 slab messages under the grid.
- Show a helper line: "Delay counts from the end of the grace period. FIXED: the amount is the fee. PER_DAY: the amount is added for each day of the slab."
- A rule edit applies to open invoices from the next daily run. Show this as an info note after saving.
- Remove: 409 when fee structures use the rule (the message names them). Ask for confirmation before removing.

**Notes**
- Late-fee waivers are per invoice. They are on the invoice detail (FI-07), not here.

---

### FI-05 · Concessions
**Route:** `/finance/concessions` (tab **Templates**), `/finance/concession-grants` (tab **Grants**) · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.concessions.read`); ADMIN, ACCOUNTANT edit and grant (`finance.concessions.manage`)

**Data shown**
- **Templates:**
  - `name` and `category` (`SIBLING`, `STAFF_WARD`, `MERIT`, `SCHOLARSHIP`, `FINANCIAL_AID`, `OTHER`).
  - `concessionType` (`PERCENT`, or `FIXED`, which is an amount per year) and `value`.
  - `feeHeads[]` (`name`, `code`). An empty list means every fee head.
  - `description`.
- **Grants:**
  - `student` (`studentCode`, `admissionNumber`, name).
  - `concession` (name, category, type, value).
  - `academicYearId`, `reason`, `grantedBy`, `createdAt`.
- **Grant or revoke result:** `studentName` and `recalculatedInvoices`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a template | `finance.concessions.manage` | `POST /finance/concessions` |
| Edit a template | `finance.concessions.manage` | `PATCH /finance/concessions/:concessionId` |
| Remove a template | `finance.concessions.manage` | `DELETE /finance/concessions/:concessionId` |
| Grant to a student | `finance.concessions.manage` | `POST /finance/concession-grants` |
| Revoke a grant | `finance.concessions.manage` | `DELETE /finance/concession-grants/:grantId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/concessions?category=&page=&limit=` | Templates table |
| GET | `/finance/concessions/:concessionId` | Template drawer |
| POST | `/finance/concessions` | `{ name, category, concessionType, value, feeHeadIds[], description }` |
| PATCH | `/finance/concessions/:concessionId` | Update |
| DELETE | `/finance/concessions/:concessionId` | Soft delete |
| GET | `/finance/concession-grants?studentId=&academicYearId=&concessionId=` | Grants table (paginated) |
| POST | `/finance/concession-grants` | `{ studentId, concessionId, academicYearId?, reason }` |
| DELETE | `/finance/concession-grants/:grantId` | Revoke |

**Layout**
- **Templates tab:** a table with columns Name, Category (as a badge), Type and value ("10%" or "5,000.00 / year"), Fee heads (chips, or "All") and Grants. There is a category filter. The drawer form switches the value hint by type (0–100 for PERCENT).
- Once a template is granted, its type, value and fee heads are frozen (409, "Create a new concession instead"). Disable those fields; name, category and description stay editable.
- Remove: 409 when the template has grants ("revoke the grants first").
- **Grants tab:** a table with columns Student, Concession, Category, Year, Reason, Granted by and Date. Filters: concession (`concessionId`), year (`academicYearId`) and student (`studentId`).
- **Grant** dialog: pick the student (class, then section, then roster), the concession and the year (default: current), and enter a reason. After saving, show "N unpaid invoices recalculated". 409 when the student already has this concession for the year.
- **Revoke:** confirmation that explains only invoices with nothing paid are recalculated.
- Show a helper line: "Several concessions stack: percentages add up, then fixed amounts. Paid invoices are never changed."

**Notes**
- Sibling discounts are a template with category `SIBLING` granted to each sibling. There is no automatic sibling detection.
- Grants for one student are also on the student account (FI-11).

---

### FI-06 · Finance and payment settings
**Route:** `/finance/settings` · **Type:** Setup · **Who:**
- ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read the finance settings (`finance.settings.read`).
- ADMIN changes them (`finance.settings.manage`).
- The Razorpay panel is ADMIN only (`finance.paymentSettings.read`, `finance.paymentSettings.manage`).

**Data shown**
- **Refund approval panel:** `refundApprovalLimit` (0 means every accountant's refund needs an administrator), `updatedBy` and `updatedAt`.
- **Online payments (Razorpay) panel:**
  - Status: `configured`, `provider`, `mode` (test or live, from the key) and `simulated` (the mock gateway in development).
  - Keys: `keyId`, plus `keySecret` and `webhookSecret` masked (`****f9Qa`).
  - `verifiedAt`, `configuredBy`, `updatedAt`.
  - `webhookUrl`, with a copy button, to paste into the Razorpay dashboard.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Change the refund approval limit | `finance.settings.manage` (ADMIN) | `PATCH /finance/settings` |
| Save or replace Razorpay keys | `finance.paymentSettings.manage` (ADMIN) | `PUT /finance/payment-settings` |
| Test the connection | `finance.paymentSettings.manage` (ADMIN) | `POST /finance/payment-settings/connection-test` |
| Remove the keys (stop online payments) | `finance.paymentSettings.manage` (ADMIN) | `DELETE /finance/payment-settings` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/settings` | Refund approval panel |
| PATCH | `/finance/settings` | `{ refundApprovalLimit }` |
| GET | `/finance/payment-settings` | Razorpay panel |
| PUT | `/finance/payment-settings` | `{ keyId, keySecret, webhookSecret }` (always all three) |
| POST | `/finance/payment-settings/connection-test` | Sets `verifiedAt` |
| DELETE | `/finance/payment-settings` | Remove the keys |

**Layout**
- The page has two stacked cards.
- **Refund approval** card: a money input, editable for ADMIN and read-only for the others, with the help text "An accountant's refund up to this amount is approved at once. 0: every refund needs an administrator."
- **Online payments** card (ADMIN only; hidden for other roles):
  - Not configured: an empty state with a form for Key id (`rzp_test_…` or `rzp_live_…`), Key secret and Webhook secret. The two secrets are password inputs, never prefilled.
  - Configured: a status badge (Test or Live), "Verified on …" or "Not verified", the masked secrets, the webhook URL with a copy button, and buttons **Replace keys**, **Test connection** and **Remove**.
  - A `simulated: true` banner reads "Payments are simulated (mock gateway)".
- **Test connection** shows the 422 message as is (for example "Razorpay rejected these keys (HTTP 401)…" or "Razorpay could not be reached…").
- Ask for confirmation before **Remove**: "Online payments will stop. Payments already recorded are not affected."

**Notes**
- Receipt, invoice and refund numbering is fixed by the server (`INV26-000001`, `RCPT26-000001`, `RFND26-000001`, per academic-year start). Journal entries are numbered `JE-000001`. No setting exists for numbering, so the page shows none.

---

### FI-07 · Invoices
**Route:** `/finance/invoices`, `/finance/invoices/:invoiceId` · **Type:** Operations · **Who:**
- ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.invoices.read`).
- ADMIN, ACCOUNTANT issue (`finance.invoices.issue`), cancel (`finance.invoices.cancel`), waive late fees (`finance.invoices.waiveLateFee`) and apply credit (`finance.credits.apply`).
- ADMIN, ACCOUNTANT, STAFF collect (`finance.payments.collect`).

**Data shown**
- **List** (the selected year):
  - `invoiceNumber` and student (`student.user` name, `admissionNumber`).
  - `structure.name`, `plan.name` and `installment.name`.
  - `issueDate`, `dueDate`.
  - `subtotal`, `discount`, `lateFee`, `total`, `amountPaid` and `balance`.
  - `status` (`ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`) and `isOverdue`.
- **Detail:** everything above, plus:
  - `lines[]` (`description`, `feeHead.name`, `amount`, `discount`, `netAmount`, `concessions[]` with `name` and `amount`) and the per-invoice `concessions[]` summary.
  - `lateFeeWaiver` (`amount`, `reason`, `waivedAt`, `waivedBy`).
  - `payments[]` (`receiptNumber`, `amount`, `method`, `status`, `paidAt`) and `creditApplications[]`.
  - `notes`, plus `cancelledAt` and `cancelReason` when cancelled.
- **Generation result:** `created`, `skipped`, `throughDate`, `byPlan[]` (`name`, `invoices`).

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Generate invoices (wizard) | `finance.invoices.issue` | `POST /finance/invoices/generation` |
| Cancel an invoice | `finance.invoices.cancel` | `POST /finance/invoices/:invoiceId/cancellation` |
| Waive the late fee | `finance.invoices.waiveLateFee` | `POST /finance/invoices/:invoiceId/late-fee-waiver` |
| Reinstate the late fee | `finance.invoices.waiveLateFee` | `DELETE /finance/invoices/:invoiceId/late-fee-waiver` |
| Apply student credit | `finance.credits.apply` | `POST /finance/invoices/:invoiceId/credit-application` |
| Collect payment | `finance.payments.collect` | Opens FI-08 with this invoice selected |
| Open the receipt of a payment | `finance.payments.read` | `GET /finance/payments/:paymentId/receipt` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/invoices?status=&studentId=&feeStructureId=&installmentPlanId=&overdue=&page=&limit=` | Table rows (paginated) |
| GET | `/finance/invoices/:invoiceId` | Detail page |
| POST | `/finance/invoices/generation` | `{ feeStructureId, sectionId? \| studentIds[]?, throughDate?, issueDate?, notes }` |
| POST | `/finance/invoices/:invoiceId/cancellation` | `{ reason }` |
| POST | `/finance/invoices/:invoiceId/late-fee-waiver` | `{ reason }` |
| DELETE | `/finance/invoices/:invoiceId/late-fee-waiver` | Reinstate |
| POST | `/finance/invoices/:invoiceId/credit-application` | `{ amount? }` (default: as much as the credit and the balance allow) |
| GET | `/finance/students/:studentId/credits` | Credit available, shown in the apply-credit dialog |
| GET | `/finance/fee-structures`, `/finance/installment-plans`, `/academics/sections` | Filter and wizard pickers |

**Layout**
- **List:** a table with columns Invoice no., Student, Structure, Installment, Due, Total, Paid, Balance and Status (a badge, with a red "Overdue" tag when `isOverdue`).
  - Filters: status (`status`), structure (`feeStructureId`), plan (`installmentPlanId`), an "Overdue only" toggle (`overdue=true`) and student (`studentId`, set when coming from FI-11).
  - Clicking a row opens the full detail page.
- **Generate invoices** wizard (a modal with steps):
  1. Fee structure.
  2. Scope: the whole structure, one section, or chosen students.
  3. "Bill installments due up to" (`throughDate`; default: the whole year), plus issue date and notes.
  4. Confirm. Then show the result: "N created, M already issued (skipped)" and the count per plan.
  - Running it again is safe (idempotent). 422 when the section or students are not covered by the structure.
- **Detail page:**
  - Header: invoice number, status, student link (to FI-11), due date and balance.
  - Body: a lines table (Fee, Gross, Concession, Net), with concessions named under each line, and a totals block (Gross, Concessions, Late fee, Total, Paid, Balance).
  - Side panels: Late fee (amount, waiver details or a **Waive** button), Payments (each row links to its receipt PDF) and Credit applied.
  - Buttons by permission: **Collect payment** (when status is ISSUED or PARTIALLY_PAID), **Apply credit** (when the student has credit), **Cancel** (only when `amountPaid` is 0) and **Waive/Reinstate late fee**.
- **Cancel:** confirmation with a required reason. 422 "An invoice with payments cannot be cancelled"; 409 when already cancelled.
- **Waive:** required reason. 422 when part of the late fee is already paid; 409 when the invoice is paid or cancelled, or the fee is already waived. **Reinstate:** confirmation ("the late fee is charged again from today").
- **Apply credit:** a dialog showing the available credit and an amount (default: the maximum). 422 when the amount exceeds the credit or the balance.

**Notes / Gap**
- **Gap:** the invoice list has no filter by class or section, no search by invoice number or student name, and no date range.

---

### FI-08 · Collect payment (counter)
**Route:** `/finance/counter` (optionally `/finance/counter?studentId=&invoiceId=`) · **Type:** Operations · **Who:** ADMIN, ACCOUNTANT, STAFF (`finance.payments.collect`, plus `finance.invoices.read` to see invoices)

**Data shown**
- **Student panel:** name, admission number, class and section, current `installmentPlan` (empty means the structure defaults), `credit.balance`, and `totals` (`billed`, `paid`, `balance`, `overdue`) from the statement.
- **Open invoices:** invoices with `status` ISSUED or PARTIALLY_PAID, showing `invoiceNumber`, `installment.name`, `dueDate`, `total`, `amountPaid`, `balance`, `lateFee` and `isOverdue`.
- **Result:** the payment's `receiptNumber`, `amount`, `method` and `balanceAfter`, with a receipt PDF button.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Record a counter payment (partial or full) | `finance.payments.collect` | `POST /finance/invoices/:invoiceId/payments` |
| Print or open the receipt PDF | `finance.payments.read` | `GET /finance/payments/:paymentId/receipt` |
| Take a card or UPI payment through the gateway checkout | `finance.payments.collect` | `POST /finance/invoices/:invoiceId/payment-orders`, then `POST /finance/payments/confirmations` |
| Apply student credit first | `finance.credits.apply` (ADMIN, ACCOUNTANT) | `POST /finance/invoices/:invoiceId/credit-application` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/academics/sections`, `/academics/enrollments?sectionId=` | Find the student (class, then section, then roster) |
| GET | `/users/students/:studentId` | Student header (users) |
| GET | `/finance/students/:studentId/statement?academicYearId=` | Open invoices, totals and credit in one call |
| POST | `/finance/invoices/:invoiceId/payments` | `{ amount, method (CASH, CHEQUE, UPI, CARD, BANK_TRANSFER), reference?, paidAt?, notes }` |
| POST | `/finance/invoices/:invoiceId/payment-orders` | `{ amount? }`, which returns the `orderId`, `keyId`, `amountMinor` and `currency` that the checkout needs |
| POST | `/finance/payments/confirmations` | `{ orderId, paymentId, signature }` from the checkout |
| GET | `/finance/payments/:paymentId/receipt` | Receipt PDF (binary response; open in a new tab or print) |

**Layout**
- The page is a three-step panel, with no page reloads.
  1. **Find student:** class, then section, then a roster list (or arrive from FI-11 or FI-07 with `studentId` set). Selecting a student loads the statement.
  2. **Choose invoice:** a compact table of open invoices with the oldest due first (Invoice, Installment, Due, Balance, Overdue tag). If `credit.balance` > 0, a banner reads "Credit available: 1,200.00" and offers **Apply credit** (accountants and admins only).
  3. **Collect:**
     - Amount (default: the invoice balance; it can be lower for a part-payment; never above the balance).
     - Method as segmented buttons.
     - Reference: required for everything except CASH, so the field appears when needed.
     - Paid on (`paidAt`, default today) and notes.
- After saving, a success card shows the server `message` ("Payment received. Receipt RCPT26-000004"), the remaining balance, and buttons **Print receipt**, **Collect another invoice** and **Next student**.
- **Gateway checkout** (optional, shown only when payment settings are configured): a **Pay by card/UPI (Razorpay)** button. It creates an order, opens Razorpay checkout with `keyId` and `orderId`, then sends the signed result to the confirmations endpoint.
  - 422 "Online payments are not set up for this school": hide the button.
  - 422 for the minimum of 100.00 (unless the whole balance is smaller).
- Errors to show: 422 "The amount exceeds the invoice balance of …", "This invoice is cancelled", "This invoice is already fully paid". A 400 on `reference` means a reference is needed for a non-cash method.

**Notes / Gap**
- **Gap:** there is no student search by name or admission number, which a counter needs most. The current way in is class, then section, then roster.
- **Gap:** the statement covers one academic year. Arrears from an earlier year need a second call with `academicYearId` (or the year picker). No endpoint returns every open invoice of a student across years.

---

### FI-09 · Payments and receipts
**Route:** `/finance/payments`, `/finance/payments/:paymentId` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.payments.read`); ADMIN, ACCOUNTANT refund (`finance.payments.refund`)

**Data shown**
- **List:**
  - `receiptNumber`, `paidAt` and student (name, `admissionNumber`).
  - `invoice.invoiceNumber`, `amount`, `method`, `status` (`PENDING`, `SUCCEEDED`, `FAILED`), `reference`, `receivedBy`.
  - Extra amounts when present: `excessAmount` (kept as credit) and `refundedAmount`.
- **Detail:** the above, plus `balanceAfter`, `notes`, the gateway fields (`gatewayProvider`, `gatewayOrderId`, `gatewayPaymentId`) and the invoice summary (`total`, `amountPaid`, `balance`, `status`).
- **Refunds of this payment:** `refundNumber`, `amount`, `method`, `status`, `requester` and `approver`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Open or print the receipt PDF | `finance.payments.read` | `GET /finance/payments/:paymentId/receipt` |
| Refund this payment (full or part) | `finance.payments.refund` | `POST /finance/payments/:paymentId/refunds` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/payments?studentId=&method=&status=&from=&to=&page=&limit=` | Table rows, newest first |
| GET | `/finance/payments/:paymentId` | Detail drawer |
| GET | `/finance/payments/:paymentId/receipt` | Receipt PDF (SUCCEEDED only) |
| GET | `/finance/refunds?paymentId=` | Refunds panel in the detail |
| POST | `/finance/payments/:paymentId/refunds` | `{ amount?, method?, reason, reference? }` |

**Layout**
- Table columns: Receipt no., Date, Student, Invoice, Amount, Method, Status, Credit kept and Refunded.
- Filters: method (`method`, including ONLINE), status (`status`; use `PENDING` to see online payments that are still waiting), date range (`from` and `to`, which only filter when both are set) and student (`studentId`).
- Clicking a row opens a side drawer with the payment, the invoice summary, refunds and buttons: **Receipt PDF** (SUCCEEDED only; otherwise 422 "Receipts are available only for successful payments") and **Refund** (with permission, when `amount - refundedAmount` > 0).
- **Refund** dialog:
  - Amount (default: everything still refundable). Method: online payments default to `ORIGINAL` (back to the card or UPI); others must pick CASH, CHEQUE, UPI or BANK_TRANSFER.
  - Reference: required for cheque, UPI and bank transfer. Reason: required.
  - Before submitting, the dialog says what will happen: an administrator's refund runs at once; an accountant's becomes a request unless it is within the approval limit (FI-06).
  - After saving, show the server message ("Refund of 300.00 requested … An administrator must approve it" or "Refund RFND26-000003 … processed").
- Errors to show: 409 "already refunded in full" and "the rest … is already waiting for approval"; 422 "At most … can still be refunded" and "ORIGINAL is only for online payments"; 422 when the gateway refuses.

**Notes / Gap**
- Online payments are confirmed by the checkout callback (`POST /finance/payments/confirmations`, `POST /me/payments/confirmations`) and by the Razorpay webhook. Both are automatic, so this page has no "confirm" button.
- **Gap:** staff cannot re-check a payment stuck in `PENDING` against the gateway. They can only wait for the webhook.
- **Gap:** there is no filter by `invoiceId` or `receivedBy`, so no "my collections today" view. The daily collection export is in Reports (`GET /reports/exports/fee-collections`).

---

### FI-10 · Refunds
**Route:** `/finance/refunds`, `/finance/refunds/:refundId` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.payments.read`); ADMIN approves and rejects (`finance.payments.approveRefund`); ADMIN, ACCOUNTANT create (`finance.payments.refund`, from FI-09 or FI-11)

**Data shown**
- Refund:
  - `refundNumber` (empty until executed), `amount`, the split (`fromInvoice`, `fromCredit`, `unallocated`), `method`, `status` (`REQUESTED`, `PENDING`, `PROCESSED`, `FAILED`, `REJECTED`) and `source` (`STAFF`, `GATEWAY`).
  - `reason`, `reference` and `autoApproved`.
  - Who acted: `requester`, `approver`/`approvedAt`, `rejecter`/`rejectedAt`/`rejectionReason`.
  - When: `processedAt`, `failedAt`.
- Related records: `payment` (`receiptNumber`, `method`, `amount`, `refundedAmount`, `paidAt`; empty for a credit refund), `invoice` (`invoiceNumber`, `balance`, `status`) and `student`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Approve, which executes the refund | `finance.payments.approveRefund` (ADMIN) | `POST /finance/refunds/:refundId/approval` |
| Reject | `finance.payments.approveRefund` (ADMIN) | `POST /finance/refunds/:refundId/rejection` |
| Open or print the refund receipt PDF | `finance.payments.read` | `GET /finance/refunds/:refundId/receipt` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/refunds?status=&studentId=&paymentId=&creditOnly=&needsReview=&from=&to=&page=&limit=` | Table rows and tab counts (`meta.total`) |
| GET | `/finance/refunds/:refundId` | Detail drawer |
| POST | `/finance/refunds/:refundId/approval` | Approve |
| POST | `/finance/refunds/:refundId/rejection` | `{ reason }` |
| GET | `/finance/refunds/:refundId/receipt` | Refund receipt PDF (PROCESSED; PENDING printed as pending) |

**Layout**
- Tabs, each mapped to a query:
  - **Waiting for approval** (`status=REQUESTED`), with a count badge.
  - **All**.
  - **Credit refunds** (`creditOnly=true`).
  - **Needs review** (`needsReview=true`): dashboard refunds that the books could not fully cover.
- Filters: status, date range (`from`, `to`) and student.
- Table columns: Refund no. ("Request" when empty), Requested on, Student, From (receipt number, or "Credit"), Amount, Method, Status, Requested by and Approved by.
- Drawer: all fields, with a timeline (requested, approved or rejected, processed or failed).
- ADMIN sees **Approve** and **Reject** on REQUESTED rows. Approve asks for confirmation ("Money will be paid back now"). Reject needs a reason.
- Errors to show: 409 when the request was already decided; 422 when the gateway refused ("nothing changed, the request keeps waiting") or the refundable amount shrank ("reject this request and request again").
- The **Receipt** button shows only for PROCESSED and PENDING refunds. Otherwise the server returns 422 "waiting for approval; its receipt is available once it is processed".
- Accountants see the same page read-only, apart from their own new requests coming from FI-09 or FI-11.

---

### FI-11 · Student account: statement and credit
**Route:** `/finance/students/:studentId` · **Type:** Operations · **Who:**
- ADMIN, PRINCIPAL, ACCOUNTANT, STAFF read (`finance.invoices.read`, `finance.credits.read`).
- ADMIN, ACCOUNTANT pay credit back (`finance.payments.refund`), apply credit (`finance.credits.apply`), change the plan (`finance.installmentPlans.assign`) and grant concessions (`finance.concessions.manage`).

**Data shown**
- **Header:** student name and admission number (users), the year picker (`academicYearId`) and KPI cards from `totals`: `billed`, `paid`, `balance`, `overdue`, `refunded` and `credit.balance`.
- **Summary tab:**
  - `installmentPlan` (empty means the structure defaults).
  - `concessions[]` (`name`, `category`, `concessionType`, `value`, `reason`, `amount` taken off so far).
  - `totals.gross`, `totals.concessions`, `totals.lateFees`, `totals.lateFeesWaived`.
- **Invoices tab:** `invoices[]` (number, installment, due date, total, paid, balance, status, `isOverdue`).
- **Payments tab:** `payments[]` (receipt number, date, amount, method, `excessAmount`).
- **Refunds tab:** `refunds[]` (number, amount, status, method).
- **Credit tab:** `balance` and `entries[]` (`entryType`: `OVERPAYMENT`, `APPLIED`, `REFUNDED`, `REFUND_REVERSED`; `amount`; `invoice.invoiceNumber`; `notes`; `createdAt`).

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Collect a payment | `finance.payments.collect` | Opens FI-08 with `studentId` |
| Apply credit to an open invoice | `finance.credits.apply` | `POST /finance/invoices/:invoiceId/credit-application` |
| Pay credit back to the family | `finance.payments.refund` | `POST /finance/students/:studentId/credit-refunds` |
| Change this student's plan | `finance.installmentPlans.assign` | `POST /finance/plan-assignments` |
| Grant or revoke a concession | `finance.concessions.manage` | `POST /finance/concession-grants`, `DELETE /finance/concession-grants/:grantId` |
| Open a receipt or refund receipt | `finance.payments.read` | `GET /finance/payments/:paymentId/receipt`, `GET /finance/refunds/:refundId/receipt` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/users/students/:studentId` | Header (users) |
| GET | `/finance/students/:studentId/statement?academicYearId=` | All tabs except the credit history |
| GET | `/finance/students/:studentId/credits` | Credit tab (balance and full history) |
| POST | `/finance/students/:studentId/credit-refunds` | `{ amount?, method (CASH, CHEQUE, UPI, BANK_TRANSFER), reason, reference? }` |
| POST | `/finance/invoices/:invoiceId/credit-application` | `{ amount? }` |
| POST | `/finance/plan-assignments` | `{ studentId, installmentPlanId }` |
| POST/DELETE | `/finance/concession-grants`, `/finance/concession-grants/:grantId` | Grant or revoke |

**Layout**
- A full page: header with KPI cards, then tabs (Summary, Invoices, Payments, Refunds, Credit). Each row in Invoices links to FI-07 detail; each row in Payments links to the FI-09 drawer.
- Each row in the Summary concession list has a **Revoke** action (with confirmation). **Grant concession** and **Change plan** open the same dialogs as FI-05 and FI-02, prefilled with this student. After a plan change, the 409 "already paid towards … invoices" shows as is.
- The Credit tab offers **Apply to invoice** (pick an open invoice, enter the amount) and **Pay back** (amount defaults to all credit not waiting for approval; method; reference unless cash; reason). After pay-back, show the server message (request, or processed with a number).
- Errors to show: 422 "The student has no credit to pay back"; 409 "All of the student's credit … is already waiting for approval".
- Users with `read` see every tab with no action buttons.
- Entry points: from FI-07, FI-08, FI-09 and FI-10 (student links), and from the student profile in Users.

---

### FI-12 · Gateway settlements
**Route:** `/finance/settlements` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT read (`finance.settlements.read`); ADMIN, ACCOUNTANT import (`finance.settlements.import`)

**Data shown**
- Settlements: `settledAt`, `settlementId`, `utr`, `amount` (what reached the bank), `fees`, `tax`, `provider` and `journalEntry` (`entryNumber`, `entryDate`).
- Import result: `from`, `to`, `found`, `imported`, `alreadyImported` and `notYetProcessed`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Import now (optional date range) | `finance.settlements.import` | `POST /finance/settlements/imports` |
| Open the journal entry | `finance.ledger.read` | Links to FI-13 (`GET /finance/ledger/journal-entries/:entryId`) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/settlements?from=&to=&page=&limit=` | Table rows |
| POST | `/finance/settlements/imports` | `{ from?, to? }` (default: the last 7 days) |

**Layout**
- Table columns: Settled on, Settlement id, UTR, Amount received, Gateway fees, Tax and Journal entry (a link). Date-range filter (`from` and `to`, used together).
- **Import now** opens a small dialog with an optional date range, then shows a result toast ("3 found, 2 imported, 1 already imported, 0 not yet paid out").
- 422 when online payments are not set up, or Razorpay could not be reached. Show the message.
- An info line reads "Imported automatically every day. Do not also enter payouts by hand in the journal."
- Empty state when Razorpay keys are missing: "Set up online payments first" (link to FI-06 for ADMIN).

---

### FI-13 · General ledger
**Route:** `/finance/ledger` with tabs `/finance/ledger/accounts`, `/finance/ledger/accounts/:accountId`, `/finance/ledger/journal-entries`, `/finance/ledger/trial-balance` and `/finance/ledger/income-summary` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT read (`finance.ledger.read`); ADMIN, ACCOUNTANT manage accounts (`finance.ledger.manageAccounts`) and post or reverse manual entries (`finance.ledger.post`)

**Data shown**
- **Chart of accounts:** `code`, `name`, `accountType` (`ASSET`, `LIABILITY`, `EQUITY`, `INCOME`, `EXPENSE`), `isContra`, `normalBalance`, `isSystem`, `feeHead.name` (fee income accounts) and `description`.
- **Account ledger:**
  - Header from `meta`: `account`, `openingBalance`, `debits`, `credits`, `closingBalance`.
  - Rows: `entryDate`, `entryNumber`, `narration`, `sourceType`, `debit`, `credit`, `memo`, `studentId`, `balance` (running).
- **Journal:**
  - Entries: `entryNumber`, `entryDate`, `narration`, `sourceType` (`INVOICE`, `PAYMENT`, `REFUND`, `STUDENT_CREDIT`, `SETTLEMENT`, `MANUAL`, or other modules' types), `sourceId`, `event`, `total`, `reversalOfId` and `poster`.
  - `lines[]`: `account` (`code`, `name`), `debit`, `credit`, `student`, `memo`.
- **Trial balance:** `asOf`, then `accounts[]` (`code`, `name`, `accountType`, `debit`, `credit`), `totals` and `balanced`.
- **Income summary:**
  - Income: `feeIncome.byFeeHead[]` with its total, `lateFees`, `concessions` (negative) and `otherIncome`.
  - Results: `netIncome`, `expenses` and `surplus`.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add an account | `finance.ledger.manageAccounts` | `POST /finance/ledger/accounts` |
| Rename an account or edit its description | `finance.ledger.manageAccounts` | `PATCH /finance/ledger/accounts/:accountId` |
| Remove an unused own account | `finance.ledger.manageAccounts` | `DELETE /finance/ledger/accounts/:accountId` |
| Post a manual journal entry | `finance.ledger.post` | `POST /finance/ledger/journal-entries` |
| Reverse a manual entry | `finance.ledger.post` | `POST /finance/ledger/journal-entries/:entryId/reversal` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/finance/ledger/accounts?accountType=&page=&limit=` | Chart of accounts |
| GET | `/finance/ledger/accounts/:accountId` | Account header |
| POST | `/finance/ledger/accounts` | `{ code, name, accountType, isContra?, description }` |
| PATCH | `/finance/ledger/accounts/:accountId` | `{ name?, description? }` (code and type are fixed) |
| DELETE | `/finance/ledger/accounts/:accountId` | Remove |
| GET | `/finance/ledger/accounts/:accountId/ledger?from=&to=&studentId=&page=&limit=` | Account ledger with running balance |
| GET | `/finance/ledger/journal-entries?from=&to=&sourceType=&sourceId=&accountId=&studentId=&page=&limit=` | Journal list |
| GET | `/finance/ledger/journal-entries/:entryId` | Entry drawer |
| POST | `/finance/ledger/journal-entries` | `{ date?, narration, lines[{ accountId, debit?, credit?, memo }] }` |
| POST | `/finance/ledger/journal-entries/:entryId/reversal` | `{ reason, date? }` |
| GET | `/finance/ledger/trial-balance?asOf=` | Trial balance |
| GET | `/finance/ledger/income-summary?from=&to=` | Income summary (both dates required) |

**Layout**
- **Accounts tab:** a table grouped by `accountType`, with columns Code, Name, Type, Normal balance and a "System" badge. There is a type filter. Clicking a row opens the account ledger page, which has a date-range picker, a student filter, opening and closing balance cards, and a lines table (Date, Entry no., Narration, Source, Debit, Credit, Balance). Entry numbers link to the journal drawer.
  - System accounts cannot be removed (409); neither can accounts with entries (409). Their delete button is hidden.
  - Add or edit uses a drawer. On edit, Code and Type are read-only.
- **Journal tab:**
  - Table columns: Entry no., Date, Narration, Source, Total, Posted by, and a "Reversed" or "Reversal" tag.
  - Filters: date range (`from` and `to` go together, or the server returns 400), source type, account and student.
  - The drawer shows the lines (Account, Debit, Credit, Student, Memo). The source links to the record when the type is INVOICE, PAYMENT or REFUND.
- **New manual entry:**
  - A grid editor (Account, Debit, Credit, Memo), 2 to 50 lines, each line either a debit or a credit.
  - A live "Debits = Credits" check; the save button is disabled until it balances.
  - Date: not in the future.
  - Control accounts (1100 Receivables, 2100 Student credit) are excluded from the account picker; the server refuses them with 422.
- **Reverse:** only on MANUAL entries that are not already reversed. The dialog takes a reason and an optional date. Errors: 422 "posted by a payment; correct that record instead"; 409 "already reversed by JE-…".
- **Trial balance tab:** an "As of" date picker, then a table (Code, Account, Debit, Credit) with totals, and a green "Balanced" or red "Not balanced" badge.
- **Income summary tab:** a period picker (required), then a statement layout: Fee income by fee head, Late fees, Concessions (negative), Other income, Net income, Expenses, and Surplus.
- PRINCIPAL sees every tab read-only. STAFF has no access, so hide the menu item.

**Notes**
- Entries are posted automatically by invoices, payments, credit, refunds and settlements. Manual entries are only for adjustments. The books start at zero on the day the school starts using the system (no opening balances are imported).
- **Gap:** there are no ledger exports (`?format=xlsx`) for the trial balance, the journal or the income summary.

---

### FI-14 · Finance activity
Uses the shared **Module activity** component with `GET /finance/activity` and `GET /finance/activity/:auditLogId` (`finance.activity.read`, ADMIN only).

---

**Notes on structure**
- FI-02 holds both installment plans and plan assignments (two tabs). FI-04 does not hold waivers: they are per invoice and live on FI-07. FI-09 has no confirmation action of its own: confirmations happen in the FI-08 gateway checkout and from the portal. Credit refunds are created on FI-11 and approved on FI-10.

---

## Communication

Communication sends school news and direct messages to people. Every message lands in the recipient's in-app inbox (`/me/notifications`, covered elsewhere). Email and SMS are extra channels, delivered by background jobs. ADMIN, PRINCIPAL and STAFF write announcements and messages; ACCOUNTANT can read announcements. There is no setup page: audiences are chosen per announcement. Automatic notices (absence, results, invoices, payments, refunds, fee reminders, homework, imports, low stock) come from event subscribers. They have no page here and show up only in recipients' inboxes.

### CO-01 · Announcements
**Route:** `/communication/announcements` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, STAFF (write), ACCOUNTANT (read). `communication.announcements.read` opens the page; `communication.announcements.manage` shows create, edit, delete and publish. The Activity tab needs `communication.activity.read` (ADMIN and module owners)

**Data shown**
- List: `title`, `status` (`DRAFT`, `SCHEDULED`, `PUBLISHED`), `audience.roles`, `channels`, `publishAt`, `publishedAt`, `recipientCount`, `createdAt`
- Detail: `title`, `body`, `audience` (`roles`, `classIds`, `sectionIds`), `channels`, `status`, `publishAt`, `publishedAt`, `recipientCount`, `createdBy`
- Delivery report (published only): `delivery.recipients`, plus `delivery.channels.<IN_APP|EMAIL|SMS>` with counts `PENDING`, `SENT`, `FAILED`, `SKIPPED`
- Activity tab: the communication module's audit entries (`createdAt`, `actor.name`, `actor.role`, `summary`, `permission`, `entityId`). Covers announcements and sent messages

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create draft | `communication.announcements.manage` | `POST /communication/announcements` |
| Edit draft or scheduled | `communication.announcements.manage` | `PATCH /communication/announcements/:announcementId` |
| Delete draft or scheduled | `communication.announcements.manage` | `DELETE /communication/announcements/:announcementId` |
| Publish now / schedule / reschedule | `communication.announcements.manage` | `POST /communication/announcements/:announcementId/publication` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/communication/announcements?status=&page=&limit=` | List (paginated) |
| GET | `/communication/announcements/:announcementId` | Detail drawer, with the delivery report once published |
| POST | `/communication/announcements` | Create: `title` (max 200), `body` (max 5000), `audience { roles[], classIds[], sectionIds[] }`, `channels[]` |
| PATCH | `/communication/announcements/:announcementId` | Edit any of the same fields |
| DELETE | `/communication/announcements/:announcementId` | Delete |
| POST | `/communication/announcements/:announcementId/publication` | `{ publishAt? }`: no body publishes now; a future time schedules it |
| GET | `/academics/classes`, `/academics/sections` | Class and section pickers for the audience |
| GET | `/communication/activity?userId=&permission=&entityId=&method=&from=&to=&search=` | Activity tab (paginated) |
| GET | `/communication/activity/:auditLogId` | One activity entry (drawer) |

**Layout**
- Tabs: All, Drafts, Scheduled, Published (each maps to `status`), plus Activity for owners.
- Table columns: title, audience (role chips), channels (icons), status badge, scheduled for or published at, recipients. A row opens a side drawer.
- Editor (drawer or full page): title, body (plain text, character counter), audience role multi-select (`ADMIN`, `PRINCIPAL`, `ACCOUNTANT`, `STAFF`, `TEACHER`, `STUDENT`, `PARENT`). When STUDENT or PARENT is picked, show class and section multi-selects with the hint "Leave empty for the whole school (current year)". Channel checkboxes: In-app is always on and locked; Email and SMS are optional.
- Publish button opens a small dialog: "Publish now" or "Schedule" (date-time picker; a past time is refused with 400 "must not be in the past").
- Published announcements are read-only. Hide Edit and Delete, and show the delivery report as one row per channel with a stacked bar (sent, pending, failed, skipped).
- A scheduled announcement can still be edited. The new text goes out at the scheduled time. Publishing it again with a new time reschedules it.
- 409 "A published announcement cannot be changed": show it as a toast and reload.
- Empty state: "No announcements yet. Create one to notify staff, students or parents."

**Notes / Gap:**
- **Gap:** there is no recipient count preview before publishing. `recipientCount` is known only after the fan-out.
- **Gap:** the audience roles leave out HR_MANAGER, LIBRARIAN, TRANSPORT_MANAGER, HOSTEL_MANAGER and INVENTORY_MANAGER.
- **Gap:** announcements cannot carry attachments. The `ANNOUNCEMENT` file owner type exists, but no route uses it.
- **Gap:** teachers, students and parents cannot browse past announcements. They see them only as `ANNOUNCEMENT` items in their inbox.
- Delete has no "are you sure" on the server. Ask for confirmation in the UI.

---

### CO-02 · Send message
**Route:** `/communication/messages/new` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, STAFF, with `communication.notifications.send`

**Data shown**
- Recipient picker: chosen people (`userIds`) and chosen students (`studentIds`), with an "Include their parents" switch (`includeParents`, on by default)
- Message: `title`, `body`, `channels`
- After sending: the result `recipients` (the number of people reached), from "Message sent to N recipient(s)"

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Send message | `communication.notifications.send` | `POST /communication/messages` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| POST | `/communication/messages` | `{ userIds[] (max 500), studentIds[] (max 500), includeParents, title (max 200), body (max 2000), channels[] }` |
| GET | `/users/students?…` | Student search for the picker (also by section) |
| GET | `/users/teachers`, `/users/staff`, `/users` | People search (by role; access differs, see Gap) |

**Layout**
- One form page. Recipients come first, as two pickers: "Students (and their parents)" and "Staff and teachers".
- Students: search, or "Add a whole section" (fills the picker from the section roster), up to 500. The switch "Also send to parents" maps to `includeParents`. To reach parents only, there is no option: students are always included (see Gap).
- Channels: In-app (locked on), Email, SMS. Under SMS, show a cost note.
- Preview card on the right: title and body as the inbox will show them.
- Send button with a confirmation showing how many people were picked. After success, toast "Message sent to N recipient(s)" and clear the form.
- 400 "userIds: or studentIds must name at least one recipient": block Send until someone is picked.
- Notification types and delivery: messages are type `MESSAGE`. Recipients read them in their inbox.

**Notes / Gap:**
- **Gap:** there is no history of sent messages: no `GET /communication/messages` and no delivery report per message. Only the Activity tab on CO-01 shows that a message was sent.
- **Gap:** STAFF cannot list `/users` or `/users/staff` (ADMIN, PRINCIPAL only), so STAFF can pick only students, parents (through students) and teachers.
- **Gap:** you cannot message parents without their children: `studentIds` always includes the students.
- The 500-recipient limit applies to each list. For larger groups, use an announcement.

---

## Reports

Reports gives management read-only dashboards and spreadsheet exports. Dashboards are for ADMIN and PRINCIPAL; ACCOUNTANT sees the overview and fees. Exports are open to the roles that own the data: STAFF exports students and attendance, ACCOUNTANT exports fees. There is no setup. Everything is computed live from the current academic year, or from another year sent as `X-Academic-Year-Id`. Exports download as `xlsx` (default) or `csv`.

### RP-01 · Dashboards
**Route:** `/reports/dashboards/:tab` (`overview`, `attendance`, `fees`, `academics`) · **Type:** Operations · **Who:** Overview: `reports.dashboards.overview` (ADMIN, PRINCIPAL, ACCOUNTANT). Attendance: `reports.dashboards.attendance` (ADMIN, PRINCIPAL). Fees: `reports.dashboards.fees` (ADMIN, PRINCIPAL, ACCOUNTANT). Academics: `reports.dashboards.academics` (ADMIN, PRINCIPAL)

**Data shown**
- **Overview tab**
  - Header: `academicYear.yearName`, `today`, `currency`
  - Headcounts: `headcounts.students`, `teachers`, `staff`, `sections`, `classes`, `admissionsLast30Days`
  - Attendance today: `attendanceToday.presentPercentage`, `absent`, `partlyAbsent`, `sectionsTaken` of `sectionsTotal`
  - Fees: `fees.collectedThisMonth`, `collectedThisYear`, `refundedThisYear`, `netCollectedThisYear`, `billed`, `outstanding`, `overdue`, `overdueInvoices`, `collectionRate`, `concessions`, `lateFees`, `lateFeesWaived`, `creditHeld`
  - Exams: `exams.papersInNext14Days`
- **Attendance tab**
  - `from`, `to`, `threshold`, `modes[] { mode, from, to }`
  - Trend: `trend[] { date, percentage, absent }`
  - By section: `bySection[] { section, daysRecorded, percentage, periodPercentage }`
  - Low attendance: `lowAttendance[] { studentId, firstName, lastName, section, percentage }`
- **Fees tab**
  - `collections.byMonth[] { month, amount, payments }`
  - `collections.byMethod[] { method, amount, payments }`
  - `byClass[] { className, billed, concessions, collected, outstanding }`
  - `concessions.byCategory[] { category, amount, students }`
  - `defaulters[] { studentId, admissionNumber, firstName, lastName, section, overdue, invoices, oldestDueDate }`
- **Academics tab** (one exam)
  - `exam { examName, resultsPublishedAt }`
  - Overall: `overall { students, passed, compartment, failed, incomplete, passPercentage, averageGpa }`
  - By section: `bySection[] { section, policy.name, policy.gradingMode, students, appeared, passed, compartment, failed, incomplete, passPercentage, averagePercentage, highestPercentage, averageGpa }`
  - By subject: `bySubject[] { subject, averageMarks }`
  - Toppers: `toppers[] { firstName, lastName, section, percentage, grade, gpa, result }` (top 10)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Change date range / threshold | per tab | same GET with query params |
| Switch academic year | per tab | same GET with header `X-Academic-Year-Id` (overview, attendance, fees) |
| Export defaulters | `reports.exports.fees` | `GET /reports/exports/fee-defaulters` (see RP-02) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/reports/dashboards/overview` | KPI tiles of the overview tab |
| GET | `/reports/dashboards/attendance?from=&to=&threshold=&minDays=` | Attendance tab (`threshold` 1-100, default 75; `minDays` default 5) |
| GET | `/reports/dashboards/fees?from=&to=&defaulterLimit=` | Fees tab (`defaulterLimit` 1-500, default 50) |
| GET | `/reports/dashboards/academics?examId=` | Academics tab (`examId` required) |
| GET | `/academics/academic-years` | Year switcher |
| GET | `/academics/exams` | Exam picker on the academics tab |

**Layout**
- Tabs across the top. Show only the tabs the role may open, so an accountant sees Overview and Fees.
- Year switcher in the header (default: the current year). It sends `X-Academic-Year-Id` on overview, attendance and fees. The academics tab follows the chosen exam's year.
- **Overview:**
  - A KPI row of headcount tiles (students, teachers, staff, sections, new admissions in 30 days).
  - An attendance tile: today's present % and "N of M sections taken". Show "Registers not taken yet" when `sectionsTaken` is 0.
  - A fee strip: net collected this year, this month, outstanding, overdue (with the `overdueInvoices` count), and collection rate. `collectionRate` null means nothing is billed yet; show "—".
  - An "Exam papers in the next 14 days" tile.
- **Attendance:**
  - Filter bar: date range (defaults to the year start up to today, clamped to the year), threshold %, minimum days.
  - Line chart of `trend` (daily percentage), with absent counts as light bars on a second axis.
  - Horizontal bar chart of `bySection.percentage`, sorted low to high. Show `periodPercentage` in the tooltip when present.
  - Table "Below threshold": student, section, %. Rows link to the student page.
  - Show the mode segments (`modes`) as a band above the chart when the school changed attendance mode during the range.
- **Fees:**
  - Date range for collections.
  - Column chart of `byMonth.amount`, a bar or donut of `byMethod`, and a grouped bar of `byClass` (billed, collected, outstanding).
  - Concessions table by category.
  - Defaulters table: admission no., name, section, invoices, oldest due date, overdue amount. Rows link to the student's fee statement. An "Export" button calls the defaulters export.
- **Academics:**
  - The exam picker is required. Empty state: "Pick an exam to see its results".
  - KPI tiles: students, pass %, compartment, failed, incomplete, average GPA (when not null).
  - Section table with the policy name and mode.
  - Bar chart of subject averages.
  - Toppers table.
  - Badge "Not published yet" when `resultsPublishedAt` is null: the figures come from live marks, published or not.
- Errors: 422 "No academic year for this report" shows a full-tab notice linking to academic-year setup. 404 for an unknown exam.
- All tabs are read-only.

---

### RP-02 · Exports
**Route:** `/reports/exports` · **Type:** Operations · **Who:** Students: `reports.exports.students` (ADMIN, PRINCIPAL, STAFF). Attendance: `reports.exports.attendance` (ADMIN, PRINCIPAL, STAFF). Fee collections and defaulters: `reports.exports.fees` (ADMIN, PRINCIPAL, ACCOUNTANT). Results: `reports.exports.results` (ADMIN, PRINCIPAL)

**Data shown**
- One card per export, with what the file contains:
  - **Students:** class, section, roll no., `studentCode`, `admissionNumber`, name, gender, date of birth, email, phone, status, parent name, phone and email
  - **Attendance:** one sheet per section. Roll no., student, then one column per day (or per session or period, by attendance mode)
  - **Fee collections:** date, receipt, invoice, admission no., student, method, reference, amount, kept as credit
  - **Fee defaulters:** class, admission no., name, invoices, oldest due date, overdue amount
  - **Results:** roll no., student, one column per subject, total, %, grade, result, rank (GPA, grace and class rank when the policy uses them)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Download students | `reports.exports.students` | `GET /reports/exports/students?format=` |
| Download attendance | `reports.exports.attendance` | `GET /reports/exports/attendance?sectionId=&from=&to=&format=` |
| Download fee collections | `reports.exports.fees` | `GET /reports/exports/fee-collections?from=&to=&format=` |
| Download fee defaulters | `reports.exports.fees` | `GET /reports/exports/fee-defaulters?format=` |
| Download results | `reports.exports.results` | `GET /reports/exports/results?examId=&sectionId=&format=` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/reports/exports/students?format=xlsx\|csv` | Roster of the year (`X-Academic-Year-Id` for another year) |
| GET | `/reports/exports/attendance?sectionId=&from=&to=&format=` | Section register, at most 62 days |
| GET | `/reports/exports/fee-collections?from=&to=&format=` | Payments received in a date range |
| GET | `/reports/exports/fee-defaulters?format=` | Overdue balances as of today (`X-Academic-Year-Id` for another year) |
| GET | `/reports/exports/results?examId=&sectionId=&format=` | Result sheet of one section for one exam |
| GET | `/academics/academic-years`, `/academics/sections`, `/academics/exams` | Pickers |

**Layout**
- A grid of cards. Show only the cards the role may use.
- Each card has its own small form and a Download button with a format toggle (Excel default, CSV):
  - Students: year picker.
  - Attendance: section (required), from and to (required). Hint: "Up to 62 days".
  - Fee collections: from and to (required).
  - Fee defaulters: year picker.
  - Results: exam, then section (both required).
- Downloads need the bearer token. Fetch the file as a blob, then save it under the server's file name (for example `students-2026-27.xlsx`). A plain link will not carry the token.
- Errors to show next to the card:
  - 422 "Export at most 62 days at a time".
  - 400 "must be on or after from" on the `to` field.
  - 404 for an unknown section or exam.
- Show a spinner on the button while the file is generated.

---

## Files

Files stores documents for students, staff members and the school in general (certificates, ID copies, photos, circulars). ADMIN and STAFF upload and delete; every staff role (ADMIN, PRINCIPAL, ACCOUNTANT, STAFF and the module managers) can browse and download. Downloads are never direct: the API returns a signed link valid for 15 minutes. Homework, submission and logo files belong to their own modules and do not appear here. This is an operations page. The type and size rules are fixed in code, so there is no setup.

### FL-01 · Documents
**Route:** `/files` (tabs `?ownerType=STUDENT|STAFF|GENERAL`) · **Type:** Operations · **Who:** `files.documents.read` (ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, HR_MANAGER, LIBRARIAN, TRANSPORT_MANAGER, HOSTEL_MANAGER, INVENTORY_MANAGER) opens the page. `files.documents.upload` and `files.documents.remove` (ADMIN, STAFF) show Upload and Delete. Activity tab: `files.activity.read`

**Data shown**
- List: `fileName`, `category` (`PHOTO`, `DOCUMENT`), `description`, `contentType`, `size`, `ownerType`, `ownerId`, `uploadedBy`, `createdAt`
- Detail: the same, plus `checksum`
- Download link: `url`, `fileName`, `contentType`, `expiresAt`
- Activity tab: the files module's audit entries (uploads and deletions)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Upload | `files.documents.upload` | `POST /files` (multipart) |
| Download | `files.documents.read` | `GET /files/:fileId/download-url` |
| Delete | `files.documents.remove` | `DELETE /files/:fileId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/files?ownerType=&ownerId=&page=&limit=` | Table (paginated) |
| GET | `/files/:fileId` | Detail drawer |
| GET | `/files/:fileId/download-url` | Signed link (15 minutes) |
| POST | `/files` | Multipart: `file`, `ownerType` (`STUDENT`, `STAFF`, `GENERAL`), `ownerId` (student or staff-member id; omit for GENERAL), `category`, `description` (max 300) |
| DELETE | `/files/:fileId` | Delete |
| GET | `/users/students`, `/users/staff` | Owner pickers (filter and upload) |
| GET | `/files/activity?…`, `/files/activity/:auditLogId` | Activity tab and entry |

**Layout**
- Tabs: Student documents, Staff documents, General, Activity (owners only). The tab sets `ownerType`.
- Filter bar: owner picker (student search on the Student tab, staff search on the Staff tab). It maps to `ownerId`.
- Table columns: file name (with a type icon from `contentType`), category, description, size (human-readable), uploaded at, uploaded by. Actions per row: Download, Delete (permission-gated).
- Download: call `download-url`, then open `url` in a new tab. The link needs no token. Do not cache it: it expires at `expiresAt`.
- Upload drawer: owner type (preset by the tab), owner (required for student and staff), category (Photo or Document), description, file drop zone. Show the limits:
  - Photo: JPEG, PNG or WebP, up to 5 MB.
  - Document: PDF, Word, Excel, PowerPoint, text, CSV or images, up to 10 MB.
- Upload errors:
  - 400 for wrong type, too large, or "The content of … is not a valid … file" (the content does not match the declared type).
  - 422 "ownerId is required for student and staff files".
  - 422 "ownerId does not refer to an existing … record".
- Delete asks for confirmation ("Delete this file? This cannot be undone").
- The same list can be embedded as a "Documents" tab on the student and staff profile pages, with `ownerType` and `ownerId` fixed.
- Empty state: "No documents yet."

**Notes / Gap:**
- **Gap:** `uploadedBy` is a user id, and rows carry no owner name. The UI must resolve both names separately.
- **Gap:** the list cannot filter by `category`. The service supports it, but the validator does not accept it.
- **Gap:** STAFF can upload staff documents but cannot list `/users/staff` (ADMIN, PRINCIPAL only) to find the `ownerId`.
- **Gap:** teachers are not staff members (`STAFF` checks non-teaching staff records), so a teacher's documents cannot be filed here except as GENERAL.

---

## Portal (students and parents)

The portal is self-service for students, parents, teachers and every employee. Students see their own records. Parents see each linked child, one at a time, through a child switcher. Teachers see their sections and timetable. All employees, teachers included, see their own attendance, leave and payslips. Everything is read-only except:
- homework submission (students only);
- online fee payment (students and parents);
- library holds;
- leave applications and cancellations.

Every child-scoped endpoint returns 404 for a child the caller is not linked to, so other students' ids are never confirmed. There are no setup pages.

### PO-01 · Child switcher and portal home
**Route:** `/me/students/:studentId` (home). A student lands on their own id; a parent lands on their first child · **Type:** Self-service · **Who:** STUDENT, PARENT, with `portal.learning.students`

**Data shown**
- Switcher entries (`GET /me/students`): `id`, `studentCode`, `admissionNumber`, `firstName`, `lastName`, `current { academicYearId, sectionId, section, rollNumber, status }`
- Home cards for the selected child:
  - Today's classes: today's `days[].slots` from the timetable
  - Attendance: `percentage`, `basis`, `counts.ABSENT` (year so far)
  - Homework due: `meta.total` of pending homework, plus the next few `title` and `dueDate`
  - Fees: `totals.balance`, `totals.overdue`, the next unpaid invoice (`invoiceNumber`, `dueDate`, `balance`)
  - Coming up: the next calendar events (`title`, `startDate`, `eventType`)
  - Latest result: the most recent report (`exam.examName` or `scheme`, `result`, `percentage` or `grade`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Switch child | PARENT | `GET /me/students` (loaded once), then change `:studentId` in the URL |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students` | Switcher and the child header |
| GET | `/me/students/:studentId/timetable` | Today's classes card |
| GET | `/me/students/:studentId/attendance` | Attendance card |
| GET | `/me/students/:studentId/homework?status=pending&limit=5` | Homework card |
| GET | `/me/students/:studentId/fees` | Fees card |
| GET | `/me/calendar?from=&to=&limit=5` | Coming up card |
| GET | `/me/students/:studentId/report-cards` | Latest result card |

**Layout**
- The header shows the child switcher: a dropdown of "firstName lastName · section · roll rollNumber".
  - Hide the dropdown when the list has one entry (every student, and parents with one child). Show the name as plain text instead.
  - `current` can be null (not enrolled this year, or no current year). Show "Not enrolled this year" in place of section and roll, and replace the timetable, homework and attendance cards with that notice.
- Keep the selected child in the URL (`/me/students/:studentId/...`), so a reload, a bookmark or a shared link keeps the child. When switching, keep the sub-page (timetable stays timetable).
- If the URL's `:studentId` is not in `/me/students`, or any child endpoint returns 404, show "This student is not linked to your account" and offer the switcher. Do not retry.
- An empty `/me/students` for a parent means no linked children: show "No children are linked to your account yet. Please contact the school office."
- The cards form a responsive grid. Each card links to its full page (PO-02 to PO-09). Each card loads on its own, so one failing call (for example 422 "The school has not set a current academic year yet") does not blank the page.
- Side navigation: Home, Timetable, Attendance, Homework, Results, Fees, Library, Transport and hostel, Calendar, plus the inbox (covered elsewhere).

---

### PO-02 · Timetable
**Route:** `/me/students/:studentId/timetable` · **Type:** Self-service · **Who:** STUDENT, PARENT, with `portal.learning.students`

**Data shown**
- `section.name`, `academicYearId`
- `periods[] { periodNumber, name, startTime, endTime, isBreak }`
- `days[] { weekday, name, slots[] { period, subject, teacher.name, room } }`. Weekly off days are already left out.

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| None (read-only) | | |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/timetable` | The weekly grid of the child's current section |

**Layout**
- Desktop: a grid editor look but read-only. Columns are days, rows are periods (with times). Break periods show as a shaded full-width row. Each cell shows the subject, teacher and room.
- Mobile: a day picker (defaults to today) with a list of that day's periods.
- Highlight the current period when viewing today.
- 404 "Current enrollment": show "Not enrolled in a section this year". 422 when there is no current year: show "The school has not set up this year yet".
- Empty cell means a free period.

---

### PO-03 · Attendance
**Route:** `/me/students/:studentId/attendance` · **Type:** Self-service · **Who:** STUDENT, PARENT, with `portal.learning.students`

**Data shown**
- Summary: `percentage`, `basis` (`DAYS` or `PERIODS`), `dayPercentage`, `workingDays`, `marked`, `unmarked`, `attendedDays`, `countableDays`, `counts { PRESENT, ABSENT, LATE, HALF_DAY, EXCUSED }`, `mode`
- Period-wise schools: `periods` (tally and percentage), `subjects` (per-subject attendance), `periodPresenceThreshold`
- Days: `days[] { date, status, remarks, attended, breakdown[] { label, subject.subjectName, status, remarks } }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Change date range | STUDENT, PARENT | same GET with `from`, `to` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/attendance?from=&to=` | Summary and day list (current year; the range defaults to the year so far) |

**Layout**
- KPI row: attendance % (with the basis as a caption, for example "by periods"), present, absent, late, half day, excused.
- Month calendar view. Each marked day is coloured by `status`; days with no mark stay blank. Clicking a day opens a popover with the `breakdown` (sessions or periods with their subject and status) and `remarks`.
- Period-wise schools add a "By subject" table from `subjects`.
- Range filter: This month, This term (custom from/to), Whole year.
- 404 "Enrollment for this student in the academic year": show "Not enrolled this year".

**Notes / Gap:**
- **Gap:** families cannot see earlier years. The portal route takes no `academicYearId`, although the service supports it.

---

### PO-04 · Homework
**Route:** `/me/students/:studentId/homework` (list), `/me/students/:studentId/homework/:homeworkId` (detail) · **Type:** Self-service · **Who:** STUDENT and PARENT read (`portal.homework.read`). Only STUDENT submits (`portal.homework.submit`)

**Data shown**
- List: `title`, `subject`, `assignedOn`, `dueDate`, `maxMarks`, `allowLateSubmission`, `myStatus` (`NOT_SUBMITTED`, `SUBMITTED`, `LATE`, `RETURNED`, `GRADED`), `mySubmission.marksAwarded`
- Detail: `title`, `description`, `subject`, `dueDate`, `maxMarks`, `allowLateSubmission`, `attachments[] { id, fileName, contentType, size }`
- My submission: `mySubmission { content, submittedAt, isLate, status, marksAwarded, feedback, attachments[] }`, `myStatus`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Download a homework or submission file | STUDENT, PARENT | `GET /me/students/:studentId/homework/:homeworkId/attachments/:fileId/download-url` |
| Submit or resubmit | STUDENT only (`portal.homework.submit`) | `POST /me/homework/:homeworkId/submission` (multipart) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/homework?status=pending\|submitted\|graded&page=&limit=` | List (paginated, current year) |
| GET | `/me/students/:studentId/homework/:homeworkId` | Detail with attachments and own submission |
| GET | `/me/students/:studentId/homework/:homeworkId/attachments/:fileId/download-url` | Signed link, valid 15 minutes |
| POST | `/me/homework/:homeworkId/submission` | Multipart: `content` (text, max 10,000) and/or `file` |

**Layout**
- Tabs: Pending (`status=pending`: not submitted or returned), Submitted, Graded. Columns: subject, title, due date (red when past and pending), status badge, marks (`marksAwarded` / `maxMarks`).
- The detail page shows the description and attachment list (each opens its signed `url`). Below that comes the submission panel:
  - **Student:** a text box and one file picker. "Submit" when nothing has been sent; "Resubmit" while not graded. A RETURNED badge shows the teacher's `feedback` first. Hide the form once `GRADED`, and show marks and feedback instead.
  - **Parent:** the same panel, read-only. No form, and the caption "Only the student can submit".
- Past the due date with `allowLateSubmission` false: disable Submit, with "The due date has passed". With late allowed, warn "This will be marked late".
- Errors:
  - 422 "Send some text or attach a file".
  - 422 "The due date (…) has passed".
  - 409 "This homework has already been graded" (reload the detail).
  - 400 for a bad file type, size or content.
- Empty state per tab, for example "Nothing pending".

---

### PO-05 · Results and report cards
**Route:** `/me/students/:studentId/results` · **Type:** Self-service · **Who:** STUDENT, PARENT, with `portal.learning.students`

**Data shown**
- `student { rollNumber, section.name }`, `academicYearId`
- `reports[]`, one per published exam or assessment scheme:
  - `kind` (`EXAM` or `SCHEME`), `exam` or `scheme` (name), `publishedAt`, `version`
  - Subject lines: `subjects[]` (subject, `marksObtained`, `maxMarks`, grade, status), `coScholastic[]`
  - Totals: `totalObtained`, `totalMax`, `percentage`, `grade`, `gpa`, `result`
  - Problem subjects: `failedSubjects`, `compartmentSubjects`
  - Standing: `rank`, `classRank`, `sectionSize`, `classSize`, `sectionAverage`
  - Policy: `policy { name, gradingMode }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Download report card PDF | STUDENT, PARENT | `GET /me/students/:studentId/report-cards/pdf?examId=` or `?schemeId=` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/report-cards?examId=&schemeId=&academicYearId=` | Published reports (default: current year) |
| GET | `/me/students/:studentId/report-cards/pdf?examId=` or `?schemeId=` | PDF of one published report (send exactly one of the two) |

**Layout**
- A list of report cards, newest first: exam or scheme name, published date, result badge (PASS, COMPARTMENT, FAIL) and percentage or grade. Show "Version N" when `version` > 1 (a corrected result).
- Expanding one shows the subject table (subject, marks/max, grade, pass or fail), then co-scholastic grades, then totals and rank.
- Some fields come back null when the school's policy hides them from families (ranks, or marks for pass/fail grading). Hide those columns rather than showing blanks.
- "Download PDF" fetches the file with the token as a blob. The PDF is built from the published snapshot, so it matches the screen.
- Errors:
  - 404 "Published results for this exam" (withdrawn or not published): show "Results are not available".
  - 409 "This report card failed its integrity check…": show the message as is.
- Empty state: "No results published yet this year."

**Notes / Gap:**
- **Gap:** families have no way to list past academic years, so an `academicYearId` cannot be picked: `/academics/academic-years` is staff-only.

---

### PO-06 · Fees and online payment
**Route:** `/me/students/:studentId/fees` (statement), `/me/students/:studentId/fees/invoices/:invoiceId` (invoice) · **Type:** Self-service · **Who:** STUDENT, PARENT. Reading needs `portal.fees.read`; paying needs `portal.fees.pay`

**Data shown**
- Summary: `totals { gross, concessions, lateFees, lateFeesWaived, billed, paid, refunded, balance, overdue }`, `credit.balance`, `installmentPlan { name, installmentCount }` (null: the default plan)
- Concessions: `concessions[] { name, category, concessionType, value, amount, reason }`
- Invoices: `invoices[] { id, invoiceNumber, issueDate, dueDate, total, discount, lateFee, amountPaid, balance, status, isOverdue, lateFeeWaiver }`
- Payments: `payments[] { id, receiptNumber, paidAt, amount, method, excessAmount, refundedAmount }`
- Refunds: `refunds[] { id, refundNumber, amount, status, processedAt }`. Only `PENDING`, `PROCESSED` and `FAILED` are shown to families.
- Credit history: `creditEntries`
- Invoice detail: the invoice above plus `lines[] { description, amount, discount, netAmount }`, `concessions`, `payments`, `creditApplications`
- Payment order (after "Pay"): `paymentId`, `orderId`, `keyId`, `amount`, `amountMinor`, `currency`, `invoiceNumber`, `invoiceBalance`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Start online payment | `portal.fees.pay` | `POST /me/students/:studentId/invoices/:invoiceId/payment-orders` |
| Confirm payment after checkout | `portal.fees.pay` | `POST /me/payments/confirmations` |
| Download receipt | `portal.fees.read` | `GET /me/payments/:paymentId/receipt` |
| Download refund receipt | `portal.fees.read` | `GET /me/refunds/:refundId/receipt` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/fees?academicYearId=` | Statement (default: current year) |
| GET | `/me/students/:studentId/invoices/:invoiceId` | Invoice detail |
| POST | `/me/students/:studentId/invoices/:invoiceId/payment-orders` | `{ amount? }`: no amount pays the full balance |
| POST | `/me/payments/confirmations` | `{ orderId, paymentId, signature }` from the gateway checkout |
| GET | `/me/payments/:paymentId/receipt` | Receipt PDF (our payment `id`) |
| GET | `/me/refunds/:refundId/receipt` | Refund receipt PDF (PROCESSED, or PENDING marked as pending) |

**Layout**
- Summary cards: balance due, overdue (red), paid this year, credit held (only when > 0).
- Invoices table: invoice no., due date, total, paid, balance, status badge, plus "Overdue" when `isOverdue`. Rows open the invoice page, which has its lines table, concessions, late fee (with waiver note) and payments. A "Pay" button shows on rows with `balance` > 0 and status `ISSUED` or `PARTIALLY_PAID`.
- Pay flow:
  1. The pay dialog offers the full balance or another amount. The minimum is 100.00, or the whole balance when it is smaller.
  2. `POST …/payment-orders` returns the order.
  3. Open the Razorpay checkout with `key: keyId`, `order_id: orderId`, `amount: amountMinor`, `currency`.
  4. On success, send `razorpay_order_id`, `razorpay_payment_id` and `razorpay_signature` as `orderId`, `paymentId` and `signature`.
  5. The response is the recorded payment (`id`, `receiptNumber`, `excessAmount`). Show "Payment confirmed. Receipt …". When `excessAmount` > 0, add the message part "… kept as credit".
  6. Offer "Download receipt" (with `id`) and refresh the statement.
- If the checkout is closed or the confirmation fails (422 "The payment could not be verified. If money was deducted, it will be confirmed automatically."), show that text. Refresh the statement later: the webhook records the payment.
- Payments table: date, receipt no., method, amount, and a "Receipt" button (PDF, fetched as a blob with the token).
- Refunds table: refund no., amount, status, date, and a "Refund receipt" button for PROCESSED and PENDING.
- Errors on Pay (422, shown in the dialog):
  - the school has not set up online payments (hide Pay after the first such error);
  - "The amount exceeds the invoice balance of …";
  - "The minimum online payment is …";
  - "This invoice is cancelled";
  - "This invoice is already fully paid".
- Empty state: "No fees billed yet this year."

**Notes / Gap:**
- **Gap:** one payment covers one invoice. There is no combined checkout across several invoices or across siblings: a parent with two children pays each invoice separately.
- **Gap:** past years' statements need `academicYearId`, which families cannot list (see PO-05).

---

### PO-07 · Library
**Route:** `/me/students/:studentId/library` (students and parents), `/library/my-loans` (teachers and staff); tabs Loans, Holds, Fines · **Type:** Self-service · **Who:** everyone. Loans and fines need `library.loans.readOwn`; holds need `library.holds.own`

**Data shown**
- Loans: `book { title, authors, isbn }`, `copy.accessionNumber`, `borrower.name`, `borrowerUserId`, `issuedOn`, `dueDate`, `returnedOn`, `status` (`ISSUED`, `RETURNED`, `LOST`), `renewalCount`, `isOverdue`, `daysOverdue`, `fineTotal`, `fineOutstanding`, `fineIsFinal`
- Holds: `book { title, authors, itemType }`, `status` (`WAITING`, `READY`, `FULFILLED`, `CANCELLED`, `EXPIRED`), `queuePosition`, `requestedAt`, `notNeededAfter`, `readyOn`, `pickupBy`, `copy.accessionNumber`, `borrower.name`
- Fines (one account per borrower):
  - `borrower { id, name }`
  - Standing: `openLoans`, `overdueLoans`, `finesOutstanding`, `credit`, `canBorrow`, `blocks`
  - `loansWithFines[] { title, dueDate, lateFine, lostCharge, damageCharge, finePaid, fineWaived, fineOutstanding }`
  - `payments`, `credits`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Place a hold | `library.holds.own` (a parent sends `borrowerUserId`) | `POST /library/my-holds` |
| Cancel a hold | `library.holds.own` | `POST /library/my-holds/:holdId/cancellation` |
| Find a book to reserve | everyone | `GET /library/catalogue` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/my-loans?status=&overdue=&withFine=&bookId=&page=&limit=` | Loans tab (paginated). A parent gets every child's loans |
| GET | `/library/my-holds?status=&open=&bookId=&page=&limit=` | Holds tab (paginated). A parent gets every child's holds |
| POST | `/library/my-holds` | `{ bookId, notNeededAfter?, borrowerUserId? }` |
| POST | `/library/my-holds/:holdId/cancellation` | Cancel own or own child's hold |
| GET | `/library/my-fines` | Fines tab: an array of accounts (one for self, one per child for a parent) |
| GET | `/library/catalogue`, `/library/catalogue/:bookId` | Search and pick a book for a hold |

**Layout**
- Loans tab: sub-filters "On loan" (`status=ISSUED`), "Overdue" (`overdue=true`), "History". Columns: title, accession no., issued, due (red with "N days overdue"), returned, fine (`fineOutstanding`, with "still growing" when `fineIsFinal` is false).
- Holds tab: open holds first (`open=true`). Columns: title, status, queue position ("You are 2nd in line"), "Collect by `pickupBy`" when READY, and a Cancel button for WAITING or READY with confirmation. "Reserve a book" opens a catalogue search drawer, then asks for an optional "not needed after" date.
- Fines tab: a card per account showing the outstanding amount and credit. When `canBorrow` is false, show the `blocks` reasons in a warning box. Below come loans with fines, then payments.
- Parents: the API returns all children. Filter the rows client-side to the selected child (by `borrowerUserId`, `borrower.id` on fines), and send that child's user id as `borrowerUserId` when placing a hold.
  - 422 "Parents cannot borrow books; send borrowerUserId…" if it is missing.
  - 404 "Borrower" for a user who is not your child.
- Other hold errors (shown as a toast): 409 "… already has a hold on …", 422 "… already has … on loan", and 422 for the hold limit or a book that cannot be lent.
- Fines are paid at the library desk. There is no online payment here.

**Notes / Gap:**
- **Gap:** `GET /me/students` does not return the child's `userId`, which library self-service needs (`borrowerUserId`, and row filtering by child). Today the UI can only match by name against `borrower.name` in `/library/my-fines`. Add `userId` to `/me/students`, or let `my-*` take `studentId`.
- **Gap:** borrowers cannot renew loans themselves (no self-service renewal route).

---

### PO-08 · Transport and hostel
**Route:** `/me/students/:studentId/transport-hostel` · **Type:** Self-service · **Who:** STUDENT, PARENT. Transport needs `transport.myTransport.read`; hostel needs `hostel.myHostel.read`

**Data shown**
- Transport (one entry per child):
  - `student { id, studentCode, firstName, lastName }`; `transport` is null when the child has no active seat
  - Seat: `transport { direction, startDate, endDate, route { name, code } }`
  - Stop: `stop { name, sequence, landmark, pickupTime, dropTime, monthlyFee }`
  - Bus and contacts: `vehicle { registrationNumber, make, model, status }`, `driver { name, phone }`, `attendant { name, phone }`
- Hostel (one entry per child):
  - `student { id, studentCode, name }`
  - Current bed (or null): `current { fromDate, toDate, bedNumber, room }`, `hostel { name, code, address, contactPhone }`, `warden { name, phone }`
  - Booked ahead: `upcoming[]` (same shape)
  - Resources: `resources[] { phase, fromDate, toDate, withBed, resource { name, resourceType, customType, monthlyFee } }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Call driver, attendant or warden | STUDENT, PARENT | `tel:` link from the phone numbers in the response |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/transport/my-transport` | Transport card (current year). Returns every visible child in one response |
| GET | `/hostel/my-hostel` | Hostel card. Returns every visible child in one response |

**Layout**
- Two cards side by side (stacked on mobile): Transport and Hostel.
- Both endpoints return all children at once. Call each once and pick the entry where `student.id` equals the URL's `:studentId`. Cache the responses while switching children.
- Transport card:
  - Route name and code, stop name with landmark.
  - Pickup time and drop time. One of them is null for `PICKUP_ONLY` or `DROP_ONLY`; show "Not using this leg".
  - Vehicle number and model, then driver and attendant with tap-to-call.
  - Monthly fee, and the valid from and to dates.
  - When `transport` is null: "No school transport assigned."
- Hostel card:
  - Hostel name, room and bed, from and to dates, warden with tap-to-call, hostel phone.
  - An "Upcoming" list for beds booked ahead.
  - A resources list (locker, mess or laundry plan, with monthly fee).
  - When `current` is null and `upcoming` is empty: "No hostel place."
- Hide a card entirely when the school does not use that module, that is, every child returns null or empty.

---

### PO-09 · Calendar
**Route:** `/me/calendar` · **Type:** Shared · **Who:** everyone, with `portal.learning.calendar`

**Data shown**
- Events: `title`, `eventType` (`HOLIDAY`, `VACATION`, `EXAM`, `EVENT`, `MEETING`, `OTHER`), `startDate`, `endDate`, `isHoliday`, `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Filter by month or type | everyone | same GET with `from`, `to`, `eventType` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/calendar?from=&to=&eventType=&page=&limit=` | Events overlapping the range in the current academic year (paginated, `limit` up to 100) |

**Layout**
- Month grid by default, with a list view toggle. Multi-day events span their days. Holidays and vacations are shaded.
- Filters: month navigation (sets `from` and `to` to the month bounds; use `limit=100`), event type chips.
- Clicking an event opens a popover with its dates and description.
- Families reach it from the portal side navigation; it is not child-specific. Staff and teachers reach it from their own menu.
- Empty state: "No events this month."

---

### PO-10 · Teacher: my sections and my timetable
**Route:** `/me/teaching` (tabs: Sections, Timetable) · **Type:** Self-service · **Who:** TEACHER, with `portal.learning.teaching`

**Data shown**
- Sections: `sectionId`, `section` (for example "5-A"), `isClassTeacher`, `isDeputyClassTeacher`, `subjectIds`
- Timetable:
  - `weeklyLessons`
  - `periods[] { periodNumber, name, startTime, endTime, isBreak }`
  - `days[] { weekday, name, slots[] { period, subject, section.name, room } }`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Open a section's work pages | TEACHER | links to attendance, marks, homework and the section timetable (other sections of this document) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/teaching/sections` | Section cards (current year) |
| GET | `/me/teaching/timetable` | Teacher's weekly grid (current year) |
| GET | `/academics/subjects` | Subject names for `subjectIds` |

**Layout**
- Sections tab: one card per section, with a "Class teacher" or "Deputy class teacher" badge and the subject chips the teacher teaches there (names from `/academics/subjects`). Quick links per card: Take attendance, Marks, Homework, Timetable. Class teachers also get Report cards.
- Timetable tab: the same read-only grid as PO-02, but cells show subject, section and room. The header shows "N lessons a week" (`weeklyLessons`). Highlight the current period today.
- Errors:
  - 404 "Teacher profile": show "Your account has no teacher profile. Contact the office."
  - 422 when there is no current year.
- Empty state for sections: "You have no sections assigned this year."

**Notes / Gap:**
- **Gap:** `/me/teaching/sections` returns only `subjectIds`, so subject names need an extra call.

---

### PO-11 · Staff self-service
**Route:** `/hr/me` (tabs: Attendance, Leave, Payslips) · **Type:** Self-service · **Who:** every employee: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, HR_MANAGER, LIBRARIAN, TRANSPORT_MANAGER, HOSTEL_MANAGER, INVENTORY_MANAGER, TEACHER. Permissions: `hr.staffAttendance.readOwn`, `hr.leaveBalances.readOwn`, `hr.leaveRequests.readOwn`, `hr.leaveRequests.apply`, `hr.leaveRequests.cancel`, `hr.payslips.readOwn`

**Data shown**
- Attendance: `from`, `to`, `counts { PRESENT, ABSENT, HALF_DAY, LEAVE, ON_DUTY }`, `marked`, `daysPresent`, `days[] { date, status, checkIn, checkOut, remarks, leaveRequestId }`
- Leave balances: `year`, `balances[] { name, code, isPaid, quota, used, pending, remaining }`
- Leave requests: `leaveType` (name), `fromDate`, `toDate`, `halfDay`, `days`, `reason`, `status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), `decisionNote`, `decidedAt`, `cancelReason`
- Payslips list: `month`, `payslipNumber`, `grossPay`, `totalDeductions`, `netPay`
- Payslip detail:
  - Who: `employeeName`, `employeeCode`, `designation`
  - Days: `daysInMonth`, `paidDays`, `lopDays`
  - Pay: `earnings`, `deductions`, `totalEarnings`, `lopAmount`, `grossPay`, `totalDeductions`, `netPay`
  - Bank and tax: `bankAccountMasked`, `panMasked`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Apply for leave | `hr.leaveRequests.apply` | `POST /hr/leave-requests` |
| Cancel own pending leave | `hr.leaveRequests.cancel` | `POST /hr/leave-requests/:requestId/cancellation` |
| Download payslip PDF | `hr.payslips.readOwn` | `GET /hr/me/payslips/:payslipId/pdf` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/me/attendance?from=&to=` | Attendance tab (default: this month so far; range up to 366 days) |
| GET | `/hr/me/leave-balances?year=` | Balance cards (default: this calendar year) |
| GET | `/hr/me/leave-requests?status=&leaveTypeId=&from=&to=&page=&limit=` | Own requests (paginated) |
| GET | `/hr/leave-types` | Leave type picker in the apply form |
| POST | `/hr/leave-requests` | `{ leaveTypeId, fromDate, toDate, halfDay, reason }` |
| POST | `/hr/leave-requests/:requestId/cancellation` | `{ reason? }` |
| GET | `/hr/me/payslips?page=&limit=` | Finalised payslips, newest month first |
| GET | `/hr/me/payslips/:payslipId` | Payslip detail drawer |
| GET | `/hr/me/payslips/:payslipId/pdf` | Payslip PDF |

**Layout**
- Attendance tab:
  - Month picker (sets `from` and `to`). KPI row: days present (`daysPresent`), absent, half day, leave, on duty.
  - Calendar heat map coloured by `status`, with `checkIn` and `checkOut` in the tooltip.
  - Days marked by an approved leave show the leave type in `remarks`.
- Leave tab:
  - Balance cards per leave type: remaining of quota, with used and pending below. Unpaid types get a caption. Year picker.
  - Requests table: type, dates (with "½ day"), days, status badge, decision note. A "Cancel" button shows only on PENDING rows, with a confirmation and an optional reason.
  - The "Apply for leave" drawer has type, from, to, half day (only when from equals to) and reason (required, max 500). Show the chosen type's remaining balance in the form. When the type needs no approval, warn "This will be approved at once".
  - Errors:
    - 409 "You already have a … leave request … that overlaps these dates".
    - 422 "Not enough … balance for …".
    - 400 "must be in the same calendar year as fromDate".
    - Payroll for those dates is already finalised (error shown as returned).
    - Cancel: 409 "Approved leave can only be cancelled by an HR administrator".
- Payslips tab: a table of month, payslip no., gross, deductions and net. A row opens a drawer with the earnings and deductions breakdown and the days paid or LOP. A "Download PDF" button fetches the file with the token as a blob. Only finalised payslips appear; another person's id returns 404.
- Empty states: "No attendance marked this month", "No leave requests", "No payslips yet."

**Notes / Gap:**
- **Gap:** an employee cannot open one of their own requests by id: `GET /hr/leave-requests/:requestId` is for HR only. Use the list row.

### PO-15 · Daily diary
**Route:** `/me/students/:studentId/diary?date=` (My school side list, after Homework) · **Type:** Self-service · **Who:** STUDENT and PARENT read (`portal.diary.read`); PARENT signs (`portal.diary.sign`).

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/me/students/:studentId/diary/day?date=` | The day: the section's lines, notes to this family, online homework, `signature`, `changedSinceSigned` |
| GET | `/me/students/:studentId/diary/days?from=&to=` | Recent days: `entries`, `signedAt`, `changedSinceSigned` |
| PUT | `/me/students/:studentId/diary/signature` | Sign `{ date, note? }`; signing again replaces the signature and note |

**Layout**
- ‹ date › with Today. The day as in AC-20 (homework links to PO-03's detail). Signature card: who signed and when; "Changed after it was signed" asks to sign again; a parent gets a note box ("Note to the class teacher") and **Sign the diary** / **Sign again**. A day with nothing written can still be signed to send a note.
- Recent days (30): date, lines, Signed / Not signed / Changed; a row opens that day.

---

## Library

The library module runs the school library: lending terms, the catalogue and its copies, the circulation desk (issue, return, renew, fines, lost and found), holds, stock checks and reports. It is an add-on module owned by `LIBRARIAN`. ADMIN, the built-in librarian and anyone made a library owner (`/administration/access`) hold every library permission, including the owner-only ones: changing the policy (`library.policy.manage`), waiving fines (`library.loans.waiveFine`) and the activity log (`library.activity.read`). Operators (for example a "Library desk" role) hold only the keys ticked in their operator role. PRINCIPAL reads loans, fines, holds, stock checks and reports, but changes nothing. Students and staff borrow; parents cannot borrow but see their children's loans in the Portal. **Setup** pages (LB-01 to LB-03) set lending terms, closed days and the catalogue. **Operations** pages (LB-04 to LB-08) are daily desk work. The module's activity tab (`GET /library/activity`, `GET /library/activity/:auditLogId`, key `library.activity.read`) uses the shared **Module activity** component.

---

### LB-01 · Policy and circulation rules
**Route:** `/library/policy` (tabs: Policy, Circulation rules) · **Type:** Setup · **Who:** ADMIN, LIBRARIAN and library owners (edit); PRINCIPAL and operators holding any staff library key (read-only). Shown in the sidebar to holders of `library.policy.manage` or `library.circulationRules.manage`, or of any staff read key (`library.books.read`, `library.loans.read`). The read keys `library.policy.read` and `library.circulationRules.read` are held by everyone, so they do not decide who sees the page.

**Data shown**
- Policy tab (`GET /library/policy`), in groups:
  - Borrowing blocks: `blockOnFines`, `fineBlockThreshold`, `blockOnOverdue`
  - Fines: `fineDayBasis` (`ACADEMIC_DAYS` or `CALENDAR_DAYS`), `capFineAtPrice`
  - Lost and found: `lostProcessingFee`, `lostMinimumCharge`, `lostIncludesLateFine`, `lostFoundRefundDays`
  - Holds: `holdPickupDays`, `maxHoldsPerBorrower`
  - Reminders: `dueSoonDays`, `overdueReminderEveryDays`, `notifyParents`
  - `setupNeeded` (for example `["fineBlockThreshold"]`)
- Circulation rules tab: `appliesTo` (readable label), `borrowerRole`, `class.className`, `itemType`, `loanDays`, `maxLoans`, `maxRenewals`, `finePerDay`, `fineGraceDays`, `maxFine`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Save the policy | `library.policy.manage` (owner-only: ADMIN, LIBRARIAN, library owners) | `PATCH /library/policy` |
| Add a rule | `library.circulationRules.manage` | `POST /library/circulation-rules` |
| Edit a rule | `library.circulationRules.manage` | `PATCH /library/circulation-rules/:ruleId` |
| Delete a rule | `library.circulationRules.manage` | `DELETE /library/circulation-rules/:ruleId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/policy` | Policy form. The first call creates the policy and the default rules |
| PATCH | `/library/policy` | Save changed fields only |
| GET | `/library/circulation-rules?borrowerRole=&classId=&itemType=` | Rules table (paginated) |
| GET | `/library/circulation-rules/:ruleId` | Rule drawer |
| POST | `/library/circulation-rules` | New rule |
| PATCH | `/library/circulation-rules/:ruleId` | Edit rule |
| DELETE | `/library/circulation-rules/:ruleId` | Remove rule |
| GET | `/academics/classes` | Class picker in the rule form |

**Layout**
- Policy tab: the Settings form template. Show a warning banner when `setupNeeded` contains `fineBlockThreshold`: "Fines do not block borrowing until you set a fine limit". Show `fineBlockThreshold` only when `blockOnFines` is on. Explain `fineDayBasis` in one line under the field. Users without `library.policy.manage` see the form read-only, with no Save button. Operators never hold this key.
- Rules tab: a table with columns Applies to (`appliesTo`), Loan days, Max loans, Renewals, Fine/day, Grace days, Max fine. Filters: borrower role (`borrowerRole`), class (`classId`), item type (`itemType`). A row click opens a side drawer. The "New rule" button opens the same drawer empty.
- Rule form: `borrowerRole` (blank means any borrower; options are `STUDENT` and the staff roles), `classId` (shown only when `borrowerRole` is `STUDENT`), `itemType` (`BOOK`, `PERIODICAL`, `MEDIA`, blank means any; `REFERENCE` is never lent), then the terms.
- Help text: "The most specific rule applies. Its terms are copied onto each loan, so editing or deleting a rule does not change loans already issued. The rule with no item type also caps the total number of loans."
- Errors to show as they are: 409 "A circulation rule for … already exists"; 422 "A rule for a class applies to students; set borrowerRole to STUDENT".
- Delete asks for confirmation and names the rule (`appliesTo`).

---

### LB-02 · Closures
**Route:** `/library/closures` · **Type:** Setup · **Who:** ADMIN, LIBRARIAN, library owners and operators holding `library.closures.manage` (edit). Library staff see it read-only. `library.closures.read` is held by everyone.

**Data shown**
- Closed periods: `fromDate`, `toDate`, `reason`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a closure | `library.closures.manage` | `POST /library/closures` |
| Remove a closure | `library.closures.manage` | `DELETE /library/closures/:closureId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/closures?from=&to=` | Table rows (paginated). Defaults to the current year |
| POST | `/library/closures` | `{ fromDate, toDate, reason }` |
| DELETE | `/library/closures/:closureId` | Remove |

**Layout**
- A small table with columns From, To, Days, Reason, and a date-range filter (`from`, `to`). "Add closure" opens a dialog with the three fields. `toDate` must be on or after `fromDate` and within a year of it (field errors from `VALIDATION_ERROR`).
- No edit: to change a closure, remove it and add it again.
- Help text: "Only for days outside the school calendar (the break between two academic years, a renovation week). Fines skip these days, and due dates move past them."
- Removing a closure asks for confirmation.

---

### LB-03 · Catalogue
**Route:** `/library/books`, `/library/books/:bookId` (staff view); `/library/catalogue`, `/library/catalogue/:bookId` (browse view) · **Type:** Setup (staff view), Shared (browse view) · **Who:** Staff view: ADMIN, LIBRARIAN, PRINCIPAL, library owners and operators holding `library.books.read`. The Copies tab needs `library.copies.read`. Browse view: everyone (`library.books.browse`).

**Data shown**
- Staff list: `title`, `authors`, `isbn`, `category`, `itemType`, `shelfLocation`, `subject.subjectName`, copy counts `copies.total`, `copies.available`, `copies.issued`, `copies.onHold`, and `holdsWaiting`
- Book header: `title`, `subtitle`, `authors`, `isbn`, `publisher`, `publishedYear`, `edition`, `language`, `category`, `itemType`, `subject`, `shelfLocation`, `description`, `internalNotes` (staff only), and status chips from `copies.lost`, `copies.damaged`, `copies.missing`, `copies.withdrawn`
- Copies tab: `accessionNumber`, `barcode`, `status`, `itemType` (blank means the book's own type), `price`, `acquiredOn`, `source`, `conditionNotes`
- Loans tab (holders of `library.loans.read`): this book's loans
- Holds tab (holders of `library.holds.read`): open holds on this book
- Browse list: the public fields plus `availability.total`, `availability.available`, `availability.onLoan`, `availability.onHold`, `availability.holdsWaiting`, `canBeBorrowed`
- Browse detail: the same, plus `copies[]` with `accessionNumber`, `status`, `itemType`, `dueDate` (when on loan). No prices, sources, condition or internal notes

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a book | `library.books.manage` | `POST /library/books` |
| Edit a book | `library.books.manage` | `PATCH /library/books/:bookId` |
| Remove a book (and its copies) | `library.books.manage` | `DELETE /library/books/:bookId` |
| Add copies | `library.copies.manage` | `POST /library/books/:bookId/copies` |
| Edit a copy, change its status (shelve, damaged, lost, missing, withdrawn) | `library.copies.manage` | `PATCH /library/copies/:copyId` |
| Find a copy by scanning | `library.copies.read` | `GET /library/copies?accessionNumber=` or `?barcode=` |
| Place a hold for a borrower (from a book) | `library.holds.manage` | `POST /library/holds` (see LB-06) |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/books?q=&category=&subjectId=&itemType=&available=` | Staff table (paginated) |
| GET | `/library/books/:bookId` | Book header with copy counts |
| POST | `/library/books` | New book |
| PATCH | `/library/books/:bookId` | Edit book |
| DELETE | `/library/books/:bookId` | Remove book |
| GET | `/library/books/:bookId/copies?status=` | Copies tab (paginated) |
| POST | `/library/books/:bookId/copies` | `{ count, price, acquiredOn, source, itemType, conditionNotes }`. Returns `{ book, copies }` with the new accession numbers |
| GET | `/library/copies?accessionNumber=&barcode=&status=&bookId=` | Scan lookup; copy list across books |
| GET | `/library/copies/:copyId` | Copy drawer (with `book`) |
| PATCH | `/library/copies/:copyId` | Edit copy |
| GET | `/library/loans?bookId=` | Loans tab |
| GET | `/library/holds?bookId=&open=true` | Holds tab |
| GET | `/library/catalogue?q=&category=&subjectId=&itemType=&available=` | Browse list (paginated) |
| GET | `/library/catalogue/:bookId` | Browse detail with copies and due dates |
| GET | `/academics/subjects` | Subject picker and filter |

**Layout**
- Staff view: the List + detail page template.
  - Filter bar: search box (`q`: title, author or ISBN), category (`category`), subject (`subjectId`), item type (`itemType`), and an "Available now" toggle (`available=true`).
  - Table columns: Title, Authors, ISBN, Type, Shelf, Available / Total, Holds waiting.
  - "Scan" box above the table: an accession number or barcode calls `GET /library/copies?accessionNumber=` (or `?barcode=`) and opens that copy's drawer.
  - Detail page: header with the book facts and Edit / Remove buttons (holders of `library.books.manage` only). Tabs: Copies, Loans, Holds.
- Book form: `title` (required), `subtitle`, `authors` (tag input, up to 20), `isbn` (hyphens and spaces are removed), `publisher`, `publishedYear`, `edition`, `language`, `category`, `itemType`, `subjectId`, `shelfLocation`, `description`, `internalNotes`. A 409 on ISBN names the existing title: show it with a link to that book.
- Add copies: a dialog with `count` (1 to 100) and the shared details. After saving, list the new accession numbers so they can be written on labels.
- Copy drawer: status select limited to `AVAILABLE`, `LOST`, `DAMAGED`, `WITHDRAWN`, `MISSING`. `ISSUED` and `ON_HOLD` change only through circulation. A copy on loan gives 422 "Copy … is on loan; record its return instead". Taking an `ON_HOLD` copy off the shelf sends its hold back to the queue; shelving a copy offers it to the next reader waiting. Say this in the dialog.
- Badges: `REFERENCE` shows "Not for loan".
- Remove book: confirm dialog naming the title. 409 when copies are on loan or holds are open: show the message.
- Browse view: a card or list layout with a search bar and the same filters, an availability line ("2 of 5 available", "3 waiting"), and a "Not for loan" badge when `canBeBorrowed` is false. Read-only. Students and parents place holds from the Portal (PO-07/PO-08).

**Notes / Gap:**
- No endpoint deletes a single copy. A copy leaves the collection with status `WITHDRAWN`.
- **Gap:** no printable labels or barcodes for new copies.

---

### LB-04 · Circulation desk
**Route:** `/library/desk` · **Type:** Operations · **Who:** ADMIN, LIBRARIAN, library owners and operators holding `library.loans.circulate`. The borrower panel needs `library.loans.read`. Waiving needs `library.loans.waiveFine` (owner-only: never given to operators).

**Data shown**
- Borrower panel (`GET /library/borrowers/:userId/account`): `borrower.name`, `borrower.role`, `borrower.status`, `openLoans`, `overdueLoans`, `finesOutstanding`, `credit`, `canBorrow`, `blocks[]` (`reason`, `message`), `loansWithFines[]`
- The borrower's open loans: `book.title`, `copy.accessionNumber`, `issuedOn`, `dueDate`, `renewalCount` / `maxRenewals`, `isOverdue`, `daysOverdue`, `lateFine`, `fineOutstanding`
- The borrower's holds ready for pickup: `book.title`, `copy.accessionNumber`, `pickupBy`
- Scanned copy preview: `accessionNumber`, `book.title`, `status`
- Return result: `status`, `lateFine`, `lostCharge`, `damageCharge`, `fineOutstanding`, `fineIsFinal`, and `copy.status` (`ON_HOLD` when the copy goes to a waiting reader)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Issue (optionally back-dated, with a custom due date, or overriding a block) | `library.loans.circulate` | `POST /library/loans` |
| Return (OK, damaged, lost) | `library.loans.circulate` | `POST /library/loans/:loanId/return` |
| Renew | `library.loans.circulate` | `POST /library/loans/:loanId/renewal` |
| Record a lost copy as found | `library.loans.circulate` | `POST /library/loans/:loanId/recovery` |
| Collect a fine (part or all) | `library.loans.circulate` | `POST /library/loans/:loanId/fine-payment` |
| Waive a fine (part or all) | `library.loans.waiveFine` (owner-only) | `POST /library/loans/:loanId/fine-waiver` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/borrowers/:userId/account` | Borrower panel: blocks, fines, credit, payments |
| GET | `/library/loans?borrowerUserId=&status=ISSUED` | The borrower's open loans |
| GET | `/library/holds?borrowerUserId=&status=READY` | Holds waiting at the desk for this borrower |
| GET | `/library/copies?accessionNumber=` (or `?barcode=`) | Scan lookup |
| GET | `/library/loans?copyId=&status=ISSUED` | Find the open loan for a scanned copy (return mode) |
| POST | `/library/loans` | `{ accessionNumber or copyId, borrowerUserId, issuedOn?, backdateReason?, dueDate?, overrideReason? }` → 201 |
| POST | `/library/loans/:loanId/return` | `{ condition: OK, DAMAGED or LOST, damageCharge?, notes? }` |
| POST | `/library/loans/:loanId/renewal` | No body |
| POST | `/library/loans/:loanId/recovery` | `{ notes? }`. Returns the loan plus `found` (`reversed`, `credited`, `daysLost`, `refundDays`) |
| POST | `/library/loans/:loanId/fine-payment` | `{ amount, method: CASH, UPI, CARD or LIBRARY_CREDIT, reference? }` → 201 with `receiptNumber` |
| POST | `/library/loans/:loanId/fine-waiver` | `{ amount?, reason }` → 201. No amount waives everything owed so far |
| GET | `/users/students`, `/academics/sections`, `/academics/enrollments?sectionId=` | Borrower picker (students) |

**Layout**
- One screen with a mode switch: **Issue** and **Return**. The scan field keeps focus, so a barcode scanner can be used throughout.
- Issue mode:
  1. Pick the borrower. The borrower panel loads: KPI chips (On loan, Overdue, Fines, Credit), and a red block banner listing each `blocks[].message` when `canBorrow` is false.
  2. Scan a copy. A preview line shows title and status.
  3. "Issue" posts the loan. Show the response `message` as a toast ("… issued to Asha Rao. Due 2026-11-02") and add the loan to the open-loans list.
- "More options" (collapsed): **Back-date** (`issuedOn` up to 365 days back, plus a required `backdateReason`), **Due date** (`dueDate`), and **Override block** (`overrideReason`, shown only when the borrower has blocks).
- Issue errors (422 or 409) to show as they are: the block message ending "A librarian may override this with a reason" (then open Override block), "No circulation rule covers …" (link to LB-01), copy already on loan, reference copy, borrower already has a copy of this book, copy held for another reader until a date, loan limit reached.
- Return mode:
  1. Scan a copy. The page finds its open loan and shows the borrower, due date, days overdue and the fine so far.
  2. Pick the condition: OK, Damaged (asks for `damageCharge`) or Lost (warns about the replacement charge).
  3. After the return, show `fineOutstanding` with a "Collect fine" button. If `copy.status` is `ON_HOLD`, show "Keep this copy at the desk: it is held for the next reader".
- Open-loans rows have the actions Renew, Return, Collect fine, Waive and Record found (only for loans with status `LOST`). Show Waive only to holders of `library.loans.waiveFine`.
- Collect fine dialog: `amount` (prefilled with `fineOutstanding`, and may be less), `method`, `reference`. Offer `LIBRARY_CREDIT` only when `credit` > 0. Fines can be paid while the book is still out. Show the receipt number from the response.
- Waive dialog: optional `amount` (blank waives everything) and a required `reason`. Confirm before sending.
- Renew errors (422): overdue loan, renewal limit reached, other readers waiting, renewal would not extend the due date.

**Notes / Gap:**
- **Gap:** no search for borrowers by name or library card. `/users/students` has no search filter, so the picker walks section → enrollments. LIBRARIAN cannot list staff (`/users/staff` and `/users/teachers` are ADMIN, PRINCIPAL and, for teachers, STAFF only), so staff borrowers cannot be picked at the desk. Operators who are teachers see only their own sections' students in the picker.
- **Gap:** no printable fine receipt (no `…/pdf` for library payments).

---

### LB-05 · Loans and fines
**Route:** `/library/loans`, `/library/loans/:loanId` (drawer), `/library/borrowers/:userId` · **Type:** Operations · **Who:** ADMIN, LIBRARIAN, PRINCIPAL, library owners and operators holding `library.loans.read`. Row actions as on LB-04 (`library.loans.circulate`; waive: `library.loans.waiveFine`, owner-only).

**Data shown**
- Loans table: `book.title`, `copy.accessionNumber`, `borrower.name`, `borrower.role`, `issuedOn`, `dueDate`, `status` (`ISSUED`, `RETURNED`, `LOST`), `daysOverdue`, `renewalCount`, `fineTotal`, `fineOutstanding`
- Loan drawer:
  - Terms copied at issue: `loanDays`, `maxRenewals`, `finePerDay`, `fineGraceDays`, `fineCap`
  - Dates: `issuedOn`, `dueDate`, `returnedOn`, `lostOn`, `foundOn`
  - Money: `lateFine`, `lostCharge`, `damageCharge`, `lostChargeReversed`, `finePaid`, `fineWaived`, `fineCredited`, `fineOutstanding`, `fineIsFinal`
  - Notes: `backdateReason`, `blockOverrideReason`, `returnNotes`
  - `payments[]` (`receiptNumber`, `amount`, `method`, `reference`, `paidAt`) and `waivers[]` (`amount`, `reason`, `waivedAt`)
- Borrower account page: `borrower`, `openLoans`, `overdueLoans`, `finesOutstanding`, `credit`, `canBorrow`, `blocks[]`, `loansWithFines[]` (`title`, `accessionNumber`, `status`, `dueDate`, `lateFine`, `lostCharge`, `damageCharge`, `finePaid`, `fineWaived`, `fineOutstanding`), `payments[]`, `credits[]` (`amount`, `reason`, `createdAt`), plus the full loan history and holds

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Renew, return, record found, collect fine | `library.loans.circulate` | As on LB-04 |
| Waive a fine | `library.loans.waiveFine` (owner-only) | `POST /library/loans/:loanId/fine-waiver` |
| Open the desk for this borrower | `library.loans.circulate` | Links to LB-04 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/loans?status=&overdue=&withFine=&bookId=&borrowerUserId=&copyId=` | Table rows (paginated), fines as of today |
| GET | `/library/loans/:loanId` | Loan drawer with payments and waivers |
| GET | `/library/borrowers/:userId/account` | Borrower account header and fine panels |
| GET | `/library/loans?borrowerUserId=` | Borrower page: loan history |
| GET | `/library/holds?borrowerUserId=` | Borrower page: holds |

**Layout**
- Quick tabs over one table: **On loan** (`status=ISSUED`), **Overdue** (`overdue=true`), **With fines** (`withFine=true`), **All**. Extra filters: borrower (`borrowerUserId`), book (`bookId`). Table columns: Title, Accession no., Borrower, Role, Issued, Due, Status, Days overdue, Fine, Outstanding.
- Overdue rows are highlighted. While `fineIsFinal` is false, the fine shows with "so far", because late fines grow daily while the book is out.
- Row click opens the loan drawer with the actions allowed for its status: `ISSUED` → Renew, Return, Collect fine; `LOST` → Record found, Collect fine; any loan with `fineOutstanding` > 0 → Collect fine, and Waive for owners.
- The borrower name links to the borrower account page: a header with KPI chips (On loan, Overdue, Fines outstanding, Credit) and the block banner, then tabs: Fines (`loansWithFines`), Payments, Credit, Loan history, Holds.
- PRINCIPAL sees everything read-only (no action buttons).

---

### LB-06 · Holds
**Route:** `/library/holds`, `/library/holds/:holdId` (drawer) · **Type:** Operations · **Who:** ADMIN, LIBRARIAN, PRINCIPAL, library owners and operators holding `library.holds.read`. Placing and cancelling at the desk: `library.holds.manage`.

**Data shown**
- `book.title`, `book.authors`, `borrower.name`, `borrower.role`, `status` (`WAITING`, `READY`, `FULFILLED`, `CANCELLED`, `EXPIRED`), `queuePosition` (waiting holds), `requestedAt`, `notNeededAfter`, `copy.accessionNumber` (ready holds), `readyOn`, `pickupBy`, `closedAt`, `closedReason`, `fulfilledLoanId`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Place a hold for a borrower | `library.holds.manage` | `POST /library/holds` |
| Cancel a hold | `library.holds.manage` | `POST /library/holds/:holdId/cancellation` |
| Issue a ready hold | `library.loans.circulate` | Opens LB-04 with borrower and copy filled in |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/holds?status=&open=&bookId=&borrowerUserId=` | Table rows (paginated) |
| GET | `/library/holds/:holdId` | Hold drawer |
| POST | `/library/holds` | `{ bookId, borrowerUserId, notNeededAfter? }` |
| POST | `/library/holds/:holdId/cancellation` | `{ reason? }` |
| GET | `/library/books?q=` | Book picker in "Place hold" |

**Layout**
- Quick tabs: **Ready for pickup** (`status=READY`, sorted by `pickupBy`, rows due today highlighted), **Waiting** (`status=WAITING`, showing the queue position), **All** (with a status filter). Filters: book (`bookId`), borrower (`borrowerUserId`).
- Ready rows show a shelf note ("Copy ACC-0012 kept until 2026-10-21") and an "Issue" button for holders of `library.loans.circulate`.
- "Place hold" dialog: book picker, borrower picker (same as LB-04), optional `notNeededAfter`. Errors: 409 "already has a hold"; 422 hold limit reached (`maxHoldsPerBorrower`), reference book, no circulation rule, book already on loan to this borrower.
- Cancel asks for confirmation and takes an optional reason. A ready hold's copy moves to the next reader or back to the shelf.
- Help text: "Uncollected holds expire each night and the copy moves on. Renewals are refused while others wait."

---

### LB-07 · Stock checks
**Route:** `/library/stock-checks`, `/library/stock-checks/:stockCheckId` · **Type:** Operations · **Who:** ADMIN, LIBRARIAN, PRINCIPAL, library owners and operators holding `library.stockChecks.read`. Starting, scanning and closing: `library.stockChecks.manage`.

**Data shown**
- List: `title`, `status` (`OPEN`, `CLOSED`), `startedOn`, `closedOn`, `expectedCount`, `foundCount`, `missingCount`, `unexpectedCount`, `notes`
- Detail: `summary.expected`, `summary.found`, `summary.missing`, `summary.unexpected`, `summary.unknown`
- Scan results (from the last batch): `code`, `result` (`FOUND`, `UNEXPECTED`, `UNKNOWN`), `repeated`, `accessionNumber`, `title`, `copyStatus`
- Missing tab: copies expected on the shelf but not scanned (`accessionNumber`, title, `status`)
- Unexpected tab: scans whose copy should be elsewhere or that match no copy: `code`, `result`, `copyStatus`, `copy.accessionNumber`, `copy.book.title`, `scannedAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Start a stock check | `library.stockChecks.manage` | `POST /library/stock-checks` |
| Record scans | `library.stockChecks.manage` | `POST /library/stock-checks/:stockCheckId/scans` |
| Close (marks unscanned copies `MISSING`) | `library.stockChecks.manage` | `POST /library/stock-checks/:stockCheckId/closure` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/stock-checks` | List (paginated) |
| GET | `/library/stock-checks/:stockCheckId` | Header and summary |
| POST | `/library/stock-checks` | `{ title, notes? }` |
| POST | `/library/stock-checks/:stockCheckId/scans` | `{ codes: [...] }` (1 to 500). Returns `results` and the new `summary` |
| GET | `/library/stock-checks/:stockCheckId/missing` | Missing tab (paginated) |
| GET | `/library/stock-checks/:stockCheckId/unexpected` | Unexpected tab (paginated) |
| POST | `/library/stock-checks/:stockCheckId/closure` | Close |

**Layout**
- List page with a "Start stock check" button. 409 "Stock check … is already open; close it first" links to the open check.
- Detail page: KPI tiles (Expected, Found, Missing, Unexpected, Unknown), refreshed after each batch.
- Scan panel (open checks only): a code input that collects scans. Send a batch every 50 codes or on "Send", and always before leaving the page. A running log shows each result with a colour: found green, unexpected amber, unknown red, repeated grey.
- Tabs: Missing, Unexpected.
- Close: confirm dialog "N copies not scanned will be marked MISSING", using `summary.missing`. A closed check is read-only. Scanning it gives 409.

---

### LB-08 · Library reports
**Route:** `/library/reports/:report` · **Type:** Operations · **Who:** ADMIN, LIBRARIAN, PRINCIPAL, library owners and operators holding `library.reports.read`.

**Data shown**
- Current loans: `asOf`, `count`, `overdue`, `loans[]` (`title`, `accessionNumber`, `borrower`, `role`, `className`, `issuedOn`, `dueDate`, `daysOverdue`, `renewals`, `lateFine`, `fineOutstanding`)
- Overdue: `asOf`, `count`, `finesAccrued`, `loans[]` (same columns, most overdue first)
- Fines collected: `from`, `to`, `collected`, `byMethod`, `waived`, `waivers`, `payments[]` (`paidOn`, `receiptNumber`, `borrower`, `className`, `title`, `accessionNumber`, `method`, `amount`)
- Fines outstanding: `asOf`, `total`, `borrowers[]` (`borrower`, `role`, `className`, `loans`, `outstanding`)
- Most borrowed: `titles[]` (`title`, `authors`, `category`, `loans`, `borrowers`)
- Inactive borrowers: `since`, `count`, `borrowers[]` (`name`, `role`, `className`, `lastIssuedOn`, `loansEver`)
- Acquisitions: `count`, `totalValue`, `copies[]` (`acquiredOn`, `accessionNumber`, `title`, `authors`, `itemType`, `source`, `price`, `status`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Export any report (CSV or Excel) | `library.reports.read` | Same path with `?format=csv` or `?format=xlsx` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/library/reports/current-loans?format=` | Books on loan now |
| GET | `/library/reports/overdue?format=` | Overdue books |
| GET | `/library/reports/fines-collected?from=&to=&format=` | Payments and waivers in a period |
| GET | `/library/reports/fines-outstanding?format=` | Who owes what today |
| GET | `/library/reports/most-borrowed?from=&to=&limit=&format=` | Top titles (`limit` 1 to 100, default 20) |
| GET | `/library/reports/inactive-borrowers?since=&role=&format=` | Borrowers with no loan since a date |
| GET | `/library/reports/acquisitions?from=&to=&format=` | Copies acquired in a period |

**Layout**
- Left list of the seven reports. Each opens a parameter bar (date range `from`/`to`, or `since` plus `role`, or `limit`), KPI tiles, a table, and "Export CSV" / "Export Excel" buttons.
- KPI tiles: current loans (`count`, `overdue`); overdue (`count`, `finesAccrued`); fines collected (`collected`, `waived`, plus a small bar per method from `byMethod`; library credit is not counted as cash); fines outstanding (`total`); acquisitions (`count`, `totalValue`).
- Most borrowed: a horizontal bar chart of `loans` per title above the table.
- Rows in loan reports link to the loan drawer (LB-05), and borrower names to the borrower account page.
- The date-range reports refuse `to` before `from` (field error).

---

## Transport

The transport module runs school buses: vehicles and their compliance dates, routes with ordered stops, seat assignments per academic year, and route rosters for drivers and attendants. It is an add-on module owned by `TRANSPORT_MANAGER`. ADMIN, the built-in transport manager and anyone made a transport owner hold every transport permission, including the activity log (`transport.activity.read`, owner-only). Operators (for example "Transport desk: view routes, assign students, print rosters") hold only their ticked keys. PRINCIPAL and ACCOUNTANT read everything. Teachers have no access (D-51). **Setup** pages: TR-01 Vehicles and TR-02 Routes and stops. **Operations** pages: TR-03 Seat assignments and TR-04 Rosters. Occupancy, assignments and rosters follow the year switcher (`X-Academic-Year-Id`). The module's activity tab (`GET /transport/activity`, `GET /transport/activity/:auditLogId`, key `transport.activity.read`) uses the shared **Module activity** component.

---

### TR-01 · Vehicles
**Route:** `/transport/vehicles` · **Type:** Setup · **Who:** ADMIN, TRANSPORT_MANAGER, PRINCIPAL, ACCOUNTANT, transport owners and operators holding `transport.vehicles.read`. Edit buttons: `transport.vehicles.manage`.

**Data shown**
- Table: `registrationNumber`, `make`, `model`, `capacity`, `driverName`, `driverPhone`, `status` (`ACTIVE`, `IN_MAINTENANCE`, `RETIRED`), `expiringDocuments[]` (`label`, `expiresOn`, `daysLeft`, `isExpired`)
- Drawer: the fields above plus `driverLicenseNumber`, `attendantName`, `attendantPhone`, `insuranceExpiresOn`, `fitnessCertificateExpiresOn`, `permitExpiresOn`, `notes`, and `route` (`name`, `code`) when the vehicle serves one

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a vehicle | `transport.vehicles.manage` | `POST /transport/vehicles` |
| Edit, change status, retire | `transport.vehicles.manage` | `PATCH /transport/vehicles/:vehicleId` |
| Remove | `transport.vehicles.manage` | `DELETE /transport/vehicles/:vehicleId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/transport/vehicles?status=&expiringWithinDays=` | Table rows (paginated); compliance view |
| GET | `/transport/vehicles/:vehicleId` | Drawer, with the route it serves |
| POST | `/transport/vehicles` | New vehicle |
| PATCH | `/transport/vehicles/:vehicleId` | Edit |
| DELETE | `/transport/vehicles/:vehicleId` | Remove |

**Layout**
- The List + drawer template. Filters: status (`status`) and a **Compliance** toggle with 30 / 60 / 90 days (`expiringWithinDays`). The compliance view hides retired vehicles unless status `RETIRED` is chosen.
- Table columns: Registration, Make / model, Seats, Driver, Driver phone, Status, Documents. The Documents cell shows one badge per entry in `expiringDocuments`: red "Insurance expired 3 days ago", or amber "Permit in 12 days". Without a filter, badges use a 30-day window.
- A small banner above the table counts the vehicles with expired documents (from a compliance call with `expiringWithinDays=0`).
- Form groups: Vehicle (`registrationNumber`, `make`, `model`, `capacity`, `status`), Crew (`driverName`, `driverPhone`, `driverLicenseNumber`, `attendantName`, `attendantPhone`), Compliance dates (`insuranceExpiresOn`, `fitnessCertificateExpiresOn`, `permitExpiresOn`), `notes`. Spaces and hyphens in the registration number are ignored.
- Errors: 409 duplicate registration; 409 retiring or removing a vehicle that serves a route ("give the route another vehicle first"); 422 reducing seats below the students assigned on its route.
- Remove asks for confirmation and names the registration number.

**Notes / Gap:**
- Driver and attendant are plain names, not accounts.

---

### TR-02 · Routes and stops
**Route:** `/transport/routes`, `/transport/routes/:routeId` · **Type:** Setup · **Who:** ADMIN, TRANSPORT_MANAGER, PRINCIPAL, ACCOUNTANT, transport owners and operators holding `transport.routes.read`. Edit buttons: `transport.routes.manage`.

**Data shown**
- List: `code`, `name`, `vehicle.registrationNumber`, `vehicle.capacity`, stop count, `occupancy.assigned`, `occupancy.available`, `occupancy.yearName`
- Detail header: `name`, `code`, `description`, `vehicle`, `occupancy` (`capacity`, `assigned`, `available`)
- Stops: `sequence`, `name`, `landmark`, `pickupTime`, `dropTime`, `monthlyFee`, `assignedCount`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Create a route with its stops | `transport.routes.manage` | `POST /transport/routes` |
| Edit the route, change its vehicle, edit stops | `transport.routes.manage` | `PATCH /transport/routes/:routeId` |
| Remove a route | `transport.routes.manage` | `DELETE /transport/routes/:routeId` |
| Open the roster | `transport.roster.read` | Links to TR-04 |
| Assign a student to this route | `transport.assignments.manage` | Links to TR-03 with the route filled in |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/transport/routes?vehicleId=` | List (paginated), occupancy in the selected year |
| GET | `/transport/routes/:routeId` | Detail with stops and per-stop counts |
| POST | `/transport/routes` | `{ name, code?, vehicleId?, description?, stops: [...] }` (`code` generated as RT-001 when left out) |
| PATCH | `/transport/routes/:routeId` | Edit. `stops` replaces the whole ordered list |
| DELETE | `/transport/routes/:routeId` | Remove |
| GET | `/transport/vehicles?status=ACTIVE` | Vehicle picker |
| GET | `/transport/assignments?routeId=&status=ACTIVE` | Detail page: Students tab |

**Layout**
- List: table with columns Code, Name, Vehicle, Seats used (`assigned` / `capacity`, as a small bar), Stops. Filter: vehicle (`vehicleId`). A route without a vehicle shows "No vehicle: cannot take students".
- Detail page: header with the occupancy bar and Edit / Remove buttons. Tabs: Stops, Students (assignments on this route).
- Stops editor: an ordered list with drag-to-reorder and columns Name, Pickup, Drop, Landmark, Monthly fee, Students. Saving sends the full list. Existing stops keep their `id`, so their assignments stay. New rows have no `id`. Leave `sequence` out to number stops in the order shown. Rows with students cannot be deleted in the editor; the backend also refuses with 409 "Students still use stop(s) …".
- Validation: no repeated stop names or sequences, at least one stop, times as `HH:MM`.
- Errors: 409 duplicate name or code; 409 vehicle already serves another route; 422 retired vehicle; 422 vehicle has fewer seats than the students assigned; 409 removing a route with active assignments.
- Users without `transport.routes.manage` see the stops read-only.

**Notes / Gap:**
- Stop `monthlyFee` is stored but creates no invoices (D-53).

---

### TR-03 · Seat assignments
**Route:** `/transport/assignments`, `/transport/assignments/:assignmentId` (drawer) · **Type:** Operations · **Who:** ADMIN, TRANSPORT_MANAGER, PRINCIPAL, ACCOUNTANT, transport owners and operators holding `transport.assignments.read`. Assign, change and end: `transport.assignments.manage`.

**Data shown**
- Table: student name (`student.user.firstName`, `student.user.lastName`), `student.studentCode`, `student.admissionNumber`, `route.name`, `route.code`, `stop.name`, `stop.pickupTime`, `stop.dropTime`, `direction` (`BOTH`, `PICKUP_ONLY`, `DROP_ONLY`), `startDate`, `endDate`, `status` (`ACTIVE`, `ENDED`)
- Drawer: the above plus `notes` and `previousAssignmentId` (link to the assignment it replaced)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Assign a student | `transport.assignments.manage` | `POST /transport/assignments` |
| Change route or stop | `transport.assignments.manage` | `POST /transport/assignments/:assignmentId/change` |
| End an assignment | `transport.assignments.manage` | `POST /transport/assignments/:assignmentId/end` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/transport/assignments?routeId=&stopId=&studentId=&status=` | Table rows (paginated), selected year |
| GET | `/transport/assignments/:assignmentId` | Drawer |
| POST | `/transport/assignments` | `{ studentId, routeId, stopId, direction?, startDate?, notes? }` → 201 |
| POST | `/transport/assignments/:assignmentId/change` | `{ routeId, stopId, direction?, effectiveDate? }` → 201 (a new assignment, linked to the old one) |
| POST | `/transport/assignments/:assignmentId/end` | `{ endDate? }` (last day of use, default today) |
| GET | `/transport/routes`, `/transport/routes/:routeId` | Route picker with seats free; stop picker |
| GET | `/academics/sections`, `/academics/enrollments?sectionId=` | Student picker |

**Layout**
- Filters: route (`routeId`), stop (`stopId`, after a route is chosen), student (`studentId`), status (`status`, default `ACTIVE`). Table columns: Student, Code, Route, Stop, Pickup / Drop, Direction, From, To, Status.
- "Assign" drawer:
  1. Student picker (section → students).
  2. Route select showing "12 of 40 seats free" from `occupancy`.
  3. Stop select with times and monthly fee.
  4. Direction, start date (inside the academic year), notes.
- Row actions on active rows: **Change** (new route and stop, effective date) and **End** (end date). Ending frees the seat at once, even with a future end date (D-53). Confirm End.
- Errors to show as they are: 422 "Route R1 is full (40 of 40 seats)", "has no vehicle yet", "is not enrolled in 2026-27", date outside the year; 409 "already uses route …; change or end that assignment instead", "This assignment already ended …".
- When an archived year is selected, hide the write buttons.

**Notes / Gap:**
- When a student leaves the school, a background job ends their active seat in that year, so the page needs no leaver action. Nothing copies seats into the next year.
- **Gap:** no "copy assignments to next year" action (proposed in D-52).

---

### TR-04 · Rosters
**Route:** `/transport/routes/:routeId/roster` · **Type:** Operations · **Who:** ADMIN, TRANSPORT_MANAGER, PRINCIPAL, ACCOUNTANT, transport owners and operators holding `transport.roster.read`.

**Data shown**
- Header: `route.name`, `route.code`, `route.description`, `vehicle.registrationNumber`, `vehicle.driverName`, `vehicle.driverPhone`, `academicYear.yearName`, `occupancy.capacity`, `occupancy.assigned`, `occupancy.available`
- Per stop, in order: `sequence`, `name`, `landmark`, `pickupTime`, `dropTime`, and students: `name`, `studentCode`, `classSection`, `rollNumber`, `direction`, `parentName`, `parentPhone`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Print | `transport.roster.read` | Browser print of the JSON view |
| Export CSV / Excel | `transport.roster.read` | `GET /transport/routes/:routeId/roster?format=csv` or `?format=xlsx` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/transport/routes/:routeId/roster` | The roster (selected year) |
| GET | `/transport/routes/:routeId/roster?format=csv\|xlsx` | Download, one row per student in stop order |
| GET | `/transport/routes` | Route picker at the top of the page |

**Layout**
- Route picker, then a print-friendly page: header block, then one section per stop ("1 · Main Gate · 07:10 / 15:40") with a student table (Student, Class-Section, Roll no., Direction, Parent, Parent phone).
- "Print" uses a print stylesheet: no sidebar, one route per page, stop sections kept together. "Export" offers CSV and Excel.
- Empty stops show "No students". A route with no vehicle shows seats as "–".

**Notes / Gap:**
- Rosters show the primary parent's phone to everyone who holds `transport.roster.read` (D-51 is still open).
- **Gap:** no server-side PDF roster. Printing relies on the browser.

---

## Hostel

The hostel module manages boarding: hostels (with a warden), rooms and beds, bed allocations by date range (pre-booking, transfers, extensions, year-end roll-over), bed availability and occupancy, and hostel resources (lockers, cupboards, study tables, mess and laundry plans) with their assignments. It is an add-on module owned by `HOSTEL_MANAGER`. ADMIN, the built-in hostel manager and anyone made a hostel owner hold every hostel permission, including the activity log (`hostel.activity.read`, owner-only). Operators (for example "Hostel desk") hold only their ticked keys. PRINCIPAL and ACCOUNTANT read everything. A warden is a responsible person on the hostel record; being warden gives no access by itself. **Setup** pages: HO-01 Hostels and rooms and HO-03 Resources. **Operations** pages: HO-02 Bed allocations and HO-04 Resource assignments. The module's activity tab (`GET /hostel/activity`, `GET /hostel/activity/:auditLogId`, key `hostel.activity.read`) uses the shared **Module activity** component.

---

### HO-01 · Hostels and rooms
**Route:** `/hostel/hostels`, `/hostel/hostels/:hostelId` (tabs: Overview, Rooms) · **Type:** Setup · **Who:** ADMIN, HOSTEL_MANAGER, PRINCIPAL, ACCOUNTANT, hostel owners and operators holding `hostel.hostels.read`. The Rooms tab needs `hostel.rooms.read`. Edit buttons: `hostel.hostels.manage` for hostels, `hostel.rooms.manage` for rooms.

**Data shown**
- Hostel list: `code`, `name`, `residentGender` (`BOYS`, `GIRLS`, `COED`), warden name (`warden.firstName`, `warden.lastName`), `warden.phone`, `contactPhone`
- Overview: `address`, `description`, `contactPhone`, `warden` (`firstName`, `lastName`, `email`, `phone`, `role`), and today's occupancy totals
- Rooms tab: `roomNumber`, `floor`, `roomType`, `capacity`, `occupied`, `freeBeds` (bed numbers free today), `monthlyFee`, `status` (`AVAILABLE`, `MAINTENANCE`, `CLOSED`), `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a hostel | `hostel.hostels.manage` | `POST /hostel/hostels` |
| Edit a hostel, change its warden | `hostel.hostels.manage` | `PATCH /hostel/hostels/:hostelId` |
| Remove a hostel (with its rooms and resources) | `hostel.hostels.manage` | `DELETE /hostel/hostels/:hostelId` |
| Add a room | `hostel.rooms.manage` | `POST /hostel/rooms` |
| Edit a room (capacity, status, fee) | `hostel.rooms.manage` | `PATCH /hostel/rooms/:roomId` |
| Remove a room | `hostel.rooms.manage` | `DELETE /hostel/rooms/:roomId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hostel/hostels?residentGender=` | Hostel list (paginated) |
| GET | `/hostel/hostels/:hostelId` | Overview |
| POST | `/hostel/hostels` | `{ name, code?, residentGender, wardenUserId?, address?, contactPhone?, description? }` |
| PATCH | `/hostel/hostels/:hostelId` | Edit (`wardenUserId: null` removes the warden) |
| DELETE | `/hostel/hostels/:hostelId` | Remove |
| GET | `/hostel/hostels/:hostelId/occupancy` | Overview totals (today) |
| GET | `/hostel/rooms?hostelId=&status=&floor=` | Rooms tab (paginated) |
| GET | `/hostel/rooms/:roomId` | Room drawer |
| POST | `/hostel/rooms` | `{ hostelId, roomNumber, floor?, capacity, roomType?, monthlyFee?, status?, description? }` |
| PATCH | `/hostel/rooms/:roomId` | Edit (a room cannot move to another hostel) |
| DELETE | `/hostel/rooms/:roomId` | Remove |

**Layout**
- The List + detail page template. Hostel list: cards or a table with Code, Name, Residents, Warden, Beds used (from occupancy totals). Filter: residents (`residentGender`).
- Overview tab: facts, warden card, KPI tiles (Rooms, Beds, Occupied, Free, Allocatable now), and a link to the bed board (HO-02).
- Rooms tab: table with columns Room, Floor, Type, Beds (`occupied` / `capacity`), Free beds, Fee, Status. Filters: status (`status`), floor (`floor`). A row click opens the room drawer. "Add room" opens the same drawer empty.
- Status badges: `MAINTENANCE` keeps its residents but takes no new ones; `CLOSED` requires an empty room.
- Hostel form: `name`, `code` (generated as HST-001 when left out), `residentGender`, warden picker (`wardenUserId`), `address`, `contactPhone`, `description`.
- Errors: 409 duplicate name, code or room number; 422 warden is not an active employee account; 422 changing `residentGender` when current residents would not fit; 409 closing a room, or reducing its capacity, while beds are in use now or later; 409 removing a hostel or room with current or upcoming allocations.
- Remove (hostel or room) asks for confirmation and names it. For a hostel, the dialog says it also removes its rooms and resources.

**Notes / Gap:**
- **Gap:** HOSTEL_MANAGER cannot list warden candidates. Wardens can be ADMIN, PRINCIPAL, HOSTEL_MANAGER, STAFF or TEACHER accounts, but `/users`, `/users/staff` and `/users/teachers` are not open to HOSTEL_MANAGER. A warden-candidates lookup (or opening `/users/teachers` to module owners) is needed for the picker.
- Changing the warden through a handover is done in Administration › Access (`POST /administration/access/handovers`), not here.

---

### HO-02 · Bed allocations
**Route:** `/hostel/allocations` (views: Bed board, List, Availability), `/hostel/allocations/:allocationId` (drawer), `/hostel/allocations/rollover` · **Type:** Operations · **Who:** ADMIN, HOSTEL_MANAGER, PRINCIPAL, ACCOUNTANT, hostel owners and operators holding `hostel.allocations.read`. The bed board also needs `hostel.hostels.read`. Allocate, transfer, extend, vacate, cancel and roll over: `hostel.allocations.manage`.

**Data shown**
- Bed board (`GET /hostel/hostels/:hostelId/occupancy?on=`): `hostel`, `on`, `totals` (`rooms`, `capacity`, `occupied`, `free`, `allocatable`), and per room `roomNumber`, `floor`, `roomType`, `status`, `capacity`, `occupied`, `free`, `freeBeds`, `occupants[]` (`bedNumber`, `allocationId`, `toDate`, `student.name`, `student.studentCode`)
- List: student name (`student.user`), `student.studentCode`, `student.admissionNumber`, `hostel.name`, `room.roomNumber`, `bedNumber`, `fromDate`, `toDate` (the last night; blank means open-ended), `phase` (`UPCOMING`, `CURRENT`, `ENDED`, `CANCELLED`), `source` (`DIRECT`, `TRANSFER`, `ROLLOVER`), `endReason`, `previousAllocationId`, `notes`
- Availability (`GET /hostel/bed-availability`): `totals` (`hostels`, `rooms`, `capacity`, `free`); per hostel `capacity`, `free`, `byRoomType[]` (`roomType`, `rooms`, `capacity`, `free`) and `rooms[]` (`roomNumber`, `floor`, `roomType`, `monthlyFee`, `capacity`, `free`, `freeBeds`)
- Roll-over result: `fromAcademicYear`, `toAcademicYear`, `dryRun`, `continued[]` (`student`, `bed`, `newAllocationId`), `skipped[]` (`student`, `bed`, `reason`), `resources.continued[]`, `resources.skipped[]`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Allocate a bed, or pre-book one with a future `fromDate` | `hostel.allocations.manage` | `POST /hostel/allocations` |
| Extend or shorten a stay, move the start of an upcoming booking, edit notes | `hostel.allocations.manage` | `PATCH /hostel/allocations/:allocationId` |
| Transfer to another bed | `hostel.allocations.manage` | `POST /hostel/allocations/:allocationId/transfer` |
| Vacate (a stay that has started) | `hostel.allocations.manage` | `POST /hostel/allocations/:allocationId/vacate` |
| Cancel (a booking that has not started) | `hostel.allocations.manage` | `POST /hostel/allocations/:allocationId/cancellation` |
| Year-end roll-over (preview, then run) | `hostel.allocations.manage` | `POST /hostel/allocation-rollovers` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hostel/hostels` | Hostel switcher on the bed board |
| GET | `/hostel/hostels/:hostelId/occupancy?on=` | Bed board for one day (default today) |
| GET | `/hostel/allocations?hostelId=&roomId=&studentId=&phase=&activeOn=&fromDate=&toDate=` | List (paginated) |
| GET | `/hostel/allocations/:allocationId` | Drawer |
| POST | `/hostel/allocations` | `{ studentId, roomId, bedNumber?, fromDate?, toDate?, notes? }` → 201 |
| PATCH | `/hostel/allocations/:allocationId` | `{ fromDate?, toDate?, notes? }` |
| POST | `/hostel/allocations/:allocationId/transfer` | `{ roomId, bedNumber?, fromDate?, notes? }` → 201 (a new linked allocation; the old one ends the night before) |
| POST | `/hostel/allocations/:allocationId/vacate` | `{ vacatedOn?, notes? }` |
| POST | `/hostel/allocations/:allocationId/cancellation` | `{ reason? }` |
| GET | `/hostel/bed-availability?fromDate=&toDate=&hostelId=&roomType=` | Availability view; free beds in the allocate and transfer dialogs |
| POST | `/hostel/allocation-rollovers` | `{ toAcademicYearId, includeResources, dryRun }`. 201 when it continued anyone, else 200 |
| GET | `/hostel/resource-assignments?allocationId=` | Drawer: resources tied to this bed |
| GET | `/academics/academic-years` | Target year in the roll-over wizard |
| GET | `/academics/sections`, `/academics/enrollments?sectionId=` | Student picker |

**Layout**
- **Bed board** (default view): hostel switcher and a date picker (`on`) above a grid of room cards grouped by floor. Each card shows beds 1 to `capacity` as tiles:
  - an occupied tile shows the student name and "until `toDate`", and a click opens the allocation drawer;
  - a free tile is clickable for holders of `hostel.allocations.manage` and opens "Allocate" with room and bed filled in.
  - Rooms in `MAINTENANCE` or `CLOSED` are greyed out. KPI tiles across the top come from `totals`.
- **List** view: quick tabs by phase (Current, Upcoming, Ended, Cancelled → `phase`), plus filters: hostel, room, student, "staying on" date (`activeOn`), and a date range (`fromDate`/`toDate`, overlapping). Table columns: Student, Code, Hostel, Room, Bed, From, To, Phase, Source, End reason.
- **Availability** view: a date range (`fromDate` required, `toDate` optional for "with no end"), hostel and room-type filters. Show a summary table per hostel and room type (`byRoomType`), expandable to rooms with their free bed numbers. "Book" on a room opens Allocate for that room and range.
- Allocate drawer: student picker, room, optional bed (blank takes the lowest bed free for the whole stay), `fromDate` (a future date pre-books), `toDate` (blank means open-ended), `notes`.
- Allocation drawer: facts, a history chain (the `previousAllocationId` link and source), resources tied to the bed, and buttons by phase:
  - `UPCOMING`: Edit dates, Transfer, Cancel
  - `CURRENT`: Extend / shorten, Transfer, Vacate (a future move-out date is allowed)
  - `ENDED` and `CANCELLED`: none
- Transfer dialog: room, optional bed, `fromDate` (first night in the new bed). Explain: "Locker and cupboard follow the bed only within the room; mess and laundry plans continue."
- **Roll-over** wizard (holders of `hostel.allocations.manage`):
  1. Pick the target year (`toAcademicYearId`) and whether to include resources (`includeResources`).
  2. Preview: call with `dryRun: true` and show Continued and Skipped tables, with the reason for each skipped row (left school, bed taken, gender rule).
  3. Confirm: call again with `dryRun: false` and show the result.
  Residents come from the current year, or the year chosen in the switcher.
- Errors to show as they are: 409 "Bed 2 in … is booked by … from … to …", "already has bed … ; shorten, cancel or transfer that allocation first"; 422 gender rule, room closed or under maintenance, "no bed free for the whole stay", "cancel it instead of vacating" or "vacate it instead of cancelling", target year must start after the current year ends; 409 archived target year.
- Vacate and Cancel need a confirm dialog naming the student and bed.

**Notes / Gap:**
- Bed board, list, availability and roll-over are views of one page because they share the allocation drawer and the same actions.
- Pre-booking is allowed (D-64 replaces the "no future dates" rule in D-55). One bed per student at a time, across years (D-54).
- Hostel fees are not invoiced yet (D-64).

---

### HO-03 · Resources
**Route:** `/hostel/resources` · **Type:** Setup · **Who:** ADMIN, HOSTEL_MANAGER, PRINCIPAL, ACCOUNTANT, hostel owners and operators holding `hostel.resources.read`. Edit buttons: `hostel.resources.manage`.

**Data shown**
- `name`, `resourceType` (`LOCKER`, `CUPBOARD`, `STUDY_TABLE`, `MESS_PLAN`, `LAUNDRY_PLAN`, `CUSTOM`), `customType`, hostel, room (blank means hostel-wide), `capacity`, `inUse` (holders today), `available` (capacity left today), `monthlyFee`, `status` (`AVAILABLE`, `OUT_OF_SERVICE`), `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a resource | `hostel.resources.manage` | `POST /hostel/resources` |
| Edit (name, capacity, fee, status) | `hostel.resources.manage` | `PATCH /hostel/resources/:resourceId` |
| Remove | `hostel.resources.manage` | `DELETE /hostel/resources/:resourceId` |
| See who holds it | `hostel.resourceAssignments.read` | Links to HO-04 filtered by `resourceId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hostel/resources?hostelId=&roomId=&resourceType=&status=` | Table rows (paginated) with today's usage |
| GET | `/hostel/resources/:resourceId` | Drawer |
| POST | `/hostel/resources` | `{ hostelId, roomId?, resourceType, name, capacity?, customType?, monthlyFee?, status?, description? }` |
| PATCH | `/hostel/resources/:resourceId` | Edit (type, hostel and room are fixed) |
| DELETE | `/hostel/resources/:resourceId` | Remove |
| GET | `/hostel/hostels`, `/hostel/rooms?hostelId=` | Hostel and room pickers |

**Layout**
- The List + drawer template. Quick tabs by kind: **Room items** (locker, cupboard, study table), **Plans** (mess, laundry), **Other** (custom). Filters: hostel, room, type, status. Table columns: Name, Type, Hostel, Room, Capacity, In use today, Free, Fee, Status.
- Form: `resourceType` first. Plans hide the room picker (always hostel-wide). Lockers, cupboards and study tables default `capacity` to 1. Plans and `CUSTOM` require `capacity`. `customType` is shown only for `CUSTOM`.
- Errors: 409 duplicate name in the hostel; 422 plan with a room, room in another hostel; 409 removing a resource that is still held ("release or cancel them first").
- Remove asks for confirmation.

**Notes / Gap:**
- `monthlyFee` is stored on the resource only. Nothing is invoiced yet (D-64).

---

### HO-04 · Resource assignments
**Route:** `/hostel/resource-assignments`, `/hostel/resource-assignments/:assignmentId` (drawer) · **Type:** Operations · **Who:** ADMIN, HOSTEL_MANAGER, PRINCIPAL, ACCOUNTANT, hostel owners and operators holding `hostel.resourceAssignments.read`. Give, edit, release and cancel: `hostel.resourceAssignments.manage`.

**Data shown**
- `resource.name`, `resource.resourceType`, student name (`student.user`), `student.studentCode`, `allocation` (`bedNumber`, `fromDate`, `toDate`, `status`) when tied to a bed, `fromDate`, `toDate`, `phase` (`UPCOMING`, `CURRENT`, `ENDED`, `CANCELLED`), `endReason` (`RELEASED`, `BED_ENDED`, `TRANSFERRED`, `LEFT_SCHOOL`, `CANCELLED`), `notes`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Give a resource to a student | `hostel.resourceAssignments.manage` | `POST /hostel/resource-assignments` |
| Change dates or notes | `hostel.resourceAssignments.manage` | `PATCH /hostel/resource-assignments/:assignmentId` |
| Release (handed back) | `hostel.resourceAssignments.manage` | `POST /hostel/resource-assignments/:assignmentId/release` |
| Cancel (not started yet) | `hostel.resourceAssignments.manage` | `POST /hostel/resource-assignments/:assignmentId/cancellation` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hostel/resource-assignments?resourceId=&studentId=&allocationId=&hostelId=&phase=&activeOn=` | Table rows (paginated) |
| GET | `/hostel/resource-assignments/:assignmentId` | Drawer |
| POST | `/hostel/resource-assignments` | `{ resourceId, studentId, allocationId?, fromDate?, toDate?, notes? }` |
| PATCH | `/hostel/resource-assignments/:assignmentId` | `{ fromDate?, toDate?, notes? }` |
| POST | `/hostel/resource-assignments/:assignmentId/release` | `{ releasedOn?, notes? }` |
| POST | `/hostel/resource-assignments/:assignmentId/cancellation` | `{ reason? }` |
| GET | `/hostel/resources?hostelId=&status=AVAILABLE` | Resource picker with free capacity |
| GET | `/hostel/allocations?studentId=&phase=CURRENT` | The student's bed, to tie a room item to it |

**Layout**
- Filters: hostel, resource, student, phase (quick tabs Current / Upcoming / Ended / Cancelled), "holding on" date (`activeOn`). Table columns: Resource, Type, Student, Bed, From, To, Phase, End reason.
- "Give resource" drawer: student picker, then resource picker (showing `available`). For a room item (locker, cupboard, study table), the student's bed allocation is required and filled in from their current or upcoming allocation. Dates default to the bed's dates when tied, and the assignment then ends with the bed.
- Row actions by phase: `UPCOMING` → Edit dates, Cancel; `CURRENT` → Edit dates, Release. Confirm Release and Cancel.
- Errors to show as they are: 409 resource taken or student already holds it, student already on another mess or laundry plan; 422 resource full on some day, out of service, "belongs to a room; assign it with the resident's allocationId", resource in another room or hostel, dates outside the bed allocation.
- HO-02's allocation drawer shows the same rows for one bed (`?allocationId=`).

---

## HR

HR covers staff attendance, leave and payroll for every employee (accounts with an employee role: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF, TEACHER and the module-owner roles). It is an add-on module. Its built-in owner is `HR_MANAGER`, who holds every `hr.*` permission. ADMIN also holds every `hr.*` permission. PRINCIPAL holds the leave and attendance permissions by role, including leave decisions. ACCOUNTANT holds the payroll permissions by role, including finalization. An operator role can give an employee any HR permission **except** the owner-only ones: `hr.leaveRequests.decide`, `hr.leaveRequests.cancelAny`, `hr.payrollRuns.finalize` and `hr.activity.read`. **Setup** pages (HR-01, HR-02) define leave types, salary components and salary revisions. **Operations** pages (HR-03 to HR-06) cover daily attendance, the leave queue, monthly payroll and payslips. An employee's own attendance, leave and payslips (`/hr/me/*`, applying for leave, cancelling one's own pending leave) are in the portal's staff self-service page (PO-11), not here.

**Note on page split.** The payslip *list* only exists per run (`GET /hr/payroll-runs/:runId/payslips`), so it lives on the payroll run detail page (HR-05). HR-06 is the payslip detail page, with its PDF. HR-04 keeps requests and balances as two tabs of one page because both are keyed by employee and share the employee picker.

---

### HR-01 · Leave types
**Route:** `/hr/leave-types` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, HR_MANAGER, and operators granted it. The page opens with `hr.leaveTypes.manage`. Every employee holds `hr.leaveTypes.read` by role, but read alone does not add this page to the sidebar: other employees see leave types only in PO-11's apply form.

**Data shown**
- Leave types: `name`, `code`, `annualQuotaDays` (days per calendar year, steps of 0.5), `isPaid`, `requiresApproval`, `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a leave type | `hr.leaveTypes.manage` | `POST /hr/leave-types` |
| Edit a leave type | `hr.leaveTypes.manage` | `PATCH /hr/leave-types/:leaveTypeId` |
| Remove a leave type | `hr.leaveTypes.manage` | `DELETE /hr/leave-types/:leaveTypeId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/leave-types` | Table rows (paginated; no filters) |
| GET | `/hr/leave-types/:leaveTypeId` | Drawer |
| POST | `/hr/leave-types` | Create (`name`, `code`, `annualQuotaDays`, `isPaid` default true, `requiresApproval` default true, `description`) |
| PATCH | `/hr/leave-types/:leaveTypeId` | Edit (any of the same fields) |
| DELETE | `/hr/leave-types/:leaveTypeId` | Remove (soft delete) |

**Layout**
- List + drawer. Columns: name, code, quota (days/year), paid (yes/no badge), needs approval (yes/no). No filters; the list is short.
- Drawer form: name, code (upper-cased, 2–20 letters, digits, `-` or `_`), quota (0–366, step 0.5), "Paid leave" toggle (help text: unpaid days count as loss of pay in payroll), "Needs approval" toggle (help text: when off, requests are approved as soon as they are made and marked in attendance at once).
- Remove asks for confirmation that names the type. 409 "… has N pending request(s); decide or cancel them before removing it" links to HR-04, filtered by `leaveTypeId` and `status=PENDING`.
- Duplicate `code` or `name` → 409; show it on the field.
- Empty state: "No leave types yet. Add Casual, Sick or Earned leave so staff can apply."

---

### HR-02 · Salary setup
**Route:** `/hr/salary` (tabs `/hr/salary-components`, `/hr/employee-salaries`) · **Type:** Setup · **Who:** ADMIN, ACCOUNTANT, HR_MANAGER, and operators granted it. The components tab opens with `hr.salaryComponents.read`, the employee salaries tab with `hr.employeeSalaries.read`.

**Data shown**
- **Components tab:** `code`, `name`, `kind` (`EARNING` | `DEDUCTION`), `calculation` (`FIXED` | `PERCENT_OF_BASIC`), `defaultValue` (an amount, or a percent of basic), `description`
- **Employee salaries tab** (salary revisions): `user` (`firstName`, `lastName`, `role`), `effectiveFrom` (always the 1st of a month), `monthlyBasic`, `lines[]` (`component.code`, `component.name`, `component.kind`, `component.calculation`, `value`), `bankAccountNumber` and `panNumber` (always masked, e.g. `XXXXXXXX9012`), `bankIfsc`, `notes`, `createdAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a component | `hr.salaryComponents.manage` | `POST /hr/salary-components` |
| Edit a component | `hr.salaryComponents.manage` | `PATCH /hr/salary-components/:componentId` |
| Remove a component | `hr.salaryComponents.manage` | `DELETE /hr/salary-components/:componentId` |
| Add a salary revision for an employee | `hr.employeeSalaries.manage` | `POST /hr/employee-salaries` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/salary-components?kind=` | Components table; also the component picker in the revision form |
| GET | `/hr/salary-components/:componentId` | Component drawer |
| POST | `/hr/salary-components` | Create (`code`, `name`, `kind`, `calculation`, `defaultValue`, `description`) |
| PATCH | `/hr/salary-components/:componentId` | Edit |
| DELETE | `/hr/salary-components/:componentId` | Remove |
| GET | `/hr/employee-salaries?userId=` | Revisions table (paginated); one employee's history |
| GET | `/hr/employee-salaries/:salaryId` | Revision drawer (read-only) |
| POST | `/hr/employee-salaries` | New revision (`userId`, `effectiveFrom`, `monthlyBasic`, `lines[{ componentId, value? }]`, `bankAccountNumber?`, `bankIfsc?`, `panNumber?`, `notes?`) |

**Layout**
- **Components tab:** list + drawer. Columns: code, name, kind (green "Earning" / red "Deduction" badge), calculation, default value (shown as an amount or as "12% of basic"). Filter: kind → `kind`.
  - Form: when calculation is `PERCENT_OF_BASIC`, the value field shows a % suffix and a max of 100.
  - After a component is used in a salary revision, its `kind` and `calculation` cannot change and it cannot be removed. Show the 409 message ("… is used in N salary revision(s); …").
  - Remove asks for confirmation.
- **Employee salaries tab:** a table of revisions. Columns: employee, effective from, monthly basic, number of components, bank account (masked), created. Filter: employee → `userId`. A row opens a read-only drawer with the lines.
  - Revisions are never edited. To change pay, add a new revision; the drawer's "Revise" button starts the form prefilled from the current revision.
  - Revision form:
    - employee picker; effective-from month picker (always sends `YYYY-MM-01`); monthly basic
    - a lines grid: add component, value prefilled from `defaultValue`, live amount preview (percent × basic for `PERCENT_OF_BASIC`), and gross/deduction/net preview totals
    - bank account, IFSC and PAN. Help text: "Leave blank to keep the current details". Values not sent carry over from the previous revision.
  - 409 "This employee already has a salary revision effective …"; 422 "userId is not an active employee".
- Read-only when the user lacks the matching `manage` permission.

**Gap:** there is no HR employee directory. `GET /users/staff` and `GET /users/teachers` are not open to ACCOUNTANT or HR_MANAGER. The only employee list HR can read is `GET /hr/staff-attendance/register?date=`, which needs `hr.staffAttendance.read`, so ACCOUNTANT and payroll-only operators have no employee picker.

**Gap:** no "current salary per employee" view. The list returns every revision, so the page groups revisions by employee on the client. The only list of employees without a salary is `withoutSalary`, returned by a payroll run or a recalculation (HR-05).

---

### HR-03 · Staff attendance
**Route:** `/hr/staff-attendance` (tabs: Daily register, Summary) · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, HR_MANAGER, and operators granted it. Opens with `hr.staffAttendance.read`; marking needs `hr.staffAttendance.record`.

**Data shown**
- **Daily register** for one `date`:
  - `closure` (`WEEKLY_OFF`, `HOLIDAY`, `VACATION` or null)
  - `summary` (`employees`, `marked`, `unmarked`, `counts` per status)
  - `employees[]`: `userId`, `name`, `employeeCode`, `designation`, `department`, `role`, `status` (`PRESENT`, `ABSENT`, `HALF_DAY`, `LEAVE`, `ON_DUTY`, or null), `checkIn`, `checkOut`, `remarks`, `leaveRequestId` (set when an approved leave wrote the mark)
- **Summary** for a range (default: this month up to today): `from`, `to`, `workingDays`, `employees[]` with `counts` per status, `marked`, `daysPresent` (PRESENT + ON_DUTY + half of HALF_DAY)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Mark or re-mark the day | `hr.staffAttendance.record` | `POST /hr/staff-attendance` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/staff-attendance/register?date=` | The grid: every active employee with their mark |
| POST | `/hr/staff-attendance` | Save the grid: `{ date, records: [{ userId, status, checkIn?, checkOut?, remarks? }] }` (1–500 rows, idempotent per employee and date) |
| GET | `/hr/staff-attendance/summary?from=&to=&userId=` | Summary tab (range up to 366 days) |

**Layout**
- **Daily register:** grid editor.
  - Date picker at the top (defaults to today; future dates disabled). KPI strip: employees, marked, unmarked, then one count per status.
  - Rows: name + code, designation, department. Columns: status (segmented buttons P / A / ½ / L / OD, keyboard shortcuts), check-in, check-out, remarks.
  - Check-in and check-out are enabled only for `PRESENT`, `HALF_DAY` and `ON_DUTY`, and check-out must not be before check-in (validated before saving).
  - Rows with a `leaveRequestId` show a "From leave" badge. Hand-marking such a row replaces the leave's mark: warn first.
  - Toolbar: "Mark all unmarked as Present", "Unmarked only" filter, and a name search (client-side).
  - Save sends only changed rows. Toast: `created` / `updated` counts.
  - When `closure` is set, show a banner ("Holiday: attendance cannot be recorded") and make the grid read-only.
  - Read-only without `hr.staffAttendance.record`.
- **Summary:** from/to pickers, employee filter → `userId`. Header: "Working days: N". Columns: employee, present, on duty, half day, leave, absent, marked, days present, plus a bar showing `daysPresent` / `workingDays`. Export to CSV on the client.
- Errors to show as they are (422): future date; "Staff attendance cannot be recorded on … : it is a holiday"; "N user(s) are not active employees"; "Payroll for September 2026 is finalized; attendance and leave in that month can no longer change".

---

### HR-04 · Leave requests and balances
**Route:** `/hr/leave-requests` (tabs: Requests, Balances) · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, HR_MANAGER, and operators granted it. The Requests tab opens with `hr.leaveRequests.read`, the Balances tab with `hr.leaveBalances.read`. Approve/reject needs `hr.leaveRequests.decide` (owner-only: ADMIN, PRINCIPAL, HR_MANAGER, HR owners by assignment; never an operator). Cancelling someone else's request, or any approved request, needs `hr.leaveRequests.cancelAny` (owner-only: ADMIN, HR_MANAGER, HR owners by assignment; **not** PRINCIPAL, never an operator).

**Data shown**
- **Requests:** `user` (`firstName`, `lastName`, `role`), `leaveType` (`name`, `code`, `isPaid`), `fromDate`, `toDate`, `halfDay`, `days` (working days, fixed when applied), `reason`, `status` (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), `createdAt`, `decidedAt`, `decisionNote`, `cancelledAt`, `cancelReason`
- After a decision or cancellation: `markedDates` (attendance days marked LEAVE / HALF_DAY on approval) or `clearedDates` (marks removed on cancelling approved leave)
- **Balances** for one employee and `year`: per leave type `name`, `code`, `isPaid`, `quota`, `used` (approved), `pending`, `remaining`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Approve | `hr.leaveRequests.decide` (owner-only) | `POST /hr/leave-requests/:requestId/decision` `{ decision: "APPROVED", note? }` |
| Reject (note required) | `hr.leaveRequests.decide` (owner-only) | `POST /hr/leave-requests/:requestId/decision` `{ decision: "REJECTED", note }` |
| Cancel a request (pending or approved, anyone's) | `hr.leaveRequests.cancelAny` (owner-only) | `POST /hr/leave-requests/:requestId/cancellation` `{ reason? }` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/leave-requests?status=&userId=&leaveTypeId=&from=&to=` | Requests table (paginated). `from`/`to` match requests that overlap the window |
| GET | `/hr/leave-requests/:requestId` | Request drawer |
| POST | `/hr/leave-requests/:requestId/decision` | Approve or reject |
| POST | `/hr/leave-requests/:requestId/cancellation` | Cancel |
| GET | `/hr/leave-balances?userId=&year=` | Balances tab (`userId` required; `year` defaults to this year) |
| GET | `/hr/leave-types` | Leave type filter options |

**Layout**
- **Requests tab:** a table, opening on the "Pending" quick filter (`status=PENDING`), oldest first, so it works as an approval queue.
  - Columns: employee, leave type (paid/unpaid badge), dates (with "½ day" tag), days, reason (truncated), status badge, applied on.
  - Filters: status → `status`, employee → `userId`, leave type → `leaveTypeId`, date range → `from`/`to`.
  - A row opens a drawer with the full request, decision trail and cancellation trail, plus the employee's balance for that leave type (from `GET /hr/leave-balances?userId=&year=`).
  - Approve and Reject buttons show only on `PENDING` rows and only with `hr.leaveRequests.decide`. Reject opens a dialog with a required note. Hide both on the signed-in user's own request (422 "You cannot decide on your own leave request").
  - Cancel shows on `PENDING` and `APPROVED` rows only with `hr.leaveRequests.cancelAny`. Confirm dialog: for approved leave, "This removes the leave marks from staff attendance".
  - Success toast uses `message`, plus "Marked in attendance: …" (`markedDates`) or "Removed from attendance: …" (`clearedDates`).
  - Errors: 409 "This leave request is already approved/rejected/cancelled" (refresh the row); 422 when the month's payroll is finalized.
- **Balances tab:** employee picker and year picker (current year default). Table: leave type, paid, quota, used, pending, remaining. A bar per row shows used and pending against quota. "View requests" links to the Requests tab filtered by `userId`.

**Gap:** no way to adjust a balance (opening balance, carry forward, a manual credit or debit). Balances are always quota − approved − pending for the calendar year, and the quota is per leave type, not per employee.

**Gap:** balances are one employee at a time (`userId` is required); there is no all-staff balance report. The employee picker has the same directory gap as HR-02. HR-03's register works as the picker only for holders of `hr.staffAttendance.read`.

**Notes**
- HR cannot apply on an employee's behalf: `POST /hr/leave-requests` always applies for the caller (PO-11).
- Responses return `decidedBy` / `cancelledBy` as user ids only; show the time and note, not a name.

---

### HR-05 · Payroll runs
**Route:** `/hr/payroll-runs`, detail `/hr/payroll-runs/:runId` · **Type:** Operations · **Who:** ADMIN, ACCOUNTANT, HR_MANAGER, and operators granted it. Opens with `hr.payrollRuns.read`. Running and recalculating need `hr.payrollRuns.run`. Finalizing needs `hr.payrollRuns.finalize` (owner-only: ADMIN, ACCOUNTANT, HR_MANAGER, HR owners by assignment; never an operator).

**Data shown**
- Runs: `month`, `monthLabel` (e.g. "September 2026"), `periodStart`, `periodEnd`, `status` (`DRAFT` | `FINALIZED`), `employeeCount`, `totalGross`, `totalDeductions`, `totalNet`, `computedAt`, `finalizedAt`, `notes`
- After a run or a recalculation: `withoutSalary[]` (`userId`, `name`): active employees left out because they have no salary revision effective on the 1st of the month
- Payslips of the run: `employeeName`, `employeeCode`, `designation`, `role`, `paidDays`, `lopDays`, `grossPay`, `totalDeductions`, `netPay`, `payslipNumber` (set at finalization, e.g. `PSL-202609-0001`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Run payroll for a month | `hr.payrollRuns.run` | `POST /hr/payroll-runs` `{ month: "YYYY-MM", notes? }` |
| Recalculate a draft | `hr.payrollRuns.run` | `POST /hr/payroll-runs/:runId/recalculation` |
| Finalize | `hr.payrollRuns.finalize` (owner-only) | `POST /hr/payroll-runs/:runId/finalization` |
| Open a payslip / PDF | `hr.payslips.read` | HR-06 |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/payroll-runs?status=` | Runs table (paginated) |
| POST | `/hr/payroll-runs` | Create a DRAFT run with every payslip computed |
| GET | `/hr/payroll-runs/:runId` | Run detail header |
| GET | `/hr/payroll-runs/:runId/payslips` | Payslips table on the run detail (paginated; no filters) |
| POST | `/hr/payroll-runs/:runId/recalculation` | Recompute a draft from current salaries, attendance and leave |
| POST | `/hr/payroll-runs/:runId/finalization` | Lock the run, number the payslips, release them to employees |

**Layout**
- **Runs list:** columns: month (`monthLabel`), status badge, employees, gross, deductions, net, computed at, finalized at. Filter: status → `status`. "Run payroll" button opens a dialog with a month picker (future months disabled) and notes.
- **Run detail** (list + detail page):
  - Header: month, status, KPI tiles (employees, total gross, total deductions, total net), computed at, finalized at.
  - Buttons (DRAFT only): "Recalculate" (`run`) and "Finalize" (`finalize`).
  - Finalize confirm dialog: "Finalize payroll for September 2026? Payslips get numbers and become visible to staff. Attendance and leave for this month will be locked. This cannot be undone."
  - When `withoutSalary` comes back non-empty, show a warning panel listing those employees, with a link to HR-02 to add their salary. It is returned only by run and recalculate, so the panel shows after those actions.
  - Payslips table: columns: employee, code, designation, paid days, LOP days, gross, deductions, net, payslip number (blank on drafts). A row opens HR-06. Each row has a PDF icon.
  - A FINALIZED run is read-only.
- Workflow hint on DRAFT runs: "Check attendance (HR-03) and leave (HR-04) for the month, recalculate, then finalize."
- Errors: 409 "A payroll run for … already exists" (link to it); 422 "… cannot be run yet: the month has not started"; 422 "… has no payslips to finalize"; 409 "… is finalized; it can no longer be recalculated".

**Gap:** the run's payslip list has no search or sort (only `page`, `limit`). With a large staff, search on the client after loading all pages (max 100 per page).

**Notes**
- No endpoint un-finalizes a run (there is no `DELETE …/finalization`).

---

### HR-06 · Payslip
**Route:** `/hr/payslips/:payslipId` (opened from HR-05) · **Type:** Operations · **Who:** ADMIN, ACCOUNTANT, HR_MANAGER, and operators granted it. Opens with `hr.payslips.read`.

**Data shown**
- Header: `payslipNumber` ("Assigned on finalization" on drafts), `month`, `run.status`, `run.finalizedAt`, `employeeName`, `employeeCode`, `designation`, `role`
- Bank: `bankAccountMasked`, `bankIfsc`, `panMasked`
- Days: `daysInMonth`, `paidDays`, `lopDays`, `attendance` (count per status for the month)
- Earnings: `monthlyBasic`, `earnings[]` (`code`, `name`, `calculation`, `value`, `amount`; the first line is Basic), `totalEarnings`, `lopAmount`, `grossPay`
- Deductions: `deductions[]` (same shape), `totalDeductions`
- `netPay`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Download / print PDF | `hr.payslips.read` | `GET /hr/payslips/:payslipId/pdf` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/hr/payslips/:payslipId` | The payslip |
| GET | `/hr/payslips/:payslipId/pdf` | PDF (drafts are stamped "DRAFT - not final") |

**Layout**
- A payslip-style card: header block, a two-column earnings / deductions table, an LOP line ("Loss of pay (2 days): −…") between total earnings and gross, a highlighted net pay, and an attendance strip (P / A / ½ / L / OD counts).
- "Back to run" link (`run.id`), and previous/next payslip buttons using the run's payslip list.
- A "Draft" banner when `run.status` is `DRAFT`: figures can still change on recalculation.
- The PDF endpoint returns the file itself, not a signed link. Fetch it with the bearer token, then open the blob in a new tab.

**Gap:** no payslip list across runs (for example one employee's payslips for a year, or a search by employee). Payslips are reachable only through their run.

---

## Inventory

Inventory is the school store: item categories, vendors, items with stock on hand, an append-only stock ledger, and stock reports. It is an add-on module. Its built-in owner is `INVENTORY_MANAGER`, who holds every `inventory.*` permission, and so does ADMIN. PRINCIPAL and ACCOUNTANT read everything (`*.read`) but change nothing. An operator role can give an employee any inventory permission **except** the owner-only `inventory.stock.adjust` (stock adjustments) and `inventory.activity.read`. **Setup** pages (IN-01 to IN-03) keep the masters. **Operations** pages (IN-04, IN-05) record receipts, issues, returns and adjustments, and report on stock. Stock and average cost are never edited directly. They change only through movements, and each receipt re-averages the cost: new average = (stock × average + quantity × unit cost) ÷ (stock + quantity).

**Note on page split.** Item detail (IN-03) shows that item's ledger and starts movements for it. IN-04 is the ledger across all items, with the same movement form. One movement form component serves both.

---

### IN-01 · Categories
**Route:** `/inventory/categories` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER, and operators granted it. Opens with `inventory.categories.read`; editing needs `inventory.categories.manage`.

**Data shown**
- `name`, `description`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a category | `inventory.categories.manage` | `POST /inventory/categories` |
| Rename / edit | `inventory.categories.manage` | `PATCH /inventory/categories/:categoryId` |
| Remove | `inventory.categories.manage` | `DELETE /inventory/categories/:categoryId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/inventory/categories?q=` | Table rows (paginated, sorted by name; `q` searches the name) |
| GET | `/inventory/categories/:categoryId` | Drawer |
| POST | `/inventory/categories` | Create (`name`, `description`) |
| PATCH | `/inventory/categories/:categoryId` | Edit |
| DELETE | `/inventory/categories/:categoryId` | Remove (soft delete) |

**Layout**
- List + drawer. Columns: name, description. Search box → `q`. Each row has a "View items" link to IN-03 filtered by `categoryId`.
- 409 "A category named … already exists" (names are unique ignoring case).
- Remove asks for confirmation. 422 "… still has N items. Move or remove them first." links to IN-03 with that category.
- Read-only without `manage`.

**Notes**
- The list has no item count. The valuation report (IN-05) gives `itemCount` per category if needed.

---

### IN-02 · Vendors
**Route:** `/inventory/vendors` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER, and operators granted it. Opens with `inventory.vendors.read`; editing needs `inventory.vendors.manage`.

**Data shown**
- `name`, `contactPerson`, `phone`, `email`, `taxId` (GSTIN for schools in India), `address`, `notes`
- In the drawer: recent receipts from this vendor (`movementNumber`, `movementDate`, `item.name`, `quantityChange`, `unitCost`, `totalValue`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add a vendor | `inventory.vendors.manage` | `POST /inventory/vendors` |
| Edit | `inventory.vendors.manage` | `PATCH /inventory/vendors/:vendorId` |
| Remove | `inventory.vendors.manage` | `DELETE /inventory/vendors/:vendorId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/inventory/vendors?q=` | Table rows (paginated; `q` searches name, contact person, phone, email, tax id) |
| GET | `/inventory/vendors/:vendorId` | Drawer |
| POST | `/inventory/vendors` | Create |
| PATCH | `/inventory/vendors/:vendorId` | Edit |
| DELETE | `/inventory/vendors/:vendorId` | Remove (soft delete; past receipts keep the vendor) |
| GET | `/inventory/movements?vendorId=&type=RECEIPT` | Drawer: purchase history (needs `inventory.stock.read`) |

**Layout**
- List + drawer. Columns: name, contact person, phone, email, tax id. Search box → `q`.
- Drawer tabs: Details (form), Receipts (read-only list, newest first, with a link to IN-04 filtered by `vendorId`).
- `taxId` errors to show on the field: 400 "must be a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)" (India); 409 "… is already registered with tax id …".
- Remove asks for confirmation.

---

### IN-03 · Items
**Route:** `/inventory/items`, detail `/inventory/items/:itemId` · **Type:** Setup · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER, and operators granted it. Opens with `inventory.items.read`. Editing needs `inventory.items.manage`. The ledger tab needs `inventory.stock.read`. Movement buttons need `inventory.stock.move`; "Adjust" also needs `inventory.stock.adjust` (owner-only).

**Data shown**
- Items: `sku`, `name`, `category.name`, `unit` (`PCS`, `BOX`, `PACK`, `KG`, `G`, `LITRE`, `ML`, `METRE`, `SET`, `REAM`), `stockOnHand`, `reorderLevel`, `averageUnitCost`, `stockValue` (stock × average cost), `isLowStock`, `location`, `discontinued`, `description`
- Item ledger: `movementNumber` (`STK-000001`), `movementDate`, `type`, `quantityChange` (signed), `balanceAfter`, `unitCost`, `totalValue`, `averageCostAfter`, `vendor.name`, `issuedToUser` / `issuedTo`, `reason`, `reference`, `creator`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Add an item | `inventory.items.manage` | `POST /inventory/items` |
| Edit an item, reorder level, discontinue | `inventory.items.manage` | `PATCH /inventory/items/:itemId` |
| Remove an item | `inventory.items.manage` | `DELETE /inventory/items/:itemId` |
| Receive / issue / take back | `inventory.stock.move` | `POST /inventory/items/:itemId/movements` (IN-04 form) |
| Adjust stock | `inventory.stock.move` + `inventory.stock.adjust` (owner-only) | `POST /inventory/items/:itemId/movements` `type: "ADJUSTMENT"` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/inventory/items?q=&categoryId=&lowStock=&discontinued=` | Items table (paginated; `q` searches SKU and name) |
| GET | `/inventory/items/:itemId` | Detail header |
| POST | `/inventory/items` | Create (`sku`, `name`, `categoryId`, `unit`, `reorderLevel`, `location`, `description`, `discontinued`) |
| PATCH | `/inventory/items/:itemId` | Edit (same fields) |
| DELETE | `/inventory/items/:itemId` | Remove (soft delete; ledger kept) |
| GET | `/inventory/items/:itemId/movements?type=&from=&to=` | Ledger tab (paginated, newest first) |
| POST | `/inventory/items/:itemId/movements` | Record a movement for this item |
| GET | `/inventory/categories` | Category filter and form picker |

**Layout**
- **List:** columns: SKU, name, category, unit, in stock, reorder level, avg cost, stock value, location, status (red "Low stock" when `isLowStock`, grey "Discontinued").
  - Filters: search → `q`, category → `categoryId`, "Low stock only" → `lowStock=true`, "Show discontinued" → `discontinued`.
  - "New item" opens a drawer form. Units `PCS`, `BOX`, `PACK`, `SET` and `REAM` take whole numbers only; 422 otherwise.
- **Detail page:**
  - Header: SKU, name, category, unit, location, KPI tiles (in stock, reorder level, avg unit cost, stock value), low-stock and discontinued badges.
  - Buttons: Receive, Issue, Return (`inventory.stock.move`), Adjust (`inventory.stock.adjust`), Edit, Remove (`inventory.items.manage`).
  - Tabs: **Ledger** (columns: number, date, type badge, change (+/−), balance after, unit cost, value, avg cost after, vendor / issued to, reason/reference, by; filters type → `type`, date range → `from`/`to`), **Details** (form; read-only without `manage`), **History** (MA-01 filtered by `entityId` = item id; owners and ADMIN only).
- Stock on hand and average cost are never form fields (sending them gives 400 "is maintained by stock movements…").
- Errors:
  - 409 "SKU … is already used by …"
  - 422 "… already has stock movements in PCS; its unit can no longer change"
  - remove: 422 "… still has 12 PCS in stock. Issue or adjust it to zero first."
- Empty state for low stock: "Nothing at or below its reorder level."

---

### IN-04 · Stock movements
**Route:** `/inventory/movements` · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER, and operators granted it. Opens with `inventory.stock.read`. Recording needs `inventory.stock.move` (receive, issue, return). Adjustments also need `inventory.stock.adjust` (owner-only: ADMIN, INVENTORY_MANAGER, inventory owners by assignment; never an operator).

**Data shown**
- Movements: `movementNumber`, `movementDate`, `type` (`RECEIPT`, `ISSUE`, `RETURN`, `ADJUSTMENT`), `item` (`sku`, `name`, `unit`, `stockOnHand`), `quantityChange`, `balanceAfter`, `unitCost`, `totalValue`, `averageCostAfter`, `vendor.name`, `issuedToUser` (`firstName`, `lastName`, `role`) or `issuedTo` (free text), `reason`, `reference`, `creator`, `createdAt`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Receive stock (purchase) | `inventory.stock.move` | `POST /inventory/items/:itemId/movements` `{ type: "RECEIPT", quantity, unitCost, vendorId?, reference?, movementDate? }` |
| Issue stock | `inventory.stock.move` | `POST /inventory/items/:itemId/movements` `{ type: "ISSUE", quantity, issuedToUserId or issuedTo, reason?, reference?, movementDate? }` |
| Take back (return) | `inventory.stock.move` | `POST /inventory/items/:itemId/movements` `{ type: "RETURN", quantity, issuedToUserId? / issuedTo?, reason?, movementDate? }` |
| Adjust (count, damage, loss) | `inventory.stock.move` + `inventory.stock.adjust` (owner-only) | `POST /inventory/items/:itemId/movements` `{ type: "ADJUSTMENT", quantityChange (signed), reason, reference?, movementDate? }` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/inventory/movements?type=&itemId=&vendorId=&issuedToUserId=&from=&to=` | Ledger table (paginated, newest first) |
| GET | `/inventory/movements/:movementId` | Movement drawer |
| POST | `/inventory/items/:itemId/movements` | Record a movement |
| GET | `/inventory/items?q=` | Item picker in the form (shows unit, stock, avg cost) |
| GET | `/inventory/vendors?q=` | Vendor picker (receipts) |

**Layout**
- **Ledger table:** columns: number, date, type badge, item (SKU + name), change (+ green / − red, with unit), balance after, unit cost, value, vendor / issued to, reason / reference, by.
  - Filters: type → `type`, item → `itemId`, vendor → `vendorId`, issued to → `issuedToUserId`, date range → `from`/`to`.
  - A row opens a read-only drawer. Item links go to IN-03.
- **"Record movement" drawer** (also opened from IN-03 with the item fixed):
  - Step 1: pick the item and type. The Adjust tab shows only with `inventory.stock.adjust`.
  - Step 2: fields for that type only:
    - RECEIPT: quantity, unit cost, vendor, reference (invoice no.)
    - ISSUE: quantity, issued to (person picker or free text), reason
    - RETURN: quantity, from whom
    - ADJUSTMENT: signed change (e.g. −2), required reason
  - Date: defaults to today; future dates disabled.
  - Live preview: current stock → balance after. For RECEIPT, also the new weighted average cost. ISSUE, RETURN and ADJUSTMENT use the current average cost.
- Movements are permanent: no edit or delete. Corrections are a new ADJUSTMENT. Before saving, a confirm step repeats the movement ("Issue 5 PCS of Whiteboard marker to Asha Rao").
- Errors (422) to show as they are:
  - "… is out of stock" / "Only 3 PCS of … in stock"
  - "The adjustment would take … below zero"
  - "… is discontinued and cannot receive new stock"
  - "… is counted in PCS: the quantity must be a whole number"
  - "movementDate cannot be in the future"
- An issue or adjustment that takes an item to its reorder level or below sends an in-app notification to ADMIN and INVENTORY_MANAGER. That is shown in the notification inbox, not here.

**Gap:** no person picker for issues. INVENTORY_MANAGER can read `GET /users/students` but not staff or teachers (`/users/staff`, `/users/teachers`, `/users` are ADMIN/PRINCIPAL, teachers also STAFF). So `issuedToUserId` can be picked only for students. For staff, the form falls back to free-text `issuedTo`, and the "issued to" filter can't find them.

---

### IN-05 · Inventory reports
**Route:** `/inventory/reports` (tabs: Low stock, Valuation, Consumption) · **Type:** Operations · **Who:** ADMIN, PRINCIPAL, ACCOUNTANT, INVENTORY_MANAGER, and operators granted it. Opens with `inventory.reports.read`.

**Data shown**
- **Low stock** (`asOf`): `items[]`: `sku`, `name`, `categoryName`, `unit`, `stockOnHand`, `reorderLevel`, `shortfall`, `averageUnitCost`, `lastVendor`, `lastUnitCost`, `lastReceivedOn`, `location` (discontinued items excluded)
- **Valuation** (`asOf`, `currency`): `categories[]` (`categoryName`, `itemCount`, `itemsInStock`, `stockValue`), `itemCount`, `totalValue`
- **Consumption** (`from`, `to`): `items[]`: `sku`, `name`, `categoryName`, `unit`, `issuedQuantity`, `issuedValue`, `returnedQuantity`, `returnedValue`, `netQuantity`, `netValue`; `totals` (`issuedValue`, `returnedValue`, `netValue`)

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| Export a report (CSV / Excel) | `inventory.reports.read` | same endpoint with `?format=csv` or `?format=xlsx` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/inventory/reports/low-stock?format=` | Low stock tab |
| GET | `/inventory/reports/valuation?format=` | Valuation tab |
| GET | `/inventory/reports/consumption?from=&to=&format=` | Consumption tab (`from` and `to` required) |

**Layout**
- **Low stock:** table sorted by shortfall (largest first). Columns: SKU, item, category, in stock, reorder level, shortfall, last vendor, last unit cost, last received, location. Each row links to IN-03. A "Receive" button opens the IN-04 form with the item and last vendor prefilled (`inventory.stock.move`). Empty state: "All items are above their reorder level."
- **Valuation:** a KPI tile for total stock value (in `currency`) and one for item count. A horizontal bar chart of `stockValue` by category. Table: category, items, items in stock, stock value, with a total row.
- **Consumption:** date range picker (default: this month). KPI tiles: issued value, returned value, net value. Table: SKU, item, category, unit, issued (qty/value), returned (qty/value), net (qty/value). Top-10 chart by `netValue`.
- Export buttons per tab ("CSV", "Excel"). Unlike other exports, these endpoints return JSON when `format` is omitted. The download returns the file itself, so fetch it with the bearer token and save the blob.

---

## Shared components

Components used by many modules' pages rather than one module.

---

### MA-01 · Module activity tab
**Route:** `/<module>/activity` (a tab or sidebar item inside each module, e.g. `/hr/activity`, `/inventory/activity`) · **Type:** Shared · **Who:** ADMIN, and the module's owners (built-in owner role or by owner assignment). Opens with `<module>.activity.read` (e.g. `hr.activity.read`). That permission is owner-only and is never in an operator role. Operators and everyone else get 403, so hide the tab unless `GET /administration/access/me/access` lists that permission. Only the add-on modules have owners, so for users, academics, administration, finance, communication, reports and files the tab is ADMIN-only.

Modules with an activity log (every module except `/auth` and `/me`):

| Module | List | One entry | Opened by |
|---|---|---|---|
| users | `GET /users/activity` | `GET /users/activity/:auditLogId` | ADMIN |
| academics | `GET /academics/activity` | `GET /academics/activity/:auditLogId` | ADMIN |
| administration | `GET /administration/activity` | `GET /administration/activity/:auditLogId` | ADMIN |
| finance | `GET /finance/activity` | `GET /finance/activity/:auditLogId` | ADMIN |
| communication | `GET /communication/activity` | `GET /communication/activity/:auditLogId` | ADMIN |
| reports | `GET /reports/activity` | `GET /reports/activity/:auditLogId` | ADMIN |
| files | `GET /files/activity` | `GET /files/activity/:auditLogId` | ADMIN |
| library | `GET /library/activity` | `GET /library/activity/:auditLogId` | ADMIN, LIBRARIAN, library owners |
| transport | `GET /transport/activity` | `GET /transport/activity/:auditLogId` | ADMIN, TRANSPORT_MANAGER, transport owners |
| hostel | `GET /hostel/activity` | `GET /hostel/activity/:auditLogId` | ADMIN, HOSTEL_MANAGER, hostel owners |
| hr | `GET /hr/activity` | `GET /hr/activity/:auditLogId` | ADMIN, HR_MANAGER, HR owners |
| inventory | `GET /inventory/activity` | `GET /inventory/activity/:auditLogId` | ADMIN, INVENTORY_MANAGER, inventory owners |

**Data shown**
- Entries (newest first): `createdAt`, `actor` (`name`, `role`, as they were at the time), `userId`, `role`, `action` (the permission's label, e.g. "Approve or reject leave requests"), `permission` (e.g. `hr.leaveRequests.decide`), `summary` (the response's message, e.g. "Book issued to Asha Rao. Due 2026-11-02"), `entityId`, `method`
- Entry detail adds: `path`, `statusCode`, `payload` (request body with secrets removed and long lists summarised), `ipAddress`, `module`

**Actions**
| Action | Permission / roles | API |
|---|---|---|
| View the log | `<module>.activity.read` (owner-only) | `GET /<module>/activity` |
| Open an entry | `<module>.activity.read` | `GET /<module>/activity/:auditLogId` |

**APIs**
| Method | Path | Used for |
|---|---|---|
| GET | `/<module>/activity?userId=&permission=&entityId=&method=&from=&to=&search=` | Entries table (paginated, newest first) |
| GET | `/<module>/activity/:auditLogId` | Entry drawer (404 if the entry belongs to another module) |
| GET | `/administration/access/permissions?module=<module>` | Options for the "Action" filter (key + label, grouped by resource); open to ADMIN and owners |
| GET | `/administration/access/me/access` | Whether to show the tab at all |

**Layout**
- Read-only table, one component with the module as a prop. Columns: when (`createdAt`, relative time with exact time on hover), who (`actor.name` + role chip), action (`action` label), what happened (`summary`), method badge (POST create / PATCH edit / PUT replace / DELETE remove).
- Filters, all kept in the page URL:
  - **Person** → `userId`. ADMIN gets a picker from `GET /users`. Owners can't read `/users`, so a "Filter by this person" link on any row's actor sets it.
  - **Action** → `permission`. A grouped select from the catalogue. Picking a group header (e.g. "Leave requests") sends the prefix with a trailing dot (`hr.leaveRequests.`); picking one action sends the exact key.
  - **Record** → `entityId` (set by a record's History link, shown as a removable chip).
  - **Method** → `method` (`POST`, `PUT`, `PATCH`, `DELETE`).
  - **Date range** → `from` / `to` (inclusive whole days, UTC).
  - **Search** → `search`: words in the summary, any case, matched literally.
- A row opens a drawer with the full entry: the summary as a title, actor, time, action and permission, then a "Request" section (method, path, status code, IP) and the payload as a collapsible JSON view. Show `entityId` with a "History of this record" link (sets `entityId`).
- Empty state: "No activity matches these filters." Sign-in events never appear here (central log only).

**Record history (on detail pages)**
- Detail pages of add-on and core modules can show a **History** tab or button. It reuses this component with `entityId=<record id>` fixed and the other filters hidden. Examples: an item (IN-03), a payroll run (HR-05), a leave request drawer (HR-04), a vendor (IN-02).
- Show it only when the user holds `<module>.activity.read`. Operators never see it.
- `entityId` is the record the write returned (or created), else the last id in the path. So:
  - a payroll run's history includes its recalculations and finalization (they return the run)
  - a leave request's history includes its decision and cancellation
  - a stock movement is filed under the movement's own id, not the item's. An item's History shows edits to the item; its movements are in the item's Ledger tab (IN-03).
  - staff attendance saves return no record id, so they have no per-record history. Find them by action (`hr.staffAttendance.record`) and date instead.

**Gap:** owners have no endpoint that lists the people who acted in their module. The person filter for owners works only from rows already loaded.

---

## Gaps found

Collected from the **Gap** notes on the pages above, and checked against the code. These are backend changes a page needs, ordered by how badly the frontend needs them.

### Blocks core screens: fix before building them

| # | Gap | Pages affected |
|---|---|---|
| 1 | **No student search or filters.** `GET /users/students` takes only `page` and `limit`: no search by name, code or admission number, no class, section or status filter. Rows also lack the current class and section. Today every student picker has to go class → section → `/academics/enrollments?sectionId=` | PE-01, FI-05, FI-08, FI-11, LB-04, TR-03, HO-02, and every student picker |
| 2 | **Marks already entered for a paper can't be loaded.** `GET /academics/marks` requires `studentId`, so filling the marks grid takes one call per student. Needs `GET /academics/marks?examPaperId=` | AC-14 |
| 3 | **No enrollment list per student.** `/academics/enrollments` requires `sectionId`, so the profile can't show the current section or the history across years | PE-02 |
| 4 | **Parents can't be searched**, so finding a sibling's parent during admission isn't practical. There is also no list of a parent's children, and a link's relation or primary contact can't be edited (only unlinked and linked again) | PE-03, PE-04 |
| 5 | **`GET /me/students` has no `userId`.** A parent needs it to place a library hold for a child (`borrowerUserId`) and to split loans and fines by child | PO-07 |
| 6 | **Module owners can't pick people.** LIBRARIAN, HR_MANAGER, HOSTEL_MANAGER, INVENTORY_MANAGER and ACCOUNTANT can't list staff or teachers. That blocks adding operators, handovers, the warden picker, staff borrowers, payroll employee pickers and inventory issues to staff | AD-05, HO-01, LB-04, HR-02, HR-05, IN-04 |
| 7 | **Sections show only the class teacher's `employeeCode`**, not the name, and teachers can't call `/users/teachers` to look names up | AC-02, AC-09, PO-10 |
| 8 | **Account lifecycle is incomplete:** deactivated accounts disappear from every read (`?status=INACTIVE` lists nothing). There is no reactivate endpoint, no role change, and nobody can edit their own profile. `PATCH /users/:userId` is ADMIN only, so STAFF can admit a student but can't fix a typo afterwards | AD-06, PE-02, SH-07 |
| 9 | **School name and logo are closed to teachers, students and parents.** `GET /administration/settings` allows staff roles only. `POST /auth/refresh` also leaves out `school`, so the app has to keep it from sign-in | SH-04 |

### Has a workaround, but worth adding

**Finance**
- The invoice list has no class, section, invoice-number, student or date filter (FI-07).
- The payments list has no `invoiceId` or `receivedBy` filter, so there's no "my collections today" view. `from` and `to` only filter when both are sent (FI-09).
- The statement covers one academic year; arrears need a second call (FI-11).
- A payment stuck in PENDING can't be re-checked with the gateway; staff wait for the webhook (FI-09).
- One payment pays one invoice. There's no combined checkout across invoices or siblings (PO-06).
- No exports for the trial balance, journal or income summary (FI-13).
- A fee head that fee structures still use can be deleted. The confirm dialog should warn (FI-01).

**Academics**
- Nothing copies a year's setup (sections, section subjects, teacher assignments, periods, timetable) into the next year, and there's no year-end view of students still active in the old year (AC-01, AC-12).
- Classes, sections and subjects can't be deleted or deactivated. Section `capacity` is stored but not enforced, and no endpoint returns a section's student count (AC-02, AC-03).
- No bulk endpoint for exam papers, and no view of which papers have all their marks entered (AC-13, AC-14).
- The staff homework submissions list leaves out attachment ids, so staff can't download what students submitted (AC-16).
- Families can't list academic years (needed for past report cards and statements). Portal attendance covers only the current year (PO-03, PO-05, PO-06).

**HR**
- No way to adjust leave balances (opening balance, carry forward, manual credit). No all-staff balance report: `userId` is required (HR-04).
- No "current salary" view; the list returns every salary revision (HR-02).
- No payslip list across runs and no payslip search. A payroll run can't be un-finalized (HR-05, HR-06).

**Communication and files**
- No list of sent messages and no delivery report. No recipient count before publishing (CO-01, CO-02).
- Announcement audiences leave out the module owner roles. Announcements can't carry attachments. Teachers and families can't browse past announcements outside their inbox (CO-01).
- A message can't go to parents without also going to their children (CO-02).
- The documents list can't filter by `category`: the service supports it, but the validator rejects it. `uploadedBy` is only an id. Teachers' documents can only be filed as GENERAL (FL-01).

**Library, transport, hostel**
- No printable fine receipt, no labels or barcodes for new copies, and borrowers can't renew their own loans (LB-03, LB-04, PO-07).
- No server-side roster PDF and no "copy seats to next year" action (TR-03, TR-04).
- Transport stop fees and hostel room and resource fees are stored but never invoiced (TR-02, HO-01, HO-03).

**General**
- No summary endpoint for the home page; each widget is its own call (SH-05).
- The audit log can't be exported. Module owners have no list of people to filter activity by (AD-03, MA-01).
- Smaller items: no "sign out all other devices" endpoint (changing the password does it), the logo can't be removed, and an invitation link can't be checked before use to show whose it is (SH-03, SH-07, AD-01).
- Inventory report exports return JSON when `format` is left out, unlike the other exports (IN-05).

### Docs that disagree with the code

The pages follow the code. These docs need updating (or the code, if the doc was right):

- **D-48** says library fines can be paid only after the book is returned. The code and API.md allow paying while it is still out.
- **D-50** says waivers clear the whole fine and that there is no LIBRARIAN role. The code allows partial waivers, and LIBRARIAN exists.
- **D-55** says beds can't be pre-booked. D-64 and the code allow it.
- **API.md, Roles table** lists STAFF for library, transport and hostel. ENDPOINTS.md gives STAFF none of those routes.
- **API.md, Handover** tells admins to "change their role", but no endpoint changes a role (see gap 8).
- **D-51** (parents' phone numbers on transport rosters) is still open. Today everyone with `transport.roster.read` sees them.

---

## Endpoints not on a page

Every endpoint in [ENDPOINTS.md](ENDPOINTS.md) appears on at least one page above, except these:

| Endpoint | Why |
|---|---|
| `POST /public/payments/razorpay/:tenantId/webhook` | Razorpay calls it server to server. Its URL is shown on FI-06 so the school can register it with Razorpay |
| `GET /reports/activity`, `GET /reports/activity/:auditLogId` | Reports only reads and never writes, so its activity log is always empty. The central audit log (AD-03) covers it |

Background jobs with no endpoint, for information: nightly library hold expiry, overdue and due-soon reminders, and ending a leaver's library holds, transport seat and hostel bed.
