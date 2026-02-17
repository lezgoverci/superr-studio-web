ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "ui_spec" jsonb;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "ui_spec_version" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "ui_metadata" jsonb;