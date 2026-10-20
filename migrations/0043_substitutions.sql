CREATE TYPE "public"."substitution_kind" AS ENUM('SUBSTITUTE', 'ACTIVITY', 'LEISURE', 'NOT_NEEDED');--> statement-breakpoint
CREATE TABLE "substitutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"date" date NOT NULL,
	"timetable_slot_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"absent_teacher_id" uuid NOT NULL,
	"kind" "substitution_kind" NOT NULL,
	"substitute_teacher_id" uuid,
	"subject_id" uuid,
	"activity" text,
	"note" text,
	"assigned_by" uuid NOT NULL,
	CONSTRAINT "substitutions_kind_chk" CHECK (CASE "substitutions"."kind"
        WHEN 'SUBSTITUTE' THEN "substitutions"."substitute_teacher_id" IS NOT NULL AND "substitutions"."activity" IS NULL
        WHEN 'ACTIVITY' THEN "substitutions"."activity" IS NOT NULL AND "substitutions"."subject_id" IS NULL
        ELSE "substitutions"."substitute_teacher_id" IS NULL AND "substitutions"."subject_id" IS NULL AND "substitutions"."activity" IS NULL
      END),
	CONSTRAINT "substitutions_not_self_chk" CHECK ("substitutions"."substitute_teacher_id" IS NULL OR "substitutions"."substitute_teacher_id" <> "substitutions"."absent_teacher_id")
);
--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_timetable_slot_id_timetable_slots_id_fk" FOREIGN KEY ("timetable_slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_absent_teacher_id_teachers_id_fk" FOREIGN KEY ("absent_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_substitute_teacher_id_teachers_id_fk" FOREIGN KEY ("substitute_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitutions" ADD CONSTRAINT "substitutions_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "substitutions_slot_date_uq" ON "substitutions" USING btree ("timetable_slot_id","date") WHERE "substitutions"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "substitutions_teacher_date_period_uq" ON "substitutions" USING btree ("substitute_teacher_id","date","period_id") WHERE "substitutions"."is_active" = true AND "substitutions"."substitute_teacher_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "substitutions_date_idx" ON "substitutions" USING btree ("tenant_id","date");--> statement-breakpoint
/* Archived years are read-only (0004): their plans are history */
CREATE TRIGGER substitutions_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON substitutions
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
