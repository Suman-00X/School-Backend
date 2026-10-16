import { defineJob } from "../../../../common/jobs/queue.js";
import { subscribe } from "../../../../common/events/events.js";
import { USER_EMAIL_CHANGED } from "../../../users/accounts/index.js";
import { credentialService } from "../services/credential.service.js";

export const passwordResetJob = defineJob("auth.sendPasswordReset", credentialService.sendResetLink, { attempts: 3 });

subscribe(USER_EMAIL_CHANGED, "auth.emailChanged", credentialService.emailChanged);
