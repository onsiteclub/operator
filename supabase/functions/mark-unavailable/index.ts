/**
 * mark-unavailable — Edge Function
 *
 * Called by the operator app when the machinist taps ✗ on a request card
 * because the requested material isn't on hand. Atomically:
 *   1. Marks the request status='unavailable' (removes it from queue).
 *   2. Sends a friendly "not available" SMS to the worker so they know
 *      the request was seen and aren't left waiting.
 *   3. Logs the notification in frm_messages so it appears in the chat.
 *
 * Request:  POST { request_id: UUID }
 * Response: 200 { ok: true }
 *
 * Deploy:   supabase functions deploy mark-unavailable --project-ref dbasazrdbtigrdntaehb
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const UNAVAILABLE_NOTIFICATION =
  '✗ This material isn\'t available right now — please check back with us later.';

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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData.user) return json({ error: 'Unauthorized' }, 401);

    const { request_id } = await req.json();
    if (!request_id) return json({ error: 'request_id is required' }, 400);

    const { data: request, error: reqErr } = await supabase
      .from('frm_material_requests')
      .select('id, jobsite_id, worker_phone, status')
      .eq('id', request_id)
      .single();

    if (reqErr || !request) return json({ error: 'Request not found' }, 404);
    if (request.status === 'delivered') {
      return json({ error: 'Cannot mark delivered request as unavailable' }, 409);
    }
    if (request.status === 'unavailable') {
      return json({ ok: true, note: 'already unavailable' });
    }

    // 1. Mark unavailable
    const { error: updateErr } = await supabase
      .from('frm_material_requests')
      .update({ status: 'unavailable' })
      .eq('id', request.id);

    if (updateErr) {
      console.error('Update failed:', updateErr);
      return json({ error: 'Failed to mark unavailable' }, 500);
    }

    // 2. Notify worker via SMS
    if (request.worker_phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const { data: opNumber } = await supabase
        .from('frm_operator_numbers')
        .select('phone_e164')
        .eq('site_id', request.jobsite_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (opNumber?.phone_e164) {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
        try {
          await fetch(twilioUrl, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: request.worker_phone,
              From: opNumber.phone_e164,
              Body: UNAVAILABLE_NOTIFICATION,
            }).toString(),
          });
        } catch (smsErr) {
          // Don't block status change on SMS failure; log and continue.
          console.error('Unavailable SMS failed:', smsErr);
        }
      }
    }

    // 3. Log notification in chat thread
    await supabase.from('frm_messages').insert({
      jobsite_id: request.jobsite_id,
      request_id: request.id,
      sender_type: 'system',
      sender_id: null,
      sender_name: 'Operator',
      content: UNAVAILABLE_NOTIFICATION,
    });

    return json({ ok: true });
  } catch (err) {
    console.error('mark-unavailable error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
