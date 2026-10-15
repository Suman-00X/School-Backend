import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { accountService } from "../../accounts/index.js";
import { USER_SUMMARY_COLUMNS, toUserSummary } from "../constants/user.constants.js";

/* Service for a person profile (staff member, teacher, parent, student) that
   sits on top of a user account:
   - reads include the account summary as `user`
   - createWithAccount creates account + generated code + profile atomically

   nextCode(ctx, profile, { dbc }) returns the profile's generated code. */
export const createProfileService = ({ repository, entity, codeField, nextCode }) => {
  const withUser = { user: { columns: USER_SUMMARY_COLUMNS } };
  const base = createCrudService(repository, { entity, with: withUser });

  return {
    ...base,
    withUser,

    /* Pass { dbc: tx } to run inside the caller's transaction */
    createWithAccount: (ctx, { role, user, profile = {} }, { dbc } = {}) => {
      const run = async tx => {
        const account = await accountService.createAccount(ctx, user, role, { dbc: tx });
        const code = await nextCode(ctx, profile, { dbc: tx });
        const row = await repository.create(
          ctx.tenantId,
          { ...profile, userId: account.id, [codeField]: code },
          { dbc: tx }
        );
        return { ...row, user: toUserSummary(account) };
      };
      return dbc ? run(dbc) : transaction(run);
    }
  };
};
