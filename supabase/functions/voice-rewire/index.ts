/**
 * voice-rewire — Edge Function (one-shot maintenance)
 *
 * Backfills the Twilio VoiceUrl on every active row in
 * frm_operator_numbers so existing operator lines start routing inbound
 * calls through the voice-forward function. Numbers provisioned before
 * we wired VoiceUrl in provision-number had no voice webhook at all,
 * so Twilio played its default "this number is not in service" message
 * regardless of whether the operator saved a forwarding number.
 *
 * Idempotent: re-running just re-sets VoiceUrl to the same value.
 *
 * Auth: requires the project service_role key in the Authorization
 * header. Not callable from the client app.
 *
 * Request:  POST (no body)
 * Response: 200 { updated: [{ phone_e164, sid, ok, status, detail? }] }
 *
 * Deploy:   supabase functions deploy voice-rewire --project-ref dbasazrdbtigrdntaehb
 * Invoke:   curl -X POST https://<ref>.supabase.co/functions/v1/voice-rewire \
 *             -H "Authorization: Bearer <service_role_key>"
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // Service-role gate: decode the JWT and require role === 'service_role'.
    // The platform already verified the JWT signature (verify_jwt=true).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    let role: string | undefined;
    try {
      const [, payload] = token.split('.');
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      role = json.role;
    } catch {
      // fall through
    }
    if (role !== 'service_role') {
      return json({ error: 'Unauthorized — service role key required' }, 401);
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return json({ error: 'Twilio credentials not configured' }, 500);
    }

    const { data: rows, error: queryErr } = await supabase
      .from('frm_operator_numbers')
      .select('phone_e164, provider_sid, status')
      .eq('status', 'active');
    if (queryErr) {
      return json({ error: 'DB query failed', detail: queryErr.message }, 500);
    }

    const voiceUrl = `${SUPABASE_URL}/functions/v1/voice-forward`;
    const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const results: Array<{
      phone_e164: string;
      sid: string;
      ok: boolean;
      status: number;
      detail?: string;
    }> = [];

    for (const row of rows || []) {
      const sid = row.provider_sid as string | null;
      if (!sid) {
        results.push({
          phone_e164: row.phone_e164,
          sid: '',
          ok: false,
          status: 0,
          detail: 'missing provider_sid',
        });
        continue;
      }
      const updateRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${sid}.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            VoiceUrl: voiceUrl,
            VoiceMethod: 'POST',
          }).toString(),
        },
      );
      const ok = updateRes.ok;
      const detail = ok ? undefined : await updateRes.text();
      results.push({ phone_e164: row.phone_e164, sid, ok, status: updateRes.status, detail });
    }

    return json({ updated: results });
  } catch (err) {
    console.error('voice-rewire error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
