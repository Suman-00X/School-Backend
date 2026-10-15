CREATE TYPE "public"."leave_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('DRAFT', 'FINALIZED');--> statement-breakpoint
CREATE TYPE "public"."salary_calculation" AS ENUM('FIXED', 'PERCENT_OF_BASIC');--> statement-breakpoint
CREATE TYPE "public"."salary_component_kind" AS ENUM('EARNING', 'DEDUCTION');--> statement-breakpoint
CREATE TYPE "public"."staff_attendance_status" AS ENUM('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'ON_DUTY');--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"half_day" boolean DEFAULT false NOT NULL,
	"days" numeric(5, 1) NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_request_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "leave_requests_dates_chk" CHECK ("leave_requests"."to_date" >= "leave_requests"."from_date"),
	CONSTRAINT "leave_requests_days_chk" CHECK ("leave_requests"."days" > 0),
	CONSTRAINT "leave_requests_half_day_chk" CHECK (NOT "leave_requests"."half_day" OR ("leave_requests"."from_date" = "leave_requests"."to_date" AND "leave_requests"."days" = 0.5))
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"annual_quota_days" numeric(5, 1) NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"description" text,
	CONSTRAINT "leave_types_quota_chk" CHECK ("leave_types"."annual_quota_days" >= 0 AND "leave_types"."annual_quota_days" <= 366)
);
--> statement-breakpoint
CREATE TABLE "employee_salaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"monthly_basic" numeric(12, 2) NOT NULL,
	"bank_account_number" text,
	"bank_ifsc" text,
	"pan_number" text,
	"notes" text,
	"created_by" uuid,
	CONSTRAINT "employee_salaries_basic_chk" CHECK ("employee_salaries"."monthly_basic" >= 0),
	CONSTRAINT "employee_salaries_month_start_chk" CHECK (extract(day from "employee_salaries"."effective_from") = 1)
);
--> statement-breakpoint
CREATE TABLE "employee_salary_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"salary_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	CONSTRAINT "employee_salary_lines_value_chk" CHECK ("employee_salary_lines"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"month" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "payroll_run_status" DEFAULT 'DRAFT' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"total_gross" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total_deductions" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total_net" numeric(12, 2) DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone,
	"created_by" uuid,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "payroll_runs_month_chk" CHECK ("payroll_runs"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "payroll_runs_period_chk" CHECK ("payroll_runs"."period_end" >= "payroll_runs"."period_start")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"payslip_number" text,
	"salary_id" uuid NOT NULL,
	"employee_name" text NOT NULL,
	"employee_code" text,
	"role" text NOT NULL,
	"designation" text,
	"days_in_month" integer NOT NULL,
	"paid_days" numeric(5, 1) NOT NULL,
	"lop_days" numeric(5, 1) NOT NULL,
	"attendance" jsonb NOT NULL,
	"monthly_basic" numeric(12, 2) NOT NULL,
	"earnings" jsonb NOT NULL,
	"deductions" jsonb NOT NULL,
	"total_earnings" numeric(12, 2) NOT NULL,
	"lop_amount" numeric(12, 2) NOT NULL,
	"gross_pay" numeric(12, 2) NOT NULL,
	"total_deductions" numeric(12, 2) NOT NULL,
	"net_pay" numeric(12, 2) NOT NULL,
	"bank_account_masked" text,
	"bank_ifsc" text,
	"pan_masked" text,
	CONSTRAINT "payslips_days_chk" CHECK ("payslips"."lop_days" >= 0 AND "payslips"."lop_days" <= "payslips"."days_in_month"),
	CONSTRAINT "payslips_amounts_chk" CHECK ("payslips"."total_earnings" >= 0 AND "payslips"."lop_amount" >= 0 AND "payslips"."gross_pay" >= 0 AND "payslips"."total_deductions" >= 0 AND "payslips"."net_pay" >= 0)
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "salary_component_kind" NOT NULL,
	"calculation" "salary_calculation" NOT NULL,
	"default_value" numeric(12, 2) DEFAULT 0 NOT NULL,
	"description" text,
	CONSTRAINT "salary_components_value_chk" CHECK ("salary_components"."default_value" >= 0 AND ("salary_components"."calculation" <> 'PERCENT_OF_BASIC' OR "salary_components"."default_value" <= 100))
);
--> statement-breakpoint
CREATE TABLE "staff_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "staff_attendance_status" NOT NULL,
	"check_in" time,
	"check_out" time,
	"remarks" text,
	"recorded_by" uuid,
	"leave_request_id" uuid,
	CONSTRAINT "staff_attendance_times_chk" CHECK ("staff_attendance"."check_in" IS NULL OR "staff_attendance"."check_out" IS NULL OR "staff_attendance"."check_out" >= "staff_attendance"."check_in")
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_lines" ADD CONSTRAINT "employee_salary_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_lines" ADD CONSTRAINT "employee_salary_lines_salary_id_employee_salaries_id_fk" FOREIGN KEY ("salary_id") REFERENCES "public"."employee_salaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salary_lines" ADD CONSTRAINT "employee_salary_lines_component_id_salary_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."salary_components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_salary_id_employee_salaries_id_fk" FOREIGN KEY ("salary_id") REFERENCES "public"."employee_salaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_user_dates_idx" ON "leave_requests" USING btree ("tenant_id","user_id","from_date");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_tenant_code_uq" ON "leave_types" USING btree ("tenant_id","code") WHERE "leave_types"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_tenant_name_uq" ON "leave_types" USING btree ("tenant_id","name") WHERE "leave_types"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_salaries_user_effective_uq" ON "employee_salaries" USING btree ("tenant_id","user_id","effective_from") WHERE "employee_salaries"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_salary_lines_component_uq" ON "employee_salary_lines" USING btree ("salary_id","component_id");--> statement-breakpoint
CREATE INDEX "employee_salary_lines_component_idx" ON "employee_salary_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_tenant_month_uq" ON "payroll_runs" USING btree ("tenant_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_run_user_uq" ON "payslips" USING btree ("run_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_tenant_number_uq" ON "payslips" USING btree ("tenant_id","payslip_number");--> statement-breakpoint
CREATE INDEX "payslips_user_idx" ON "payslips" USING btree ("tenant_id","user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "salary_components_tenant_code_uq" ON "salary_components" USING btree ("tenant_id","code") WHERE "salary_components"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_attendance_user_date_uq" ON "staff_attendance" USING btree ("tenant_id","user_id","date");--> statement-breakpoint
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance" USING btree ("tenant_id","date");