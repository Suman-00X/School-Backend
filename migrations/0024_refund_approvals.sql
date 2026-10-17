CREATE TABLE "finance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refund_approval_limit" numeric(12, 2) DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "finance_settings_refund_limit_chk" CHECK ("finance_settings"."refund_approval_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" ALTER COLUMN "payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ALTER COLUMN "invoice_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ALTER COLUMN "refund_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "auto_approved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
/* Hand-written: requests and rejected requests no longer hold a refund number, and refunds an
   administrator made alone under the old rule are kept as they were (marked as auto-approved) */
UPDATE "payment_refunds" SET "refund_number" = NULL WHERE "status"::text IN ('REQUESTED', 'REJECTED');--> statement-breakpoint
UPDATE "payment_refunds" SET "auto_approved" = true WHERE "approved_by" = "requested_by";--> statement-breakpoint
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_settings" ADD CONSTRAINT "finance_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_settings_tenant_uq" ON "finance_settings" USING btree ("tenant_id") WHERE "finance_settings"."is_active" = true;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_four_eyes_chk" CHECK ("payment_refunds"."auto_approved" OR "payment_refunds"."approved_by" IS NULL OR "payment_refunds"."requested_by" IS NULL OR "payment_refunds"."approved_by" <> "payment_refunds"."requested_by");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_auto_chk" CHECK (NOT "payment_refunds"."auto_approved" OR "payment_refunds"."source" = 'STAFF');--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_number_chk" CHECK (("payment_refunds"."refund_number" IS NULL) = ("payment_refunds"."status"::text IN ('REQUESTED', 'REJECTED')));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_credit_chk" CHECK (("payment_refunds"."payment_id" IS NULL) = ("payment_refunds"."invoice_id" IS NULL) AND ("payment_refunds"."payment_id" IS NOT NULL OR ("payment_refunds"."source" = 'STAFF' AND "payment_refunds"."method" <> 'ORIGINAL' AND "payment_refunds"."from_invoice" = 0)));