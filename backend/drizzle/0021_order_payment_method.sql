CREATE TYPE "public"."payment_method" AS ENUM('online', 'upi', 'cod');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method" DEFAULT 'online' NOT NULL;
