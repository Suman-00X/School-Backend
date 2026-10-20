import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { admitCards } from "../models/admitCard.schema.js";

export const admitCardRepository = createRepository({
  table: admitCards,
  queryKey: "admitCards",
  orderBy: [asc(admitCards.issuedAt)]
});
