CREATE TYPE "public"."note_type" AS ENUM('top', 'heart', 'base', 'accord');--> statement-breakpoint
CREATE TYPE "public"."variant_type" AS ENUM('perfume', 'attar');--> statement-breakpoint
CREATE TABLE "fragrance_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fragrance_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_quantity_non_negative" CHECK ("inventory"."quantity" >= 0),
	CONSTRAINT "inventory_reserved_non_negative" CHECK ("inventory"."reserved" >= 0),
	CONSTRAINT "inventory_reserved_within_quantity" CHECK ("inventory"."reserved" <= "inventory"."quantity")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"alt" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_notes" (
	"product_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"note_type" "note_type" DEFAULT 'accord' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "product_notes_product_id_note_id_pk" PRIMARY KEY("product_id","note_id")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"variant_type" "variant_type" NOT NULL,
	"size_label" varchar(24) NOT NULL,
	"size_ml" smallint NOT NULL,
	"price_paise" integer NOT NULL,
	"compare_at_price_paise" integer,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_price_positive" CHECK ("product_variants"."price_paise" > 0),
	CONSTRAINT "product_variants_size_positive" CHECK ("product_variants"."size_ml" > 0),
	CONSTRAINT "product_variants_compare_at_price_valid" CHECK ("product_variants"."compare_at_price_paise" IS NULL OR "product_variants"."compare_at_price_paise" > "product_variants"."price_paise")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"family_id" uuid,
	"gender" varchar(24) DEFAULT 'Unisex' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hero_image_url" text,
	"hero_image_alt" text,
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rating_average" numeric(2, 1) DEFAULT '0.0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_review_count_non_negative" CHECK ("products"."review_count" >= 0),
	CONSTRAINT "products_rating_range" CHECK ("products"."rating_average" >= 0 AND "products"."rating_average" <= 5)
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_notes" ADD CONSTRAINT "product_notes_note_id_fragrance_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."fragrance_notes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_family_id_fragrance_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."fragrance_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fragrance_families_slug_key" ON "fragrance_families" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "fragrance_notes_slug_key" ON "fragrance_notes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_product_url_key" ON "product_images" USING btree ("product_id","url");--> statement-breakpoint
CREATE INDEX "product_notes_note_id_idx" ON "product_notes" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants" USING btree ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_type_size_key" ON "product_variants" USING btree ("product_id","variant_type","size_ml");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_family_id_idx" ON "products" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");