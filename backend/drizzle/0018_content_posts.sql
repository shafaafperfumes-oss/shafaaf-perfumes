CREATE TABLE "content_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" varchar(120),
	"platform" varchar(24) NOT NULL,
	"kind" varchar(24) DEFAULT 'post' NOT NULL,
	"title" varchar(160) NOT NULL,
	"caption" text NOT NULL,
	"hashtags" text DEFAULT '' NOT NULL,
	"image_url" varchar(500),
	"product_slug" varchar(120),
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"source" varchar(24) DEFAULT 'agent' NOT NULL,
	"agent_note" text,
	"owner_note" text,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_ref" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "content_posts_agent_key_key" ON "content_posts" USING btree ("agent_key");--> statement-breakpoint
CREATE INDEX "content_posts_status_idx" ON "content_posts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_posts_scheduled_idx" ON "content_posts" USING btree ("scheduled_for");