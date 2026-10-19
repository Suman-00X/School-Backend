/* Canonical names (see DATA_MODEL.md › Names and codes).
   1. Classes get a level (NURSERY, LKG, UKG, GRADE_1 … GRADE_12); className and
      classOrder come from it. Existing classes are mapped by name ("Class 1", "Grade 1",
      "Std 1", "1", "I", "LKG"…); a class whose name maps to no level keeps a null level and
      its own name and order. Mapped classes take the level's name and order.
   2. Names of master records become unique ignoring case (unique indexes on lower(name)).
   Nothing is merged or renamed to make room: when existing rows would clash (names that
   differ only in case or spacing, or two classes of one level), the migration stops and
   lists them. Rename or deactivate one of each, then migrate again. */
CREATE FUNCTION pg_temp.class_level(class_name text) RETURNS text AS $$
DECLARE
  words text := btrim(regexp_replace(replace(lower(class_name), '.', ''), '[\s_-]+', ' ', 'g'));
  num text;
  grade int;
BEGIN
  IF words = 'nursery' THEN RETURN 'NURSERY'; END IF;
  IF words IN ('lkg', 'l k g') THEN RETURN 'LKG'; END IF;
  IF words IN ('ukg', 'u k g') THEN RETURN 'UKG'; END IF;
  num := substring(words FROM '^(?:(?:class|grade|std|standard) ?)?(\d{1,2}|[ivx]+)$');
  IF num IS NULL THEN RETURN NULL; END IF;
  grade := CASE WHEN num ~ '^\d' THEN num::int
    ELSE array_position(ARRAY['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'], num) END;
  RETURN CASE WHEN grade BETWEEN 1 AND 12 THEN 'GRADE_' || grade END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
DO $$
DECLARE
  spec record;
  clash text;
  problems text[] := '{}';
