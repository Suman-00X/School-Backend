import { createCrudController } from "../../../../common/crud/crudController.js";
import { subjectService } from "../services/subject.service.js";

export const subjectController = createCrudController(subjectService, {
  singular: "Subject",
  plural: "Subjects",
  idParam: "subjectId",
  bulkKey: "subjects"
});
