CREATE TYPE "public"."library_copy_status" AS ENUM('AVAILABLE', 'ISSUED', 'LOST', 'DAMAGED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."library_fine_payment_method" AS ENUM('CASH', 'UPI', 'CARD');--> statement-breakpoint
CREATE TYPE "public"."library_loan_status" AS ENUM('ISSUED', 'RETURNED', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."library_return_condition" AS ENUM('OK', 'DAMAGED', 'LOST');--> statement-breakpoint
CREATE TABLE "library_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"authors" text[] DEFAULT '{}'::text[] NOT NULL,
	"isbn" text,
	"publisher" text,
	"published_year" integer,
	"edition" text,
	"language" text,
	"category" text,
	"subject_id" uuid,
	"shelf_location" text,
	"description" text,
	CONSTRAINT "library_books_year_chk" CHECK ("library_books"."published_year" IS NULL OR "library_books"."published_year" BETWEEN 1000 AND 9999),
	CONSTRAINT "library_books_isbn_chk" CHECK ("library_books"."isbn" IS NULL OR "library_books"."isbn" ~ '^([0-9]{9}[0-9X]|[0-9]{13})$')
);
--> statement-breakpoint
CREATE TABLE "library_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"book_id" uuid NOT NULL,
	"accession_number" text NOT NULL,
	"barcode" text,
	"status" "library_copy_status" DEFAULT 'AVAILABLE' NOT NULL,
	"price" numeric(12, 2),
	"acquired_on" date,
	"condition_notes" text,
	CONSTRAINT "library_copies_price_chk" CHECK ("library_copies"."price" IS NULL OR "library_copies"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "library_fine_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"loan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "library_fine_payment_method" NOT NULL,
	"receipt_number" text NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference" text,
	"received_by" uuid,
	CONSTRAINT "library_fine_payments_amount_chk" CHECK ("library_fine_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "library_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"copy_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"borrower_user_id" uuid NOT NULL,
	"borrower_role" "user_role" NOT NULL,
	"issued_on" date NOT NULL,
	"due_date" date NOT NULL,
	"returned_on" date,
	"status" "library_loan_status" DEFAULT 'ISSUED' NOT NULL,
	"return_condition" "library_return_condition",
	"return_notes" text,
	"renewal_count" integer DEFAULT 0 NOT NULL,
	"late_fine" numeric(12, 2) DEFAULT 0 NOT NULL,
	"lost_charge" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fine_paid" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fine_waived" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fine_outstanding" numeric(12, 2) GENERATED ALWAYS AS (late_fine + lost_charge - fine_paid - fine_waived) STORED,
	"waiver_reason" text,
	"waived_by" uuid,
	"waived_at" timestamp with time zone,
	"issued_by" uuid,
	"returned_to" uuid,
	CONSTRAINT "library_loans_open_chk" CHECK (("library_loans"."status" = 'ISSUED') = ("library_loans"."returned_on" IS NULL)),
	CONSTRAINT "library_loans_dates_chk" CHECK ("library_loans"."returned_on" IS NULL OR "library_loans"."returned_on" >= "library_loans"."issued_on"),
	CONSTRAINT "library_loans_renewals_chk" CHECK ("library_loans"."renewal_count" >= 0),
	CONSTRAINT "library_loans_fine_chk" CHECK ("library_loans"."late_fine" >= 0 AND "library_loans"."lost_charge" >= 0 AND "library_loans"."fine_paid" >= 0 AND "library_loans"."fine_waived" >= 0 AND "library_loans"."fine_paid" + "library_loans"."fine_waived" <= "library_loans"."late_fine" + "library_loans"."lost_charge")
);
--> statement-breakpoint
CREATE TABLE "library_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"student_loan_days" integer DEFAULT 14 NOT NULL,
	"staff_loan_days" integer DEFAULT 30 NOT NULL,
	"max_active_loans_student" integer DEFAULT 3 NOT NULL,
	"max_active_loans_staff" integer DEFAULT 10 NOT NULL,
	"max_renewals" integer DEFAULT 2 NOT NULL,
	"fine_per_day" numeric(12, 2) DEFAULT 2 NOT NULL,
	"fine_grace_days" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "library_policies_loan_days_chk" CHECK ("library_policies"."student_loan_days" > 0 AND "library_policies"."staff_loan_days" > 0),
	CONSTRAINT "library_policies_limits_chk" CHECK ("library_policies"."max_active_loans_student" >= 0 AND "library_policies"."max_active_loans_staff" >= 0 AND "library_policies"."max_renewals" >= 0),
	CONSTRAINT "library_policies_fine_chk" CHECK ("library_policies"."fine_per_day" >= 0 AND "library_policies"."fine_grace_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_copies" ADD CONSTRAINT "library_copies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_copies" ADD CONSTRAINT "library_copies_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_loan_id_library_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."library_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_fine_payments" ADD CONSTRAINT "library_fine_payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_copy_id_library_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."library_copies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_book_id_library_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."library_books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_borrower_user_id_users_id_fk" FOREIGN KEY ("borrower_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_waived_by_users_id_fk" FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_loans" ADD CONSTRAINT "library_loans_returned_to_users_id_fk" FOREIGN KEY ("returned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_policies" ADD CONSTRAINT "library_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_books_tenant_isbn_uq" ON "library_books" USING btree ("tenant_id","isbn") WHERE "library_books"."is_active" = true AND "library_books"."isbn" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "library_books_tenant_title_idx" ON "library_books" USING btree ("tenant_id","title");--> statement-breakpoint
CREATE INDEX "library_books_tenant_category_idx" ON "library_books" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "library_books_subject_idx" ON "library_books" USING btree ("subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_copies_tenant_accession_uq" ON "library_copies" USING btree ("tenant_id","accession_number");--> statement-breakpoint
CREATE UNIQUE INDEX "library_copies_tenant_barcode_uq" ON "library_copies" USING btree ("tenant_id","barcode") WHERE "library_copies"."is_active" = true AND "library_copies"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "library_copies_book_idx" ON "library_copies" USING btree ("book_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "library_fine_payments_receipt_uq" ON "library_fine_payments" USING btree ("tenant_id","receipt_number");--> statement-breakpoint
CREATE INDEX "library_fine_payments_loan_idx" ON "library_fine_payments" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_loans_open_copy_uq" ON "library_loans" USING btree ("copy_id") WHERE "library_loans"."status" = 'ISSUED' AND "library_loans"."is_active" = true;--> statement-breakpoint
CREATE INDEX "library_loans_borrower_idx" ON "library_loans" USING btree ("tenant_id","borrower_user_id","status");--> statement-breakpoint
CREATE INDEX "library_loans_due_idx" ON "library_loans" USING btree ("tenant_id","status","due_date");--> statement-breakpoint
CREATE INDEX "library_loans_book_idx" ON "library_loans" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "library_policies_tenant_uq" ON "library_policies" USING btree ("tenant_id");