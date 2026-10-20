CREATE TYPE "public"."admit_card_status" AS ENUM('ISSUED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "admit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"status" "admit_card_status" DEFAULT 'ISSUED' NOT NULL,
	"details" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_reason" text
);
--> statement-breakpoint
CREATE TABLE "exam_eligibility_exemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "exam_eligibility_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attendance_rule_enabled" boolean DEFAULT false NOT NULL,
	"min_attendance_percentage" integer DEFAULT 75 NOT NULL,
	"dues_rule_enabled" boolean DEFAULT false NOT NULL,
	"max_overdue_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_eligibility_policies_attendance_chk" CHECK ("exam_eligibility_policies"."min_attendance_percentage" BETWEEN 1 AND 100),
	CONSTRAINT "exam_eligibility_policies_dues_chk" CHECK ("exam_eligibility_policies"."max_overdue_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admit_cards" ADD CONSTRAINT "admit_cards_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_exemptions" ADD CONSTRAINT "exam_eligibility_exemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_exemptions" ADD CONSTRAINT "exam_eligibility_exemptions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_exemptions" ADD CONSTRAINT "exam_eligibility_exemptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_exemptions" ADD CONSTRAINT "exam_eligibility_exemptions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_eligibility_policies" ADD CONSTRAINT "exam_eligibility_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admit_cards_exam_student_uq" ON "admit_cards" USING btree ("exam_id","student_id") WHERE "admit_cards"."is_active" = true;--> statement-breakpoint
CREATE INDEX "admit_cards_student_idx" ON "admit_cards" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_eligibility_exemptions_exam_student_uq" ON "exam_eligibility_exemptions" USING btree ("exam_id","student_id") WHERE "exam_eligibility_exemptions"."is_active" = true;--> statement-breakpoint
CREATE INDEX "exam_eligibility_exemptions_exam_idx" ON "exam_eligibility_exemptions" USING btree ("exam_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_eligibility_policies_tenant_uq" ON "exam_eligibility_policies" USING btree ("tenant_id");