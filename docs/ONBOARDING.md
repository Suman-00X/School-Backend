# Admin console (school onboarding)

System admins own the platform, onboard schools (tenants) and charge them. They use the admin
console at `/adminConsole` in the web app. A visit to `/adminConsole` on the API host
redirects to the web app.

The console opens only with a system admin's session cookie. Without one, it shows the system
admin sign-in. School accounts can never open it, and a system admin's session opens nothing
inside a school.

Each school is onboarded with:

- its details
- the number of students it is charged for
- its first administrator
- the modules it uses

A school sees and uses only its switched-on modules. The others are:

- missing from its navigation
- "not found" if their pages are opened directly
- refused by their endpoints with 403 "This module is not switched on for your school"

## Set up

1. Apply the platform migration `0002_school_onboarding`. It adds:
   - the `platform_admins` table
   - `platform_tenants.enabled_modules`
   - `platform_tenants.student_count`

   ```sh
   npm run db:migrate
   ```

   Run this **before** restarting a server on this code. The server reads the new columns on
   every request.

2. Create the first system admin. Without `--password`, a password is generated and printed
   once. Run it again for the same email to set a new password. This also signs that admin out
   everywhere and re-enables a disabled admin.

   ```sh
   npm run platform:admin -- --email owner@example.com --name "Asha Rao"
   ```

3. Open `<web app>/adminConsole` and sign in.

## Session

- **The cookie.** `system_admin_session` is httpOnly, so page scripts cannot read it. It is
  `SameSite=Strict`, `Secure` in production, sent only to `/api/v1/platform`, and lasts 8 hours.
  The sign-in answer never contains the token.
- **Changes need an extra header.** Every change, sign-in included, must carry
  `X-Requested-With: XMLHttpRequest`. A page on another site cannot add that header, so the
  cookie alone never changes anything.
- **Signing out** ends every session of that admin, including any copied cookie. A new password
  from the CLI does the same.
- **Hosting.** The console works out of the box when the web app and the API share an origin,
  as with the Vite proxy in dev or a reverse proxy in production. If they are on different
  origins, list the web app in `ALLOWED_ORIGINS`: CORS then allows credentials for those
  origins only. The two must still be on the same site (for example `app.example.com` and
  `api.example.com`), because the cookie is `SameSite=Strict`.

## Tenants list

The list covers every school on the platform. It offers:

- **Search** by name or code.
- **Status tabs** with counts: All, Active, Suspended.
- **Module filter:** schools that have a given module switched on. Older schools count as having
  every module.
- **Sort:** newest, oldest, name, or most students.
- **Pages** of 20.

The filters are kept in the URL, so a link or a refresh keeps them.

## Number of students

- **At onboarding:** the number of students is required, as a whole number from 1 to 1,000,000.
  It is stored in the platform registry (`platform_tenants.student_count`), next to the modules,
  so billing never has to open each school's database.
- **On the school's page:** the console shows two figures:
  - "Charged for": the declared number, which can be changed.
  - "On the roll now": the students in the school's own database, counted live.
- **Over the count:** the console warns when the school has more students than it is charged
  for. Nothing is blocked.
- **Older schools:** schools onboarded before this change have no number. They show "—" until
  one is set.

## Modules

- **Always included (core):** Academics, People (users), Administration, My school (portal).
- **Switchable:** Finance, Messages, Reports, Files, Library, Transport, Hostel, HR & payroll,
  Inventory.
- **Fee pages belong to Finance,** wherever they live: the family fee pages (`portal.fees.*`) and
  the fee dashboard and export (`reports.*.fees`).
- **`enabled_modules = NULL` means every module.** Schools created before this change, and
  schools made with `npm run school:create`, keep every module.
- **Switching a module off keeps its records.** Switching it on again brings them back.
- **Scheduled jobs** (late fees, library circulation, reminders) skip schools that have the job's
  module switched off.

## API (`/api/v1/platform`, system admin session cookie)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Sign in. Sets the cookie and returns `{ systemAdmin, expiresAt }`. Public, rate-limited, needs the XHR header. |
| GET | `/auth/me` | The signed-in system admin. 401 when nobody is signed in. |
| POST | `/auth/logout` | Ends every session of the admin and clears the cookie |
| GET | `/modules` | The module catalogue |
| GET | `/schools?search=&status=&module=&sort=&page=&limit=` | The tenants list. `meta` holds `total`, `totalPages` and `statusCounts`. |
| GET | `/schools/code-availability?code=` | Whether a school code is still free |
| POST | `/schools` | Onboard a school. Body: `{ school: { …, studentCount }, admin, modules }`. Returns `{ school, invitation }`. |
| GET | `/schools/:id` | One school, with its profile, administrators, module states, `studentCount` and `enrolledStudents` |
| PATCH | `/schools/:id` | `{ studentCount }` |
| PUT | `/schools/:id/modules` | `{ modules: [...] }`: the full list of switched-on add-on modules |
| PATCH | `/schools/:id/status` | `{ status: "ACTIVE" \| "SUSPENDED" }` |
| POST | `/schools/:id/admins/:userId/invitations` | A new set-password link for an administrator who has not set a password yet |

## For review

1. **No hard limit on students.** Admitting students past the declared number is not blocked;
   the console only warns. Say if admissions should stop at the limit, or if the limit should
   count active students only.
2. **System admins are logged, not audited.** Their actions go to the server log (pino) only. If
   you want a platform audit log, it would be a new table in the platform database.
3. **Admin phone is optional.** The school's contact email, phone and address are required. For
   the administrator, the first name, last name and email are required.
4. **Module manager roles.** Accounts with a role such as Librarian can still be created while
   that module is off; they simply see nothing of it.
5. **`school:create` CLI.** The CLI still creates schools with every module and no student
   number. A `--modules` and `--students` option can be added.
6. **Open tabs.** A school user's open tab picks up a module change after a reload, or the next
   time the app re-reads access (at most every 2 minutes). Their API calls are refused
   immediately, whatever the tab shows.
