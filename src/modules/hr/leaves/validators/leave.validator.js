import { z } from "../../../../common/validation/zod.js";
import {
  code,
  date,
  id,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody,
  text
} from "../../../../common/validation/schemas.js";
import { LEAVE_DECISIONS, LEAVE_REQUEST_STATUSES } from "../../shared/constants/hr.constants.js";

const typeFields = z.object({
  name: name(100),
  code: code(),
  annualQuotaDays: z.number().min(0).max(366).multipleOf(0.5),
  isPaid: z.boolean(),
  requiresApproval: z.boolean(),
  description: optionalText()
});

const year = () => z.coerce.number().int().min(2000).max(2100);

const typeParams = idParams("leaveTypeId");
const requestParams = idParams("requestId");

const requestFilters = {
  status: z.enum(LEAVE_REQUEST_STATUSES).optional(),
  leaveTypeId: id().optional(),
  from: date().optional(),
  to: date().optional()
};

export const leaveTypeValidators = {
  create: {
    body: typeFields.extend({ isPaid: z.boolean().default(true), requiresApproval: z.boolean().default(true) })
  },
  list: { query: listQuery() },
  getById: { params: typeParams },
  update: { params: typeParams, body: patchBody(typeFields) },
  remove: { params: typeParams }
};

export const leaveRequestValidators = {
  apply: {
    body: z
      .object({
        leaveTypeId: id(),
        fromDate: date(),
        toDate: date(),
        halfDay: z.boolean().default(false),
        reason: text(500)
      })
      .refine(r => r.toDate >= r.fromDate, { path: ["toDate"], message: "must be on or after fromDate" })
      .refine(r => !r.halfDay || r.fromDate === r.toDate, {
        path: ["halfDay"],
        message: "is only allowed when fromDate and toDate are the same day"
      })
      .refine(r => r.fromDate.slice(0, 4) === r.toDate.slice(0, 4), {
        path: ["toDate"],
        message: "must be in the same calendar year as fromDate (apply separately for each year)"
      })
  },
  decide: {
    params: requestParams,
    body: z
      .object({ decision: z.enum(LEAVE_DECISIONS), note: optionalText(500) })
      .refine(d => d.decision !== "REJECTED" || d.note, { path: ["note"], message: "is required when rejecting" })
  },
  cancel: { params: requestParams, body: z.object({ reason: optionalText(500) }) },
  list: { query: listQuery({ ...requestFilters, userId: id().optional() }) },
  mine: { query: listQuery(requestFilters) },
  getById: { params: requestParams }
};

export const leaveBalanceValidators = {
  list: { query: z.object({ userId: id(), year: year().optional() }) },
  mine: { query: z.object({ year: year().optional() }) }
};
