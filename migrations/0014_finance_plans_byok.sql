CREATE TYPE "public"."concession_category" AS ENUM('SIBLING', 'STAFF_WARD', 'MERIT', 'SCHOLARSHIP', 'FINANCIAL_AID', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."credit_entry_type" AS ENUM('OVERPAYMENT', 'APPLIED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."late_fee_charge_type" AS ENUM('FIXED', 'PER_DAY');--> statement-breakpoint
CREATE TABLE "concession_fee_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concession_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_credit_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid NOT NULL,
	"balance" numeric(12, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "student_credit_balances_chk" CHECK ("student_credit_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "student_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid NOT NULL,
	"entry_type" "credit_entry_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_id" uuid,
	"invoice_id" uuid,
	"method" text,
	"reference" text,
	"notes" text,
	"created_by" uuid,
	CONSTRAINT "student_credit_entries_chk" CHECK ("student_credit_entries"."amount" > 0 AND ("student_credit_entries"."entry_type" <> 'OVERPAYMENT' OR "student_credit_entries"."payment_id" IS NOT NULL) AND ("student_credit_entries"."entry_type" <> 'APPLIED' OR "student_credit_entries"."invoice_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "fee_structure_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"installment_plan_id" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "plan_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"installment_plan_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"name" text NOT NULL,
	"due_date" date NOT NULL,
	"share_percent" numeric(5, 2) NOT NULL,
	CONSTRAINT "plan_installments_share_chk" CHECK ("plan_installments"."share_percent" > 0 AND "plan_installments"."share_percent" <= 100 AND "plan_installments"."sequence" >= 1)
);
--> statement-breakpoint
CREATE TABLE "student_installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"installment_plan_id" uuid,
	"assigned_by" uuid
);
--> statement-breakpoint
CREATE TABLE "invoice_line_concessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"invoice_line_id" uuid NOT NULL,
	"concession_id" uuid NOT NULL,
	"student_concession_id" uuid,
	"name" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "invoice_line_concessions_amount_chk" CHECK ("invoice_line_concessions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "late_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"grace_days" integer DEFAULT 0 NOT NULL,
	"max_amount" numeric(12, 2),
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "late_fee_rules_chk" CHECK ("late_fee_rules"."grace_days" BETWEEN 0 AND 365 AND ("late_fee_rules"."max_amount" IS NULL OR "late_fee_rules"."max_amount" > 0))
);
--> statement-breakpoint
CREATE TABLE "late_fee_slabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"late_fee_rule_id" uuid NOT NULL,
	"from_day" integer NOT NULL,
	"to_day" integer,
	"charge_type" "late_fee_charge_type" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "late_fee_slabs_chk" CHECK ("late_fee_slabs"."from_day" >= 1 AND ("late_fee_slabs"."to_day" IS NULL OR "late_fee_slabs"."to_day" >= "late_fee_slabs"."from_day") AND "late_fee_slabs"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text DEFAULT 'razorpay' NOT NULL,
	"key_id" text NOT NULL,
	"key_secret" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"configured_by" uuid,
	"verified_at" timestamp with time zone,
	CONSTRAINT "payment_gateway_accounts_provider_chk" CHECK ("payment_gateway_accounts"."provider" IN ('razorpay'))
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_fee_installment_id_fee_installments_id_fk";--> statement-breakpoint
ALTER TABLE "fee_installments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "fee_installments" CASCADE;--> statement-breakpoint
ALTER TABLE "fee_structures" DROP CONSTRAINT "fee_structures_late_fee_chk";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amounts_chk";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_amount_chk";--> statement-breakpoint
ALTER TABLE "concessions" DROP CONSTRAINT "concessions_fee_head_id_fee_heads_id_fk";
--> statement-breakpoint
DROP INDEX "invoices_student_installment_uq";--> statement-breakpoint
DROP INDEX "payments_gateway_order_uq";--> statement-breakpoint
DROP INDEX "payments_gateway_payment_uq";--> statement-breakpoint
ALTER TABLE "concessions" ADD COLUMN "category" "concession_category" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN "charges_late_fee" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD COLUMN "late_fee_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "installment_plan_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "plan_installment_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_waived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_waived_by" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_waived_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "late_fee_waiver_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "excess_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "balance_after" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "concession_fee_heads" ADD CONSTRAINT "concession_fee_heads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concession_fee_heads" ADD CONSTRAINT "concession_fee_heads_concession_id_concessions_id_fk" FOREIGN KEY ("concession_id") REFERENCES "public"."concessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concession_fee_heads" ADD CONSTRAINT "concession_fee_heads_fee_head_id_fee_heads_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_balances" ADD CONSTRAINT "student_credit_balances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_balances" ADD CONSTRAINT "student_credit_balances_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_entries" ADD CONSTRAINT "student_credit_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_entries" ADD CONSTRAINT "student_credit_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_entries" ADD CONSTRAINT "student_credit_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_entries" ADD CONSTRAINT "student_credit_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_credit_entries" ADD CONSTRAINT "student_credit_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_plans" ADD CONSTRAINT "fee_structure_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_plans" ADD CONSTRAINT "fee_structure_plans_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_plans" ADD CONSTRAINT "fee_structure_plans_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_installments" ADD CONSTRAINT "plan_installments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_installments" ADD CONSTRAINT "plan_installments_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_installment_plans" ADD CONSTRAINT "student_installment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_installment_plans" ADD CONSTRAINT "student_installment_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_installment_plans" ADD CONSTRAINT "student_installment_plans_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_installment_plans" ADD CONSTRAINT "student_installment_plans_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_installment_plans" ADD CONSTRAINT "student_installment_plans_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_concessions" ADD CONSTRAINT "invoice_line_concessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_concessions" ADD CONSTRAINT "invoice_line_concessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_concessions" ADD CONSTRAINT "invoice_line_concessions_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_concessions" ADD CONSTRAINT "invoice_line_concessions_concession_id_concessions_id_fk" FOREIGN KEY ("concession_id") REFERENCES "public"."concessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_concessions" ADD CONSTRAINT "invoice_line_concessions_student_concession_id_student_concessions_id_fk" FOREIGN KEY ("student_concession_id") REFERENCES "public"."student_concessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_rules" ADD CONSTRAINT "late_fee_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_slabs" ADD CONSTRAINT "late_fee_slabs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_fee_slabs" ADD CONSTRAINT "late_fee_slabs_late_fee_rule_id_late_fee_rules_id_fk" FOREIGN KEY ("late_fee_rule_id") REFERENCES "public"."late_fee_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD CONSTRAINT "payment_gateway_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_gateway_accounts" ADD CONSTRAINT "payment_gateway_accounts_configured_by_users_id_fk" FOREIGN KEY ("configured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concession_fee_heads_uq" ON "concession_fee_heads" USING btree ("concession_id","fee_head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_credit_balances_student_uq" ON "student_credit_balances" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX "student_credit_entries_student_idx" ON "student_credit_entries" USING btree ("tenant_id","student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_plans_plan_uq" ON "fee_structure_plans" USING btree ("fee_structure_id","installment_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_plans_default_uq" ON "fee_structure_plans" USING btree ("fee_structure_id") WHERE "fee_structure_plans"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "installment_plans_year_name_uq" ON "installment_plans" USING btree ("tenant_id","academic_year_id","name") WHERE "installment_plans"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_installments_sequence_uq" ON "plan_installments" USING btree ("installment_plan_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_installments_name_uq" ON "plan_installments" USING btree ("installment_plan_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_installment_plans_student_year_uq" ON "student_installment_plans" USING btree ("tenant_id","student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "invoice_line_concessions_invoice_idx" ON "invoice_line_concessions" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "late_fee_rules_name_uq" ON "late_fee_rules" USING btree ("tenant_id","name") WHERE "late_fee_rules"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "late_fee_rules_default_uq" ON "late_fee_rules" USING btree ("tenant_id") WHERE "late_fee_rules"."is_default" = true AND "late_fee_rules"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "late_fee_slabs_rule_from_uq" ON "late_fee_slabs" USING btree ("late_fee_rule_id","from_day");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_gateway_accounts_tenant_uq" ON "payment_gateway_accounts" USING btree ("tenant_id") WHERE "payment_gateway_accounts"."is_active" = true;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_late_fee_rule_id_late_fee_rules_id_fk" FOREIGN KEY ("late_fee_rule_id") REFERENCES "public"."late_fee_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_installment_plan_id_installment_plans_id_fk" FOREIGN KEY ("installment_plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_installment_id_plan_installments_id_fk" FOREIGN KEY ("plan_installment_id") REFERENCES "public"."plan_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_late_fee_waived_by_users_id_fk" FOREIGN KEY ("late_fee_waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_student_installment_uq" ON "invoices" USING btree ("student_id","fee_structure_id","plan_installment_id") WHERE "invoices"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_order_uq" ON "payments" USING btree ("tenant_id","gateway_provider","gateway_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_payment_uq" ON "payments" USING btree ("tenant_id","gateway_provider","gateway_payment_id");--> statement-breakpoint
ALTER TABLE "concessions" DROP COLUMN "fee_head_id";--> statement-breakpoint
ALTER TABLE "fee_structures" DROP COLUMN "late_fee_type";--> statement-breakpoint
ALTER TABLE "fee_structures" DROP COLUMN "late_fee_amount";--> statement-breakpoint
ALTER TABLE "fee_structures" DROP COLUMN "late_fee_grace_days";--> statement-breakpoint
ALTER TABLE "fee_structures" DROP COLUMN "late_fee_cap";--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "fee_installment_id";--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_late_fee_chk" CHECK ("fee_structures"."charges_late_fee" OR "fee_structures"."late_fee_rule_id" IS NULL);--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts_chk" CHECK ("invoice_lines"."discount" >= 0 AND "invoice_lines"."discount" <= "invoice_lines"."amount" AND "invoice_lines"."net_amount" = "invoice_lines"."amount" - "invoice_lines"."discount");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_chk" CHECK ("invoices"."total" = "invoices"."subtotal" - "invoices"."discount" + "invoices"."late_fee");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_chk" CHECK ("invoices"."amount_paid" <= "invoices"."total");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_chk" CHECK ("invoices"."subtotal" >= 0 AND "invoices"."discount" >= 0 AND "invoices"."discount" <= "invoices"."subtotal" AND "invoices"."late_fee" >= 0 AND "invoices"."amount_paid" >= 0 AND "invoices"."late_fee_waived_amount" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount" > 0 AND "payments"."excess_amount" >= 0 AND "payments"."excess_amount" <= "payments"."amount");--> statement-breakpoint
DROP TYPE "public"."late_fee_type";