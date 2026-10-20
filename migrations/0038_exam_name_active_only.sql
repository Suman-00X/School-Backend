DROP INDEX "exams_year_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "exams_year_name_uq" ON "exams" USING btree ("academic_year_id",lower("exam_name")) WHERE "exams"."is_active" = true;