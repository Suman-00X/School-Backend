import { created, done, ok } from "../../../../common/http/responses.js";
import { clientInfo } from "../../shared/utils/request.util.js";
import { sessionService } from "../services/session.service.js";

export const sessionController = {
  /* 201 with a session, or 200 with the schools to choose from (no session yet) */
  login: async (req, res) => {
    const result = await sessionService.login(req.body, clientInfo(req));
    if (result.chooseSchool) return ok(res, result, "Choose a school to continue");
    return created(res, result, `Signed in as ${result.user.firstName} ${result.user.lastName}`);
  },

  refresh: async (req, res) =>
    ok(res, await sessionService.refresh(req.body.refreshToken, clientInfo(req)), "Session refreshed"),

  logout: async (req, res) => {
    await sessionService.logout(req.context);
    return done(res, "Signed out");
  },

  list: async (req, res) => ok(res, await sessionService.list(req.context), "Your signed-in devices"),

  revoke: async (req, res) => {
    await sessionService.revoke(req.context, req.params.sessionId);
    return done(res, "That device has been signed out");
  }
};
