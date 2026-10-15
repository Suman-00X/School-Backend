/* Registry of every module's background jobs and schedules.
   Importing a jobs file registers its handlers (defineJob / defineSchedule).
   Add new module job files here. */

import "./modules/administration/imports/jobs/studentImport.job.js";
import "./modules/finance/invoices/jobs/lateFee.job.js";
import "./modules/communication/notifications/jobs/deliver.job.js";
import "./modules/communication/announcements/jobs/publish.job.js";
import "./modules/communication/subscribers/index.js";
import "./modules/library/loans/jobs/overdueReminder.job.js";
