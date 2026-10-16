# API Guide (v1)

Base URL: `/api/v1`. Every endpoint needs `Authorization: Bearer <token>`, except:
- `GET /health` and `GET /ready`
- the API docs
- signed file downloads
- the payment webhook, which is verified by signature

- **All endpoints** (generated from the code, always current): [ENDPOINTS.md](ENDPOINTS.md). There are 300+, each with its roles.
- **Request and response schemas:** `GET /api/v1/openapi.json` (OpenAPI 3.1), or interactively at **`/api/docs`**.
- This page covers the rules every endpoint follows, plus the main workflows.

## Contents

- [Conventions](#conventions)
- [Responses and errors](#responses-and-errors)
- [Roles](#roles)
- [Modules](#modules)
- [Workflows](#workflows)

---

## Conventions

| Topic | Rule |
|---|---|
| **Versioning** | The version is in the path (`/api/v1`). Breaking changes go to `/api/v2`, and v1 keeps working. |
| **Resources** | Plural nouns in kebab-case (`/academic-years`, `/teacher-assignments`), grouped by module (`/users/…`, `/academics/…`, `/finance/…`). |
| **Nesting** | Only for records that belong to one parent: `/academics/exams/:examId/papers`, `/library/books/:bookId/copies`. Records looked up from several sides are top-level, with filters (`/academics/enrollments?sectionId=`). |
| **Methods** | `GET` reads · `POST` creates · `PATCH` updates partially · `DELETE` removes or deactivates. `PUT` replaces a singleton; it is used only for the school logo (`PUT /administration/settings/logo`). |
| **Actions** | State changes that are not plain edits are `POST`s to an action sub-resource: `/exams/:id/result-publication`, `/invoices/:id/cancellation`, `/payroll-runs/:id/finalization`, `/loans/:id/return`. They return **200** with the updated resource. **201** is returned only when a new record is created (a payment, a transfer that creates a new allocation). Undoing an action is `DELETE` on the same sub-resource (`DELETE …/result-publication`, `DELETE …/archival`). |
| **IDs** | UUIDs. Invalid IDs are rejected with `400` before any lookup. |
| **Lists** | Paginated: `?page=` (default 1) and `?limit=` (default 20, max 100), plus filters per resource. `meta` holds the totals. |
| **Bulk** | `POST /<resource>/bulk` with `{ "<resource>": [ … ] }`. All-or-nothing. |
| **Academic year** | Year-scoped endpoints act on the school's current year. Send `X-Academic-Year-Id: <id>` to use another year. Archived years are read-only: writes return `409`. |
| **Input** | JSON (`application/json`), except uploads (`multipart/form-data`, field `file`). Unknown fields are ignored. `id`, `tenantId`, timestamps, `role` and `passwordHash` can never be set through a profile endpoint. |
| **Dates and money** | Dates are `"YYYY-MM-DD"`. "Today" means today in the school's time zone (settings). Money is a JSON number in the school's currency, with at most 2 decimals. |
| **Files** | Uploads are checked for type, size and content signature. Downloads are never direct: endpoints return a **signed link valid for 15 minutes** (`…/download-url`). |
| **Exports** | Report and list exports take `?format=xlsx` (default) or `?format=csv`. CSV is UTF-8 with a BOM, with spreadsheet-formula injection neutralised. Report cards, receipts and payslips are available as PDF (`…/pdf`). |
| **Tracing** | Every response carries `X-Request-Id`, and you may send your own. Error bodies repeat it, so support can find the log line. |
| **Rate limits** | 300 requests per 15 minutes per IP by default. See the `RateLimit` headers. |

---

## Responses and errors

### Success

```json
{
  "success": true,
  "message": "Classes retrieved successfully",
  "data": [{ "id": "…", "className": "Class 1" }],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

`message` is written for people, for example "Book issued to Asha Rao. Due 2026-11-02", and can be shown to users as is.

### Error

```json
{
  "success": false,
  "message": "Invalid request: email must be a valid email; lastName is required",
  "error": {
    "code": "VALIDATION_ERROR",
    "requestId": "5b0c…",
    "details": [
      { "location": "body", "field": "email", "message": "must be a valid email" },
      { "location": "body", "field": "lastName", "message": "is required" }
    ]
  }
}
```

| Status | `error.code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request (invalid JSON, bad header, file of the wrong type) |
| 400 | `VALIDATION_ERROR` | Body, query or params fail validation; `details` lists each problem |
| 401 | `UNAUTHORIZED` | Missing, invalid or expired token |
| 403 | `FORBIDDEN` | Your role may not do this, or a teacher acts outside the sections they teach |
| 404 | `NOT_FOUND` | The resource in the URL does not exist, belongs to another school, or is not visible to you (for example, another family's child). Also returned for unknown routes |
| 409 | `CONFLICT` | Duplicate, or the resource's state forbids it: already exists, already graded, already finalized, archived year, seat or bed taken |
| 422 | `UNPROCESSABLE_ENTITY` | Valid input that breaks a business rule ("Route R1 is full (40 of 40 seats)") |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected failure. No internal details are returned; quote the `requestId` |

Clients should branch on `error.code` and `details[].field`, and display `message`. Messages are in English; localising by code is described in [OPERATIONS.md](OPERATIONS.md#design-note-languages-i18n).

---

## Roles

A token carries `{ userId, tenantId, role }`. Each endpoint allows a fixed set of roles, listed in [ENDPOINTS.md](ENDPOINTS.md). Some data is also limited to the records a person is linked to.

| Role | Who | Scope |
|---|---|---|
| `ADMIN` | School administrator | Everything, including privileged accounts, settings, audit log, archiving |
| `PRINCIPAL` | Head of school | Academic management and approvals (leave, fine waivers). Reads most other areas |
| `ACCOUNTANT` | Fees and payroll | Fees, payments, concessions, payroll, financial reports |
| `STAFF` | Office | Admissions, parents, enrollments, attendance of staff, library, transport, hostel, inventory |
| `TEACHER` | Teacher | Marks, attendance, homework and timetables **only for the sections and subjects they teach** |
| `STUDENT` | Student | `/me`: own timetable, attendance, homework (and submitting it), results, fees, library, transport, hostel |
| `PARENT` | Parent/guardian | `/me`: the same, for **linked children only**; pays fees online |

Self-service lives under `/api/v1/me` (portal), plus `my-…` endpoints in library, transport and hostel, and `/hr/me/…` for staff (own attendance, leave, payslips).

---

## Modules

| Module | Base path | What it covers |
|---|---|---|
| Users | `/users` | Accounts, staff, teachers, parents, students. Admission in one step (account, profile, parents, enrollment) |
| Academics | `/academics` | Years (with archiving), classes, subjects, sections, teacher assignments, enrollments and promotion, calendar, attendance, timetable, grade scales, exams and papers, marks, report cards, homework |
| Portal | `/me` | Student, parent and teacher self-service, and the notification inbox |
| Administration | `/administration` | School settings and logo, CSV imports, audit log |
| Finance | `/finance` | Fee heads, structures with installments and late fees, concessions, invoices, payments (counter and online), receipts, statements |
| Communication | `/communication` | Notifications (in-app, email, SMS) and announcements to audiences |
| Reports | `/reports` | Dashboards (overview, attendance, fees, academics) and exports |
| Files | `/files` | Student, staff and general documents |
| Library | `/library` | Catalogue (ISBN), copies, loans, renewals, fines, overdue reminders |
| Transport | `/transport` | Vehicles (compliance dates), routes and stops, seat assignments, rosters |
| Hostel | `/hostel` | Hostels, rooms, bed allocations, transfers, occupancy |
| HR | `/hr` | Staff attendance, leave types, requests and balances, salary structures, payroll runs, payslips |
| Inventory | `/inventory` | Categories, vendors, items, stock ledger (weighted average cost), low-stock, valuation and consumption reports |

---

## Workflows

### Admission

`POST /users/students` creates the account, profile, parents and enrollment in one transaction. Each parent is either an existing `parentId` or a new `user`/`profile`:

```json
{
  "user": { "firstName": "Asha", "lastName": "Rao", "email": "asha@example.com" },
  "profile": { "admissionNumber": "ADM-2026-001" },
  "parents": [
    { "user": { "firstName": "Meera", "lastName": "Rao", "email": "meera@example.com" }, "relation": "MOTHER", "isPrimaryContact": true },
    { "parentId": "7c1e…", "relation": "FATHER" }
  ],
  "enrollment": { "academicYearId": "…", "sectionId": "…", "admissionType": "NEW" }
}
```

The student code (`STU26-1-000001`) and roll number are generated.

For many students:
1. `GET /administration/imports/students/template` downloads the CSV template.
2. `POST /administration/imports/students` (multipart) returns **202** and runs the import in the background.
3. `GET /administration/imports/:importId` shows progress and per-row errors.

### Setting up a year

1. `POST /academics/academic-years` creates the year (`isCurrent: true` makes it current).
2. Create classes, subjects and sections (`…/bulk`).
3. Add section subjects and teacher assignments.
4. Set periods and the timetable (`/academics/timetable/…`). Clashes of section, teacher or room are rejected.
5. Add the calendar: holidays and events. These decide working days for attendance and leave.

### Exams and results

1. `POST /academics/exams` creates the exam, then `POST /academics/exams/:examId/papers` adds papers (date, time, room, max and pass marks).
2. `POST /academics/marks` or `/marks/bulk` records marks. Teachers can do this only for their sections. Grades are computed from the grade scale.
3. `POST /academics/exams/:examId/result-publication` publishes results. Students and parents are notified once, and report cards appear in `/me/students/:id/report-cards` (also as PDF).

### Fees

1. **Set up:** fee heads, then `POST /finance/fee-structures` (items, installments, late-fee rule), then concessions and concession grants.
2. **Bill:** `POST /finance/invoices/generation` bills a class or section for an installment. This is idempotent: students already billed are skipped. A daily job adds late fees.
3. **Collect at the counter:** `POST /finance/invoices/:id/payments` records the payment, then `GET /finance/payments/:id/receipt` gives the receipt PDF.
4. **Collect online (parent):**
   - `POST /me/students/:id/invoices/:invoiceId/payment-orders` returns the gateway order.
   - The app opens the gateway checkout.
   - `POST /me/payments/confirmations` sends the signed result.
   - The gateway also calls `POST /public/payments/webhook`.
   - Both paths are idempotent, so a payment is recorded once.

### Year end

1. `POST /academics/enrollments/promotions/bulk` promotes a section, with per-student overrides (`REPEAT`, `LEAVE`).
2. `PATCH /academics/academic-years/:id { "isCurrent": true }` switches the current year to the new one.
3. After the old year has ended and nobody is still active in it: `POST /academics/academic-years/:id/archival`. Its academic records become read-only; fees stay payable.

### Homework

1. A teacher creates `POST /academics/homework` and adds attachments with `POST …/attachments` (multipart).
2. Students and parents see it at `/me/students/:id/homework`.
3. The student submits with `POST /me/homework/:id/submission` (multipart: text and/or file). The student can resubmit until the work is graded.
4. The teacher reviews `GET /academics/homework/:id/submissions` and grades or returns each one with `POST …/submissions/:sid/grading`.
