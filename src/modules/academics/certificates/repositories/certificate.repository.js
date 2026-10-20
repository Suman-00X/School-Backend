import { desc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { certificates } from "../models/certificate.schema.js";

/* Newest first: the order they were issued in, latest on top */
export const certificateRepository = createRepository({
  table: certificates,
  queryKey: "certificates",
  orderBy: [desc(certificates.issuedAt), desc(certificates.serialNumber)]
});
