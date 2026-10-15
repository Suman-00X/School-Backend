CREATE TYPE "public"."homework_submission_status" AS ENUM('SUBMITTED', 'GRADED', 'RETURNED');--> statement-breakpoint
CREATE TABLE "homework_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"teacher_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assigned_on" date NOT NULL,
	"due_date" date NOT NULL,
	"max_marks" numeric(6, 2),
	"allow_late_submission" boolean DEFAULT false NOT NULL,
	CONSTRAINT "homework_dates_chk" CHECK ("homework_assignments"."due_date" >= "homework_assignments"."assigned_on"),
	CONSTRAINT "homework_max_marks_chk" CHECK ("homework_assignments"."max_marks" IS NULL OR "homework_assignments"."max_marks" > 0)
);
--> statement-breakpoint
CREATE TABLE "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"content" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"status" "homework_submission_status" DEFAULT 'SUBMITTED' NOT NULL,
	"marks_awarded" numeric(6, 2),
	"feedback" text,
	"graded_by" uuid,
	"graded_at" timestamp with time zone,
	CONSTRAINT "homework_submissions_marks_chk" CHECK ("homework_submissions"."marks_awarded" IS NULL OR "homework_submissions"."marks_awarded" >= 0)
);
--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_assignments" ADD CONSTRAINT "homework_assignments_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_homework_assignments_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "homework_section_due_idx" ON "homework_assignments" USING btree ("section_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "homework_submissions_active_uq" ON "homework_submissions" USING btree ("homework_id","student_id") WHERE "homework_submissions"."is_active" = true;