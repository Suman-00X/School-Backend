import { created, ok, paginated } from "../../../../common/http/responses.js";
import { copyService } from "../services/copy.service.js";

/* "ACC-000004" or "ACC-000004 to ACC-000006" */
const range = copies =>
  copies.length === 1 ? copies[0].accessionNumber : `${copies[0].accessionNumber} to ${copies.at(-1).accessionNumber}`;

export const copyController = {
  addCopies: async (req, res) => {
    const { book, copies } = await copyService.addCopies(req.context, req.params.bookId, req.body);
    const noun = copies.length === 1 ? "copy" : "copies";
    return created(res, copies, `${copies.length} ${noun} of ${book.title} added (${range(copies)})`);
  },

  listForBook: async (req, res) =>
    paginated(
      res,
      await copyService.listForBook(req.context, req.params.bookId, req.query),
      "Copies retrieved successfully"
    ),

  list: async (req, res) =>
    paginated(res, await copyService.list(req.context, req.query), "Copies retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await copyService.getById(req.context, req.params.copyId), "Copy retrieved successfully"),

  update: async (req, res) => {
    const copy = await copyService.update(req.context, req.params.copyId, req.body);
    return ok(res, copy, `Copy ${copy.accessionNumber} updated successfully`);
  }
};
