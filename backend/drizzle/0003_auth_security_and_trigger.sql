-- Ties `profiles` to Supabase's own auth.users table, and keeps them in
-- sync automatically: the moment someone signs up, they get a profile row,
-- with no chance of the application forgetting to create one.

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_id_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();
--> statement-breakpoint

-- Same rule as every other table in this project: RLS on, no public
-- policy, so Supabase's own auto-generated API cannot reach these tables —
-- only this backend's own database connection (the table owner) can.
ALTER TABLE "profiles"  ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
DECLARE
  target_table text;
  browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      FOREACH target_table IN ARRAY ARRAY['profiles', 'addresses'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', target_table, browser_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
