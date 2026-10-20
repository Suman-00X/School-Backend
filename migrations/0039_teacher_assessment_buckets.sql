CREATE TYPE "public"."assessment_mark_status" AS ENUM('MARKED', 'ABSENT', 'EXEMPT', 'MEDICAL');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('TEST', 'ASSIGNMENT', 'PROJECT', 'HOMEWORK', 'OTHER');--> statement-breakpoint
CREATE TABLE "assessment_scheme_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weight" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "assessment_scheme_buckets_weight_chk" CHECK ("assessment_scheme_buckets"."weight" > 0 AND "assessment_scheme_buckets"."weight" <= 100)
);
--> statement-breakpoint
CREATE TABLE "assessment_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "assessment_mark_status" DEFAULT 'MARKED' NOT NULL,
	"marks_obtained" numeric(6, 2),
	"remarks" text,
	"recorded_by" uuid NOT NULL,
	CONSTRAINT "assessment_marks_marks_chk" CHECK ("assessment_marks"."marks_obtained" IS NULL OR "assessment_marks"."marks_obtained" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"bucket_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"assessment_type" "assessment_type" NOT NULL,
	"title" text NOT NULL,
	"assessed_on" date,
	"max_marks" numeric(6, 2) NOT NULL,
	"counts" boolean DEFAULT true NOT NULL,
	"homework_id" uuid,
	"description" text,
	"created_by" uuid NOT NULL,
	CONSTRAINT "assessments_max_marks_chk" CHECK ("assessments"."max_marks" > 0)
);
--> statement-breakpoint
ALTER TABLE "assessment_scheme_buckets" ADD CONSTRAINT "assessment_scheme_buckets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scheme_buckets" ADD CONSTRAINT "assessment_scheme_buckets_scheme_id_assessment_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."assessment_schemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_marks" ADD CONSTRAINT "assessment_marks_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_bucket_id_assessment_scheme_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."assessment_scheme_buckets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_homework_id_homework_assignments_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_scheme_buckets_name_uq" ON "assessment_scheme_buckets" USING btree ("scheme_id",lower("name")) WHERE "assessment_scheme_buckets"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_marks_item_student_uq" ON "assessment_marks" USING btree ("assessment_id","student_id");--> statement-breakpoint
CREATE INDEX "assessments_bucket_section_subject_idx" ON "assessments" USING btree ("bucket_id","section_id","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_homework_uq" ON "assessments" USING btree ("homework_id") WHERE "assessments"."homework_id" IS NOT NULL AND "assessments"."is_active" = true;