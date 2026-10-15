import { ok } from "../../../../common/http/responses.js";
import { myHostelService } from "../services/myHostel.service.js";

export const myHostelController = {
  get: async (req, res) => {
    const entries = await myHostelService.get(req.context);
    const housed = entries.filter(entry => entry.allocation).length;
    return ok(res, entries, housed ? "Hostel details retrieved successfully" : "No hostel allocation found");
  }
};
