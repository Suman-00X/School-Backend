import { defineJob } from "../../../../common/jobs/queue.js";
import { studentImportService } from "../services/studentImport.service.js";

/* Imports are not retried automatically: rows already admitted would fail as
   duplicates. A failed import can be re-run by uploading the file again. */
export const studentImportJob = defineJob("administration.importStudents", studentImportService.run, { attempts: 1 });
