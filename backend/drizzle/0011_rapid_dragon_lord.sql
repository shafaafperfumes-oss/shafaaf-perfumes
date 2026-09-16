-- Adding a value to an existing enum the obvious way (`ALTER TYPE ... ADD
-- VALUE`) cannot run inside a transaction block, and every migration here
-- runs inside one. Building the replacement type and swapping the column
-- over to it does the same job and is transaction-safe.
ALTER TYPE "public"."inventory_movement_reason" RENAME TO "inventory_movement_reason_old";--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_reason" AS ENUM('order_reserved', 'order_released', 'order_committed', 'admin_adjustment');--> statement-breakpoint
ALTER TABLE "inventory_movements" ALTER COLUMN "reason" SET DATA TYPE "public"."inventory_movement_reason" USING "reason"::text::"public"."inventory_movement_reason";--> statement-breakpoint
DROP TYPE "public"."inventory_movement_reason_old";--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(80),
	"ip_address" varchar(45),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");