-- ============================================================================
-- frm_alerts.supervisor_phone — audit column
--
-- The Machine tab (Low fuel / Broken / Maintenance) sends an SMS to the
-- supervisor and records a row in frm_alerts. Storing the destination
-- number on the row keeps the audit trail self-contained: who was paged,
-- when, and at what number. The phone is captured per-alert because the
-- supervisor number is a per-device setting (AsyncStorage) and may
-- change between alerts.
--
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.frm_alerts
  ADD COLUMN IF NOT EXISTS supervisor_phone text;
