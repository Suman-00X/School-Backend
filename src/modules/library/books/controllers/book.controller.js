import { createCrudController } from "../../../../common/crud/crudController.js";
import { bookService } from "../services/book.service.js";

export const bookController = createCrudController(bookService, {
  singular: "Book",
  plural: "Books",
  idParam: "bookId"
});
