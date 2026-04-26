/**
 * expire-stale-requests — Edge Function
 *
 * Invoked on a schedule by pg_cron (see migrations) to time out material
 * requests that have been sitting in `requested` status for too long
 * without machinist action. For each stale request:
 *   1. Mark status='timed_out'.
 *   2. Send a friendly SMS to the worker so they know to re-send.
 *   3. Log the notice in the chat thread.
 *
 * Auth: requires the service role key in the Authorization header. This
 * function is server-only — pg_net inside Postgres calls it with the
 * service key. It does NOT accept user JWTs.
 *
 * Request:  POST {} (no body required)
 * Response: 200 { ok: true, expired: <count> }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Threshold: requests older than this in `requested` status get timed out.
const TIMEOUT_MIN = 20;

const TIMEOUT_NOTIFICATION =
  '⏱ Your request timed out without a reply — please send again if you still need it.';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Service-role only.
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (token !== SUPABASE_SERVICE_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const cutoff = new Date(Date.now() - TIMEOUT_MIN * 60 * 1000).toISOString();

    // 1. Find stale requests.
    const { data: stale, error: selErr } = await supabase
      .from('frm_material_requests')
      .select('id, jobsite_id, worker_phone')
      .eq('status', 'requested')
      .lt('created_at', cutoff);

    if (selErr) {
      console.error('Select stale failed:', selErr);
      return json({ error: 'Select failed' }, 500);
    }

    if (!stale || stale.length === 0) {
      return json({ ok: true, expired: 0 });
    }

    const ids = stale.map((r) => r.id);

    // 2. Bulk-update to timed_out.
    const { error: updErr } = await supabase
      .from('frm_material_requests')
      .update({ status: 'timed_out' })
      .in('id', ids);

    if (updErr) {
      console.error('Bulk update failed:', updErr);
      return json({ error: 'Update failed' }, 500);
    }

    // 3. For each, notify worker + log message. Done sequentially because
    // each request can have a different operator number per jobsite, and
    // we don't want a single bad SMS to abort the loop.
    let notified = 0;
    for (const r of stale) {
      // Log message in chat thread (always, even if SMS isn't sent).
      await supabase.from('frm_messages').insert({
        jobsite_id: r.jobsite_id,
        request_id: r.id,
        sender_type: 'system',
        sender_id: null,
        sender_name: 'Operator',
        content: TIMEOUT_NOTIFICATION,
      });

      if (!r.worker_phone || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) continue;

      const { data: opNumber } = await supabase
        .from('frm_operator_numbers')
        .select('phone_e164')
        .eq('site_id', r.jobsite_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!opNumber?.phone_e164) continue;

      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: r.worker_phone,
            From: opNumber.phone_e164,
            Body: TIMEOUT_NOTIFICATION,
          }).toString(),
        });
        notified += 1;
      } catch (smsErr) {
        console.error(`Timeout SMS failed for request ${r.id}:`, smsErr);
      }
    }

    return json({ ok: true, expired: ids.length, notified });
  } catch (err) {
    console.error('expire-stale-requests error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
