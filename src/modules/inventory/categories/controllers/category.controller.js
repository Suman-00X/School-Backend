import { createCrudController } from "../../../../common/crud/crudController.js";
import { categoryService } from "../services/category.service.js";

export const categoryController = createCrudController(categoryService, {
  singular: "Category",
  plural: "Categories",
  idParam: "categoryId"
});
