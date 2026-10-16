import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, patchBody } from "../../../../common/validation/schemas.js";
import { BORROWER_ROLES, LOANABLE_ITEM_TYPES } from "../../shared/constants/library.constants.js";
import { amount } from "../../shared/utils/schemas.util.js";

const count = (max = 100) => z.number().int().min(0).max(max);

const scope = {
  /* null: any borrower */
  borrowerRole: z.enum(BORROWER_ROLES).nullable().default(null),
  /* Students of one class (borrowerRole STUDENT) */
  classId: id().nullable().default(null),
  /* null: any item type. Reference items are never lent, so they have no rule. */
  itemType: z.enum(LOANABLE_ITEM_TYPES).nullable().default(null)
};

const terms = {
  loanDays: z.number().int().min(1).max(365),
  maxLoans: count(),
  maxRenewals: count(20),
  finePerDay: amount({ max: 10_000 }),
  fineGraceDays: count(90).default(0),
  maxFine: amount({ max: 100_000 }).nullable().default(null)
};

const params = idParams("ruleId");

/* Defaults dropped for PATCH, so a partial update never resets a field */
const patchFields = z.object({
  borrowerRole: scope.borrowerRole.unwrap(),
  classId: scope.classId.unwrap(),
  itemType: scope.itemType.unwrap(),
  loanDays: terms.loanDays,
  maxLoans: terms.maxLoans,
  maxRenewals: terms.maxRenewals,
  finePerDay: terms.finePerDay,
  fineGraceDays: terms.fineGraceDays.unwrap(),
  maxFine: terms.maxFine.unwrap()
});

export const circulationRuleValidators = {
  create: { body: z.object({ ...scope, ...terms }) },
  list: {
    query: listQuery({
      borrowerRole: z.enum(BORROWER_ROLES).optional(),
      classId: id().optional(),
      itemType: z.enum(LOANABLE_ITEM_TYPES).optional()
    })
  },
  getById: { params },
  update: { params, body: patchBody(patchFields) },
  remove: { params }
};
