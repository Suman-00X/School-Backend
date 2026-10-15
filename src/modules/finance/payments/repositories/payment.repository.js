import { desc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { payments } from "../models/payment.schema.js";

export const paymentRepository = createRepository({
  table: payments,
  queryKey: "payments",
  orderBy: desc(payments.createdAt)
});
