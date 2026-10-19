CREATE TABLE "platform_account_directory" (
	"email_digest" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_account_directory_email_digest_tenant_id_pk" PRIMARY KEY("email_digest","tenant_id")
);
--> statement-breakpoint
ALTER TABLE "platform_account_directory" ADD CONSTRAINT "platform_account_directory_tenant_id_platform_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."platform_tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_account_directory_user_idx" ON "platform_account_directory" USING btree ("tenant_id","user_id");