BEGIN
  /* table, name column, uniqueness scope, rows the index covers */
  FOR spec IN SELECT * FROM (VALUES
    ('classes', 'class_name', 'tenant_id', 'true'),
    ('subjects', 'subject_name', 'tenant_id', 'true'),
    ('grade_scales', 'name', 'tenant_id', 'is_active'),
    ('grade_bands', 'grade', 'grade_scale_id', 'true'),
    ('result_policies', 'name', 'tenant_id', 'is_active'),
    ('assessment_schemes', 'name', 'tenant_id, academic_year_id', 'is_active'),
    ('exams', 'exam_name', 'academic_year_id', 'true'),
    ('fee_heads', 'name', 'tenant_id', 'is_active'),
    ('installment_plans', 'name', 'tenant_id, academic_year_id', 'is_active'),
    ('plan_installments', 'name', 'installment_plan_id', 'true'),
    ('fee_structures', 'name', 'academic_year_id, class_id', 'is_active AND class_id IS NOT NULL'),
    ('late_fee_rules', 'name', 'tenant_id', 'is_active'),
    ('concessions', 'name', 'tenant_id', 'is_active'),
    ('leave_types', 'name', 'tenant_id', 'is_active'),
    ('hostels', 'name', 'tenant_id', 'is_active'),
    ('hostel_rooms', 'room_number', 'hostel_id', 'is_active'),
    ('hostel_resources', 'name', 'hostel_id', 'is_active'),
    ('transport_routes', 'name', 'tenant_id', 'is_active'),
    ('transport_route_stops', 'name', 'route_id', 'is_active')
  ) AS s(tbl, col, scope, covered) LOOP
    EXECUTE format(
      'SELECT string_agg(names, ''; '') FROM (
         SELECT string_agg(quote_literal(%1$I), '' and '' ORDER BY %1$I) AS names FROM %2$I WHERE %3$s
         GROUP BY %4$s, lower(regexp_replace(btrim(%1$I), ''\s+'', '' '', ''g'')) HAVING count(*) > 1) clashes',
      spec.col, spec.tbl, spec.covered, spec.scope
    ) INTO clash;
    IF clash IS NOT NULL THEN
      problems := problems || format('%s.%s: %s', spec.tbl, spec.col, clash);
    END IF;
  END LOOP;

  SELECT string_agg(names, '; ') INTO clash FROM (
    SELECT string_agg(quote_literal(class_name), ' and ' ORDER BY class_name) AS names FROM classes
    WHERE pg_temp.class_level(class_name) IS NOT NULL
    GROUP BY tenant_id, pg_temp.class_level(class_name) HAVING count(*) > 1) clashes;
  IF clash IS NOT NULL THEN
    problems := problems || format('classes of the same level: %s', clash);
  END IF;

  IF cardinality(problems) > 0 THEN
    RAISE EXCEPTION 'Names must be unique ignoring case and spacing, and these existing records clash. Rename or deactivate one of each, then migrate again. %',
      array_to_string(problems, ' | ');
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TYPE "public"."class_level" AS ENUM('NURSERY', 'LKG', 'UKG', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10', 'GRADE_11', 'GRADE_12');--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "level" "class_level";--> statement-breakpoint
DROP INDEX "classes_tenant_order_uq";--> statement-breakpoint
DROP INDEX "assessment_schemes_year_name_uq";--> statement-breakpoint
DROP INDEX "classes_tenant_name_uq";--> statement-breakpoint
DROP INDEX "exams_year_name_uq";--> statement-breakpoint
DROP INDEX "grade_bands_scale_grade_uq";--> statement-breakpoint
DROP INDEX "grade_scales_tenant_name_uq";--> statement-breakpoint
DROP INDEX "result_policies_tenant_name_uq";--> statement-breakpoint
DROP INDEX "subjects_tenant_name_uq";--> statement-breakpoint
DROP INDEX "concessions_tenant_name_uq";--> statement-breakpoint
DROP INDEX "fee_heads_tenant_name_uq";--> statement-breakpoint
DROP INDEX "fee_structures_year_class_name_uq";--> statement-breakpoint
DROP INDEX "installment_plans_year_name_uq";--> statement-breakpoint
DROP INDEX "plan_installments_name_uq";--> statement-breakpoint
DROP INDEX "late_fee_rules_name_uq";--> statement-breakpoint
DROP INDEX "hostels_tenant_name_uq";--> statement-breakpoint
DROP INDEX "hostel_resources_hostel_name_uq";--> statement-breakpoint
DROP INDEX "hostel_rooms_hostel_number_uq";--> statement-breakpoint
DROP INDEX "leave_types_tenant_name_uq";--> statement-breakpoint
DROP INDEX "transport_route_stops_route_name_uq";--> statement-breakpoint
DROP INDEX "transport_routes_tenant_name_uq";--> statement-breakpoint
/* After the old indexes are gone (orders move). Mapped classes take their level's name and order (Nursery 1, LKG 2, UKG 3, Class n = n + 3) */
UPDATE "classes" SET
  "level" = pg_temp.class_level("class_name")::"class_level",
  "class_name" = CASE pg_temp.class_level("class_name")
    WHEN 'NURSERY' THEN 'Nursery' WHEN 'LKG' THEN 'LKG' WHEN 'UKG' THEN 'UKG'
    ELSE 'Class ' || substring(pg_temp.class_level("class_name") FROM 7) END,
  "class_order" = CASE pg_temp.class_level("class_name")
    WHEN 'NURSERY' THEN 1 WHEN 'LKG' THEN 2 WHEN 'UKG' THEN 3
    ELSE substring(pg_temp.class_level("class_name") FROM 7)::int + 3 END
WHERE pg_temp.class_level("class_name") IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_tenant_level_uq" ON "classes" USING btree ("tenant_id","level") WHERE "classes"."level" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_schemes_year_name_uq" ON "assessment_schemes" USING btree ("tenant_id","academic_year_id",lower("name")) WHERE "assessment_schemes"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "classes_tenant_name_uq" ON "classes" USING btree ("tenant_id",lower("class_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "exams_year_name_uq" ON "exams" USING btree ("academic_year_id",lower("exam_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "grade_bands_scale_grade_uq" ON "grade_bands" USING btree ("grade_scale_id",lower("grade"));--> statement-breakpoint
CREATE UNIQUE INDEX "grade_scales_tenant_name_uq" ON "grade_scales" USING btree ("tenant_id",lower("name")) WHERE "grade_scales"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "result_policies_tenant_name_uq" ON "result_policies" USING btree ("tenant_id",lower("name")) WHERE "result_policies"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_tenant_name_uq" ON "subjects" USING btree ("tenant_id",lower("subject_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "concessions_tenant_name_uq" ON "concessions" USING btree ("tenant_id",lower("name")) WHERE "concessions"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_heads_tenant_name_uq" ON "fee_heads" USING btree ("tenant_id",lower("name")) WHERE "fee_heads"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_year_class_name_uq" ON "fee_structures" USING btree ("academic_year_id","class_id",lower("name")) WHERE "fee_structures"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "installment_plans_year_name_uq" ON "installment_plans" USING btree ("tenant_id","academic_year_id",lower("name")) WHERE "installment_plans"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_installments_name_uq" ON "plan_installments" USING btree ("installment_plan_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "late_fee_rules_name_uq" ON "late_fee_rules" USING btree ("tenant_id",lower("name")) WHERE "late_fee_rules"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "hostels_tenant_name_uq" ON "hostels" USING btree ("tenant_id",lower("name")) WHERE "hostels"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_resources_hostel_name_uq" ON "hostel_resources" USING btree ("hostel_id",lower("name")) WHERE "hostel_resources"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_rooms_hostel_number_uq" ON "hostel_rooms" USING btree ("hostel_id",lower("room_number")) WHERE "hostel_rooms"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_tenant_name_uq" ON "leave_types" USING btree ("tenant_id",lower("name")) WHERE "leave_types"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_stops_route_name_uq" ON "transport_route_stops" USING btree ("route_id",lower("name")) WHERE "transport_route_stops"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_tenant_name_uq" ON "transport_routes" USING btree ("tenant_id",lower("name")) WHERE "transport_routes"."is_active" = true;
