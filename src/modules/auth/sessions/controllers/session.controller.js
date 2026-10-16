import { created, done, ok } from "../../../../common/http/responses.js";
import { clientInfo } from "../../shared/utils/request.util.js";
import { sessionService } from "../services/session.service.js";

export const sessionController = {
  login: async (req, res) => {
    const session = await sessionService.login(req.body, clientInfo(req));
    return created(res, session, `Signed in as ${session.user.firstName} ${session.user.lastName}`);
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
