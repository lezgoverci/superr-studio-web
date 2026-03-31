CREATE TABLE "member_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"display_name" text,
	"bio" text,
	"location" text,
	"avatar_url" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"current_role" text,
	"target_role" text,
	"skill_level" text,
	"ai_familiarity" text,
	"career_pressure" text,
	"first_goal" text,
	"whop_affiliate_id" text,
	"notebooklm_notebook_id" text,
	"onboarding_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"track_id" text NOT NULL,
	"task_id" text NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_progress" ADD CONSTRAINT "member_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "member_profiles_user_id_unique" ON "member_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_profiles_level_idx" ON "member_profiles" USING btree ("level");--> statement-breakpoint
CREATE INDEX "member_progress_user_id_idx" ON "member_progress" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_progress_user_task_unique" ON "member_progress" USING btree ("user_id","track_id","task_id");