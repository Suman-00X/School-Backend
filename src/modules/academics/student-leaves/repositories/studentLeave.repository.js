import { eq, gte, inArray, lte, or } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { HOLDING_STATUSES } from "../constants/studentLeave.constants.js";
import { studentLeaveRequests as leaves } from "../models/studentLeave.schema.js";

const base = createRepository({ table: leaves, queryKey: "studentLeaveRequests" });

export const studentLeaveRepository = {
  ...base,

  /* A pending or approved request of the student sharing a day with [fromDate, toDate].
     Two half days of the same date overlap only when they are the same half. */
  findOverlap: (tenantId, studentId, { fromDate, toDate, session }, { dbc } = {}) =>
    base.findOne(
      tenantId,
      [
        eq(leaves.studentId, studentId),
        inArray(leaves.status, HOLDING_STATUSES),
        lte(leaves.fromDate, toDate),
        gte(leaves.toDate, fromDate),
        session === "FULL_DAY" ? undefined : or(eq(leaves.session, "FULL_DAY"), eq(leaves.session, session))
      ].filter(Boolean),
      { dbc }
    ),

  /* Requests of these students covering `date`, with the given statuses */
  covering: (tenantId, { studentIds, sectionId, date, statuses }) =>
    base.findMany(tenantId, {
      conditions: [
        studentIds && inArray(leaves.studentId, studentIds),
        sectionId && eq(leaves.sectionId, sectionId),
        inArray(leaves.status, statuses),
        lte(leaves.fromDate, date),
        gte(leaves.toDate, date)
      ].filter(Boolean)
    }),

  /* Moves a request on only from the status it was read in: a second decision or a
     cancellation racing it finds nothing to change */
  transition: async (tenantId, id, from, values, { dbc } = {}) =>
    base.update(tenantId, id, values, { dbc, conditions: [eq(leaves.status, from)] })
};
