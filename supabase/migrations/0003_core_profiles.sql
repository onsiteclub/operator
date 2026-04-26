-- ============================================================================
-- core_profiles (+ `profiles` view) for OnSite Operator's Supabase project
--
-- Background: this Supabase project (dbasazrdbtigrdntaehb) was extracted
-- from the eagle monorepo, which already provisions a richer `core_profiles`
-- table in its 000_initial_schema.sql. This migration is a NARROW guard:
-- it only adds the columns the operator's auth flow reads/writes if they
-- don't exist yet, and (re)creates the read-only `profiles` view that the
-- ported auth code queries via supabase.from('profiles').
--
-- Idempotent: safe to re-run. Will not clobber existing eagle data.
-- ============================================================================

-- 1. Make sure the table exists. The eagle migration adds many more columns
--    (trade_id, certifications, etc.); this CREATE is a fallback.
CREATE TABLE IF NOT EXISTS core_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       VARCHAR(255),
  full_name   VARCHAR(200),
  first_name  VARCHAR(100),
  last_name   VARCHAR(100),
  phone       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add the columns the auth code touches if they're missing.
ALTER TABLE core_profiles ADD COLUMN IF NOT EXISTS email      VARCHAR(255);
ALTER TABLE core_profiles ADD COLUMN IF NOT EXISTS full_name  VARCHAR(200);
ALTER TABLE core_profiles ADD COLUMN IF NOT EXISTS phone      TEXT;
ALTER TABLE core_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 3. RLS: every user owns their own profile row.
ALTER TABLE core_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "core_profiles_owner_read"  ON core_profiles;
DROP POLICY IF EXISTS "core_profiles_owner_write" ON core_profiles;

CREATE POLICY "core_profiles_owner_read"
  ON core_profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "core_profiles_owner_write"
  ON core_profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 4. Trigger to auto-create a core_profiles row when a new auth user is
--    created. Mirrors the timekeeper convention so signups don't need a
--    separate INSERT call from the client.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO core_profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL),
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Read-only `profiles` VIEW that the auth code queries.
CREATE OR REPLACE VIEW profiles AS
  SELECT id, email, full_name, phone, avatar_url, created_at, updated_at
  FROM core_profiles;

GRANT SELECT ON profiles TO authenticated;
