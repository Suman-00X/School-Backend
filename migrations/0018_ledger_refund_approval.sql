CREATE TYPE "public"."ledger_account_type" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');--> statement-breakpoint
ALTER TYPE "public"."refund_status" ADD VALUE 'REQUESTED' BEFORE 'PENDING';--> statement-breakpoint
ALTER TYPE "public"."refund_status" ADD VALUE 'REJECTED';--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sequence" integer NOT NULL,
	"entry_number" text NOT NULL,
	"entry_date" date NOT NULL,
	"narration" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"event" text NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"reversal_of_id" uuid,
	"posted_by" uuid,
	CONSTRAINT "journal_entries_total_chk" CHECK ("journal_entries"."total" > 0),
	CONSTRAINT "journal_entries_source_chk" CHECK ("journal_entries"."source_type" ~ '^[A-Z][A-Z_]{1,39}$' AND length("journal_entries"."event") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(12, 2) DEFAULT 0 NOT NULL,
	"credit" numeric(12, 2) DEFAULT 0 NOT NULL,
	"student_id" uuid,
	"memo" text,
	CONSTRAINT "journal_lines_amount_chk" CHECK ("journal_lines"."debit" >= 0 AND "journal_lines"."credit" >= 0 AND ("journal_lines"."debit" > 0) <> ("journal_lines"."credit" > 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"account_type" "ledger_account_type" NOT NULL,
	"is_contra" boolean DEFAULT false NOT NULL,
	"system_key" text,
	"fee_head_id" uuid,
	"description" text,
	CONSTRAINT "ledger_accounts_code_chk" CHECK ("ledger_accounts"."code" ~ '^[0-9A-Z][0-9A-Z.-]{1,19}$'),
	CONSTRAINT "ledger_accounts_fee_head_chk" CHECK ("ledger_accounts"."fee_head_id" IS NULL OR ("ledger_accounts"."system_key" = 'FEE_INCOME' AND "ledger_accounts"."account_type" = 'INCOME')),
	CONSTRAINT "ledger_accounts_system_chk" CHECK ("ledger_accounts"."system_key" IS NULL OR "ledger_accounts"."is_active")
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_gateway_chk";--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_fee_head_id_fee_heads_id_fk" FOREIGN KEY ("fee_head_id") REFERENCES "public"."fee_heads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_tenant_sequence_uq" ON "journal_entries" USING btree ("tenant_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_event_uq" ON "journal_entries" USING btree ("tenant_id","source_type","source_id","event");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_reversal_uq" ON "journal_entries" USING btree ("reversal_of_id") WHERE "journal_entries"."reversal_of_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("tenant_id","entry_date","sequence");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("tenant_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_lines_student_idx" ON "journal_lines" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_tenant_code_uq" ON "ledger_accounts" USING btree ("tenant_id","code") WHERE "ledger_accounts"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_system_key_uq" ON "ledger_accounts" USING btree ("tenant_id","system_key") WHERE "ledger_accounts"."system_key" IS NOT NULL AND "ledger_accounts"."fee_head_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_fee_head_uq" ON "ledger_accounts" USING btree ("tenant_id","fee_head_id") WHERE "ledger_accounts"."fee_head_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_approval_chk" CHECK ("payment_refunds"."source" <> 'STAFF' OR "payment_refunds"."status"::text IN ('REQUESTED', 'REJECTED') OR ("payment_refunds"."approved_by" IS NOT NULL AND "payment_refunds"."approved_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_rejection_chk" CHECK (("payment_refunds"."status"::text = 'REJECTED') = ("payment_refunds"."rejected_at" IS NOT NULL) AND ("payment_refunds"."rejected_at" IS NULL OR ("payment_refunds"."rejected_by" IS NOT NULL AND "payment_refunds"."rejection_reason" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_gateway_chk" CHECK ("payment_refunds"."method" <> 'ORIGINAL' OR "payment_refunds"."status"::text IN ('REQUESTED', 'REJECTED') OR "payment_refunds"."gateway_refund_id" IS NOT NULL);--> statement-breakpoint
/* The journal is immutable: corrections are reversing entries, never edits */
CREATE OR REPLACE FUNCTION journal_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Journal entries cannot be changed or deleted; post a reversing entry instead' USING ERRCODE = 'ZA409';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();
--> statement-breakpoint
CREATE TRIGGER journal_entries_no_truncate BEFORE TRUNCATE ON journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION journal_append_only();
--> statement-breakpoint
CREATE TRIGGER journal_lines_no_truncate BEFORE TRUNCATE ON journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION journal_append_only();
--> statement-breakpoint
/* At commit, every entry touched balances: at least two lines, debits = credits = its
   total, and every line and account belongs to the entry's school */
CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger AS $$
DECLARE
  v_entry uuid;
  v_number text;
  v_total numeric;
  v_debits numeric;
  v_credits numeric;
  v_lines integer;
  v_foreign integer;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_entry := NEW.id;
  ELSE
    v_entry := NEW.entry_id;
  END IF;
  SELECT e.entry_number, e.total INTO v_number, v_total FROM journal_entries e WHERE e.id = v_entry;
  SELECT coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0), count(*),
         count(*) FILTER (WHERE l.tenant_id <> e.tenant_id OR a.tenant_id <> e.tenant_id)
    INTO v_debits, v_credits, v_lines, v_foreign
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l.entry_id
    JOIN ledger_accounts a ON a.id = l.account_id
   WHERE l.entry_id = v_entry;
  IF v_lines < 2 OR v_debits <> v_credits OR v_debits <> v_total THEN
    RAISE EXCEPTION 'Journal entry % does not balance (debits %, credits %, total %)', v_number, v_debits, v_credits, v_total
      USING ERRCODE = 'ZA422';
  END IF;
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'Journal entry % uses another school''s lines or accounts', v_number USING ERRCODE = 'ZA422';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_balanced AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();
