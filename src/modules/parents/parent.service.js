import { db } from "../../database/postgres/client.js";
import * as userQueries from "../users/user.queries.js";
import * as parentQueries from "./parent.queries.js";
import { generateParentId } from "../../common/services/idFormat.service.js";
import { toYearYY } from "../../common/utils/date.util.js";

/* Parent = user (role PARENT) + parent profile with a generated parent code.
   Pass `dbc` to run inside a caller's transaction (e.g. student admission). */
export const createParentWithUser = async (tenantId, { user, profile = {} }, { yearYY, dbc } = {}) => {
  const run = async tx => {
    const createdUser = await userQueries.createUser(tenantId, { ...user, role: "PARENT" }, tx);

    const parentCode = await generateParentId({
      tenantId,
      yearYY: yearYY ?? toYearYY(new Date()),
      dbc: tx
    });

    return parentQueries.createParent(tenantId, { ...profile, userId: createdUser.id, parentCode }, tx);
  };

  return dbc ? run(dbc) : db.transaction(run);
};
