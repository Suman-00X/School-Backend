ALTER TABLE "academic_years" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_archived_not_current_chk" CHECK (NOT ("academic_years"."is_current" AND "academic_years"."archived_at" IS NOT NULL));--> statement-breakpoint
/* Archived academic years are read-only. Enforced here so that every write path
   (API, jobs, imports, future modules) obeys it. SQLSTATE ZA409 is mapped to an
   HTTP 409 with this message by the API error handler. Finance tables are not
   guarded: arrears from an archived year stay payable. */
CREATE OR REPLACE FUNCTION assert_academic_year_writable(year_id uuid) RETURNS void AS $$
DECLARE
  archived_name text;
BEGIN
  IF year_id IS NULL THEN
    RETURN;
  END IF;
  SELECT y.year_name INTO archived_name FROM academic_years y WHERE y.id = year_id AND y.archived_at IS NOT NULL;
  IF FOUND THEN
    RAISE EXCEPTION 'Academic year % is archived and read-only', archived_name USING ERRCODE = 'ZA409';
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_archived_year_rows() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM assert_academic_year_writable(OLD.academic_year_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM assert_academic_year_writable(NEW.academic_year_id);
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
/* Homework submissions reach their year through the assignment */
CREATE OR REPLACE FUNCTION guard_archived_homework_submissions() RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM assert_academic_year_writable((SELECT h.academic_year_id FROM homework_assignments h WHERE h.id = OLD.homework_id));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM assert_academic_year_writable((SELECT h.academic_year_id FROM homework_assignments h WHERE h.id = NEW.homework_id));
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
/* The year row itself: only un-archiving is allowed while archived */
CREATE OR REPLACE FUNCTION guard_archived_year_itself() RETURNS trigger AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL AND (TG_OP = 'DELETE' OR NEW.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Academic year % is archived and read-only. Restore it first.', OLD.year_name USING ERRCODE = 'ZA409';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER academic_years_archive_guard BEFORE UPDATE OR DELETE ON academic_years
  FOR EACH ROW EXECUTE FUNCTION guard_archived_year_itself();
--> statement-breakpoint
DO $$
DECLARE
  guarded text;
BEGIN
  FOREACH guarded IN ARRAY ARRAY[
    'sections', 'section_subjects', 'teacher_assignments', 'student_enrollments',
    'exams', 'exam_papers', 'marks', 'calendar_events',
    'attendance_sessions', 'attendance_records', 'periods', 'timetable_slots', 'homework_assignments'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION guard_archived_year_rows()',
      guarded || '_archive_guard', guarded
    );
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER homework_submissions_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_archived_homework_submissions();
