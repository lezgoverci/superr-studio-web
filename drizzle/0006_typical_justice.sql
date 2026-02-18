CREATE TABLE "artifact_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"ui_spec" jsonb,
	"ui_spec_version" text,
	"ui_metadata" jsonb,
	"visibility" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"execution_id" text,
	"execution_log_id" text,
	"node_id" text NOT NULL,
	"node_type" text NOT NULL,
	"action_type" text,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"mime_type" text,
	"extension" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text,
	"blob_url" text,
	"inline_content" text,
	"preview" jsonb,
	"metadata" jsonb,
	"status" text NOT NULL,
	"visibility" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact_publications" ADD CONSTRAINT "artifact_publications_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_publications" ADD CONSTRAINT "artifact_publications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_execution_log_id_workflow_execution_logs_id_fk" FOREIGN KEY ("execution_log_id") REFERENCES "public"."workflow_execution_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_publications_artifact_id_unique" ON "artifact_publications" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_publications_slug_unique" ON "artifact_publications" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "artifact_publications_user_id_idx" ON "artifact_publications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifacts_user_id_idx" ON "artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifacts_workflow_id_idx" ON "artifacts" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "artifacts_execution_id_idx" ON "artifacts" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "artifacts_created_at_idx" ON "artifacts" USING btree ("created_at");