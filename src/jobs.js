/* Registry of every module's background jobs and schedules.
   Importing a jobs file registers its handlers (defineJob / defineSchedule).
   Add new module job files here. */

import "./modules/administration/imports/jobs/studentImport.job.js";
import "./modules/finance/invoices/jobs/lateFee.job.js";
import "./modules/communication/notifications/jobs/deliver.job.js";
import "./modules/communication/announcements/jobs/publish.job.js";
import "./modules/communication/subscribers/index.js";
import "./modules/library/shared/jobs/notice.job.js";
import "./modules/library/loans/jobs/dailyCirculation.job.js";
import "./modules/library/holds/jobs/holdExpiry.job.js";
import "./modules/library/holds/jobs/studentLeft.job.js";
import "./modules/auth/credentials/jobs/credential.job.js";
import "./modules/transport/assignments/jobs/studentLeft.job.js";
import "./modules/hostel/allocations/jobs/studentLeft.job.js";
