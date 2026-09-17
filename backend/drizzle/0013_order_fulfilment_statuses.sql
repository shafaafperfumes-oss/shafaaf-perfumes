ALTER TYPE "public"."order_status" ADD VALUE 'shipped' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'delivered' BEFORE 'cancelled';