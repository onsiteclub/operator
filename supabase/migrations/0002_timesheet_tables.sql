-- ============================================================================
-- Timesheet & invoice tables for OnSite Operator
--
-- All tables are prefixed `app_operator_*` so they coexist with the existing
-- `frm_*` request-queue tables AND with the timekeeper app's `daily_hours`
-- + `business_profiles` tables in this same Supabase project.
--
-- RLS: every row is owned by `auth.uid() = user_id`. invoice_items piggyback
-- on the user_id duplicated from their parent invoice (simpler than a
-- subquery in the policy).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app_operator_daily_hours
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_operator_daily_hours (
  id           TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date         DATE NOT NULL,

  total_minutes  INTEGER NOT NULL DEFAULT 0,
  break_minutes  INTEGER DEFAULT 0,

  location_name  TEXT,
  location_id    TEXT,

  verified  BOOLEAN DEFAULT FALSE,
  source    TEXT DEFAULT 'manual',
  type      TEXT DEFAULT 'work',

  first_entry  TEXT,  -- HH:MM
  last_exit    TEXT,  -- HH:MM
  notes        TEXT,

  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  synced_at    TIMESTAMPTZ,

  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_app_operator_daily_hours_user
  ON app_operator_daily_hours (user_id);
CREATE INDEX IF NOT EXISTS idx_app_operator_daily_hours_user_date
  ON app_operator_daily_hours (user_id, date);

ALTER TABLE app_operator_daily_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_daily_hours_owner_all" ON app_operator_daily_hours;
CREATE POLICY "operator_daily_hours_owner_all"
  ON app_operator_daily_hours
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- app_operator_business_profile
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_operator_business_profile (
  id            TEXT PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,

  address_street      TEXT,
  address_city        TEXT,
  address_province    TEXT,
  address_postal_code TEXT,

  phone TEXT,
  email TEXT,

  business_number TEXT,
  gst_hst_number  TEXT,

  default_hourly_rate  NUMERIC(10, 2),
  tax_rate             NUMERIC(5, 2),
  next_invoice_number  INTEGER DEFAULT 1,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at  TIMESTAMPTZ,

  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_operator_business_profile_user
  ON app_operator_business_profile (user_id);

ALTER TABLE app_operator_business_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_business_profile_owner_all" ON app_operator_business_profile;
CREATE POLICY "operator_business_profile_owner_all"
  ON app_operator_business_profile
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- app_operator_clients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_operator_clients (
  id           TEXT PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name  TEXT NOT NULL,

  address_street       TEXT NOT NULL DEFAULT '',
  address_city         TEXT NOT NULL DEFAULT '',
  address_province     TEXT NOT NULL DEFAULT '',
  address_postal_code  TEXT NOT NULL DEFAULT '',

  email  TEXT,
  phone  TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at  TIMESTAMPTZ,

  UNIQUE (user_id, client_name)
);

CREATE INDEX IF NOT EXISTS idx_app_operator_clients_user
  ON app_operator_clients (user_id);

ALTER TABLE app_operator_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_clients_owner_all" ON app_operator_clients;
CREATE POLICY "operator_clients_owner_all"
  ON app_operator_clients
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- app_operator_invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_operator_invoices (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,

  type         TEXT NOT NULL DEFAULT 'hourly',
  client_name  TEXT,
  client_id    TEXT,

  status        TEXT DEFAULT 'pending',
  subtotal      NUMERIC(12, 2) DEFAULT 0,
  tax_rate      NUMERIC(5, 2) DEFAULT 0,
  tax_amount    NUMERIC(12, 2) DEFAULT 0,
  total         NUMERIC(12, 2) DEFAULT 0,
  hourly_rate   NUMERIC(10, 2),

  period_start  DATE,
  period_end    DATE,
  due_date      DATE,

  notes    TEXT,
  pdf_uri  TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at  TIMESTAMPTZ,

  UNIQUE (user_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_app_operator_invoices_user
  ON app_operator_invoices (user_id);
CREATE INDEX IF NOT EXISTS idx_app_operator_invoices_user_status
  ON app_operator_invoices (user_id, status);

ALTER TABLE app_operator_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_invoices_owner_all" ON app_operator_invoices;
CREATE POLICY "operator_invoices_owner_all"
  ON app_operator_invoices
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- app_operator_invoice_items
--
-- user_id is duplicated from the parent invoice so RLS can be expressed
-- without a subquery. Always populate it from the client.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_operator_invoice_items (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES app_operator_invoices(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  description  TEXT NOT NULL,
  quantity     NUMERIC(12, 4) DEFAULT 1,
  unit_price   NUMERIC(12, 2) DEFAULT 0,
  total        NUMERIC(12, 2) DEFAULT 0,
  sort_order   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_app_operator_invoice_items_invoice
  ON app_operator_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_app_operator_invoice_items_user
  ON app_operator_invoice_items (user_id);

ALTER TABLE app_operator_invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operator_invoice_items_owner_all" ON app_operator_invoice_items;
CREATE POLICY "operator_invoice_items_owner_all"
  ON app_operator_invoice_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
