import { z } from "../../../../common/validation/zod.js";
import { patchBody } from "../../../../common/validation/schemas.js";
import { amount } from "../../shared/utils/schemas.util.js";

const days = (max = 365) => z.number().int().min(1).max(max);
const limit = (max = 100) => z.number().int().min(0).max(max);

const fields = z.object({
  studentLoanDays: days(),
  staffLoanDays: days(),
  maxActiveLoansStudent: limit(),
  maxActiveLoansStaff: limit(),
  maxRenewals: limit(20),
  finePerDay: amount({ max: 10_000 }),
  fineGraceDays: limit(90)
});

export const libraryPolicyValidators = {
  update: { body: patchBody(fields) }
};
