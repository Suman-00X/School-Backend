CREATE TYPE "public"."library_item_type" AS ENUM('BOOK', 'REFERENCE', 'PERIODICAL', 'MEDIA');--> statement-breakpoint
CREATE TYPE "public"."library_hold_status" AS ENUM('WAITING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."library_scan_result" AS ENUM('FOUND', 'UNEXPECTED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."library_stock_check_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."library_copy_status" ADD VALUE 'ON_HOLD' BEFORE 'LOST';--> statement-breakpoint
ALTER TYPE "public"."library_copy_status" ADD VALUE 'MISSING';--> statement-breakpoint
ALTER TYPE "public"."library_fine_payment_method" ADD VALUE 'LIBRARY_CREDIT';--> statement-breakpoint
CREATE TABLE "library_circulation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"borrower_role" "user_role",
	"class_id" uuid,
	"item_type" "library_item_type",
	"loan_days" integer NOT NULL,
	"max_loans" integer NOT NULL,
	"max_renewals" integer NOT NULL,
	"fine_per_day" numeric(12, 2) NOT NULL,
	"fine_grace_days" integer DEFAULT 0 NOT NULL,
	"max_fine" numeric(12, 2),
	CONSTRAINT "library_circulation_rules_class_chk" CHECK ("library_circulation_rules"."class_id" IS NULL OR "library_circulation_rules"."borrower_role" = 'STUDENT'),
	CONSTRAINT "library_circulation_rules_type_chk" CHECK ("library_circulation_rules"."item_type" IS NULL OR "library_circulation_rules"."item_type" <> 'REFERENCE'),
	CONSTRAINT "library_circulation_rules_terms_chk" CHECK ("library_circulation_rules"."loan_days" BETWEEN 1 AND 365 AND "library_circulation_rules"."max_loans" >= 0 AND "library_circulation_rules"."max_renewals" >= 0 AND "library_circulation_rules"."fine_per_day" >= 0 AND "library_circulation_rules"."fine_grace_days" >= 0 AND ("library_circulation_rules"."max_fine" IS NULL OR "library_circulation_rules"."max_fine" >= 0))
);
--> statement-breakpoint
CREATE TABLE "library_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"book_id" uuid NOT NULL,
	"borrower_user_id" uuid NOT NULL,
	"status" "library_hold_status" DEFAULT 'WAITING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"not_needed_after" date,
	"copy_id" uuid,
	"ready_on" date,
	"pickup_by" date,
	"fulfilled_loan_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"placed_by" uuid,
	"closed_by" uuid,
	CONSTRAINT "library_holds_ready_chk" CHECK (("library_holds"."status" <> 'WAITING' OR ("library_holds"."copy_id" IS NULL AND "library_holds"."ready_on" IS NULL AND "library_holds"."pickup_by" IS NULL)) AND ("library_holds"."status" <> 'READY' OR ("library_holds"."copy_id" IS NOT NULL AND "library_holds"."ready_on" IS NOT NULL AND "library_holds"."pickup_by" IS NOT NULL))),
	CONSTRAINT "library_holds_fulfilled_chk" CHECK (("library_holds"."status" = 'FULFILLED') = ("library_holds"."fulfilled_loan_id" IS NOT NULL)),
	CONSTRAINT "library_holds_pickup_chk" CHECK ("library_holds"."pickup_by" IS NULL OR "library_holds"."pickup_by" >= "library_holds"."ready_on")
);
--> statement-breakpoint
CREATE TABLE "library_credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"borrower_user_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"loan_id" uuid,
	"payment_id" uuid,
	"created_by" uuid,
	CONSTRAINT "library_credit_entries_amount_chk" CHECK ("library_credit_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "library_fine_waivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"waived_by" uuid,
	"waived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_fine_waivers_amount_chk" CHECK ("library_fine_waivers"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "library_stock_check_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stock_check_id" uuid NOT NULL,
	"code" text NOT NULL,
	"copy_id" uuid,
	"result" "library_scan_result" NOT NULL,
	"copy_status" "library_copy_status",
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scanned_by" uuid,
	CONSTRAINT "library_stock_check_scans_copy_chk" CHECK (("library_stock_check_scans"."result" = 'UNKNOWN') = ("library_stock_check_scans"."copy_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "library_stock_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"status" "library_stock_check_status" DEFAULT 'OPEN' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_on" date NOT NULL,
	"closed_on" date,
	"started_by" uuid,
	"closed_by" uuid,
	"expected_count" integer,
	"found_count" integer,
	"missing_count" integer,
	"unexpected_count" integer,
	"notes" text,
	CONSTRAINT "library_stock_checks_closed_chk" CHECK (("library_stock_checks"."status" = 'CLOSED') = ("library_stock_checks"."closed_on" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "library_loans" DROP CONSTRAINT "library_loans_dates_chk";--> statement-breakpoint
ALTER TABLE "library_loans" DROP CONSTRAINT "library_loans_renewals_chk";--> statement-breakpoint
ALTER TABLE "library_loans" DROP CONSTRAINT "library_loans_fine_chk";--> statement-breakpoint
ALTER TABLE "library_policies" DROP CONSTRAINT "library_policies_loan_days_chk";--> statement-breakpoint
ALTER TABLE "library_policies" DROP CONSTRAINT "library_policies_limits_chk";--> statement-breakpoint
ALTER TABLE "library_policies" DROP CONSTRAINT "library_policies_fine_chk";--> statement-breakpoint
ALTER TABLE "library_loans" DROP CONSTRAINT "library_loans_waived_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN "item_type" "library_item_type" DEFAULT 'BOOK' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_books" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "library_copies" ADD COLUMN "item_type" "library_item_type";--> statement-breakpoint
ALTER TABLE "library_copies" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "item_type" "library_item_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "rule_id" uuid;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "loan_days" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "max_renewals" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "fine_per_day" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "fine_grace_days" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "fine_cap" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "lost_on" date;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "found_on" date;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "damage_charge" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "lost_charge_reversed" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "fine_credited" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_loans" drop column "fine_outstanding";--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "fine_outstanding" numeric(12, 2) GENERATED ALWAYS AS (late_fine + lost_charge + damage_charge - fine_paid - fine_waived + fine_credited) STORED;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "backdate_reason" text;--> statement-breakpoint
ALTER TABLE "library_loans" ADD COLUMN "block_override_reason" text;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "fine_block_threshold" numeric(12, 2) DEFAULT 100;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "block_on_overdue" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "skip_closed_days_in_fines" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "cap_fine_at_price" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "lost_processing_fee" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "lost_minimum_charge" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "lost_includes_late_fine" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "lost_found_refund_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "hold_pickup_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "max_holds_per_borrower" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "due_soon_days" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "overdue_reminder_every_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "library_policies" ADD COLUMN "notify_parents" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_circulation_rules" ADD CONSTRAINT "library_circulation_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_circulation_rules" ADD CONSTRAINT "library_circulation_rules_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_borrower_user_id_users_id_fk" FOREIGN KEY ("borrower_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_copy_id_library_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."library_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_fulfilled_loan_id_library_loans_id_fk" FOREIGN KEY ("fulfilled_loan_id") REFERENCES "public"."library_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_placed_by_users_id_fk" FOREIGN KEY ("placed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_holds" ADD CONSTRAINT "library_holds_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_credit_entries" ADD CONSTRAINT "library_credit_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_credit_entries" ADD CONSTRAINT "library_credit_entries_borrower_user_id_users_id_fk" FOREIGN KEY ("borrower_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_credit_entries" ADD CONSTRAINT "library_credit_entries_loan_id_library_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."library_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_credit_entries" ADD CONSTRAINT "library_credit_entries_payment_id_library_fine_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."library_fine_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_credit_entries" ADD CONSTRAINT "library_credit_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_waivers" ADD CONSTRAINT "library_fine_waivers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_waivers" ADD CONSTRAINT "library_fine_waivers_loan_id_library_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."library_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_waivers" ADD CONSTRAINT "library_fine_waivers_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_check_scans" ADD CONSTRAINT "library_stock_check_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_check_scans" ADD CONSTRAINT "library_stock_check_scans_stock_check_id_library_stock_checks_id_fk" FOREIGN KEY ("stock_check_id") REFERENCES "public"."library_stock_checks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_check_scans" ADD CONSTRAINT "library_stock_check_scans_copy_id_library_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."library_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_check_scans" ADD CONSTRAINT "library_stock_check_scans_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_checks" ADD CONSTRAINT "library_stock_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_checks" ADD CONSTRAINT "library_stock_checks_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_stock_checks" ADD CONSTRAINT "library_stock_checks_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_circulation_rules_role_type_uq" ON "library_circulation_rules" USING btree ("tenant_id","borrower_role",coalesce("class_id"::text, ''),"item_type") WHERE "library_circulation_rules"."is_active" = true AND "library_circulation_rules"."borrower_role" IS NOT NULL AND "library_circulation_rules"."item_type" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "library_circulation_rules_role_uq" ON "library_circulation_rules" USING btree ("tenant_id","borrower_role",coalesce("class_id"::text, '')) WHERE "library_circulation_rules"."is_active" = true AND "library_circulation_rules"."borrower_role" IS NOT NULL AND "library_circulation_rules"."item_type" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "library_circulation_rules_type_uq" ON "library_circulation_rules" USING btree ("tenant_id","item_type") WHERE "library_circulation_rules"."is_active" = true AND "library_circulation_rules"."borrower_role" IS NULL AND "library_circulation_rules"."item_type" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "library_circulation_rules_any_uq" ON "library_circulation_rules" USING btree ("tenant_id") WHERE "library_circulation_rules"."is_active" = true AND "library_circulation_rules"."borrower_role" IS NULL AND "library_circulation_rules"."item_type" IS NULL;--> statement-breakpoint
CREATE INDEX "library_circulation_rules_class_idx" ON "library_circulation_rules" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_holds_open_borrower_uq" ON "library_holds" USING btree ("tenant_id","book_id","borrower_user_id") WHERE "library_holds"."status" IN ('WAITING', 'READY') AND "library_holds"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "library_holds_ready_copy_uq" ON "library_holds" USING btree ("copy_id") WHERE "library_holds"."status" = 'READY' AND "library_holds"."is_active" = true;--> statement-breakpoint
CREATE INDEX "library_holds_queue_idx" ON "library_holds" USING btree ("tenant_id","book_id","status","requested_at");--> statement-breakpoint
CREATE INDEX "library_holds_borrower_idx" ON "library_holds" USING btree ("tenant_id","borrower_user_id","status");--> statement-breakpoint
CREATE INDEX "library_credit_entries_borrower_idx" ON "library_credit_entries" USING btree ("tenant_id","borrower_user_id");--> statement-breakpoint
CREATE INDEX "library_fine_waivers_loan_idx" ON "library_fine_waivers" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_stock_check_scans_copy_uq" ON "library_stock_check_scans" USING btree ("stock_check_id","copy_id") WHERE "library_stock_check_scans"."copy_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "library_stock_check_scans_unknown_uq" ON "library_stock_check_scans" USING btree ("stock_check_id","code") WHERE "library_stock_check_scans"."copy_id" IS NULL;--> statement-breakpoint
CREATE INDEX "library_stock_check_scans_check_idx" ON "library_stock_check_scans" USING btree ("stock_check_id","result");--> statement-breakpoint
CREATE UNIQUE INDEX "library_stock_checks_open_uq" ON "library_stock_checks" USING btree ("tenant_id") WHERE "library_stock_checks"."is_active" = true AND "library_stock_checks"."status" = 'OPEN';--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_rule_id_library_circulation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."library_circulation_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_copies_acquired_idx" ON "library_copies" USING btree ("tenant_id","acquired_on");--> statement-breakpoint
CREATE INDEX "library_fine_payments_paid_idx" ON "library_fine_payments" USING btree ("tenant_id","paid_at");--> statement-breakpoint
CREATE INDEX "library_loans_copy_idx" ON "library_loans" USING btree ("copy_id");--> statement-breakpoint
ALTER TABLE "library_loans" DROP COLUMN "waiver_reason";--> statement-breakpoint
ALTER TABLE "library_loans" DROP COLUMN "waived_by";--> statement-breakpoint
ALTER TABLE "library_loans" DROP COLUMN "waived_at";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "student_loan_days";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "staff_loan_days";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "max_active_loans_student";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "max_active_loans_staff";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "max_renewals";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "fine_per_day";--> statement-breakpoint
ALTER TABLE "library_policies" DROP COLUMN "fine_grace_days";--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_lost_chk" CHECK (("library_loans"."status" = 'LOST') <= ("library_loans"."lost_on" IS NOT NULL) AND ("library_loans"."lost_on" IS NULL OR "library_loans"."status" <> 'ISSUED') AND ("library_loans"."found_on" IS NULL OR ("library_loans"."lost_on" IS NOT NULL AND "library_loans"."status" = 'RETURNED' AND "library_loans"."found_on" >= "library_loans"."lost_on")));--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_terms_chk" CHECK ("library_loans"."fine_per_day" >= 0 AND "library_loans"."fine_grace_days" >= 0 AND ("library_loans"."fine_cap" IS NULL OR "library_loans"."fine_cap" >= 0));--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_dates_chk" CHECK ("library_loans"."due_date" >= "library_loans"."issued_on" AND ("library_loans"."returned_on" IS NULL OR "library_loans"."returned_on" >= "library_loans"."issued_on"));--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_renewals_chk" CHECK ("library_loans"."renewal_count" >= 0 AND "library_loans"."max_renewals" >= 0 AND "library_loans"."loan_days" > 0);--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_fine_chk" CHECK ("library_loans"."late_fine" >= 0 AND "library_loans"."lost_charge" >= 0 AND "library_loans"."damage_charge" >= 0 AND "library_loans"."lost_charge_reversed" >= 0 AND "library_loans"."fine_paid" >= 0 AND "library_loans"."fine_waived" >= 0 AND "library_loans"."fine_credited" >= 0 AND "library_loans"."fine_credited" <= "library_loans"."fine_paid" AND "library_loans"."fine_paid" - "library_loans"."fine_credited" + "library_loans"."fine_waived" <= "library_loans"."late_fine" + "library_loans"."lost_charge" + "library_loans"."damage_charge");--> statement-breakpoint
ALTER TABLE "library_policies" ADD CONSTRAINT "library_policies_money_chk" CHECK (("library_policies"."fine_block_threshold" IS NULL OR "library_policies"."fine_block_threshold" >= 0) AND "library_policies"."lost_processing_fee" >= 0 AND "library_policies"."lost_minimum_charge" >= 0);--> statement-breakpoint
ALTER TABLE "library_policies" ADD CONSTRAINT "library_policies_days_chk" CHECK ("library_policies"."lost_found_refund_days" >= 0 AND "library_policies"."hold_pickup_days" >= 1 AND "library_policies"."max_holds_per_borrower" >= 0 AND "library_policies"."due_soon_days" >= 0 AND "library_policies"."overdue_reminder_every_days" >= 1);