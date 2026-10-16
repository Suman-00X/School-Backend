import { asc, desc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { hostelResourceAssignments } from "../models/hostelResourceAssignment.schema.js";

const base = createRepository({
  table: hostelResourceAssignments,
  queryKey: "hostelResourceAssignments",
  orderBy: [desc(hostelResourceAssignments.fromDate), desc(hostelResourceAssignments.createdAt)]
});

export const hostelResourceAssignmentRepository = {
  ...base,

  lockForUpdate: async (tenantId, assignmentId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(hostelResourceAssignments)
      .where(scoped(hostelResourceAssignments, tenantId, eq(hostelResourceAssignments.id, assignmentId)))
      .for("update");
    return row ?? null;
  },

  /* Lock several assignments, in id order */
  lockManyForUpdate: (tenantId, conditions, { dbc }) =>
    dbc
      .select()
      .from(hostelResourceAssignments)
      .where(scoped(hostelResourceAssignments, tenantId, ...conditions))
      .orderBy(asc(hostelResourceAssignments.id))
      .for("update")
};
