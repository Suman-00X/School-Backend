CREATE TYPE "public"."paper_component" AS ENUM('THEORY', 'PRACTICAL', 'INTERNAL', 'PROJECT', 'ORAL');--> statement-breakpoint
CREATE TYPE "public"."paper_grading_type" AS ENUM('MARKS', 'GRADE');--> statement-breakpoint
CREATE TYPE "public"."absence_reason" AS ENUM('ABSENT', 'MEDICAL', 'EXEMPT');--> statement-breakpoint
CREATE TYPE "public"."publication_kind" AS ENUM('EXAM', 'SCHEME');--> statement-breakpoint
CREATE TYPE "public"."absence_treatment" AS ENUM('ZERO_FAIL', 'EXCLUDE');--> statement-breakpoint
CREATE TYPE "public"."result_grading_mode" AS ENUM('MARKS', 'GRADES', 'GPA', 'PASS_FAIL');--> statement-breakpoint
CREATE TYPE "public"."rank_scope" AS ENUM('SECTION', 'CLASS', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."ranking_method" AS ENUM('COMPETITION', 'DENSE', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."rounding_mode" AS ENUM('HALF_UP', 'HALF_EVEN', 'UP', 'DOWN');--> statement-breakpoint
CREATE TYPE "public"."subject_category" AS ENUM('SCHOLASTIC', 'CO_SCHOLASTIC');--> statement-breakpoint
CREATE TABLE "assessment_scheme_exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assessment_scheme_exams_weight_chk" CHECK ("assessment_scheme_exams"."weight" > 0 AND "assessment_scheme_exams"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "assessment_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"policy_id" uuid,
	"results_published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "result_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "publication_kind" NOT NULL,
	"exam_id" uuid,
	"scheme_id" uuid,
	"academic_year_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"superseded_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	"report_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer,
	CONSTRAINT "result_publications_source_chk" CHECK (("result_publications"."kind" = 'EXAM' AND "result_publications"."exam_id" IS NOT NULL AND "result_publications"."scheme_id" IS NULL)
        OR ("result_publications"."kind" = 'SCHEME' AND "result_publications"."scheme_id" IS NOT NULL AND "result_publications"."exam_id" IS NULL)),
	CONSTRAINT "result_publications_version_chk" CHECK ("result_publications"."version" > 0),
	CONSTRAINT "result_publications_state_chk" CHECK ("result_publications"."superseded_at" IS NULL OR "result_publications"."withdrawn_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "result_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"grading_mode" "result_grading_mode" DEFAULT 'GRADES' NOT NULL,
	"grade_scale_id" uuid,
	"co_scholastic_scale_id" uuid,
	"gpa_scale" numeric(4, 2),
	"use_paper_pass_marks" boolean DEFAULT true NOT NULL,
	"subject_min_percent" numeric(5, 2),
	"require_passing_grade" boolean DEFAULT true NOT NULL,
	"require_component_pass" boolean DEFAULT true NOT NULL,
	"overall_min_percent" numeric(5, 2),
	"max_compartment_subjects" integer DEFAULT 0 NOT NULL,
	"grace_max_per_subject" numeric(6, 2) DEFAULT 0 NOT NULL,
	"grace_max_total" numeric(6, 2) DEFAULT 0 NOT NULL,
	"grace_counts_in_total" boolean DEFAULT true NOT NULL,
	"best_of_subjects" integer,
	"absent_treatment" "absence_treatment" DEFAULT 'ZERO_FAIL' NOT NULL,
	"medical_treatment" "absence_treatment" DEFAULT 'ZERO_FAIL' NOT NULL,
	"exempt_treatment" "absence_treatment" DEFAULT 'EXCLUDE' NOT NULL,
	"ranking_method" "ranking_method" DEFAULT 'COMPETITION' NOT NULL,
	"rank_scope" "rank_scope" DEFAULT 'SECTION' NOT NULL,
	"rank_failed_students" boolean DEFAULT true NOT NULL,
	"show_rank_to_students" boolean DEFAULT true NOT NULL,
	"percentage_decimals" integer DEFAULT 2 NOT NULL,
	"gpa_decimals" integer DEFAULT 2 NOT NULL,
	"rounding_mode" "rounding_mode" DEFAULT 'HALF_UP' NOT NULL,
	CONSTRAINT "result_policies_gpa_chk" CHECK ("result_policies"."grading_mode" <> 'GPA' OR "result_policies"."gpa_scale" IS NOT NULL),
	CONSTRAINT "result_policies_gpa_scale_chk" CHECK ("result_policies"."gpa_scale" IS NULL OR ("result_policies"."gpa_scale" > 0 AND "result_policies"."gpa_scale" <= 10)),
	CONSTRAINT "result_policies_percent_chk" CHECK (("result_policies"."subject_min_percent" IS NULL OR "result_policies"."subject_min_percent" BETWEEN 0 AND 100)
        AND ("result_policies"."overall_min_percent" IS NULL OR "result_policies"."overall_min_percent" BETWEEN 0 AND 100)),
	CONSTRAINT "result_policies_grace_chk" CHECK ("result_policies"."grace_max_per_subject" >= 0 AND "result_policies"."grace_max_total" >= 0 AND "result_policies"."grace_max_per_subject" <= "result_policies"."grace_max_total"),
	CONSTRAINT "result_policies_compartment_chk" CHECK ("result_policies"."max_compartment_subjects" >= 0),
	CONSTRAINT "result_policies_best_of_chk" CHECK ("result_policies"."best_of_subjects" IS NULL OR "result_policies"."best_of_subjects" > 0),
	CONSTRAINT "result_policies_decimals_chk" CHECK ("result_policies"."percentage_decimals" BETWEEN 0 AND 4 AND "result_policies"."gpa_decimals" BETWEEN 0 AND 4),
	CONSTRAINT "result_policies_pass_fail_rank_chk" CHECK ("result_policies"."grading_mode" <> 'PASS_FAIL' OR "result_policies"."ranking_method" = 'NONE')
);
--> statement-breakpoint
CREATE TABLE "result_policy_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"policy_id" uuid NOT NULL,
	"exam_id" uuid,
	"class_id" uuid,
	CONSTRAINT "result_policy_assignments_target_chk" CHECK ("result_policy_assignments"."exam_id" IS NOT NULL OR "result_policy_assignments"."class_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "result_policy_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"policy_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" "subject_category" DEFAULT 'SCHOLASTIC' NOT NULL,
	"credits" numeric(4, 2) DEFAULT 1 NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"min_percent" numeric(5, 2),
	CONSTRAINT "result_policy_subjects_credits_chk" CHECK ("result_policy_subjects"."credits" > 0),
	CONSTRAINT "result_policy_subjects_min_chk" CHECK ("result_policy_subjects"."min_percent" IS NULL OR "result_policy_subjects"."min_percent" BETWEEN 0 AND 100),
	CONSTRAINT "result_policy_subjects_mandatory_chk" CHECK (NOT ("result_policy_subjects"."is_mandatory" AND "result_policy_subjects"."category" = 'CO_SCHOLASTIC'))
);
--> statement-breakpoint
ALTER TABLE "exam_papers" DROP CONSTRAINT "exam_papers_marks_chk";--> statement-breakpoint
DROP INDEX "exam_papers_exam_section_subject_uq";--> statement-breakpoint
DROP INDEX "exam_papers_exam_section_code_uq";--> statement-breakpoint
ALTER TABLE "exam_papers" ALTER COLUMN "max_marks" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD COLUMN "component" "paper_component";--> statement-breakpoint
ALTER TABLE "exam_papers" ADD COLUMN "grading_type" "paper_grading_type" DEFAULT 'MARKS' NOT NULL;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "grade_is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "absence_reason" "absence_reason";--> statement-breakpoint
ALTER TABLE "assessment_scheme_exams" ADD CONSTRAINT "assessment_scheme_exams_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scheme_exams" ADD CONSTRAINT "assessment_scheme_exams_scheme_id_assessment_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."assessment_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scheme_exams" ADD CONSTRAINT "assessment_scheme_exams_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_schemes" ADD CONSTRAINT "assessment_schemes_policy_id_result_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."result_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_scheme_id_assessment_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."assessment_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publications" ADD CONSTRAINT "result_publications_withdrawn_by_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_co_scholastic_scale_id_grade_scales_id_fk" FOREIGN KEY ("co_scholastic_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_assignments" ADD CONSTRAINT "result_policy_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_assignments" ADD CONSTRAINT "result_policy_assignments_policy_id_result_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."result_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_assignments" ADD CONSTRAINT "result_policy_assignments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_assignments" ADD CONSTRAINT "result_policy_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_subjects" ADD CONSTRAINT "result_policy_subjects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_subjects" ADD CONSTRAINT "result_policy_subjects_policy_id_result_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."result_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_policy_subjects" ADD CONSTRAINT "result_policy_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_scheme_exams_uq" ON "assessment_scheme_exams" USING btree ("scheme_id","exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_schemes_year_name_uq" ON "assessment_schemes" USING btree ("tenant_id","academic_year_id","name") WHERE "assessment_schemes"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_publications_exam_version_uq" ON "result_publications" USING btree ("exam_id","version") WHERE "result_publications"."exam_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "result_publications_scheme_version_uq" ON "result_publications" USING btree ("scheme_id","version") WHERE "result_publications"."scheme_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "result_publications_exam_current_uq" ON "result_publications" USING btree ("exam_id") WHERE "result_publications"."exam_id" IS NOT NULL AND "result_publications"."superseded_at" IS NULL AND "result_publications"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "result_publications_scheme_current_uq" ON "result_publications" USING btree ("scheme_id") WHERE "result_publications"."scheme_id" IS NOT NULL AND "result_publications"."superseded_at" IS NULL AND "result_publications"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE INDEX "result_publications_year_idx" ON "result_publications" USING btree ("tenant_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "result_policies_tenant_name_uq" ON "result_policies" USING btree ("tenant_id","name") WHERE "result_policies"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policies_one_default_uq" ON "result_policies" USING btree ("tenant_id") WHERE "result_policies"."is_default" = true AND "result_policies"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policy_assignments_exam_class_uq" ON "result_policy_assignments" USING btree ("tenant_id","exam_id","class_id") WHERE "result_policy_assignments"."exam_id" IS NOT NULL AND "result_policy_assignments"."class_id" IS NOT NULL AND "result_policy_assignments"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policy_assignments_exam_uq" ON "result_policy_assignments" USING btree ("tenant_id","exam_id") WHERE "result_policy_assignments"."class_id" IS NULL AND "result_policy_assignments"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policy_assignments_class_uq" ON "result_policy_assignments" USING btree ("tenant_id","class_id") WHERE "result_policy_assignments"."exam_id" IS NULL AND "result_policy_assignments"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policy_subjects_uq" ON "result_policy_subjects" USING btree ("policy_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_papers_exam_section_subject_component_uq" ON "exam_papers" USING btree ("exam_id","section_id","subject_id","component") WHERE "exam_papers"."component" IS NOT NULL AND "exam_papers"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_papers_exam_section_subject_uq" ON "exam_papers" USING btree ("exam_id","section_id","subject_id") WHERE "exam_papers"."component" IS NULL AND "exam_papers"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_papers_exam_section_code_uq" ON "exam_papers" USING btree ("exam_id","section_id","display_code") WHERE "exam_papers"."is_active" = true;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_marks_chk" CHECK (("exam_papers"."grading_type" = 'MARKS' AND "exam_papers"."max_marks" > 0 AND ("exam_papers"."pass_marks" IS NULL OR "exam_papers"."pass_marks" BETWEEN 0 AND "exam_papers"."max_marks"))
        OR ("exam_papers"."grading_type" = 'GRADE' AND "exam_papers"."max_marks" IS NULL AND "exam_papers"."pass_marks" IS NULL));--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_absence_reason_chk" CHECK ("marks"."absence_reason" IS NULL OR "marks"."is_absent");--> statement-breakpoint
/* Archived academic years are read-only (0004): result publications and assessment schemes too */
CREATE TRIGGER result_publications_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON result_publications
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
--> statement-breakpoint
CREATE TRIGGER assessment_schemes_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON assessment_schemes
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
--> statement-breakpoint
/* A scheme's exams reach their year through the scheme */
CREATE OR REPLACE FUNCTION guard_archived_assessment_scheme_exams() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM assert_academic_year_writable((SELECT s.academic_year_id FROM assessment_schemes s WHERE s.id = OLD.scheme_id));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM assert_academic_year_writable((SELECT s.academic_year_id FROM assessment_schemes s WHERE s.id = NEW.scheme_id));
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER assessment_scheme_exams_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON assessment_scheme_exams
  FOR EACH ROW EXECUTE FUNCTION guard_archived_assessment_scheme_exams();
