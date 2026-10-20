/* End-to-end suite: one API instance on real PostgreSQL + MongoDB (in-memory),
   exercised over HTTP. Suites run in order and share state through `world`. */
import { after, before } from "node:test";
import { startHarness, stopHarness } from "./helpers/harness.js";

before(startHarness, { timeout: 240_000 });
after(stopHarness);

await import("./suites/01-framework.suite.js");
await import("./suites/02-users.suite.js");
await import("./suites/03-academics.suite.js");
await import("./suites/04-exams-marks.suite.js");
await import("./suites/05-core-academics.suite.js");
await import("./suites/06-portal-imports.suite.js");
await import("./suites/07-finance-communication.suite.js");
await import("./suites/08-reports-administration.suite.js");
await import("./suites/09-files-homework.suite.js");
await import("./suites/09b-module-managers.suite.js");
await import("./suites/10-library.suite.js");
await import("./suites/11-transport.suite.js");
await import("./suites/12-hostel.suite.js");
await import("./suites/13-inventory.suite.js");
await import("./suites/14-hr.suite.js");
await import("./suites/15-results.suite.js");
await import("./suites/16-auth.suite.js");
await import("./suites/17-finance-plans.suite.js");
await import("./suites/18-refunds.suite.js");
await import("./suites/19-ledger.suite.js");
await import("./suites/20-tenancy.suite.js");
await import("./suites/21-access.suite.js");
await import("./suites/22-attendance-modes.suite.js");
await import("./suites/23-owners-handover.suite.js");
await import("./suites/24-activity-logs.suite.js");
await import("./suites/25-login-directory.suite.js");
await import("./suites/26-canonical-names.suite.js");
await import("./suites/27-admission-roll-numbers.suite.js");
await import("./suites/28-scheduling.suite.js");
await import("./suites/29-subject-codes.suite.js");
await import("./suites/32-substitutions.suite.js");
await import("./suites/33-nep.suite.js");
await import("./suites/34-behaviour.suite.js");
await import("./suites/35-certificates.suite.js");
await import("./suites/36-student-leaves.suite.js");
await import("./suites/38-diary.suite.js");
await import("./suites/39-low-attendance.suite.js");
/* keep last of the feature suites */
await import("./suites/99-year-end.suite.js");
/* Every endpoint × every kind of user, on the data the suites above created */
await import("./suites/30-api-matrix.suite.js");
