-- Supabase publishes every table in the `public` schema through its own
-- auto-generated API. Without Row Level Security, anyone holding the browser
-- ("anon") key could read and write these tables directly, bypassing our
-- Express API and all of its validation.
--
-- Enabling RLS with no policies means nobody reaches these tables through
-- Supabase's API. Our backend connects as the table owner over its own
-- database connection, and an owner is not subject to RLS, so the API keeps
-- working. (RLS is deliberately not FORCEd, which would lock out the owner
-- as well and break the API.)

ALTER TABLE "fragrance_families" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fragrance_notes"    ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products"           ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_notes"      ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_images"     ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_variants"   ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory"          ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Belt and braces: also take away the browser roles' table privileges.
-- Guarded so this migration still runs on a plain Postgres, where Supabase's
-- `anon` and `authenticated` roles do not exist.
DO $$
DECLARE
  target_table text;
  browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      FOREACH target_table IN ARRAY ARRAY[
        'fragrance_families', 'fragrance_notes', 'products',
        'product_notes', 'product_images', 'product_variants', 'inventory'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', target_table, browser_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
