import { unprocessable } from "../../../../common/http/errors.js";
import { policyView, resultPolicyService } from "../../result-policies/index.js";
import { reportCardService } from "./reportCard.service.js";

const RESULTS = ["PASS", "COMPARTMENT", "FAIL", "INCOMPLETE"];
const FIGURES = ["result", "percentage", "grade", "gpa", "graceTotal", "rank", "classRank"];

const tally = students => Object.fromEntries(RESULTS.map(r => [r, students.filter(s => s.result === r).length]));
const figures = row => Object.fromEntries(FIGURES.map(field => [field, row?.[field] ?? null]));

/* A policy (saved or sent inline) run on an exam's real marks; nothing is stored or published */
export const resultPreviewService = {
  /* The policy to preview: a saved one, or settings sent inline (validated like a new policy) */
  policyFrom: async (ctx, { policyId, policy }) => {
    if (policyId) {
      const config = await resultPolicyService.configById(ctx, policyId);
      if (!config) throw unprocessable("policyId does not refer to an existing result policy");
      return config;
    }
    return resultPolicyService.configFromInput(ctx, policy);
  },

  /* Side by side with the results under the policy in force today */
  compare: (previewSheets, currentSheets, sectionId) => {
    const keep = sheet => !sectionId || sheet.section.id === sectionId;
    const now = new Map(currentSheets.flatMap(sheet => sheet.students.map(row => [row.studentId, row])));
    const previewed = previewSheets.filter(keep);
    const students = previewed.flatMap(sheet => sheet.students);
    const current = currentSheets.filter(keep).flatMap(sheet => sheet.students);
    const changes = previewed.flatMap(sheet =>
      sheet.students
        .map(row => ({ row, before: now.get(row.studentId) }))
        .filter(({ row, before }) => FIGURES.some(field => (before?.[field] ?? null) !== (row[field] ?? null)))
        .map(({ row, before }) => ({
          studentId: row.studentId,
          firstName: row.firstName,
          lastName: row.lastName,
          section: sheet.section.name,
          current: figures(before),
          preview: figures(row)
        }))
    );
    return {
      summary: {
        students: students.length,
        changed: changes.length,
        resultChanged: changes.filter(c => c.current.result !== c.preview.result).length,
        current: tally(current),
        preview: tally(students)
      },
      changes,
      sections: previewed
    };
  },

  exam: async (ctx, { examId, sectionId, policyId, policy }) => {
    const exam = await reportCardService.loadExam(ctx, examId);
    const config = await resultPreviewService.policyFrom(ctx, { policyId, policy });
    const [previewSheets, currentSheets] = await Promise.all([
      reportCardService.forExam(ctx, exam, { override: { policy: config, source: "PREVIEW" } }),
      reportCardService.forExam(ctx, exam)
    ]);
    if (sectionId && !previewSheets.some(sheet => sheet.section.id === sectionId)) {
      throw unprocessable(`The section does not sit ${exam.examName}`);
    }
    return {
      exam: { id: exam.id, examName: exam.examName },
      policy: policyView(config),
      ...resultPreviewService.compare(previewSheets, currentSheets, sectionId)
    };
  }
};
