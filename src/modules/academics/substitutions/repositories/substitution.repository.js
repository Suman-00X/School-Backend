import { asc, between, eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { substitutions } from "../models/substitution.schema.js";

const base = createRepository({
  table: substitutions,
  queryKey: "substitutions",
  orderBy: [asc(substitutions.date), asc(substitutions.createdAt)]
});

export const substitutionRepository = {
  ...base,

  /* The plan in force for one lesson on one date, or null */
  findAt: (tenantId, { timetableSlotId, date }, { dbc, with: relations } = {}) =>
    base.findOne(tenantId, [eq(substitutions.timetableSlotId, timetableSlotId), eq(substitutions.date, date)], {
      dbc,
      with: relations
    }),

  /* Every plan in force in [from, to] */
  findInRange: (tenantId, { from, to, conditions = [] }, { dbc, with: relations } = {}) =>
    base.findMany(tenantId, {
      conditions: [between(substitutions.date, from, to), ...conditions],
      with: relations,
      dbc
    })
};
