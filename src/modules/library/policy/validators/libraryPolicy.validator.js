import { z } from "../../../../common/validation/zod.js";
import { patchBody } from "../../../../common/validation/schemas.js";
import { FINE_DAY_BASES } from "../../shared/constants/library.constants.js";
import { amount } from "../../shared/utils/schemas.util.js";

const days = (min, max) => z.number().int().min(min).max(max);

const fields = z.object({
  /* null: fines never block borrowing */
  fineBlockThreshold: amount({ max: 100_000 }).nullable(),
  blockOnOverdue: z.boolean(),
  fineDayBasis: z.enum(FINE_DAY_BASES),
  capFineAtPrice: z.boolean(),
  lostProcessingFee: amount({ max: 100_000 }),
  lostMinimumCharge: amount({ max: 100_000 }),
  lostIncludesLateFine: z.boolean(),
  lostFoundRefundDays: days(0, 365),
  holdPickupDays: days(1, 30),
  maxHoldsPerBorrower: days(0, 50),
  dueSoonDays: days(0, 30),
  overdueReminderEveryDays: days(1, 90),
  notifyParents: z.boolean()
});

export const libraryPolicyValidators = {
  update: { body: patchBody(fields) }
};
