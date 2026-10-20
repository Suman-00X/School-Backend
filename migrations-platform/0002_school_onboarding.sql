CREATE TYPE "public"."platform_admin_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" "platform_admin_status" DEFAULT 'ACTIVE' NOT NULL,
	"sessions_valid_after" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_tenants" ADD COLUMN "enabled_modules" text[];--> statement-breakpoint
ALTER TABLE "platform_tenants" ADD COLUMN "student_count" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_admins_email_uq" ON "platform_admins" USING btree ("email");