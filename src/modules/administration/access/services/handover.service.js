import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { handoversOf } from "../../../../common/handover/handovers.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { maxDate } from "../../../../common/utils/date.util.js";
import { accountService } from "../../../users/accounts/index.js";
import { ACCESS_MODULES } from "../../shared/constants/access.constants.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { accessAssignmentRepository } from "../repositories/accessAssignment.repository.js";
import { accessLabel, assertAssignable, assertNoOverlap, fullName } from "./assignment.service.js";
import { accessGrants } from "./grants.service.js";
import { operatorRoleService } from "./operatorRole.service.js";
import { accessScope } from "./scope.service.js";

const person = user => ({ id: user.id, name: fullName(user), role: user.role });

/* The person taking over must be an active employee (whether they can hold each thing is
   checked when it moves: operator access by assertAssignable, records by their module) */
const assertTakesOver = user => {
  if (!user) throw unprocessable("toUserId does not refer to an active user");
  const name = fullName(user);
  if (user.status !== "ACTIVE") throw unprocessable(`${name}'s account is ${user.status.toLowerCase()}`);
  if (!ROLE_GROUPS.ALL_EMPLOYEES.includes(user.role)) {
    throw unprocessable(`${name} has a ${user.role.toLowerCase()} account; work is handed over to employees only`);
  }
};

export const handoverService = {
  /* Someone else takes over fromUser's work in one module, in one transaction:
     - each live or upcoming OPERATOR assignment of fromUser there is revoked (reason HANDOVER)
       and the same role is assigned to toUser, from today (or its later start) to its end date;
     - with includeOwnership (ADMIN only), their ownership of the module moves the same way;
     - the module's records with fromUser as the responsible person (a hostel's warden) go to
       toUser, through the handlers the module registered (common/handover).
     History is never rewritten: who created, recorded, approved or issued anything stays as it
     was, so the trail still shows who did what. Afterwards fromUser has no access in the module
     through assignments (their own role, if it gives any, is untouched). */
  create: async (ctx, { module, fromUserId, toUserId, note, includeOwnership = false }) => {
    await accessScope.assertManages(ctx, module);
    if (includeOwnership) await accessScope.assertManagesOwners(ctx);
    const { label } = ACCESS_MODULES[module];

    /* The person leaving may already be deactivated */
    const [[from], [to], today] = await Promise.all([
      accountService.findAnyByIds(ctx, [fromUserId]),
      accountService.findManyByIds(ctx, [toUserId]),
      tenantToday(ctx.tenantId)
    ]);
    if (!from) throw unprocessable("fromUserId does not refer to a user of this school");
    assertTakesOver(to);
    const handedOver = note ?? `Handed over from ${fullName(from)}`;

    const moved = await transaction(async tx => {
      const current = await accessAssignmentRepository.lockCurrentInModule(
        ctx.tenantId,
        { userId: fromUserId, module, kinds: includeOwnership ? ["OWNER", "OPERATOR"] : ["OPERATOR"] },
        today,
        { dbc: tx }
      );
      if (current.length) assertAssignable(to, module);

      /* Lock the roles in one order (no deadlock with another handover); the locks also keep
         them from being removed meanwhile */
      const roles = new Map();
      for (const roleId of [...new Set(current.map(row => row.operatorRoleId).filter(Boolean))].sort()) {
        const role = await operatorRoleService.lockForUpdate(ctx, roleId, { dbc: tx });
        if (!role) throw conflict("An operator role of this handover has just been removed; try again");
        roles.set(roleId, role);
      }
      if (current.some(row => row.kind === "OWNER")) await lockKey(tx, "access.owner", ctx.tenantId, module, toUserId);

      const assignments = [];
      for (const row of current) {
        const operatorRole = roles.get(row.operatorRoleId) ?? null;
        const next = {
          kind: row.kind,
          module,
          operatorRoleId: row.operatorRoleId,
          operatorRole,
          userId: toUserId,
          /* A live assignment moves from today; an upcoming one keeps its start */
          validFrom: maxDate(row.validFrom ?? today, today),
          validTo: row.validTo
        };
        await assertNoOverlap(ctx, next, to, { dbc: tx });
        await accessAssignmentRepository.update(
          ctx.tenantId,
          row.id,
          { revokedAt: new Date(), revokedBy: ctx.userId, revokeReason: "HANDOVER" },
          { dbc: tx }
        );
        const created = await accessAssignmentRepository.create(
          ctx.tenantId,
          { ...next, operatorRole: undefined, note: handedOver, assignedBy: ctx.userId },
          { dbc: tx }
        );
        assignments.push({
          kind: row.kind,
          label: accessLabel(next),
          operatorRole: operatorRole && { id: operatorRole.id, name: operatorRole.name },
          endedAssignmentId: row.id,
          assignmentId: created.id,
          validFrom: created.validFrom,
          validTo: created.validTo
        });
      }

      const records = [];
      for (const handler of handoversOf(module)) {
        const rows = await handler.reassign(ctx, { fromUserId, toUser: to }, { dbc: tx });
        records.push({ kind: handler.kind, label: handler.label, count: rows.length, records: rows });
      }

      if (!assignments.length && !records.some(group => group.count)) {
        const access = includeOwnership ? "no ownership or operator access" : "no operator access";
        throw unprocessable(
          `${fullName(from)} has nothing to hand over in the ${label} module: ${access} now or later, and no records in their charge`
        );
      }
      return { assignments, records };
    });
    await accessGrants.invalidate(ctx.tenantId);

    return { module, moduleLabel: label, from: person(from), to: person(to), note: handedOver, ...moved };
  }
};
