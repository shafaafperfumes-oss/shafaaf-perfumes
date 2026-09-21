CREATE TABLE "fragrance_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" varchar(120) NOT NULL,
	"matches" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspired_fragrances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"inspired_by" varchar(120) NOT NULL,
	"gender" varchar(24),
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspired_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(24) NOT NULL,
	"size_ml" integer NOT NULL,
	"price_paise" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fragrance_queries_created_at_idx" ON "fragrance_queries" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inspired_fragrances_name_brand_key" ON "inspired_fragrances" USING btree ("name","inspired_by");--> statement-breakpoint
CREATE INDEX "inspired_fragrances_available_idx" ON "inspired_fragrances" USING btree ("is_available");--> statement-breakpoint
CREATE UNIQUE INDEX "inspired_sizes_label_key" ON "inspired_sizes" USING btree ("label");