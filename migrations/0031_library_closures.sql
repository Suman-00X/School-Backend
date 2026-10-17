CREATE TABLE "library_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	CONSTRAINT "library_closures_dates_chk" CHECK ("library_closures"."to_date" >= "library_closures"."from_date")
);
--> statement-breakpoint
ALTER TABLE "library_policies" ALTER COLUMN "fine_block_threshold" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "block_on_fines" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_closures" ADD CONSTRAINT "library_closures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_closures" ADD CONSTRAINT "library_closures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_closures_dates_idx" ON "library_closures" USING btree ("tenant_id","from_date","to_date");