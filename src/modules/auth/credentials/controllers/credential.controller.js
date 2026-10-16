import { accepted, done, ok } from "../../../../common/http/responses.js";
import { clientInfo } from "../../shared/utils/request.util.js";
import { passwordResetJob } from "../jobs/credential.job.js";
import { credentialService } from "../services/credential.service.js";

export const credentialController = {
  invite: async (req, res) => {
    const result = await credentialService.invite(req.context, req.body.userIds);
    const skipped = result.skipped.length ? `, ${result.skipped.length} skipped` : "";
    return ok(res, result, `${result.invited.length} invitation(s) sent${skipped}`);
  },

  requestReset: async (req, res) => {
    await passwordResetJob.enqueue({ schoolCode: req.body.schoolCode, email: req.body.email });
    return accepted(res, null, "If an account matches, we have emailed a link to reset the password.");
  },

  reset: async (req, res) => {
    const { purpose } = await credentialService.resetPassword(req.body);
    return done(
      res,
      purpose === "INVITE" ? "Password set. You can now sign in." : "Password changed. Please sign in again."
    );
  },

  change: async (req, res) => {
    const signedOut = await credentialService.changePassword(req.context, req.body, clientInfo(req));
    return done(res, `Password changed${signedOut ? `; ${signedOut} other device(s) signed out` : ""}`);
  }
};
