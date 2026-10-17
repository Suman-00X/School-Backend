import { relations, sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { ASSIGNMENT_KINDS, REVOKE_REASONS } from "../../shared/constants/access.constants.js";
import { accessModule, operatorRoles } from "./operatorRole.schema.js";

export const accessAssignmentKind = pgEnum("access_assignment_kind", ASSIGNMENT_KINDS);
export const accessRevokeReason = pgEnum("access_revoke_reason", REVOKE_REASONS);

/* A user's extra access in one add-on module, for [valid_from, valid_to] (null = open):
   OPERATOR holds an operator role; OWNER acts as the module's administrator.
   Revoked rows stay as history (revoked_at; revoke_reason: by hand, or ended by a handover).
   Two not-revoked assignments of the same role to one user never share a day: the service
   checks under the role's row lock, and the database refuses it too (hand-written exclusion
   constraint access_assignments_operator_no_overlap, btree_gist). Ownerships of a module are checked under an advisory lock per (module, user). */
export const accessAssignments = pgTable(
  "access_assignments",
  {
    ...baseColumns(),
    kind: accessAssignmentKind("kind").notNull(),
    /* The operator role's module (copied), or the module owned */
    module: accessModule("module").notNull(),
    operatorRoleId: uuid("operator_role_id").references(() => operatorRoles.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    note: text("note"),
    assignedBy: uuid("assigned_by").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    /* Null on rows revoked before reasons were recorded */
    revokeReason: accessRevokeReason("revoke_reason")
  },
  t => [
    index("access_assignments_tenant_user_idx").on(t.tenantId, t.userId),
    index("access_assignments_operator_role_idx").on(t.operatorRoleId),
    index("access_assignments_tenant_module_idx").on(t.tenantId, t.module, t.kind),
    check("access_assignments_kind_chk", sql`(${t.kind} = 'OPERATOR') = (${t.operatorRoleId} IS NOT NULL)`),
    check(
      "access_assignments_dates_chk",
      sql`${t.validFrom} IS NULL OR ${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`
    ),
    check("access_assignments_revoked_chk", sql`${t.revokedBy} IS NULL OR ${t.revokedAt} IS NOT NULL`),
    check("access_assignments_revoke_reason_chk", sql`${t.revokeReason} IS NULL OR ${t.revokedAt} IS NOT NULL`)
  ]
);

export const accessAssignmentsRelations = relations(accessAssignments, ({ one }) => ({
  operatorRole: one(operatorRoles, { fields: [accessAssignments.operatorRoleId], references: [operatorRoles.id] }),
  user: one(users, { fields: [accessAssignments.userId], references: [users.id] }),
  assigner: one(users, { fields: [accessAssignments.assignedBy], references: [users.id] }),
  revoker: one(users, { fields: [accessAssignments.revokedBy], references: [users.id] })
}));

export const operatorRolesRelations = relations(operatorRoles, ({ many }) => ({
  assignments: many(accessAssignments)
}));
