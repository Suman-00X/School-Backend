import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { classSubjectService } from "../services/classSubject.service.js";

const sectionsNote = n => (n ? ` and ${n} section${n === 1 ? "" : "s"}` : "");

export const classSubjectController = {
  create: async (req, res) => {
    const row = await classSubjectService.create(req.context, req.body);
    return created(res, row, `${row.subject.subjectName} added to ${row.className}${sectionsNote(row.sectionsAdded)}`);
  },

  list: async (req, res) =>
    paginated(res, await classSubjectService.list(req.context, req.query), "Class subjects retrieved successfully"),

  update: async (req, res) => {
    const row = await classSubjectService.update(req.context, req.params.classSubjectId, req.body);
    const added = row.sectionsAdded ? `; added to ${row.sectionsAdded} more section${row.sectionsAdded === 1 ? "" : "s"}` : "";
    return ok(res, row, `${row.subject.subjectName} in ${row.className} updated${added}`);
  },

  remove: async (req, res) => {
    const row = await classSubjectService.remove(req.context, req.params.classSubjectId);
    return done(res, `${row.subject.subjectName} removed from ${row.class.className}${sectionsNote(row.sectionsRemoved)}`);
  }
};
