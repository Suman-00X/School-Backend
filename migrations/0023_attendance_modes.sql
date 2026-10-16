CREATE TYPE "public"."attendance_kind" AS ENUM('DAY', 'FORENOON', 'AFTERNOON', 'PERIOD');--> statement-breakpoint
CREATE TYPE "public"."attendance_mode" AS ENUM('DAILY', 'TWO_SESSIONS', 'PERIOD_WISE');--> statement-breakpoint
CREATE TABLE "attendance_mode_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"class_id" uuid,
	"mode" "attendance_mode",
	"effective_from" date NOT NULL,
	"set_by" uuid NOT NULL,
	CONSTRAINT "attendance_mode_rules_school_mode_chk" CHECK ("attendance_mode_rules"."class_id" IS NOT NULL OR "attendance_mode_rules"."mode" IS NOT NULL)
);
--> statement-breakpoint
DROP INDEX "attendance_sessions_section_date_period_uq";--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "kind" "attendance_kind" DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "kind" "attendance_kind" DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD COLUMN "period_presence_threshold" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
/* Hand-written: registers taken before kinds existed. period_number > 0 meant a period register.
   The archive guard is paused so archived years are converted too (their meaning is unchanged). */
ALTER TABLE "attendance_sessions" DISABLE TRIGGER "attendance_sessions_archive_guard";--> statement-breakpoint
ALTER TABLE "attendance_records" DISABLE TRIGGER "attendance_records_archive_guard";--> statement-breakpoint
UPDATE "attendance_sessions" SET "kind" = 'PERIOD' WHERE "period_number" > 0;--> statement-breakpoint
UPDATE "attendance_records" SET "kind" = 'PERIOD' WHERE "period_number" > 0;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ENABLE TRIGGER "attendance_sessions_archive_guard";--> statement-breakpoint
ALTER TABLE "attendance_records" ENABLE TRIGGER "attendance_records_archive_guard";--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" ADD CONSTRAINT "attendance_mode_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" ADD CONSTRAINT "attendance_mode_rules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" ADD CONSTRAINT "attendance_mode_rules_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_mode_rules_school_uq" ON "attendance_mode_rules" USING btree ("tenant_id","effective_from") WHERE "attendance_mode_rules"."is_active" = true AND "attendance_mode_rules"."class_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_mode_rules_class_uq" ON "attendance_mode_rules" USING btree ("class_id","effective_from") WHERE "attendance_mode_rules"."is_active" = true AND "attendance_mode_rules"."class_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_section_date_kind_period_uq" ON "attendance_sessions" USING btree ("section_id","date","kind","period_number");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_period_kind_chk" CHECK (("attendance_records"."kind" = 'PERIOD') = ("attendance_records"."period_number" > 0));--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_period_kind_chk" CHECK (("attendance_sessions"."kind" = 'PERIOD') = ("attendance_sessions"."period_number" > 0));--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_threshold_chk" CHECK ("attendance_policies"."period_presence_threshold" BETWEEN 1 AND 100);