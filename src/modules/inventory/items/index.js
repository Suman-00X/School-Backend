/* inventory/items: stock-keeping units with their balance and average cost */
export { default as itemRoutes } from "./routes/item.routes.js";
export { itemService, isLowStock } from "./services/item.service.js";
