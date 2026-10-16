CREATE TYPE "public"."access_assignment_kind" AS ENUM('OPERATOR', 'OWNER');--> statement-breakpoint
CREATE TYPE "public"."access_module" AS ENUM('library', 'transport', 'hostel', 'hr', 'inventory');--> statement-breakpoint
CREATE TABLE "access_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" "access_assignment_kind" NOT NULL,
	"module" "access_module" NOT NULL,
	"operator_role_id" uuid,
	"user_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"note" text,
	"assigned_by" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	CONSTRAINT "access_assignments_kind_chk" CHECK (("access_assignments"."kind" = 'OPERATOR') = ("access_assignments"."operator_role_id" IS NOT NULL)),
	CONSTRAINT "access_assignments_dates_chk" CHECK ("access_assignments"."valid_from" IS NULL OR "access_assignments"."valid_to" IS NULL OR "access_assignments"."valid_to" >= "access_assignments"."valid_from"),
	CONSTRAINT "access_assignments_revoked_chk" CHECK ("access_assignments"."revoked_by" IS NULL OR "access_assignments"."revoked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "operator_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"module" "access_module" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" text[] NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "operator_roles_permissions_count_chk" CHECK (cardinality("operator_roles"."permissions") BETWEEN 1 AND 100),
	CONSTRAINT "operator_roles_permissions_module_chk" CHECK (array_to_string("operator_roles"."permissions", ',') ~ ('^' || "operator_roles"."module"::text || '\.[A-Za-z0-9.]+(,' || "operator_roles"."module"::text || '\.[A-Za-z0-9.]+)*$'))
);
--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_operator_role_id_operator_roles_id_fk" FOREIGN KEY ("operator_role_id") REFERENCES "public"."operator_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_roles" ADD CONSTRAINT "operator_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_roles" ADD CONSTRAINT "operator_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_roles" ADD CONSTRAINT "operator_roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_assignments_tenant_user_idx" ON "access_assignments" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "access_assignments_operator_role_idx" ON "access_assignments" USING btree ("operator_role_id");--> statement-breakpoint
CREATE INDEX "access_assignments_tenant_module_idx" ON "access_assignments" USING btree ("tenant_id","module","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_roles_tenant_module_name_uq" ON "operator_roles" USING btree ("tenant_id","module",lower("name")) WHERE "operator_roles"."is_active" = true;--> statement-breakpoint
CREATE INDEX "operator_roles_tenant_module_idx" ON "operator_roles" USING btree ("tenant_id","module");--> statement-breakpoint
/* Date-range exclusion constraints need btree_gist (uuid equality inside a GiST index) */
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
/* A user never holds the same operator role twice on the same day ('[]': both ends inclusive; null = open) */
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_operator_no_overlap"
  EXCLUDE USING gist ("operator_role_id" WITH =, "user_id" WITH =, daterange("valid_from", "valid_to", '[]') WITH &&)
  WHERE ("is_active" AND "revoked_at" IS NULL AND "kind" = 'OPERATOR');
