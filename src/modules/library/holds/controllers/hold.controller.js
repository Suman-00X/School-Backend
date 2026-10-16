import { created, ok, paginated } from "../../../../common/http/responses.js";
import { holdService } from "../services/hold.service.js";

const placedMessage = hold =>
  hold.status === "READY"
    ? `${hold.book.title} is held for ${hold.borrower.name}: copy ${hold.copy.accessionNumber}, to collect by ${hold.pickupBy}`
    : `${hold.book.title} reserved for ${hold.borrower.name}, number ${hold.queuePosition} in the queue`;

const cancelledMessage = hold => `Hold on ${hold.book.title} for ${hold.borrower.name} cancelled`;

export const holdController = {
  place: async (req, res) => {
    const hold = await holdService.place(req.context, req.body);
    return created(res, hold, placedMessage(hold));
  },

  list: async (req, res) =>
    paginated(res, await holdService.list(req.context, req.query), "Holds retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await holdService.getById(req.context, req.params.holdId), "Hold retrieved successfully"),

  cancel: async (req, res) => {
    const hold = await holdService.cancel(req.context, req.params.holdId, req.body);
    return ok(res, hold, cancelledMessage(hold));
  },

  myHolds: async (req, res) =>
    paginated(res, await holdService.myHolds(req.context, req.query), "Holds retrieved successfully"),

  placeMine: async (req, res) => {
    const hold = await holdService.placeMine(req.context, req.body);
    return created(res, hold, placedMessage(hold));
  },

  cancelMine: async (req, res) => {
    const hold = await holdService.cancelMine(req.context, req.params.holdId);
    return ok(res, hold, cancelledMessage(hold));
  }
};
