CREATE TYPE "public"."scheduling_kind" AS ENUM('CLASS_TIMETABLE', 'EXAM_TIMETABLE');--> statement-breakpoint
CREATE TYPE "public"."scheduling_origin" AS ENUM('API', 'AGENT_TOOL');--> statement-breakpoint
CREATE TYPE "public"."scheduling_status" AS ENUM('DRAFT', 'APPLIED', 'DISCARDED');--> statement-breakpoint
CREATE TABLE "scheduling_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"kind" "scheduling_kind" NOT NULL,
	"status" "scheduling_status" DEFAULT 'DRAFT' NOT NULL,
	"origin" "scheduling_origin" DEFAULT 'API' NOT NULL,
	"exam_id" uuid,
	"seed" integer NOT NULL,
	"request" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"fingerprint" jsonb NOT NULL,
	"summary" text NOT NULL,
	"created_by" uuid,
	"applied_at" timestamp with time zone,
	"applied_by" uuid,
	"discarded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduling_runs_year_kind_idx" ON "scheduling_runs" USING btree ("academic_year_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "scheduling_runs_exam_idx" ON "scheduling_runs" USING btree ("exam_id");--> statement-breakpoint
/* Archived years are read-only (0004): no new drafts, nothing applied or discarded */
CREATE TRIGGER scheduling_runs_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON scheduling_runs
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
