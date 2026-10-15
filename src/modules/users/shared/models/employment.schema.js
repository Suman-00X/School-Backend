import { pgEnum } from "drizzle-orm/pg-core";
import { EMPLOYMENT_TYPES } from "../constants/user.constants.js";

/* Shared by staff_members and teachers */
export const employmentType = pgEnum("employment_type", EMPLOYMENT_TYPES);
