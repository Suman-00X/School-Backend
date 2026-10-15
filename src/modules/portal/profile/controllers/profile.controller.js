import { ok } from "../../../../common/http/responses.js";
import { profileService } from "../services/profile.service.js";

export const profileController = {
  me: async (req, res) => ok(res, await profileService.me(req.context), "Profile retrieved successfully")
};
