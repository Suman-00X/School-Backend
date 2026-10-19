import { defineJob } from "../../../../common/jobs/queue.js";
import { subscribe } from "../../../../common/events/events.js";
import { USER_EMAIL_CHANGED } from "../../../users/accounts/index.js";
import { credentialService } from "../services/credential.service.js";

/* A request without a school code becomes one job per school with an account for the
   email, so a retry in one school never re-sends (and so voids) another school's link */
export const passwordResetJob = defineJob(
  "auth.sendPasswordReset",
  async data => {
    if (data.tenantId || data.schoolCode) return credentialService.sendResetLink(data);
    for (const school of await credentialService.resetSchools(data.email)) {
      await passwordResetJob.enqueue({ tenantId: school.id, email: data.email });
    }
  },
  { attempts: 3 }
);

subscribe(USER_EMAIL_CHANGED, "auth.emailChanged", credentialService.emailChanged);
