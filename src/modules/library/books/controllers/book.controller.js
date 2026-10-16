import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok, paginated } from "../../../../common/http/responses.js";
import { bookService } from "../services/book.service.js";

export const bookController = {
  ...createCrudController(bookService, { singular: "Book", plural: "Books", idParam: "bookId" }),

  catalogue: async (req, res) =>
    paginated(res, await bookService.catalogue(req.context, req.query), "Catalogue retrieved successfully"),

  catalogueEntry: async (req, res) =>
    ok(res, await bookService.catalogueEntry(req.context, req.params.bookId), "Book retrieved successfully")
};
