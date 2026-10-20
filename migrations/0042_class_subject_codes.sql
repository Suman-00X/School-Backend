CREATE TABLE "class_code_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"class_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "class_code_slots_digits_chk" CHECK ("class_code_slots"."stage" BETWEEN 1 AND 9 AND "class_code_slots"."position" BETWEEN 1 AND 9)
);
--> statement-breakpoint
ALTER TABLE "class_subjects" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "class_code_slots" ADD CONSTRAINT "class_code_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_code_slots" ADD CONSTRAINT "class_code_slots_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_code_slots_class_uq" ON "class_code_slots" USING btree ("tenant_id","class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_code_slots_place_uq" ON "class_code_slots" USING btree ("tenant_id","stage","position");--> statement-breakpoint
/* Backfill: every class takes its level's default place (Nursery 1-1, LKG 1-2, UKG 1-3,
   Class 1-3 2-1..2-3, Class 4-7 3-1..3-4, Class 8-10 4-1..4-3, Class 11-12 5-1..5-2);
   a class without a level takes stage 9, by its order */
INSERT INTO "class_code_slots" ("tenant_id", "class_id", "stage", "position")
SELECT c."tenant_id", c."id", d.stage, d.position
FROM "classes" c
JOIN (VALUES
  ('NURSERY', 1, 1), ('LKG', 1, 2), ('UKG', 1, 3),
  ('GRADE_1', 2, 1), ('GRADE_2', 2, 2), ('GRADE_3', 2, 3),
  ('GRADE_4', 3, 1), ('GRADE_5', 3, 2), ('GRADE_6', 3, 3), ('GRADE_7', 3, 4),
  ('GRADE_8', 4, 1), ('GRADE_9', 4, 2), ('GRADE_10', 4, 3),
  ('GRADE_11', 5, 1), ('GRADE_12', 5, 2)
) AS d(level, stage, position) ON d.level = c."level"::text;
--> statement-breakpoint
INSERT INTO "class_code_slots" ("tenant_id", "class_id", "stage", "position")
SELECT "tenant_id", "id", 9, n FROM (
  SELECT c."tenant_id", c."id", row_number() OVER (PARTITION BY c."tenant_id" ORDER BY c."class_order", c."created_at") AS n
  FROM "classes" c WHERE c."level" IS NULL
) unplaced WHERE n <= 9;
--> statement-breakpoint
/* Codes for every class subject (archived years too: the archive guard is paused for it), and
   the section subjects take MA221-A. Exam papers keep the codes they were printed with. */
ALTER TABLE "class_subjects" DISABLE TRIGGER "class_subjects_archive_guard";--> statement-breakpoint
ALTER TABLE "section_subjects" DISABLE TRIGGER "section_subjects_archive_guard";--> statement-breakpoint
UPDATE "class_subjects" cs
SET "code" = sub."subject_code" || COALESCE(slot."stage"::text || slot."position"::text, '00') || CASE WHEN cs."is_optional" THEN '0' ELSE '1' END
FROM "subjects" sub, "classes" c
LEFT JOIN "class_code_slots" slot ON slot."class_id" = c."id"
WHERE sub."id" = cs."subject_id" AND c."id" = cs."class_id";
--> statement-breakpoint
UPDATE "section_subjects" ss
SET "display_code" = cs."code" || '-' || s."section_name"
FROM "sections" s, "class_subjects" cs
WHERE s."id" = ss."section_id" AND cs."is_active" = true AND cs."tenant_id" = ss."tenant_id"
  AND cs."academic_year_id" = ss."academic_year_id" AND cs."class_id" = s."class_id" AND cs."subject_id" = ss."subject_id";
--> statement-breakpoint
ALTER TABLE "class_subjects" ENABLE TRIGGER "class_subjects_archive_guard";--> statement-breakpoint
ALTER TABLE "section_subjects" ENABLE TRIGGER "section_subjects_archive_guard";--> statement-breakpoint
ALTER TABLE "class_subjects" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "class_subjects_code_uq" ON "class_subjects" USING btree ("tenant_id","academic_year_id","code") WHERE "class_subjects"."is_active" = true;