ALTER TABLE "class_subjects" ADD COLUMN "is_optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
/* Backfill: subjects already given to sections become subjects of their class, required
   when every section of the class that year has them, optional otherwise */
INSERT INTO "class_subjects" ("tenant_id", "academic_year_id", "class_id", "subject_id", "is_optional", "weekly_no_of_classes")
SELECT ss."tenant_id", ss."academic_year_id", s."class_id", ss."subject_id",
  count(DISTINCT ss."section_id") < (
    SELECT count(*) FROM "sections" s2
    WHERE s2."tenant_id" = ss."tenant_id" AND s2."academic_year_id" = ss."academic_year_id"
      AND s2."class_id" = s."class_id" AND s2."is_active" = true
  ),
  max(ss."weekly_no_of_classes")
FROM "section_subjects" ss
JOIN "sections" s ON s."id" = ss."section_id" AND s."is_active" = true
WHERE ss."is_active" = true
  AND NOT EXISTS (
    SELECT 1 FROM "class_subjects" cs
    WHERE cs."is_active" = true AND cs."tenant_id" = ss."tenant_id" AND cs."academic_year_id" = ss."academic_year_id"
      AND cs."class_id" = s."class_id" AND cs."subject_id" = ss."subject_id"
  )
GROUP BY ss."tenant_id", ss."academic_year_id", s."class_id", ss."subject_id";
--> statement-breakpoint
/* Archived years are read-only (0004) */
CREATE TRIGGER class_subjects_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON class_subjects
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
