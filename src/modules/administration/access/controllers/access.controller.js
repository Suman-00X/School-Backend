import { created, ok, paginated } from "../../../../common/http/responses.js";
import { accessLabel, assignmentService, fullName, period } from "../services/assignment.service.js";
import { catalogueService } from "../services/catalogue.service.js";
import { handoverService } from "../services/handover.service.js";
import { operatorRoleService } from "../services/operatorRole.service.js";
import { userAccessService } from "../services/userAccess.service.js";

const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const permissionCount = count => plural(count, "permission");
const moduleCount = count => plural(count, "module");

export const catalogueController = {
  list: async (req, res) => {
    const { total, modules } = catalogueService.list(req.context, req.query);
    const where = modules.length === 1 ? `the ${modules[0].label} module` : moduleCount(modules.length);
    return ok(res, modules, `${permissionCount(total)} in ${where}`);
  }
};

export const operatorRoleController = {
  list: async (req, res) =>
    paginated(res, await operatorRoleService.list(req.context, req.query), "Operator roles retrieved successfully"),

  getById: async (req, res) =>
    ok(
      res,
      await operatorRoleService.getById(req.context, req.params.operatorRoleId),
      "Operator role retrieved successfully"
    ),

  create: async (req, res) => {
    const role = await operatorRoleService.create(req.context, req.body);
    return created(
      res,
      role,
      `Operator role ${role.name} created in ${role.moduleLabel} with ${permissionCount(role.permissions.length)}`
    );
  },

  update: async (req, res) => {
    const role = await operatorRoleService.update(req.context, req.params.operatorRoleId, req.body);
    const holders = role.holders ? `; applies to its ${role.holders} holder(s) at once` : "";
    return ok(res, role, `Operator role ${role.name} updated (${permissionCount(role.permissions.length)})${holders}`);
  },

  remove: async (req, res) => {
    const role = await operatorRoleService.remove(req.context, req.params.operatorRoleId);
    return ok(res, role, `Operator role ${role.name} removed`);
  }
};

export const assignmentController = {
  list: async (req, res) =>
    paginated(res, await assignmentService.list(req.context, req.query), "Assignments retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await assignmentService.getById(req.context, req.params.assignmentId), "Assignment retrieved successfully"),

  /* "Asha Rao now holds Transport desk (Transport) from 2026-10-17 until 2026-12-31" */
  create: async (req, res) => {
    const assignment = await assignmentService.create(req.context, req.body);
    const status = assignment.status === "SCHEDULED" ? " (scheduled)" : "";
    const what =
      assignment.kind === "OWNER" ? `is now an ${accessLabel(assignment)}` : `now holds ${accessLabel(assignment)}`;
    return created(res, assignment, `${fullName(assignment.user)} ${what} ${period(assignment)}${status}`);
  },

  update: async (req, res) => {
    const assignment = await assignmentService.update(req.context, req.params.assignmentId, req.body);
    return ok(res, assignment, `${fullName(assignment.user)}: ${accessLabel(assignment)}, ${period(assignment)}`);
  },

  revoke: async (req, res) => {
    const assignment = await assignmentService.revoke(req.context, req.params.assignmentId);
    const what =
      assignment.kind === "OWNER"
        ? `is no longer an ${accessLabel(assignment)}`
        : `no longer holds ${accessLabel(assignment)}`;
    return ok(res, assignment, `${fullName(assignment.user)} ${what}`);
  }
};

/* "Hostels (warden): Boys Hostel (HST-001)"; just the count beyond 3 */
const listed = (label, names) => `${label}: ${names.length <= 3 ? names.join(", ") : names.length}`;

export const handoverController = {
  /* "Hostel work of Asha Rao handed over to Ravi Kumar: 1 operator assignment (Warden desk);
      Hostels (warden): Boys Hostel (HST-001)" */
  create: async (req, res) => {
    const handover = await handoverService.create(req.context, req.body);
    const operator = handover.assignments.filter(a => a.kind === "OPERATOR").map(a => a.operatorRole.name);
    const parts = [
      handover.assignments.some(a => a.kind === "OWNER") && "ownership of the module",
      operator.length && `${plural(operator.length, "operator assignment")} (${operator.join(", ")})`,
      ...handover.records
        .filter(group => group.count)
        .map(({ label, records }) =>
          listed(
            label,
            records.map(record => record.name)
          )
        )
    ].filter(Boolean);
    /* The audit trail files it under the person who handed over */
    res.locals.entityId = handover.from.id;
    return created(
      res,
      handover,
      `${handover.moduleLabel} work of ${handover.from.name} handed over to ${handover.to.name}: ${parts.join("; ")}`
    );
  }
};

export const userAccessController = {
  forUser: async (req, res) => {
    const access = await userAccessService.forUser(req.context, req.params.userId, req.query);
    return ok(res, access, `${fullName(access.user)} has access to ${moduleCount(access.modules.length)}`);
  },

  mine: async (req, res) => {
    const access = await userAccessService.mine(req.context, req.query);
    return ok(res, access, `You have access to ${moduleCount(access.modules.length)}`);
  }
};
