CREATE TABLE "custom_node_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"runtime" text DEFAULT 'javascript' NOT NULL,
	"config_schema" jsonb,
	"output_schema" jsonb,
	"secret_schema" jsonb,
	"latest_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_node_secret_values" (
	"id" text PRIMARY KEY NOT NULL,
	"custom_node_id" text NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_node_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"custom_node_id" text NOT NULL,
	"version" integer NOT NULL,
	"code" text NOT NULL,
	"changelog" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_node_definitions" ADD CONSTRAINT "custom_node_definitions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_node_secret_values" ADD CONSTRAINT "custom_node_secret_values_custom_node_id_custom_node_definitions_id_fk" FOREIGN KEY ("custom_node_id") REFERENCES "public"."custom_node_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_node_secret_values" ADD CONSTRAINT "custom_node_secret_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_node_versions" ADD CONSTRAINT "custom_node_versions_custom_node_id_custom_node_definitions_id_fk" FOREIGN KEY ("custom_node_id") REFERENCES "public"."custom_node_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_node_definitions_user_id_idx" ON "custom_node_definitions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_node_definitions_user_name_unique" ON "custom_node_definitions" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "custom_node_secret_values_custom_node_id_idx" ON "custom_node_secret_values" USING btree ("custom_node_id");--> statement-breakpoint
CREATE INDEX "custom_node_secret_values_user_id_idx" ON "custom_node_secret_values" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_node_secret_values_custom_node_user_key_unique" ON "custom_node_secret_values" USING btree ("custom_node_id","user_id","key");--> statement-breakpoint
CREATE INDEX "custom_node_versions_custom_node_id_idx" ON "custom_node_versions" USING btree ("custom_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_node_versions_custom_node_version_unique" ON "custom_node_versions" USING btree ("custom_node_id","version");