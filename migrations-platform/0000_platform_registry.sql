CREATE TYPE "public"."platform_tenant_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "platform_tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" "platform_tenant_status" DEFAULT 'ACTIVE' NOT NULL,
	"database_name" text NOT NULL,
	"mongo_database_name" text NOT NULL,
	"database_url" text,
	"mongo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tenants_code_uq" ON "platform_tenants" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tenants_database_uq" ON "platform_tenants" USING btree ("database_name");