CREATE TYPE "public"."student_leave_session" AS ENUM('FULL_DAY', 'FORENOON', 'AFTERNOON');--> statement-breakpoint
CREATE TYPE "public"."student_leave_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "student_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"session" "student_leave_session" DEFAULT 'FULL_DAY' NOT NULL,
	"days" numeric(4, 1) NOT NULL,
	"reason_category" text NOT NULL,
	"reason" text NOT NULL,
	"status" "student_leave_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "student_leave_requests_dates_chk" CHECK ("student_leave_requests"."to_date" >= "student_leave_requests"."from_date"),
	CONSTRAINT "student_leave_requests_days_chk" CHECK ("student_leave_requests"."days" > 0),
	CONSTRAINT "student_leave_requests_half_day_chk" CHECK ("student_leave_requests"."session" = 'FULL_DAY' OR ("student_leave_requests"."from_date" = "student_leave_requests"."to_date" AND "student_leave_requests"."days" = 0.5))
);
--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_leave_requests" ADD CONSTRAINT "student_leave_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_leave_requests_student_idx" ON "student_leave_requests" USING btree ("tenant_id","student_id","from_date");--> statement-breakpoint
CREATE INDEX "student_leave_requests_section_idx" ON "student_leave_requests" USING btree ("tenant_id","section_id","status","from_date");--> statement-breakpoint
/* Archived years are read-only (0004): their leave requests are history */
CREATE TRIGGER student_leave_requests_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON student_leave_requests
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
