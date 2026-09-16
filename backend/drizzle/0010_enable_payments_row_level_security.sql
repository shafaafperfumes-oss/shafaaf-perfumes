-- Same rule as every other table in this project: RLS on, no public
-- policy, so Supabase's own auto-generated API cannot reach these tables —
-- only this backend's own database connection (the table owner) can.
ALTER TABLE "payments"       ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Guarded so this migration still runs on a plain Postgres, where Supabase's
-- `anon` and `authenticated` roles do not exist.
DO $$
DECLARE
  target_table text;
  browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      FOREACH target_table IN ARRAY ARRAY['payments', 'payment_events'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', target_table, browser_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
