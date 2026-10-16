/* library/books: the catalogue (titles, authors, ISBN, item type, shelf), with copy counts;
   plus the public catalogue without staff-only fields */
export { default as bookRoutes, catalogueRoutes } from "./routes/book.routes.js";
export { bookService } from "./services/book.service.js";
