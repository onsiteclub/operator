-- ============================================================================
-- frm_operator_numbers.forward_to_e164 — voice forwarding target
--
-- Workers call the operator's provisioned Twilio number to talk live. The
-- voice-forward Edge Function answers the call and bridges it to the
-- operator's personal cellphone via TwiML <Dial>. This column stores that
-- destination per operator-number row, so each operator picks where their
-- calls land without touching env vars.
--
-- NULL means voice forwarding is disabled — the function plays a short
-- "operator unavailable" message instead of dialing.
--
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.frm_operator_numbers
  ADD COLUMN IF NOT EXISTS forward_to_e164 text;
