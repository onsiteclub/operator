/**
 * delete-account — Edge Function
 *
 * Permanently deletes the authenticated user's account. Two responsibilities
 * the client can't do safely on its own:
 *
 *   1. Release any active Twilio phone numbers the user owns
 *      (frm_operator_numbers) so we stop paying ~$1.15/mo per orphaned
 *      line. Without this, deleting the auth row would just leave the
 *      Twilio resources hanging.
 *   2. Call auth.admin.deleteUser() — the only path that hard-removes
 *      the user from auth.users (the regular SDK has no self-delete).
 *
 * Data tables referencing the user (frm_operator_numbers, frm_alerts,
 * profiles, …) are removed via the auth-user delete cascade; if any FK
 * lacks ON DELETE CASCADE the function returns the underlying error
 * unchanged so we can fix the migration.
 *
 * Auth: requires the caller's own user JWT in the Authorization header.
 * The operation always targets that user — there's no `user_id` param,
 * which prevents accidental deletion of someone else's account.
 *
 * Request:  POST (no body)
 * Response: 200 { ok: true, released_numbers: [phone_e164…] }
 *
 * Deploy:   supabase functions deploy delete-account --project-ref dbasazrdbtigrdntaehb
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') || '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData.user) return json({ error: 'Unauthorized' }, 401);
    const userId = authData.user.id;

    // 1. Release Twilio numbers tied to this operator. Best-effort: if a
    //    Twilio call fails (e.g. number already released externally), log
    //    and continue — losing a Twilio orphan is preferable to blocking
    //    the user from deleting their account.
    const { data: numbers } = await supabase
      .from('frm_operator_numbers')
      .select('id, phone_e164, provider_sid, status')
      .eq('operator_id', userId)
      .eq('status', 'active');

    const releasedNumbers: string[] = [];
    if (numbers && numbers.length > 0 && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      for (const row of numbers) {
        if (!row.provider_sid) continue;
        try {
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${row.provider_sid}.json`,
            { method: 'DELETE', headers: { Authorization: `Basic ${creds}` } },
          );
          if (resp.ok || resp.status === 404) {
            releasedNumbers.push(row.phone_e164);
          } else {
            const detail = await resp.text();
            console.error('Twilio release failed:', resp.status, detail);
          }
        } catch (err) {
          console.error('Twilio release exception:', err);
        }
      }
      // Mark released in DB regardless of Twilio result — the row will be
      // cascade-deleted with the user anyway, but flipping status first
      // keeps the audit trail consistent if the cascade fails.
      await supabase
        .from('frm_operator_numbers')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('operator_id', userId)
        .eq('status', 'active');
    }

    // 2. Hard-delete the auth user. Cascades to any table with
    //    ON DELETE CASCADE on user_id / operator_id.
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('admin.deleteUser failed:', delErr);
      return json({ error: 'Account deletion failed', detail: delErr.message }, 500);
    }

    return json({ ok: true, released_numbers: releasedNumbers });
  } catch (err) {
    console.error('delete-account error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
