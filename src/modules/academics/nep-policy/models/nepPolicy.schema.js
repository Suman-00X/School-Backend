import { sql } from "drizzle-orm";
import { boolean, check, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { NEP_STAGE_KEYS } from "../constants/nep.constants.js";

export const nepStage = pgEnum("nep_stage", NEP_STAGE_KEYS);

/* One per school (created with defaults on first read). What the school opts into under
   NEP 2020: the Holistic Progress Card for some stages, and the UDISE+ / APAAR student
   exports. Everything is off until the school switches it on. */
export const nepPolicies = pgTable(
  "nep_policies",
  {
    ...baseColumns(),
    holisticProgressCard: boolean("holistic_progress_card").notNull().default(false),
    hpcStages: nepStage("hpc_stages")
      .array()
      .notNull()
      .default(sql`ARRAY['FOUNDATIONAL', 'PREPARATORY', 'MIDDLE']::nep_stage[]`),
    udiseExport: boolean("udise_export").notNull().default(false),
    apaarExport: boolean("apaar_export").notNull().default(false),
    /* The school's 11-digit UDISE+ code, printed on exports and the card */
    udiseCode: text("udise_code")
  },
  t => [
    uniqueIndex("nep_policies_tenant_uq").on(t.tenantId),
    check("nep_policies_udise_code_chk", sql`${t.udiseCode} IS NULL OR ${t.udiseCode} ~ '^[0-9]{11}$'`),
    check("nep_policies_udise_needs_code_chk", sql`NOT ${t.udiseExport} OR ${t.udiseCode} IS NOT NULL`),
    check(
      "nep_policies_hpc_stages_chk",
      sql`NOT ${t.holisticProgressCard} OR cardinality(${t.hpcStages}) > 0`
    )
  ]
);
