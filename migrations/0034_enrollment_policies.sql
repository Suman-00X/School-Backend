CREATE TYPE "public"."roll_number_order" AS ENUM('ALPHABETICAL', 'RESULT_RANK');--> statement-breakpoint
CREATE TABLE "enrollment_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"roll_number_order" "roll_number_order" DEFAULT 'ALPHABETICAL' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_policies" ADD CONSTRAINT "enrollment_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_policies_tenant_uq" ON "enrollment_policies" USING btree ("tenant_id");