# API Reference (v1)

Base URL: `/api/v1`. Every endpoint except `GET /health` needs `Authorization: Bearer <token>`.

## Conventions

| Topic | Rule |
|---|---|
| **Versioning** | The version is in the path (`/api/v1`). Breaking changes go to `/api/v2`; v1 keeps working. |
| **Resources** | Plural nouns, kebab-case (`/academic-years`, `/teacher-assignments`). Grouped by module: `/users/...`, `/academics/...`. |
| **Nesting** | Only for records that belong to one parent: `/users/students/:studentId/parents`, `/academics/exams/:examId/papers`. Records looked up from several sides are top-level with filters (`/academics/enrollments?sectionId=`). |
| **Methods** | `GET` read · `POST` create (or run an action such as `/promotions`) · `PATCH` partial update · `DELETE` remove/deactivate. `PUT` is not used. |
| **IDs** | UUIDs. Invalid IDs are rejected with `400` before any lookup. |
| **Bulk** | `POST /<resource>/bulk` with `{ "<resource>": [ ... ] }`. All-or-nothing. |
| **Academic year** | Year-scoped endpoints (sections, section-subjects, teacher-assignments, enrollments, exams, marks lists) use the school's current year. Send `X-Academic-Year-Id: <id>` to use another year. |
| **Input** | JSON only. Unknown fields are ignored. `id`, `tenantId`, timestamps, `role` and `passwordHash` can never be set through a profile endpoint. |

### Success response

```json
{
  "success": true,
  "message": "Classes retrieved successfully",
  "data": [ { "id": "…", "className": "Class 1" } ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

`meta` appears on list endpoints only. Lists accept `?page=` (default 1) and `?limit=` (default 20, max 100).

### Error response

```json
{
  "success": false,
  "message": "Invalid request: email must be a valid email; lastName is required",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": [
      { "location": "body", "field": "email", "message": "must be a valid email" },
      { "location": "body", "field": "lastName", "message": "is required" }
    ]
  }
}
```

| Status | `error.code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request (invalid JSON, bad header) |
| 400 | `VALIDATION_ERROR` | Body, query or params fail validation (`details` lists each problem) |
| 401 | `UNAUTHORIZED` | Missing, invalid or expired token |
| 403 | `FORBIDDEN` | Your role may not perform this action |
| 404 | `NOT_FOUND` | Resource in the URL does not exist (or belongs to another school), or unknown route |
| 409 | `CONFLICT` | Duplicate (already exists / already assigned / already enrolled) |
| 422 | `UNPROCESSABLE_ENTITY` | Valid input that breaks a business rule (e.g. "The student is not enrolled in this paper's section") |
| 429 | `TOO_MANY_REQUESTS` | Rate limit exceeded (see `RateLimit` headers) |
| 500 | `INTERNAL_ERROR` | Unexpected failure. No internal details are returned. |

Create returns `201`; everything else that succeeds returns `200`. `POST /academics/marks` returns `201` when it records new marks and `200` when it updates existing ones.

---

## Roles

| Role | Who |
|---|---|
| `ADMIN` | Full access, including privileged accounts |
| `PRINCIPAL` | Academic management; reads everything else |
| `ACCOUNTANT` | Reads people and academic structure (fees come later) |
| `STAFF` | Office work: admissions, parents, enrollments |
| `TEACHER` | Reads academics and students; records marks |
| `STUDENT`, `PARENT` | No API access yet (self-service portals are on the roadmap) |

Groups used below: **Mgmt** = ADMIN, PRINCIPAL · **Office** = ADMIN, STAFF · **Staff roles** = ADMIN, PRINCIPAL, ACCOUNTANT, STAFF · **Employees** = staff roles + TEACHER.

---

## Users module: `/api/v1/users`

### Accounts (any role)

| Method | Path | Does | Roles |
|---|---|---|---|
| GET | `/users?role=&status=` | List accounts | Mgmt |
| GET | `/users/:userId` | Get an account | Mgmt |
| PATCH | `/users/:userId` | Update personal details | ADMIN |
| DELETE | `/users/:userId` | Deactivate the account (you cannot deactivate yourself) | ADMIN |

### Staff (privileged users: ADMIN, PRINCIPAL, ACCOUNTANT, STAFF)

| Method | Path | Does | Roles |
|---|---|---|---|
| POST | `/users/staff` | Create account + staff profile. Body: `{ role, user, profile }` | ADMIN |
| GET | `/users/staff?role=` | List staff | Mgmt |
| GET | `/users/staff/:staffId` | Get a staff member | Mgmt |
| PATCH | `/users/staff/:staffId` | Update profile (designation, department…) | ADMIN |

### Teachers

| Method | Path | Does | Roles |
|---|---|---|---|
| POST | `/users/teachers` | Create account + teacher profile. Body: `{ user, profile }` | Mgmt |
| GET | `/users/teachers` | List teachers | ADMIN, PRINCIPAL, STAFF |
| GET | `/users/teachers/:teacherId` | Get a teacher | ADMIN, PRINCIPAL, STAFF |
| PATCH | `/users/teachers/:teacherId` | Update profile | Mgmt |

