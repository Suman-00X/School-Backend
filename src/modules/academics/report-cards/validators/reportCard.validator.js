import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery } from "../../../../common/validation/schemas.js";
import { policySettings } from "../../result-policies/index.js";

const snapshotId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid snapshot id");
const version = () => z.coerce.number().int().positive();

/* A saved policy (policyId) or settings sent inline (policy), not both */
export const previewPolicy = {
  policyId: id().optional(),
  policy: policySettings.optional()
};
export const onePolicy = [
  body => Boolean(body.policyId) !== Boolean(body.policy),
  { path: ["policyId"], message: "send either policyId or policy" }
];

const examParams = idParams("examId");

export const reportCardValidators = {
  section: { params: idParams("sectionId"), query: z.object({ examId: id() }) },
  pdf: { params: idParams("studentId"), query: z.object({ examId: id() }) },
  student: {
    params: idParams("studentId"),
    query: z.object({ examId: id().optional(), academicYearId: id().optional() })
  },
  preview: {
    body: z.object({ examId: id(), sectionId: id().optional(), ...previewPolicy }).refine(...onePolicy)
  },
  snapshots: {
    query: listQuery({
      examId: id().optional(),
      schemeId: id().optional(),
      studentId: id().optional(),
      sectionId: id().optional(),
      version: version().optional()
    })
  },
  snapshot: { params: z.object({ snapshotId: snapshotId() }) },

  /* /exams/:examId/result-publication */
  publication: { params: examParams },
  versions: { params: examParams, query: listQuery() },
  comparison: {
    params: examParams,
    query: z.object({ sectionId: id().optional(), version: version().optional() })
  }
};
