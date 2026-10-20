CREATE TYPE "public"."nep_stage" AS ENUM('FOUNDATIONAL', 'PREPARATORY', 'MIDDLE', 'SECONDARY');--> statement-breakpoint
CREATE TABLE "holistic_progress_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subjects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interests" text,
	"strengths" text,
	"areas_to_improve" text,
	"teacher_remark" text,
	"parent_feedback" text,
	"recorded_by" uuid
);
--> statement-breakpoint
CREATE TABLE "nep_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"holistic_progress_card" boolean DEFAULT false NOT NULL,
	"hpc_stages" "nep_stage"[] DEFAULT ARRAY['FOUNDATIONAL', 'PREPARATORY', 'MIDDLE']::nep_stage[] NOT NULL,
	"udise_export" boolean DEFAULT false NOT NULL,
	"apaar_export" boolean DEFAULT false NOT NULL,
	"udise_code" text,
	CONSTRAINT "nep_policies_udise_code_chk" CHECK ("nep_policies"."udise_code" IS NULL OR "nep_policies"."udise_code" ~ '^[0-9]{11}$'),
	CONSTRAINT "nep_policies_udise_needs_code_chk" CHECK (NOT "nep_policies"."udise_export" OR "nep_policies"."udise_code" IS NOT NULL),
	CONSTRAINT "nep_policies_hpc_stages_chk" CHECK (NOT "nep_policies"."holistic_progress_card" OR cardinality("nep_policies"."hpc_stages") > 0)
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "pen" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "apaar_id" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "apaar_consent_on" date;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "mother_tongue" text;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holistic_progress_records" ADD CONSTRAINT "holistic_progress_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nep_policies" ADD CONSTRAINT "nep_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holistic_progress_exam_student_uq" ON "holistic_progress_records" USING btree ("exam_id","student_id") WHERE "holistic_progress_records"."is_active" = true;--> statement-breakpoint
CREATE INDEX "holistic_progress_section_idx" ON "holistic_progress_records" USING btree ("tenant_id","section_id","exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nep_policies_tenant_uq" ON "nep_policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_tenant_pen_uq" ON "students" USING btree ("tenant_id","pen") WHERE "students"."pen" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "students_tenant_apaar_id_uq" ON "students" USING btree ("tenant_id","apaar_id") WHERE "students"."apaar_id" IS NOT NULL;--> statement-breakpoint
/* Archived years are read-only (0004): their cards are history */
CREATE TRIGGER holistic_progress_records_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON holistic_progress_records
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();