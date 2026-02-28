DROP INDEX "opencode_connections_user_id_unique";--> statement-breakpoint
ALTER TABLE "opencode_connections" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "opencode_connections" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "opencode_connections_user_id_idx" ON "opencode_connections" USING btree ("user_id");