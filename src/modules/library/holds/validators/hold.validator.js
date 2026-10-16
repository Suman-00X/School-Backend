import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { HOLD_STATUSES } from "../../shared/constants/library.constants.js";
import { booleanQuery } from "../../shared/utils/schemas.util.js";

const params = idParams("holdId");

const filters = {
  status: z.enum(HOLD_STATUSES).optional(),
  /* WAITING or READY */
  open: booleanQuery(),
  bookId: id().optional()
};

const placement = {
  bookId: id(),
  /* The hold lapses after this date if no copy came back in time */
  notNeededAfter: date().optional()
};

export const holdValidators = {
  place: { body: z.object({ ...placement, borrowerUserId: id() }) },
  list: { query: listQuery({ ...filters, borrowerUserId: id().optional() }) },
  getById: { params },
  cancel: { params, body: z.object({ reason: optionalText(500) }) },
  myHolds: { query: listQuery(filters) },
  /* A parent names the child; everyone else reserves for themselves */
  placeMine: { body: z.object({ ...placement, borrowerUserId: id().optional() }) },
  cancelMine: { params }
};
