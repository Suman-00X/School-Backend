# School onboarding portal

Operators (the people who run the service) onboard schools at `/platform` in the web app.
Each school gets its first administrator and the modules it uses. A school sees and uses only
its switched-on modules: the others are missing from its navigation, their pages show "not
found", and their endpoints answer 403 "This module is not switched on for your school".

## Set up

1. Apply the platform migration `0002_school_onboarding` (it adds `platform_operators` and
   `platform_tenants.enabled_modules`):

   ```sh
   npm run db:migrate
   ```

   Run this **before** restarting a server on this code. The server reads the new column
   on every request.

2. Create the first operator. Without `--password`, a password is generated and printed once.
   Run it again for the same email to set a new password.

   ```sh
   npm run platform:operator -- --email ops@example.com --name "Asha Rao"
   ```

3. Sign in at `<web app>/platform/sign-in`.

## What the portal does

| Page | What it does |
| --- | --- |
| Schools | Lists every school with its add-on modules and status. Search by name or code. |
| Onboard a school | Takes the school's details, region, first administrator and module switches. It creates the school's databases and the administrator account. The administrator is emailed a set-password link; the link is also shown so it can be passed on by hand. |
| School detail | Switch modules on or off (changes apply at once), see the administrators, send a new invitation link, suspend or reactivate the school. |

## Modules

- **Always included (core):** Academics, People (users), Administration, My school (portal).
- **Switchable:** Finance, Messages, Reports, Files, Library, Transport, Hostel, HR & payroll,
  Inventory.
- Fee permissions in other modules belong to Finance: the family fee pages (`portal.fees.*`) and
  the fee dashboard and export (`reports.*.fees`).
- `enabled_modules = NULL` means every module. Schools created before this change, and schools
  made with `npm run school:create`, keep every module.
- Switching a module off keeps its records. Switching it on again brings them back.
- Scheduled jobs (late fees, library circulation, reminders) skip schools that have the job's
  module switched off.

## API (`/api/v1/platform`, operator token)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Operator sign-in. Public and rate-limited. Returns an 8-hour token. |
| GET | `/auth/me` | The signed-in operator |
| GET | `/modules` | The module catalogue |
| GET | `/schools?search=&status=` | The list of schools |
| GET | `/schools/code-availability?code=` | Whether a school code is still free |
| POST | `/schools` | Onboard a school. Body: `{ school, admin, modules }`. Returns `{ school, invitation }`. |
| GET | `/schools/:id` | One school, with its profile, administrators and module states |
| PUT | `/schools/:id/modules` | `{ modules: [...] }`: the full list of switched-on add-on modules |
| PATCH | `/schools/:id/status` | `{ status: "ACTIVE" \| "SUSPENDED" }` |
| POST | `/schools/:id/admins/:userId/invitations` | A new set-password link for an administrator who has not set a password yet |

Operator tokens have `typ: "platform"`, and school endpoints accept only `typ: "access"`. A token
of one kind therefore never opens the other side. A disabled operator is refused on their next
request.

## For review

1. **Operators are logged, not audited.** Their actions go to the server log (pino) only. The
   school audit trail lives in each school's own database. If you want a platform audit log, it
   would be a new table in the platform database.
2. **Admin phone is optional.** The school's contact email, phone and address are required. For
   the administrator, the first name, last name and email are required.
3. **Module manager roles.** Accounts with a role such as Librarian can still be created while
   that module is off; they simply see nothing of it. Say if those roles should be hidden from
   the role list as well.
4. **`school:create` CLI.** The CLI still creates schools with every module. A `--modules` option
   can be added if you want one.
5. **Open tabs.** A school user's open tab picks up a module change after a reload, or the next
   time the app re-reads access (on focus, at most every 2 minutes). Their API calls are refused
   immediately, whatever the tab shows.
