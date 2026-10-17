ALTER TABLE "attendance_sessions" ADD COLUMN "is_substitute" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "deputy_class_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_deputy_class_teacher_id_teachers_id_fk" FOREIGN KEY ("deputy_class_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sections_deputy_class_teacher_idx" ON "sections" USING btree ("deputy_class_teacher_id","academic_year_id");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_substitute_chk" CHECK ("attendance_sessions"."kind" = 'PERIOD' OR NOT "attendance_sessions"."is_substitute");--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_deputy_class_teacher_chk" CHECK ("sections"."deputy_class_teacher_id" IS NULL OR "sections"."class_teacher_id" IS NULL OR "sections"."deputy_class_teacher_id" <> "sections"."class_teacher_id");
--> statement-breakpoint
/* Hand-written (D-66): an attendance mode change starts tomorrow, in the school's time
   zone, at the earliest, so registers already taken never change meaning. clock_timestamp()
   is read when the row is written, after the service has taken the policy row lock. */
CREATE OR REPLACE FUNCTION attendance_mode_rule_future_only() RETURNS trigger AS $$
DECLARE
  v_tomorrow date;
BEGIN
  SELECT (clock_timestamp() AT TIME ZONE coalesce(t.timezone, 'UTC'))::date + 1 INTO v_tomorrow
    FROM tenants t WHERE t.id = NEW.tenant_id;
  v_tomorrow := coalesce(v_tomorrow, (clock_timestamp() AT TIME ZONE 'UTC')::date + 1);
  IF NEW.effective_from < v_tomorrow THEN
    RAISE EXCEPTION 'A new attendance mode can start tomorrow (%) at the earliest. Choose % or a later date.', v_tomorrow, v_tomorrow
      USING ERRCODE = 'ZA422';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attendance_mode_rules_future_only BEFORE INSERT OR UPDATE OF effective_from, class_id, mode ON attendance_mode_rules
  FOR EACH ROW EXECUTE FUNCTION attendance_mode_rule_future_only();
