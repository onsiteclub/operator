/**
 * signup-operator — Edge Function
 *
 * Creates a new operator account WITHOUT triggering Supabase's
 * confirmation email. The Supabase project is shared across multiple
 * apps (operator, checklist, invoicepass, …) and the email template
 * is project-global — branded "InvoicePass". Calling
 * `supabase.auth.signUp()` from the client would send that misleading
 * email to operator customers.
 *
 * Workaround: use the admin API (service_role) to create the user
 * with `email_confirm: true`, which short-circuits the confirmation
 * flow entirely. The client then signs in with email+password to get
 * a session, and verifies the phone via Twilio Verify SMS as usual.
 *
 * No email of any kind is sent to operator customers.
 *
 * Request:  POST { email, password, phone, firstName, lastName }
 * Response: 200 { user_id }
 *           400 { error: 'already_registered' | 'validation_failed' }
 *
 * Deploy:   supabase functions deploy signup-operator --project-ref dbasazrdbtigrdntaehb
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { email, password, phone, firstName, lastName } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return json({ error: 'validation_failed', detail: 'email required' }, 400);
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return json({ error: 'validation_failed', detail: 'password >= 8 chars' }, 400);
    }
    if (!phone || typeof phone !== 'string' || !phone.startsWith('+')) {
      return json({ error: 'validation_failed', detail: 'phone in E.164 format' }, 400);
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      phone,
      email_confirm: true,    // pre-confirm so Supabase sends NO email
      phone_confirm: false,   // phone still needs Twilio Verify SMS round-trip
      user_metadata: {
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName || null,
      },
    });

    if (error) {
      // Supabase returns 422 for duplicate email or invalid phone.
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
        return json({ error: 'already_registered' }, 409);
      }
      console.error('admin.createUser failed:', error);
      return json({ error: 'create_failed', detail: error.message }, 500);
    }

    return json({ user_id: data.user?.id });
  } catch (err) {
    console.error('signup-operator error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
