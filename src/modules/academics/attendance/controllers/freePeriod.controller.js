import { created, ok, paginated } from "../../../../common/http/responses.js";
import { freePeriodService } from "../services/freePeriod.service.js";

/* "Period 2 (English) of Class 6-A on 2026-09-03" */
const which = freePeriod => `${freePeriod.label} of ${freePeriod.section.label} on ${freePeriod.date}`;

export const freePeriodController = {
  /* 201 for a new free period, 200 when its reason was changed */
  mark: async (req, res) => {
    const { created: isNew, freePeriod } = await freePeriodService.mark(req.context, req.body);
    const message = `${which(freePeriod)} ${isNew ? "marked free" : "is free: reason updated"}${
      freePeriod.lockOverride ? " (locked date changed by override)" : ""
    }`;
    return isNew ? created(res, freePeriod, message) : ok(res, freePeriod, message);
  },

  list: async (req, res) =>
    paginated(res, await freePeriodService.list(req.context, req.query), "Free periods retrieved successfully"),

  remove: async (req, res) => {
    const freePeriod = await freePeriodService.remove(req.context, req.params.freePeriodId, req.query);
    return ok(res, freePeriod, `${which(freePeriod)} is no longer free: its register can be taken`);
  }
};