### Parents

| Method | Path | Does | Roles |
|---|---|---|---|
| POST | `/users/parents` | Create account + parent profile. Body: `{ user, profile }` | Office |
| GET | `/users/parents` | List parents | Staff roles |
| GET | `/users/parents/:parentId` | Get a parent | Staff roles |
| PATCH | `/users/parents/:parentId` | Update profile | Office |

### Students

| Method | Path | Does | Roles |
|---|---|---|---|
| POST | `/users/students` | **Admission**: account, profile, parents and enrollment in one step (below) | Office |
| GET | `/users/students` | List students | Employees |
| GET | `/users/students/:studentId` | Get a student | Employees |
| PATCH | `/users/students/:studentId` | Update profile | Office |
| GET | `/users/students/:studentId/parents` | Parents of a student | Employees |
| POST | `/users/students/:studentId/parents` | Link an existing parent `{ parentId, relation, isPrimaryContact }` | Office |
| DELETE | `/users/students/:studentId/parents/:parentId` | Unlink a parent | Office |

Admission body (each parent is either an existing `parentId` or a new `user`/`profile`):

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

The student code (`STU26-1-000001`) and roll number (`1A-001`) are generated.

---

## Academics module: `/api/v1/academics`

| Method | Path | Does | Roles |
|---|---|---|---|
| POST | `/academic-years` | Create (set `isCurrent: true` to make it current) | Mgmt |
| GET | `/academic-years` | List | Employees |
| GET | `/academic-years/current` | The current year | Employees |
| GET | `/academic-years/:academicYearId` | Get | Employees |
| PATCH | `/academic-years/:academicYearId` | Update (`isCurrent: true` switches the current year) | Mgmt |
| POST | `/classes`, `/classes/bulk` | Create class(es) | Mgmt |
| GET | `/classes`, `/classes/:classId` | List / get | Employees |
| PATCH | `/classes/:classId` | Update | Mgmt |
| POST | `/subjects`, `/subjects/bulk` | Create subject(s) | Mgmt |
| GET | `/subjects`, `/subjects/:subjectId` | List / get | Employees |
| PATCH | `/subjects/:subjectId` | Update | Mgmt |
| POST | `/sections`, `/sections/bulk` | Create section(s) in the year · *year* | Mgmt |
| GET | `/sections?classId=` | List the year's sections · *year* | Employees |
| GET | `/sections/:sectionId` | Get (with class and class teacher) | Employees |
| PATCH | `/sections/:sectionId` | Update | Mgmt |
| POST | `/section-subjects` | Add a subject to a section `{ sectionId, subjectId }` · *year* | Mgmt |
| GET | `/section-subjects?sectionId=` | Subjects of a section · *year* | Employees |
| DELETE | `/section-subjects/:sectionSubjectId` | Remove | Mgmt |
| POST | `/teacher-assignments` | Assign a teacher `{ teacherId, sectionId, subjectId }` · *year* | Mgmt |
| GET | `/teacher-assignments?sectionId=&teacherId=` | List · *year* | Employees |
| DELETE | `/teacher-assignments/:assignmentId` | Remove | Mgmt |
| POST | `/enrollments` | Enroll an existing student `{ studentId, sectionId, rollNumber? }` · *year* | ADMIN, PRINCIPAL, STAFF |
| GET | `/enrollments?sectionId=` | Section roster, by roll number · *year* | Employees |
| PATCH | `/enrollments/:enrollmentId` | Change section, roll number or status | ADMIN, PRINCIPAL, STAFF |
| POST | `/enrollments/promotions` | Promote `{ studentId, fromAcademicYearId, toAcademicYearId, toSectionId }` | Mgmt |
| POST | `/exams`, `/exams/bulk` | Create exam(s) · *year* | Mgmt |
| GET | `/exams` | List · *year* | ADMIN, PRINCIPAL, STAFF, TEACHER |
| GET | `/exams/:examId` | Get | ADMIN, PRINCIPAL, STAFF, TEACHER |
| PATCH | `/exams/:examId` | Update | Mgmt |
| POST | `/exams/:examId/papers` | Add a paper `{ sectionId, subjectId, maxMarks, passMarks?, examDate? }` | Mgmt |
| GET | `/exams/:examId/papers?sectionId=` | Papers of an exam | ADMIN, PRINCIPAL, STAFF, TEACHER |
| POST | `/marks` | Record or update one student's marks `{ studentId, examPaperId, marksObtained \| isAbsent }` | ADMIN, PRINCIPAL, TEACHER |
| POST | `/marks/bulk` | Record many `{ marks: [...] }` (max 500) | ADMIN, PRINCIPAL, TEACHER |
| GET | `/marks?studentId=&examId=` | A student's marks · *year* | ADMIN, PRINCIPAL, TEACHER |

*year* = uses the current academic year, or `X-Academic-Year-Id`.
