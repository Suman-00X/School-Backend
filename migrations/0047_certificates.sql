CREATE TYPE "public"."certificate_status" AS ENUM('ISSUED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."certificate_type" AS ENUM('BONAFIDE', 'CHARACTER', 'TRANSFER');--> statement-breakpoint
CREATE TABLE "certificate_format_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "certificate_type" NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"note" text,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" "certificate_type" NOT NULL,
	"serial_number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid,
	"format_version_id" uuid NOT NULL,
	"details" jsonb NOT NULL,
	"status" "certificate_status" DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text
);
--> statement-breakpoint
ALTER TABLE "certificate_format_versions" ADD CONSTRAINT "certificate_format_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate_format_versions" ADD CONSTRAINT "certificate_format_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_format_version_id_certificate_format_versions_id_fk" FOREIGN KEY ("format_version_id") REFERENCES "public"."certificate_format_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_format_versions_type_version_uq" ON "certificate_format_versions" USING btree ("tenant_id","type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_serial_number_uq" ON "certificates" USING btree ("tenant_id","serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_one_tc_uq" ON "certificates" USING btree ("tenant_id","student_id") WHERE "certificates"."type" = 'TRANSFER' AND "certificates"."status" = 'ISSUED' AND "certificates"."is_active" = true;--> statement-breakpoint
CREATE INDEX "certificates_issued_at_idx" ON "certificates" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE INDEX "certificates_student_idx" ON "certificates" USING btree ("student_id");