CREATE TYPE "public"."refund_method" AS ENUM('ORIGINAL', 'CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."refund_source" AS ENUM('STAFF', 'GATEWAY');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'PROCESSED', 'FAILED');--> statement-breakpoint
ALTER TYPE "public"."credit_entry_type" ADD VALUE 'REFUND_REVERSED';--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"refund_number" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"from_invoice" numeric(12, 2) DEFAULT 0 NOT NULL,
	"from_credit" numeric(12, 2) DEFAULT 0 NOT NULL,
	"unallocated" numeric(12, 2) DEFAULT 0 NOT NULL,
	"method" "refund_method" NOT NULL,
	"status" "refund_status" NOT NULL,
	"source" "refund_source" NOT NULL,
	"reason" text,
	"reference" text,
	"gateway_provider" text,
	"gateway_refund_id" text,
	"requested_by" uuid,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "payment_refunds_amount_chk" CHECK ("payment_refunds"."amount" > 0 AND "payment_refunds"."from_invoice" >= 0 AND "payment_refunds"."from_credit" >= 0 AND "payment_refunds"."unallocated" >= 0
        AND "payment_refunds"."amount" = "payment_refunds"."from_invoice" + "payment_refunds"."from_credit" + "payment_refunds"."unallocated"),
	CONSTRAINT "payment_refunds_gateway_chk" CHECK ("payment_refunds"."method" <> 'ORIGINAL' OR "payment_refunds"."gateway_refund_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_tenant_number_uq" ON "payment_refunds" USING btree ("tenant_id","refund_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_gateway_uq" ON "payment_refunds" USING btree ("tenant_id","gateway_provider","gateway_refund_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_idx" ON "payment_refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_student_idx" ON "payment_refunds" USING btree ("tenant_id","student_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_chk" CHECK ("payments"."refunded_amount" >= 0 AND "payments"."refunded_amount" <= "payments"."amount");