import { z } from "../../../../common/validation/zod.js";
import { id, idParams, optionalText } from "../../../../common/validation/schemas.js";
import { HPC_LEVELS } from "../constants/holisticProgress.constants.js";

const level = () => z.enum(HPC_LEVELS).nullable().optional();
const note = (max = 2000) => optionalText(max).nullable();

const entry = z.object({
  subjectId: id(),
  awareness: level(),
  sensitivity: level(),
  creativity: level(),
  selfAssessment: level(),
  peerAssessment: level(),
  remark: note(500)
});

const studentParams = idParams("examId", "studentId");

export const holisticProgressValidators = {
  section: { params: idParams("examId", "sectionId") },
  student: { params: studentParams },
  save: {
    params: studentParams,
    body: z.object({
      subjects: z
        .array(entry)
        .max(50)
        .default([])
        .refine(items => new Set(items.map(i => i.subjectId)).size === items.length, "lists a subject twice"),
      interests: note(),
      strengths: note(),
      areasToImprove: note(),
      teacherRemark: note(),
      parentFeedback: note()
    })
  }
};
