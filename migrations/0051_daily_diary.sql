CREATE TYPE "public"."diary_entry_kind" AS ENUM('CLASSWORK', 'HOMEWORK', 'REMINDER', 'NOTE');--> statement-breakpoint
CREATE TABLE "diary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"kind" "diary_entry_kind" NOT NULL,
	"subject_id" uuid,
	"student_id" uuid,
	"body" text NOT NULL,
	"written_by" uuid NOT NULL,
	CONSTRAINT "diary_entries_subject_chk" CHECK ("diary_entries"."kind" NOT IN ('CLASSWORK', 'HOMEWORK') OR "diary_entries"."subject_id" IS NOT NULL),
	CONSTRAINT "diary_entries_student_chk" CHECK ("diary_entries"."student_id" IS NULL OR "diary_entries"."kind" = 'NOTE')
);
--> statement-breakpoint
CREATE TABLE "diary_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"signed_by" uuid NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"parent_note" text
);
--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_written_by_users_id_fk" FOREIGN KEY ("written_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_signatures" ADD CONSTRAINT "diary_signatures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_signatures" ADD CONSTRAINT "diary_signatures_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_signatures" ADD CONSTRAINT "diary_signatures_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_signatures" ADD CONSTRAINT "diary_signatures_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_signatures" ADD CONSTRAINT "diary_signatures_signed_by_users_id_fk" FOREIGN KEY ("signed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diary_entries_section_idx" ON "diary_entries" USING btree ("tenant_id","section_id","entry_date");--> statement-breakpoint
CREATE INDEX "diary_entries_student_idx" ON "diary_entries" USING btree ("tenant_id","student_id","entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_signatures_active_uq" ON "diary_signatures" USING btree ("student_id","entry_date") WHERE "diary_signatures"."is_active" = true;--> statement-breakpoint
CREATE INDEX "diary_signatures_section_idx" ON "diary_signatures" USING btree ("tenant_id","section_id","entry_date");--> statement-breakpoint
/* Archived years are read-only (0004): their diaries are history */
CREATE TRIGGER diary_entries_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON diary_entries
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();--> statement-breakpoint
CREATE TRIGGER diary_signatures_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON diary_signatures
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
