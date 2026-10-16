CREATE TYPE "public"."transport_assignment_status" AS ENUM('ACTIVE', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."transport_direction" AS ENUM('BOTH', 'PICKUP_ONLY', 'DROP_ONLY');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'IN_MAINTENANCE', 'RETIRED');--> statement-breakpoint
CREATE TABLE "transport_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"direction" "transport_direction" DEFAULT 'BOTH' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "transport_assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"ended_at" timestamp with time zone,
	"previous_assignment_id" uuid,
	"notes" text,
	CONSTRAINT "transport_assignments_dates_chk" CHECK ("transport_assignments"."end_date" IS NULL OR "transport_assignments"."end_date" >= "transport_assignments"."start_date"),
	CONSTRAINT "transport_assignments_ended_chk" CHECK (("transport_assignments"."status" = 'ACTIVE' AND "transport_assignments"."ended_at" IS NULL) OR ("transport_assignments"."status" = 'ENDED' AND "transport_assignments"."end_date" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "transport_route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"route_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"pickup_time" time,
	"drop_time" time,
	"landmark" text,
	"monthly_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "transport_route_stops_sequence_chk" CHECK ("transport_route_stops"."sequence" > 0),
	CONSTRAINT "transport_route_stops_fee_chk" CHECK ("transport_route_stops"."monthly_fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transport_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"vehicle_id" uuid,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "transport_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"registration_number" text NOT NULL,
	"make" text,
	"model" text,
	"capacity" integer NOT NULL,
	"driver_name" text,
	"driver_phone" text,
	"driver_license_number" text,
	"attendant_name" text,
	"attendant_phone" text,
	"insurance_expires_on" date,
	"fitness_certificate_expires_on" date,
	"permit_expires_on" date,
	"status" "vehicle_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	CONSTRAINT "transport_vehicles_capacity_chk" CHECK ("transport_vehicles"."capacity" > 0),
	CONSTRAINT "transport_vehicles_registration_chk" CHECK ("transport_vehicles"."registration_number" = upper("transport_vehicles"."registration_number"))
);
--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_stop_id_transport_route_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."transport_route_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD CONSTRAINT "transport_route_stops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_route_stops" ADD CONSTRAINT "transport_route_stops_route_id_transport_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."transport_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_routes" ADD CONSTRAINT "transport_routes_vehicle_id_transport_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."transport_vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_vehicles" ADD CONSTRAINT "transport_vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_assignments_year_student_active_uq" ON "transport_assignments" USING btree ("academic_year_id","student_id") WHERE "transport_assignments"."is_active" = true AND "transport_assignments"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "transport_assignments_route_idx" ON "transport_assignments" USING btree ("route_id","academic_year_id","status");--> statement-breakpoint
CREATE INDEX "transport_assignments_stop_idx" ON "transport_assignments" USING btree ("stop_id","status");--> statement-breakpoint
CREATE INDEX "transport_assignments_student_idx" ON "transport_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_stops_route_sequence_uq" ON "transport_route_stops" USING btree ("route_id","sequence") WHERE "transport_route_stops"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_route_stops_route_name_uq" ON "transport_route_stops" USING btree ("route_id","name") WHERE "transport_route_stops"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_tenant_name_uq" ON "transport_routes" USING btree ("tenant_id","name") WHERE "transport_routes"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_tenant_code_uq" ON "transport_routes" USING btree ("tenant_id","code") WHERE "transport_routes"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_routes_vehicle_uq" ON "transport_routes" USING btree ("vehicle_id") WHERE "transport_routes"."is_active" = true AND "transport_routes"."vehicle_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transport_vehicles_tenant_registration_uq" ON "transport_vehicles" USING btree ("tenant_id","registration_number") WHERE "transport_vehicles"."is_active" = true;--> statement-breakpoint
CREATE INDEX "transport_vehicles_tenant_status_idx" ON "transport_vehicles" USING btree ("tenant_id","status");