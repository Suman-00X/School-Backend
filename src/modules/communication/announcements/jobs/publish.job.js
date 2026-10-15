import { defineJob } from "../../../../common/jobs/queue.js";
import { FANOUT_JOB, announcementService } from "../services/announcement.service.js";

/* Fan an announcement out to its audience (at publishAt) */
export const publishAnnouncementJob = defineJob(FANOUT_JOB, announcementService.fanOut, { attempts: 3 });
