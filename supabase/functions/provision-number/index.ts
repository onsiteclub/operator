/**
 * provision-number — Edge Function
 *
 * Buys a Twilio local number for the calling operator and persists it in
 * frm_operator_numbers. Idempotent: if the operator already has an
 * active row, returns it instead of buying a second line.
 *
 * Webhooks pre-wired on the new number:
 *   - SmsUrl   → request-ingest  (worker SMS comes in)
 *   - VoiceUrl → voice-forward   (worker calls bridged to operator's cell)
 *
 * Without VoiceUrl set Twilio plays its default "this number is not in
 * service" message on inbound calls — that was the bug that made calls
 * never reach voice-forward even after the operator saved a forwarding
 * number in Settings.
 *
 * Request:  POST { area_code?: string, country?: string, site_id?: uuid }
 * Response: 200 { phone_e164, reused: boolean }
 *
 * Deploy:   supabase functions deploy provision-number --project-ref dbasazrdbtigrdntaehb
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
    const user = authData.user;

    const { area_code = '613', country = 'CA', site_id = null } = await safeJson(req);

    // Idempotency: return existing active number if any.
    const { data: existing } = await supabase
      .from('frm_operator_numbers')
      .select('phone_e164')
      .eq('operator_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (existing?.phone_e164) {
      return json({ phone_e164: existing.phone_e164, reused: true });
    }

    const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const searchUrl =
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}` +
      `/AvailablePhoneNumbers/${country}/Local.json` +
      `?AreaCode=${area_code}&SmsEnabled=true&VoiceEnabled=true&Limit=1`;
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Basic ${creds}` },
    });
    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error('Twilio search failed:', searchRes.status, text);
      return json({ error: 'Number search failed', detail: text }, 502);
    }
    const searchData = await searchRes.json();
    const candidates = searchData.available_phone_numbers || [];
    if (candidates.length === 0) {
      return json({ error: `No available numbers in area code ${area_code}` }, 404);
    }
    const candidate = candidates[0].phone_number;

    const smsUrl = `${SUPABASE_URL}/functions/v1/request-ingest`;
    const voiceUrl = `${SUPABASE_URL}/functions/v1/voice-forward`;
    const buyUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`;
    const buyRes = await fetch(buyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        PhoneNumber: candidate,
        SmsUrl: smsUrl,
        SmsMethod: 'POST',
        VoiceUrl: voiceUrl,
        VoiceMethod: 'POST',
        FriendlyName: `OnSite Operator — ${user.email || user.id}`,
      }).toString(),
    });
    if (!buyRes.ok) {
      const text = await buyRes.text();
      console.error('Twilio purchase failed:', buyRes.status, text);
      return json({ error: 'Number purchase failed', detail: text }, 502);
    }
    const purchased = await buyRes.json();

    const { data: saved, error: insertErr } = await supabase
      .from('frm_operator_numbers')
      .insert({
        operator_id: user.id,
        site_id,
        phone_e164: purchased.phone_number,
        provider: 'twilio',
        provider_sid: purchased.sid,
        status: 'active',
        monthly_cost: 1.15,
        metadata: { twilio_capabilities: purchased.capabilities || {} },
      })
      .select('phone_e164')
      .single();

    if (insertErr) {
      console.error('DB insert failed:', insertErr);
      // Orphaned Twilio number — release it so we don't keep paying.
      await releaseNumber(purchased.sid, creds).catch(() => {});
      return json({ error: 'Database insert failed', detail: insertErr.message }, 500);
    }

    return json({ phone_e164: saved.phone_e164, reused: false });
  } catch (err) {
    console.error('provision-number error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

async function releaseNumber(sid: string, creds: string) {
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
    { method: 'DELETE', headers: { Authorization: `Basic ${creds}` } },
  );
}

async function safeJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
