CREATE TYPE "public"."behaviour_remark_kind" AS ENUM('APPRECIATION', 'NOTE', 'CONCERN', 'INCIDENT');--> statement-breakpoint
CREATE TABLE "behaviour_remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" "behaviour_remark_kind" NOT NULL,
	"category" text NOT NULL,
	"remark" text NOT NULL,
	"action_taken" text,
	"recorded_by" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid
);
--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "behaviour_remarks" ADD CONSTRAINT "behaviour_remarks_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "behaviour_remarks_student_idx" ON "behaviour_remarks" USING btree ("tenant_id","student_id","occurred_on");--> statement-breakpoint
CREATE INDEX "behaviour_remarks_section_idx" ON "behaviour_remarks" USING btree ("tenant_id","section_id","occurred_on");--> statement-breakpoint
/* Archived years are read-only (0004): their log books are history */
CREATE TRIGGER behaviour_remarks_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON behaviour_remarks
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
