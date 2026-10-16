CREATE TABLE "attendance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edit_window_days" integer DEFAULT 2 NOT NULL,
	"override_roles" text[] DEFAULT '{ADMIN}'::text[] NOT NULL,
	CONSTRAINT "attendance_policies_window_chk" CHECK ("attendance_policies"."edit_window_days" BETWEEN 0 AND 365),
	CONSTRAINT "attendance_policies_roles_chk" CHECK ("attendance_policies"."override_roles" <@ ARRAY['ADMIN','PRINCIPAL']::text[] AND cardinality("attendance_policies"."override_roles") > 0)
);
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "lock_override_reason" text;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "lock_overridden_by" uuid;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "lock_overridden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_policies_tenant_uq" ON "attendance_policies" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_lock_overridden_by_users_id_fk" FOREIGN KEY ("lock_overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;