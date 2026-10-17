CREATE TABLE "gateway_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"settlement_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"fees" numeric(12, 2) DEFAULT 0 NOT NULL,
	"tax" numeric(12, 2) DEFAULT 0 NOT NULL,
	"utr" text,
	"settled_at" timestamp with time zone NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "gateway_settlements_amount_chk" CHECK ("gateway_settlements"."amount" >= 0 AND "gateway_settlements"."fees" >= 0 AND "gateway_settlements"."tax" >= 0 AND "gateway_settlements"."tax" <= "gateway_settlements"."fees" AND "gateway_settlements"."amount" + "gateway_settlements"."fees" > 0)
);
--> statement-breakpoint
ALTER TABLE "gateway_settlements" ADD CONSTRAINT "gateway_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_settlements_tenant_settlement_uq" ON "gateway_settlements" USING btree ("tenant_id","provider","settlement_id");--> statement-breakpoint
CREATE INDEX "gateway_settlements_settled_idx" ON "gateway_settlements" USING btree ("tenant_id","settled_at");