-- Same rule as every other table in this project: RLS on, no public
-- policy, so Supabase's own auto-generated API cannot reach these tables —
-- only this backend's own database connection (the table owner) can.
ALTER TABLE "inspired_fragrances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inspired_sizes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fragrance_queries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Guarded so this migration still runs on a plain Postgres, where Supabase's
-- `anon` and `authenticated` roles do not exist.
DO $$
DECLARE
  browser_role text;
  tbl text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      FOREACH tbl IN ARRAY ARRAY['inspired_fragrances', 'inspired_sizes', 'fragrance_queries'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, browser_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;--> statement-breakpoint

-- The sizes custom and inspired fragrances are made in. Prices are left
-- empty on purpose: the owner sets them in the admin, and until then the
-- site says "ask on WhatsApp".
INSERT INTO "inspired_sizes" ("label", "size_ml", "position") VALUES
  ('10ml', 10, 1),
  ('30ml', 30, 2),
  ('50ml', 50, 3),
  ('100ml', 100, 4)
ON CONFLICT ("label") DO NOTHING;
