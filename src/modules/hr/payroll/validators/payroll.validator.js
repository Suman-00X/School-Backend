import { z } from "../../../../common/validation/zod.js";
import {
  code,
  date,
  id,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody
} from "../../../../common/validation/schemas.js";
import {
  PAYROLL_RUN_STATUSES,
  SALARY_CALCULATIONS,
  SALARY_COMPONENT_KINDS
} from "../../shared/constants/hr.constants.js";
import { month } from "../../shared/utils/validators.util.js";

const amount = () => z.number().min(0).max(100_000_000).multipleOf(0.01);

const upper = (pattern, message) => z.string().trim().toUpperCase().regex(pattern, message);

const componentFields = z.object({
  code: code(),
  name: name(100),
  kind: z.enum(SALARY_COMPONENT_KINDS),
  calculation: z.enum(SALARY_CALCULATIONS),
  /* An amount (FIXED) or a percent of basic (PERCENT_OF_BASIC) */
  defaultValue: amount(),
  description: optionalText()
});

const componentParams = idParams("componentId");

export const salaryComponentValidators = {
  create: {
    body: componentFields
      .extend({ defaultValue: amount().default(0) })
      .refine(c => c.calculation !== "PERCENT_OF_BASIC" || c.defaultValue <= 100, {
        path: ["defaultValue"],
        message: "must be at most 100 for a percent of basic"
      })
  },
  list: { query: listQuery({ kind: z.enum(SALARY_COMPONENT_KINDS).optional() }) },
  getById: { params: componentParams },
  update: { params: componentParams, body: patchBody(componentFields) },
  remove: { params: componentParams }
};

export const employeeSalaryValidators = {
  create: {
    body: z.object({
      userId: id(),
      effectiveFrom: date().refine(value => value.endsWith("-01"), "must be the first day of a month"),
      monthlyBasic: amount(),
      lines: z
        .array(z.object({ componentId: id(), value: amount().optional() }))
        .max(30)
        .refine(list => new Set(list.map(l => l.componentId)).size === list.length, "must not repeat a component")
        .default([]),
      bankAccountNumber: z
        .string()
        .trim()
        .regex(/^[0-9]{6,20}$/, "must be 6-20 digits")
        .optional(),
      bankIfsc: upper(/^[A-Z]{4}0[A-Z0-9]{6}$/, "must be a valid IFSC (e.g. HDFC0001234)").optional(),
      panNumber: upper(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "must be a valid PAN (e.g. ABCDE1234F)").optional(),
      notes: optionalText(500)
    })
  },
  list: { query: listQuery({ userId: id().optional() }) },
  getById: { params: idParams("salaryId") }
};

const runParams = idParams("runId");

export const payrollRunValidators = {
  create: { body: z.object({ month: month(), notes: optionalText(500) }) },
  list: { query: listQuery({ status: z.enum(PAYROLL_RUN_STATUSES).optional() }) },
  getById: { params: runParams },
  payslips: { params: runParams, query: listQuery() }
};

export const payslipValidators = {
  getById: { params: idParams("payslipId") },
  mine: { query: listQuery() }
};
