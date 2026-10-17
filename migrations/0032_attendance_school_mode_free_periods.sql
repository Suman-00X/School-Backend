/* Hand-written (the attendance mode is the school's, for every class), BEFORE the
   generated statements: class-level mode rules are deleted, so that mode can become NOT
   NULL, the school's unique index can be rebuilt and class_id dropped. Their classes follow
   the school from now on; registers already taken keep their kind. The future-only
   trigger (0029) lists class_id among its columns, so it goes first and is recreated
   at the end. */
DROP TRIGGER IF EXISTS attendance_mode_rules_future_only ON attendance_mode_rules;
--> statement-breakpoint
DELETE FROM "attendance_mode_rules" WHERE "class_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "attendance_free_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_number" integer NOT NULL,
	"reason" text NOT NULL,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lock_override_reason" text,
	"lock_overridden_by" uuid,
	"lock_overridden_at" timestamp with time zone,
	CONSTRAINT "attendance_free_periods_period_chk" CHECK ("attendance_free_periods"."period_number" BETWEEN 1 AND 20)
);
--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" DROP CONSTRAINT "attendance_mode_rules_school_mode_chk";--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" DROP CONSTRAINT "attendance_mode_rules_class_id_classes_id_fk";
--> statement-breakpoint
DROP INDEX "attendance_mode_rules_class_uq";--> statement-breakpoint
DROP INDEX "attendance_mode_rules_school_uq";--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" ALTER COLUMN "mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_free_periods" ADD CONSTRAINT "attendance_free_periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_free_periods" ADD CONSTRAINT "attendance_free_periods_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_free_periods" ADD CONSTRAINT "attendance_free_periods_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_free_periods" ADD CONSTRAINT "attendance_free_periods_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_free_periods" ADD CONSTRAINT "attendance_free_periods_lock_overridden_by_users_id_fk" FOREIGN KEY ("lock_overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_free_periods_section_date_period_uq" ON "attendance_free_periods" USING btree ("section_id","date","period_number");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_mode_rules_school_uq" ON "attendance_mode_rules" USING btree ("tenant_id","effective_from") WHERE "attendance_mode_rules"."is_active" = true;--> statement-breakpoint
ALTER TABLE "attendance_mode_rules" DROP COLUMN "class_id";
--> statement-breakpoint
/* Hand-written: the future-only trigger again, without class_id */
CREATE TRIGGER attendance_mode_rules_future_only BEFORE INSERT OR UPDATE OF effective_from, mode ON attendance_mode_rules
  FOR EACH ROW EXECUTE FUNCTION attendance_mode_rule_future_only();
--> statement-breakpoint
/* Hand-written: free periods of an archived year are read-only, like its registers */
CREATE TRIGGER attendance_free_periods_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON attendance_free_periods
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows();
--> statement-breakpoint
/* Hand-written: a period is either free or has a register, never both, on every write
   path. Both sides first take the same transaction-scoped advisory lock on (section,
   date, period), so of two writers racing for one period the second waits, then sees the
   first's row. SQLSTATE ZA409 reaches the API as a 409 with this message. */
CREATE OR REPLACE FUNCTION attendance_period_lock(p_section uuid, p_date date, p_period integer) RETURNS void AS $$
  SELECT pg_advisory_xact_lock(hashtext('attendance_period'), hashtext(p_section::text || '|' || p_date::text || '|' || p_period::text));
$$ LANGUAGE sql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION attendance_session_not_free() RETURNS trigger AS $$
BEGIN
  PERFORM attendance_period_lock(NEW.section_id, NEW.date, NEW.period_number);
  IF EXISTS (
    SELECT 1 FROM attendance_free_periods f
     WHERE f.section_id = NEW.section_id AND f.date = NEW.date AND f.period_number = NEW.period_number AND f.is_active
  ) THEN
    RAISE EXCEPTION 'Period % on % is a free period: remove the free period first to take its register', NEW.period_number, NEW.date
      USING ERRCODE = 'ZA409';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attendance_sessions_not_free BEFORE INSERT OR UPDATE ON attendance_sessions
  FOR EACH ROW WHEN (NEW.kind = 'PERIOD' AND NEW.is_active) EXECUTE FUNCTION attendance_session_not_free();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION attendance_free_period_not_taken() RETURNS trigger AS $$
BEGIN
  PERFORM attendance_period_lock(NEW.section_id, NEW.date, NEW.period_number);
  IF EXISTS (
    SELECT 1 FROM attendance_sessions s
     WHERE s.section_id = NEW.section_id AND s.date = NEW.date AND s.kind = 'PERIOD'
       AND s.period_number = NEW.period_number AND s.is_active
  ) THEN
    RAISE EXCEPTION 'The register of period % on % was already taken: a period with a register cannot be marked free', NEW.period_number, NEW.date
      USING ERRCODE = 'ZA409';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attendance_free_periods_not_taken BEFORE INSERT OR UPDATE ON attendance_free_periods
  FOR EACH ROW WHEN (NEW.is_active) EXECUTE FUNCTION attendance_free_period_not_taken();