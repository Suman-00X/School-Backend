CREATE TYPE "public"."hostel_allocation_status" AS ENUM('ACTIVE', 'VACATED');--> statement-breakpoint
CREATE TYPE "public"."hostel_resident_gender" AS ENUM('BOYS', 'GIRLS', 'COED');--> statement-breakpoint
CREATE TYPE "public"."hostel_room_status" AS ENUM('AVAILABLE', 'MAINTENANCE', 'CLOSED');--> statement-breakpoint
CREATE TABLE "hostel_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"hostel_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"bed_number" integer NOT NULL,
	"allocated_on" date NOT NULL,
	"vacated_on" date,
	"status" "hostel_allocation_status" DEFAULT 'ACTIVE' NOT NULL,
	"transferred_from_id" uuid,
	"allocated_by" uuid,
	"vacated_by" uuid,
	"notes" text,
	CONSTRAINT "hostel_allocations_bed_chk" CHECK ("hostel_allocations"."bed_number" >= 1),
	CONSTRAINT "hostel_allocations_vacated_chk" CHECK (("hostel_allocations"."status" = 'ACTIVE' AND "hostel_allocations"."vacated_on" IS NULL) OR ("hostel_allocations"."status" = 'VACATED' AND "hostel_allocations"."vacated_on" >= "hostel_allocations"."allocated_on"))
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"resident_gender" "hostel_resident_gender" NOT NULL,
	"warden_user_id" uuid,
	"address" text,
	"contact_phone" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "hostel_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hostel_id" uuid NOT NULL,
	"room_number" text NOT NULL,
	"floor" integer,
	"capacity" integer NOT NULL,
	"room_type" text,
	"monthly_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"status" "hostel_room_status" DEFAULT 'AVAILABLE' NOT NULL,
	"description" text,
	CONSTRAINT "hostel_rooms_capacity_chk" CHECK ("hostel_rooms"."capacity" BETWEEN 1 AND 50),
	CONSTRAINT "hostel_rooms_fee_chk" CHECK ("hostel_rooms"."monthly_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_room_id_hostel_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."hostel_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_transferred_from_id_hostel_allocations_id_fk" FOREIGN KEY ("transferred_from_id") REFERENCES "public"."hostel_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_allocations" ADD CONSTRAINT "hostel_allocations_vacated_by_users_id_fk" FOREIGN KEY ("vacated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostels" ADD CONSTRAINT "hostels_warden_user_id_users_id_fk" FOREIGN KEY ("warden_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostel_rooms" ADD CONSTRAINT "hostel_rooms_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_allocations_student_uq" ON "hostel_allocations" USING btree ("student_id") WHERE "hostel_allocations"."is_active" = true AND "hostel_allocations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_allocations_room_bed_uq" ON "hostel_allocations" USING btree ("room_id","bed_number") WHERE "hostel_allocations"."is_active" = true AND "hostel_allocations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "hostel_allocations_tenant_year_idx" ON "hostel_allocations" USING btree ("tenant_id","academic_year_id","hostel_id");--> statement-breakpoint
CREATE INDEX "hostel_allocations_student_idx" ON "hostel_allocations" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hostels_tenant_name_uq" ON "hostels" USING btree ("tenant_id","name") WHERE "hostels"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "hostels_tenant_code_uq" ON "hostels" USING btree ("tenant_id","code") WHERE "hostels"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "hostel_rooms_hostel_number_uq" ON "hostel_rooms" USING btree ("hostel_id","room_number") WHERE "hostel_rooms"."is_active" = true;--> statement-breakpoint
CREATE INDEX "hostel_rooms_tenant_hostel_idx" ON "hostel_rooms" USING btree ("tenant_id","hostel_id");