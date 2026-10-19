import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, ok } from "../../../../common/http/responses.js";
import { enrollmentService } from "../services/enrollment.service.js";
import { rollNumberPolicyService, rollNumberService } from "../services/rollNumber.service.js";

const RULES = { ALPHABETICAL: "alphabetically", RESULT_RANK: "by last year's result" };

const crud = createCrudController(enrollmentService, {
  singular: "Enrollment",
  plural: "Enrollments",
  idParam: "enrollmentId"
});

export const enrollmentController = {
  list: crud.list,
  update: crud.update,

  create: async (req, res) =>
    created(res, await enrollmentService.create(req.context, req.body), "Student enrolled successfully"),

  promoteSection: async (req, res) => {
    const result = await enrollmentService.promoteSection(req.context, req.body);
    return created(
      res,
      result,
      `Section promoted: ${result.promoted} promoted, ${result.repeated} repeating, ${result.left} left, ${result.skipped.length} skipped`
    );
  },

  getPolicy: async (req, res) =>
    ok(res, await rollNumberPolicyService.get(req.context), "Enrollment policy retrieved successfully"),

  updatePolicy: async (req, res) => {
    const policy = await rollNumberPolicyService.update(req.context, req.body);
    return ok(res, policy, `Roll numbers will be assigned ${RULES[policy.rollNumberOrder]}`);
  },

  /* 200 either way: an action on existing enrollments */
  assignRollNumbers: async (req, res) => {
    const result = await rollNumberService.assign(req.context, req.body);
    const { sections, students, changed } = result.totals;
    const what = `${students} student(s) in ${sections} section(s) ${RULES[result.rule]}`;
    return ok(
      res,
      result,
      result.dryRun
        ? `Preview: ${what}; ${changed} roll number(s) would change. Nothing was saved.`
        : `Roll numbers assigned: ${what}; ${changed} changed`
    );
  },

  promote: async (req, res) =>
    created(res, await enrollmentService.promote(req.context, req.body), "Student promoted successfully")
};
