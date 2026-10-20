import { ok } from "../../../../common/http/responses.js";
import { subjectCodeService } from "../services/subjectCode.service.js";

export const subjectCodeController = {
  getSlots: async (req, res) => ok(res, await subjectCodeService.getSlots(req.context), "Subject code places retrieved successfully"),

  saveSlots: async (req, res) => {
    const { slots, recoded } = await subjectCodeService.saveSlots(req.context, req.body.slots);
    const note = recoded ? `; ${recoded} subject code${recoded === 1 ? "" : "s"} renewed` : "";
    return ok(res, slots, `Subject code places saved${note}`);
  }
};
