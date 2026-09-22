-- Same rule as every other table in this project: RLS on, no public
-- policy, so Supabase's own auto-generated API cannot reach this table —
-- only this backend's own database connection (the table owner) can.
ALTER TABLE "content_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Guarded so this migration still runs on a plain Postgres, where Supabase's
-- `anon` and `authenticated` roles do not exist.
DO $$
DECLARE
  browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.content_posts FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
