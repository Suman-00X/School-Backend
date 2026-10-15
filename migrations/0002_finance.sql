CREATE TYPE "public"."concession_type" AS ENUM('PERCENT', 'FIXED');--> statement-breakpoint
CREATE TYPE "public"."late_fee_type" AS ENUM('NONE', 'FIXED', 'PER_DAY');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CHEQUE', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "concessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"concession_type" "concession_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"fee_head_id" uuid,
	"description" text,
	CONSTRAINT "concessions_value_chk" CHECK ("concessions"."value" > 0 AND ("concessions"."concession_type" <> 'PERCENT' OR "concessions"."value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "student_concessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_id" uuid NOT NULL,
	"concession_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"reason" text,
	"granted_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "fee_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"name" text NOT NULL,
	"due_date" date NOT NULL,
	"share_percent" numeric(5, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "fee_installments_share_chk" CHECK ("fee_installments"."share_percent" > 0 AND "fee_installments"."share_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "fee_structure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	CONSTRAINT "fee_structure_items_amount_chk" CHECK ("fee_structure_items"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"late_fee_type" "late_fee_type" DEFAULT 'NONE' NOT NULL,
	"late_fee_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"late_fee_grace_days" integer DEFAULT 0 NOT NULL,
	"late_fee_cap" numeric(12, 2),
	CONSTRAINT "fee_structures_late_fee_chk" CHECK ("fee_structures"."late_fee_amount" >= 0 AND "fee_structures"."late_fee_grace_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"net_amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_number" text NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"fee_structure_id" uuid NOT NULL,
	"fee_installment_id" uuid NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"late_fee" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT 0 NOT NULL,
	"balance" numeric(12, 2) GENERATED ALWAYS AS (total - amount_paid) STORED,
	"status" "invoice_status" DEFAULT 'ISSUED' NOT NULL,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "invoices_amounts_chk" CHECK ("invoices"."subtotal" >= 0 AND "invoices"."discount" >= 0 AND "invoices"."late_fee" >= 0 AND "invoices"."total" >= 0 AND "invoices"."amount_paid" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"receipt_number" text,
	"paid_at" timestamp with time zone,
	"reference" text,
	"gateway_provider" text,
	"gateway_order_id" text,
	"gateway_payment_id" text,
	"received_by" uuid,
	"notes" text,
	CONSTRAINT "payments_amount_chk" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_fee_head_id_fee_heads_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concessions" ADD CONSTRAINT "student_concessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concessions" ADD CONSTRAINT "student_concessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concessions" ADD CONSTRAINT "student_concessions_concession_id_concessions_id_fk" FOREIGN KEY ("concession_id") REFERENCES "public"."concessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concessions" ADD CONSTRAINT "student_concessions_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_concessions" ADD CONSTRAINT "student_concessions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_installments" ADD CONSTRAINT "fee_installments_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_fee_head_id_fee_heads_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_fee_head_id_fee_heads_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fee_structure_id_fee_structures_id_fk" FOREIGN KEY ("fee_structure_id") REFERENCES "public"."fee_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fee_installment_id_fee_installments_id_fk" FOREIGN KEY ("fee_installment_id") REFERENCES "public"."fee_installments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "concessions_tenant_name_uq" ON "concessions" USING btree ("tenant_id","name") WHERE "concessions"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "student_concessions_active_uq" ON "student_concessions" USING btree ("student_id","concession_id","academic_year_id") WHERE "student_concessions"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_heads_tenant_code_uq" ON "fee_heads" USING btree ("tenant_id","code") WHERE "fee_heads"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_heads_tenant_name_uq" ON "fee_heads" USING btree ("tenant_id","name") WHERE "fee_heads"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_installments_structure_name_uq" ON "fee_installments" USING btree ("fee_structure_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structure_items_head_uq" ON "fee_structure_items" USING btree ("fee_structure_id","fee_head_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_year_class_name_uq" ON "fee_structures" USING btree ("academic_year_id","class_id","name") WHERE "fee_structures"."is_active" = true;--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_number_uq" ON "invoices" USING btree ("tenant_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_student_installment_uq" ON "invoices" USING btree ("student_id","fee_installment_id") WHERE "invoices"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE INDEX "invoices_student_idx" ON "invoices" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "invoices_due_idx" ON "invoices" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tenant_receipt_uq" ON "payments" USING btree ("tenant_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_order_uq" ON "payments" USING btree ("gateway_provider","gateway_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_payment_uq" ON "payments" USING btree ("gateway_provider","gateway_payment_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("tenant_id","status","paid_at");