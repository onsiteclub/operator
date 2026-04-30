-- ============================================================================
-- frm_operator_numbers — let operators set their own forward_to_e164
--
-- The Settings → Phone Calls section calls
--   supabase.from('frm_operator_numbers').update({ forward_to_e164 }).eq(...)
-- from the React Native client (authenticated role). Without an UPDATE
-- policy the row is silently filtered by RLS, the call returns no error
-- and 0 rows changed, so the toggle "succeeds" in the UI while the DB
-- column stays NULL — and the voice-forward Edge Function then plays the
-- "operator unavailable" message because it has nothing to dial.
--
-- Fix: a narrow UPDATE policy scoped to the operator's own row, plus
-- column-level grants so the only column the client can mutate is
-- forward_to_e164. phone_e164, status, provider_sid, etc. stay
-- service_role-only (provisioning is done by the provision-number
-- Edge Function, not by the client).
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- Tighten what the client roles can touch at the column level.
REVOKE UPDATE ON public.frm_operator_numbers FROM anon, authenticated;
GRANT UPDATE (forward_to_e164) ON public.frm_operator_numbers TO authenticated;

-- Allow operators to UPDATE only their own row.
DROP POLICY IF EXISTS "operator_own_numbers_update" ON public.frm_operator_numbers;
CREATE POLICY "operator_own_numbers_update" ON public.frm_operator_numbers
  FOR UPDATE
  TO authenticated
  USING (operator_id = auth.uid())
  WITH CHECK (operator_id = auth.uid());
