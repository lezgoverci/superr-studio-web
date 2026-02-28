CREATE TABLE "opencode_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" text DEFAULT 'self_hosted' NOT NULL,
	"base_url" text NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opencode_connections" ADD CONSTRAINT "opencode_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opencode_connections_user_id_unique" ON "opencode_connections" USING btree ("user_id");