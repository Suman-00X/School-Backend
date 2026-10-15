import { createRepository } from "../../../../common/database/repository.js";
import { staffMembers } from "../models/staffMember.schema.js";

export const staffMemberRepository = createRepository({ table: staffMembers, queryKey: "staffMembers" });
