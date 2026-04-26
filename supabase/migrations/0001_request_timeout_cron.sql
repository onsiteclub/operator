-- ============================================================================
-- Request timeout cron — schedules the expire-stale-requests edge function
-- to run every 5 minutes, marking requests stale after 20 min as 'timed_out'.
--
-- Idempotent: safe to re-run. cron.schedule() upserts by job name.
--
-- Prerequisites:
--   1. Extensions pg_cron and pg_net enabled (Database → Extensions in
--      the Supabase dashboard, or the CREATE EXTENSION lines below).
--   2. The SUPABASE_SERVICE_ROLE_KEY stored in Vault under name
--      'service_role_key'. Run once before this migration:
--
--        SELECT vault.create_secret('<your-service-role-key>', 'service_role_key');
--
--      (Or update via vault.update_secret if it already exists.)
--
-- Project ref hardcoded: dbasazrdbtigrdntaehb
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name (so re-running rewires cleanly).
SELECT cron.unschedule('expire-stale-requests')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-requests');

-- Schedule: every 5 minutes. POSTs to the edge function with the service
-- role key. Function reads {} body and selects all status='requested' rows
-- older than 20 min, marks them 'timed_out', notifies the worker, and logs
-- the notice in frm_messages.
SELECT cron.schedule(
  'expire-stale-requests',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://dbasazrdbtigrdntaehb.supabase.co/functions/v1/expire-stale-requests',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
          LIMIT 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
);
