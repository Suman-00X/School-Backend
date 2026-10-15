import { ok } from "../../../../common/http/responses.js";
import { myTransportService } from "../services/myTransport.service.js";

export const myTransportController = {
  forMe: async (req, res) => {
    const entries = await myTransportService.forMe(req.context);
    const riding = entries.filter(entry => entry.transport).length;
    return ok(res, entries, `${riding} of ${entries.length} student(s) use school transport`);
  }
};
