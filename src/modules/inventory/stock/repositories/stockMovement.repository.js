import { desc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { stockMovements } from "../models/stockMovement.schema.js";

/* Append-only: services use create, list and findById; nothing updates or deletes a movement */
const { create, findById, list } = createRepository({
  table: stockMovements,
  queryKey: "stockMovements",
  orderBy: desc(stockMovements.seq)
});

export const stockMovementRepository = { table: stockMovements, create, findById, list };
