import { eq, getTableColumns } from "drizzle-orm";
import { platformDb } from "../../../../common/tenancy/context.js";
import { systemAdmins } from "../models/systemAdmin.schema.js";

/* System admins live in the platform database (no school context). Reads leave the
   password hash out, except the one sign-in needs. */
const { passwordHash: _hidden, ...visibleColumns } = getTableColumns(systemAdmins);

export const systemAdminRepository = {
  findById: async id => {
    const [row] = await platformDb().select(visibleColumns).from(systemAdmins).where(eq(systemAdmins.id, id)).limit(1);
    return row ?? null;
  },

  findCredentials: async email => {
    const [row] = await platformDb().select().from(systemAdmins).where(eq(systemAdmins.email, email)).limit(1);
    return row ?? null;
  },

  create: async values => {
    const [row] = await platformDb().insert(systemAdmins).values(values).returning(visibleColumns);
    return row;
  },

  update: (id, changes) => platformDb().update(systemAdmins).set(changes).where(eq(systemAdmins.id, id))
};
