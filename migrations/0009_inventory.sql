CREATE TYPE "public"."inventory_unit" AS ENUM('PCS', 'BOX', 'PACK', 'KG', 'G', 'LITRE', 'ML', 'METRE', 'SET', 'REAM');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"unit" "inventory_unit" NOT NULL,
	"reorder_level" numeric(12, 3) DEFAULT 0 NOT NULL,
	"stock_on_hand" numeric(12, 3) DEFAULT 0 NOT NULL,
	"average_unit_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"location" text,
	"description" text,
	"discontinued" boolean DEFAULT false NOT NULL,
	CONSTRAINT "inventory_items_stock_chk" CHECK ("inventory_items"."stock_on_hand" >= 0),
	CONSTRAINT "inventory_items_reorder_chk" CHECK ("inventory_items"."reorder_level" >= 0),
	CONSTRAINT "inventory_items_cost_chk" CHECK ("inventory_items"."average_unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" integer NOT NULL,
	"movement_number" text NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity_change" numeric(12, 3) NOT NULL,
	"balance_after" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2) NOT NULL,
	"total_value" numeric(12, 2) NOT NULL,
	"average_cost_after" numeric(12, 2) NOT NULL,
	"vendor_id" uuid,
	"issued_to_user_id" uuid,
	"issued_to" text,
	"reason" text,
	"reference" text,
	"movement_date" date NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "stock_movements_direction_chk" CHECK (("stock_movements"."type" IN ('RECEIPT', 'RETURN') AND "stock_movements"."quantity_change" > 0)
        OR ("stock_movements"."type" = 'ISSUE' AND "stock_movements"."quantity_change" < 0)
        OR ("stock_movements"."type" = 'ADJUSTMENT' AND "stock_movements"."quantity_change" <> 0)),
	CONSTRAINT "stock_movements_balance_chk" CHECK ("stock_movements"."balance_after" >= 0),
	CONSTRAINT "stock_movements_value_chk" CHECK ("stock_movements"."unit_cost" >= 0 AND "stock_movements"."total_value" >= 0 AND "stock_movements"."average_cost_after" >= 0),
	CONSTRAINT "stock_movements_vendor_chk" CHECK ("stock_movements"."vendor_id" IS NULL OR "stock_movements"."type" = 'RECEIPT')
);
--> statement-breakpoint
CREATE TABLE "inventory_vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text,
	"email" text,
	"tax_id" text,
	"address" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_vendor_id_inventory_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."inventory_vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issued_to_user_id_users_id_fk" FOREIGN KEY ("issued_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_vendors" ADD CONSTRAINT "inventory_vendors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_categories_tenant_name_uq" ON "inventory_categories" USING btree ("tenant_id",lower("name")) WHERE "inventory_categories"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_tenant_sku_uq" ON "inventory_items" USING btree ("tenant_id","sku") WHERE "inventory_items"."is_active" = true;--> statement-breakpoint
CREATE INDEX "inventory_items_category_idx" ON "inventory_items" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_tenant_number_uq" ON "stock_movements" USING btree ("tenant_id","movement_number");--> statement-breakpoint
CREATE INDEX "stock_movements_item_idx" ON "stock_movements" USING btree ("item_id","seq");--> statement-breakpoint
CREATE INDEX "stock_movements_date_idx" ON "stock_movements" USING btree ("tenant_id","type","movement_date");--> statement-breakpoint
CREATE INDEX "stock_movements_vendor_idx" ON "stock_movements" USING btree ("vendor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_vendors_tenant_tax_id_uq" ON "inventory_vendors" USING btree ("tenant_id","tax_id") WHERE ("inventory_vendors"."is_active" = true and "inventory_vendors"."tax_id" IS NOT NULL);--> statement-breakpoint
CREATE INDEX "inventory_vendors_tenant_name_idx" ON "inventory_vendors" USING btree ("tenant_id","name");--> statement-breakpoint
/* The stock ledger is append-only: corrections are new movements (ADJUSTMENT), never edits */
CREATE OR REPLACE FUNCTION stock_movements_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements cannot be changed or deleted; record an adjustment instead' USING ERRCODE = 'ZA409';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();
