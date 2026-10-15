import { createRepository } from "../../../../common/database/repository.js";
import { users } from "../models/user.schema.js";

export const userRepository = createRepository({
  table: users,
  queryKey: "users",
  hiddenColumns: ["passwordHash"]
});
