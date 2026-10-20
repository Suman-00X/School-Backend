import { eq, getTableColumns } from "drizzle-orm";
import { platformDb } from "../../../../common/tenancy/context.js";
import { platformOperators } from "../models/platformOperator.schema.js";

/* Operators live in the platform database (no school context). Reads leave the password
   hash out, except the one sign-in needs. */
const { passwordHash: _hidden, ...visibleColumns } = getTableColumns(platformOperators);

export const operatorRepository = {
  findById: async id => {
    const [row] = await platformDb()
      .select(visibleColumns)
      .from(platformOperators)
      .where(eq(platformOperators.id, id))
      .limit(1);
    return row ?? null;
  },

  findCredentials: async email => {
    const [row] = await platformDb()
      .select()
      .from(platformOperators)
      .where(eq(platformOperators.email, email))
      .limit(1);
    return row ?? null;
  },

  create: async values => {
    const [row] = await platformDb().insert(platformOperators).values(values).returning(visibleColumns);
    return row;
  },

  update: (id, changes) => platformDb().update(platformOperators).set(changes).where(eq(platformOperators.id, id))
};
