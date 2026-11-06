CREATE TABLE "app_auth_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"device_name" text,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"device_name" text,
	"access_token_hash" text NOT NULL,
	"access_expires_at" timestamp NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"refresh_expires_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_auth_code" ADD CONSTRAINT "app_auth_code_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_auth_code_hash_idx" ON "app_auth_code" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "app_session_access_idx" ON "app_session" USING btree ("access_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "app_session_refresh_idx" ON "app_session" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "app_session_user_idx" ON "app_session" USING btree ("user_id");