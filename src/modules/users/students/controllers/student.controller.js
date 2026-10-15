import { createCrudController } from "../../../../common/crud/crudController.js";
import { created } from "../../../../common/http/responses.js";
import { studentService } from "../services/student.service.js";

const crud = createCrudController(studentService, { singular: "Student", plural: "Students", idParam: "studentId" });

export const studentController = {
  list: crud.list,
  getById: crud.getById,
  update: crud.update,

  admit: async (req, res) =>
    created(res, await studentService.admit(req.context, req.body), "Student admitted successfully")
};
