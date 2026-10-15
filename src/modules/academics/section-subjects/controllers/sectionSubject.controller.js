import { createCrudController } from "../../../../common/crud/crudController.js";
import { sectionSubjectService } from "../services/sectionSubject.service.js";

const crud = createCrudController(sectionSubjectService, {
  singular: "Section subject",
  plural: "Section subjects",
  idParam: "sectionSubjectId"
});

export const sectionSubjectController = {
  create: crud.create,
  list: crud.list,
  remove: crud.remove
};
