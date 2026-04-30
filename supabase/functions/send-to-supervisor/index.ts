/**
 * send-to-supervisor — Edge Function
 *
 * Called by the operator app when the machinist taps Low fuel / Broken /
 * Maintenance on the Machine tab. Atomically:
 *   1. Sends an SMS to the supervisor's phone via Twilio. The "From"
 *      number is the operator's provisioned line (frm_operator_numbers
 *      where operator_id matches). That way the supervisor sees a
 *      familiar caller — the same number workers text into.
 *   2. Records the alert in frm_alerts with sent_to_supervisor_at set
 *      when the SMS dispatch succeeds. The row is inserted either way
 *      so a Twilio outage still leaves an audit trail.
 *
 * Request:  POST { type: 'low_fuel' | 'broken' | 'maintenance',
 *                  supervisor_phone: '+1XXXXXXXXXX',
 *                  message: string }
 * Response: 200 { ok: true, alert_id, sent: boolean }
 *
 * Deploy:   supabase functions deploy send-to-supervisor --project-ref dbasazrdbtigrdntaehb
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_TYPES = new Set(['low_fuel', 'broken', 'maintenance']);

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
    const operatorId = authData.user.id;

    const { type, supervisor_phone, message } = await req.json();
    if (!type || !VALID_TYPES.has(type)) {
      return json({ error: 'type must be low_fuel | broken | maintenance' }, 400);
    }
    if (!supervisor_phone || typeof supervisor_phone !== 'string') {
      return json({ error: 'supervisor_phone is required' }, 400);
    }
    if (!message || typeof message !== 'string') {
      return json({ error: 'message is required' }, 400);
    }

    // Look up the operator's provisioned "From" number.
    const { data: opNumber } = await supabase
      .from('frm_operator_numbers')
      .select('phone_e164, site_id')
      .eq('operator_id', operatorId)
      .eq('status', 'active')
      .order('provisioned_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sent = false;
    if (opNumber?.phone_e164 && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      try {
        const resp = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: supervisor_phone,
            From: opNumber.phone_e164,
            Body: message,
          }).toString(),
        });
        sent = resp.ok;
        if (!resp.ok) {
          const detail = await resp.text();
          console.error('Twilio non-2xx:', resp.status, detail);
        }
      } catch (smsErr) {
        console.error('Supervisor SMS failed:', smsErr);
      }
    } else {
      console.warn('Skipping SMS: missing operator number or Twilio creds', {
        hasOperatorNumber: !!opNumber?.phone_e164,
        hasTwilio: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN),
      });
    }

    const { data: alert, error: insertErr } = await supabase
      .from('frm_alerts')
      .insert({
        operator_id: operatorId,
        site_id: opNumber?.site_id ?? null,
        type,
        message,
        supervisor_phone,
        sent_to_supervisor_at: sent ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('frm_alerts insert failed:', insertErr);
      return json({ error: 'Failed to record alert', detail: insertErr.message, sent }, 500);
    }

    return json({ ok: true, alert_id: alert.id, sent });
  } catch (err) {
    console.error('send-to-supervisor error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
