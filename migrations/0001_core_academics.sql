CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_type" AS ENUM('HOLIDAY', 'VACATION', 'EXAM', 'EVENT', 'MEETING', 'OTHER');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_number" integer DEFAULT 0 NOT NULL,
	"status" "attendance_status" NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"period_number" integer DEFAULT 0 NOT NULL,
	"subject_id" uuid,
	"taken_by" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"title" text NOT NULL,
	"event_type" "calendar_event_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_holiday" boolean DEFAULT false NOT NULL,
	"description" text,
	CONSTRAINT "calendar_events_dates_chk" CHECK ("calendar_events"."end_date" >= "calendar_events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "grade_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"grade_scale_id" uuid NOT NULL,
	"grade" text NOT NULL,
	"min_percent" numeric(5, 2) NOT NULL,
	"max_percent" numeric(5, 2) NOT NULL,
	"grade_point" numeric(4, 2),
	"remark" text,
	"is_passing" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "grade_bands_range_chk" CHECK ("grade_bands"."min_percent" >= 0 AND "grade_bands"."max_percent" <= 100 AND "grade_bands"."max_percent" > "grade_bands"."min_percent")
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"period_number" integer NOT NULL,
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_break" boolean DEFAULT false NOT NULL,
	CONSTRAINT "periods_times_chk" CHECK ("periods"."end_time" > "periods"."start_time")
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"period_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"room" text,
	CONSTRAINT "timetable_slots_weekday_chk" CHECK ("timetable_slots"."weekday" BETWEEN 1 AND 7)
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "currency" text DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "country" text DEFAULT 'IN' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "academic_years" ADD COLUMN "weekly_off_days" integer[] DEFAULT '{0}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "grade_scale_id" uuid;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "results_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD COLUMN "start_time" time;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD COLUMN "end_time" time;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD COLUMN "room" text;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "periods" ADD CONSTRAINT "periods_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_period_id_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student_uq" ON "attendance_records" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_student_date_idx" ON "attendance_records" USING btree ("student_id","date");--> statement-breakpoint
CREATE INDEX "attendance_records_section_date_idx" ON "attendance_records" USING btree ("section_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_section_date_period_uq" ON "attendance_sessions" USING btree ("section_id","date","period_number");--> statement-breakpoint
CREATE INDEX "calendar_events_year_dates_idx" ON "calendar_events" USING btree ("academic_year_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_bands_scale_grade_uq" ON "grade_bands" USING btree ("grade_scale_id","grade");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_scales_tenant_name_uq" ON "grade_scales" USING btree ("tenant_id","name") WHERE "grade_scales"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "grade_scales_one_default_uq" ON "grade_scales" USING btree ("tenant_id") WHERE "grade_scales"."is_default" = true AND "grade_scales"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "periods_year_number_uq" ON "periods" USING btree ("academic_year_id","period_number") WHERE "periods"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_slots_section_uq" ON "timetable_slots" USING btree ("section_id","weekday","period_id") WHERE "timetable_slots"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_slots_teacher_uq" ON "timetable_slots" USING btree ("teacher_id","weekday","period_id") WHERE "timetable_slots"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_slots_room_uq" ON "timetable_slots" USING btree ("academic_year_id","room","weekday","period_id") WHERE "timetable_slots"."is_active" = true AND "timetable_slots"."room" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_papers" ADD CONSTRAINT "exam_papers_times_chk" CHECK ("exam_papers"."start_time" IS NULL OR "exam_papers"."end_time" IS NULL OR "exam_papers"."end_time" > "exam_papers"."start_time");