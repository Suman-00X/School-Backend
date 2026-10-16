CREATE TYPE "public"."hostel_allocation_source" AS ENUM('DIRECT', 'TRANSFER', 'ROLLOVER');--> statement-breakpoint
CREATE TYPE "public"."hostel_booking_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."hostel_end_reason" AS ENUM('VACATED', 'RELEASED', 'TRANSFERRED', 'LEFT_SCHOOL', 'CANCELLED', 'BED_ENDED');--> statement-breakpoint
CREATE TYPE "public"."hostel_resource_status" AS ENUM('AVAILABLE', 'OUT_OF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."hostel_resource_type" AS ENUM('LOCKER', 'CUPBOARD', 'STUDY_TABLE', 'MESS_PLAN', 'LAUNDRY_PLAN', 'CUSTOM');--> statement-breakpoint
CREATE TABLE "hostel_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid NOT NULL,
	"hostel_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"bed_number" integer NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"status" "hostel_booking_status" DEFAULT 'ACTIVE' NOT NULL,
	"source" "hostel_allocation_source" DEFAULT 'DIRECT' NOT NULL,
	"previous_allocation_id" uuid,
	"end_reason" "hostel_end_reason",
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"allocated_by" uuid,
	"notes" text,
	CONSTRAINT "hostel_allocations_bed_chk" CHECK ("hostel_allocations"."bed_number" >= 1),
	CONSTRAINT "hostel_allocations_dates_chk" CHECK ("hostel_allocations"."to_date" IS NULL OR "hostel_allocations"."to_date" >= "hostel_allocations"."from_date"),
	CONSTRAINT "hostel_allocations_cancelled_chk" CHECK ("hostel_allocations"."status" <> 'CANCELLED' OR ("hostel_allocations"."end_reason" IS NOT NULL AND "hostel_allocations"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "hostel_resource_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resource_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"hostel_id" uuid NOT NULL,
	"allocation_id" uuid,
	"plan_type" text,
	"from_date" date NOT NULL,
	"to_date" date,
	"status" "hostel_booking_status" DEFAULT 'ACTIVE' NOT NULL,
	"previous_assignment_id" uuid,
	"end_reason" "hostel_end_reason",
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"assigned_by" uuid,
	"notes" text,
	CONSTRAINT "hostel_resource_assignments_dates_chk" CHECK ("hostel_resource_assignments"."to_date" IS NULL OR "hostel_resource_assignments"."to_date" >= "hostel_resource_assignments"."from_date"),
	CONSTRAINT "hostel_resource_assignments_plan_chk" CHECK ("hostel_resource_assignments"."plan_type" IS NULL OR "hostel_resource_assignments"."plan_type" IN ('MESS_PLAN', 'LAUNDRY_PLAN')),
	CONSTRAINT "hostel_resource_assignments_cancelled_chk" CHECK ("hostel_resource_assignments"."status" <> 'CANCELLED' OR ("hostel_resource_assignments"."end_reason" IS NOT NULL AND "hostel_resource_assignments"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "hostel_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hostel_id" uuid NOT NULL,
	"room_id" uuid,
	"resource_type" "hostel_resource_type" NOT NULL,
	"custom_type" text,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"monthly_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"status" "hostel_resource_status" DEFAULT 'AVAILABLE' NOT NULL,
	"description" text,
	CONSTRAINT "hostel_resources_capacity_chk" CHECK ("hostel_resources"."capacity" BETWEEN 1 AND 10000),
	CONSTRAINT "hostel_resources_fee_chk" CHECK ("hostel_resources"."monthly_fee" >= 0),
	CONSTRAINT "hostel_resources_custom_chk" CHECK (("hostel_resources"."resource_type" = 'CUSTOM') = ("hostel_resources"."custom_type" IS NOT NULL)),
	CONSTRAINT "hostel_resources_plan_room_chk" CHECK ("hostel_resources"."resource_type" NOT IN ('MESS_PLAN', 'LAUNDRY_PLAN') OR "hostel_resources"."room_id" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_previous_allocation_id_hostel_allocations_id_fk" FOREIGN KEY ("previous_allocation_id") REFERENCES "public"."hostel_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_resource_id_hostel_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."hostel_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_allocation_id_hostel_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."hostel_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_previous_assignment_id_hostel_resource_assignments_id_fk" FOREIGN KEY ("previous_assignment_id") REFERENCES "public"."hostel_resource_assignments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resources" ADD CONSTRAINT "hostel_resources_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resources" ADD CONSTRAINT "hostel_resources_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_resources" ADD CONSTRAINT "hostel_resources_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hostel_allocations_tenant_hostel_idx" ON "hostel_allocations" USING btree ("tenant_id","hostel_id","from_date");--> statement-breakpoint
CREATE INDEX "hostel_allocations_room_idx" ON "hostel_allocations" USING btree ("room_id","bed_number");--> statement-breakpoint
CREATE INDEX "hostel_allocations_student_idx" ON "hostel_allocations" USING btree ("student_id","from_date");--> statement-breakpoint
CREATE INDEX "hostel_resource_assignments_resource_idx" ON "hostel_resource_assignments" USING btree ("resource_id","from_date");--> statement-breakpoint
CREATE INDEX "hostel_resource_assignments_student_idx" ON "hostel_resource_assignments" USING btree ("student_id","from_date");--> statement-breakpoint
CREATE INDEX "hostel_resource_assignments_allocation_idx" ON "hostel_resource_assignments" USING btree ("allocation_id");--> statement-breakpoint
CREATE INDEX "hostel_resource_assignments_tenant_hostel_idx" ON "hostel_resource_assignments" USING btree ("tenant_id","hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_resources_hostel_name_uq" ON "hostel_resources" USING btree ("hostel_id","name") WHERE "hostel_resources"."is_active" = true;--> statement-breakpoint
CREATE INDEX "hostel_resources_tenant_hostel_idx" ON "hostel_resources" USING btree ("tenant_id","hostel_id","resource_type");--> statement-breakpoint
CREATE INDEX "hostel_resources_room_idx" ON "hostel_resources" USING btree ("room_id");--> statement-breakpoint
--> statement-breakpoint
/* Date-range exclusion constraints need btree_gist (uuid and integer equality inside a GiST index) */
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
/* A bed is never double-booked: no two ACTIVE allocations of one bed share a day ('[]': both ends inclusive) */
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_bed_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, "bed_number" WITH =, daterange("from_date", "to_date", '[]') WITH &&)
  WHERE ("is_active" AND "status" = 'ACTIVE');
--> statement-breakpoint
/* A student never holds two beds on the same day */
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_student_no_overlap"
  EXCLUDE USING gist ("student_id" WITH =, daterange("from_date", "to_date", '[]') WITH &&)
  WHERE ("is_active" AND "status" = 'ACTIVE');
--> statement-breakpoint
/* A student never holds the same resource twice on the same day */
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_student_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, "student_id" WITH =, daterange("from_date", "to_date", '[]') WITH &&)
  WHERE ("is_active" AND "status" = 'ACTIVE');
--> statement-breakpoint
/* A student is on at most one mess plan (and one laundry plan) on any day */
ALTER TABLE "hostel_resource_assignments" ADD CONSTRAINT "hostel_resource_assignments_plan_no_overlap"
  EXCLUDE USING gist ("student_id" WITH =, "plan_type" WITH =, daterange("from_date", "to_date", '[]') WITH &&)
  WHERE ("is_active" AND "status" = 'ACTIVE' AND "plan_type" IS NOT NULL);
