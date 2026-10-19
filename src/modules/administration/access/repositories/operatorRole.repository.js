import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, eq, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { operatorRoles } from "../models/operatorRole.schema.js";

export const operatorRoleRepository = {
  ...createRepository({
    table: operatorRoles,
    queryKey: "operatorRoles",
    orderBy: [asc(operatorRoles.module), asc(operatorRoles.name)]
  }),

  /* Lock a role for the rest of the transaction: assigning it, editing it and removing it serialize */
  lockForUpdate: async (tenantId, roleId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(operatorRoles)
      .where(and(eq(operatorRoles.tenantId, tenantId), eq(operatorRoles.id, roleId), eq(operatorRoles.isActive, true)))
      .for("update");
    return row ?? null;
  },

  /* Another active role of the module with this name (case-insensitive) */
  findByName: (tenantId, module, name, { dbc } = {}) =>
    operatorRoleRepository.findOne(
      tenantId,
      [eq(operatorRoles.module, module), sql`lower(${operatorRoles.name}) = lower(${name})`],
      { dbc }
    )
};

describeDuplicates({
  operator_roles_tenant_module_name_uq: ({ module, name }) => `A ${module} operator role named ${name} already exists`
});
