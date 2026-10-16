import { desc, eq, lte } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { employeeDirectory } from "../../shared/services/employeeDirectory.service.js";
import { maskSensitive, sealSensitive } from "../../shared/utils/mask.util.js";
import { employeeSalaries } from "../models/payroll.schema.js";
import { employeeSalaryRepository } from "../repositories/payroll.repository.js";
import { salaryComponentService } from "./salaryComponent.service.js";

const COMPONENT_COLUMNS = { id: true, code: true, name: true, kind: true, calculation: true };

const withDetails = {
  lines: { with: { component: { columns: COMPONENT_COLUMNS } } },
  user: { columns: { id: true, firstName: true, lastName: true, role: true } }
};

/* Bank account and PAN never leave the API unmasked */
const masked = salary =>
  salary && {
    ...salary,
    bankAccountNumber: maskSensitive(salary.bankAccountNumber),
    panNumber: maskSensitive(salary.panNumber)
  };

/* Fill each line's value from the component default, and check percents */
const resolveLines = async (ctx, lines) => {
  const components = await salaryComponentService.findManyByIds(
    ctx,
    lines.map(line => line.componentId)
  );
  const byId = new Map(components.map(component => [component.id, component]));
  return lines.map(line => {
    const component = byId.get(line.componentId);
    if (!component)
      throw unprocessable(`componentId ${line.componentId} does not refer to an existing salary component`);
    const value = line.value ?? component.defaultValue;
    if (component.calculation === "PERCENT_OF_BASIC" && value > 100) {
      throw unprocessable(`${component.name} is a percent of basic; its value must be between 0 and 100`);
    }
    return { componentId: component.id, value };
  });
};

export const employeeSalaryService = {
  /* A new revision. Bank details not sent are carried over from the latest revision. */
  create: async (ctx, { userId, effectiveFrom, lines, ...details }) => {
    if (!(await employeeDirectory.find(ctx, userId))) throw unprocessable("userId is not an active employee");
    const resolved = await resolveLines(ctx, lines);
    const duplicate = await employeeSalaryRepository.exists(ctx.tenantId, [
      eq(employeeSalaries.userId, userId),
      eq(employeeSalaries.effectiveFrom, effectiveFrom)
    ]);
    if (duplicate) throw conflict(`This employee already has a salary revision effective ${effectiveFrom}`);

    const [previous] = await employeeSalaryRepository.findMany(ctx.tenantId, {
      conditions: [eq(employeeSalaries.userId, userId)],
      orderBy: desc(employeeSalaries.effectiveFrom)
    });
    const carried = ["bankAccountNumber", "bankIfsc", "panNumber"].map(key => [key, details[key] ?? previous?.[key]]);
    const sealed = Object.fromEntries(carried);
    sealed.bankAccountNumber = sealSensitive(sealed.bankAccountNumber);
    sealed.panNumber = sealSensitive(sealed.panNumber);

    const salaryId = await transaction(async tx => {
      const salary = await employeeSalaryRepository.create(
        ctx.tenantId,
        { ...details, ...sealed, userId, effectiveFrom, createdBy: ctx.userId },
        { dbc: tx }
      );
      await employeeSalaryRepository.insertLines(ctx.tenantId, salary.id, resolved, { dbc: tx });
      return salary.id;
    });
    return employeeSalaryService.getById(ctx, salaryId);
  },

  list: async (ctx, { page, limit, userId }) => {
    const result = await employeeSalaryRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [userId && eq(employeeSalaries.userId, userId)].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(masked) };
  },

  getById: async (ctx, salaryId) => {
    const salary = await employeeSalaryRepository.findById(ctx.tenantId, salaryId, { with: withDetails });
    if (!salary) throw notFound("Salary revision");
    return masked(salary);
  },

  /* For payroll (unmasked): each employee's latest revision effective on `date` -> Map userId -> revision */
  effectiveOn: async (ctx, date, { dbc } = {}) => {
    const revisions = await employeeSalaryRepository.findMany(ctx.tenantId, {
      conditions: [lte(employeeSalaries.effectiveFrom, date)],
      orderBy: [desc(employeeSalaries.effectiveFrom), desc(employeeSalaries.createdAt)],
      with: { lines: { with: { component: { columns: COMPONENT_COLUMNS } } } },
      dbc
    });
    const latest = new Map();
    for (const revision of revisions) if (!latest.has(revision.userId)) latest.set(revision.userId, revision);
    return latest;
  }
};
