/**
 * voice-forward — Edge Function (Twilio Voice webhook)
 *
 * Wired as the VoiceUrl on each provisioned Twilio number. When a worker
 * calls the operator's line, Twilio POSTs a form-urlencoded webhook here
 * and we answer with TwiML that <Dial>s the operator's personal cell.
 *
 *   worker → +1 (613) 900-XXXX (Twilio)
 *          → this function (TwiML <Dial>)
 *          → operator's personal cell
 *
 * Lookup: frm_operator_numbers.phone_e164 = To. If forward_to_e164 is
 * NULL or no row matches, we play a short "unavailable" message so the
 * caller doesn't hear Twilio's default "not configured" announcement.
 *
 * Caller ID on the leg-B (operator's cell) is set to the Twilio number,
 * not the worker's number — Twilio requires verified caller IDs to spoof
 * arbitrary numbers, and using the Twilio line keeps the operator's
 * "missed call" history scoped to the work line.
 *
 * No JWT verification: Twilio webhooks come from the public internet.
 * Set verify_jwt = false in supabase/config.toml or deploy with
 *   supabase functions deploy voice-forward --no-verify-jwt
 *
 * Twilio-side validation (X-Twilio-Signature) is the right hardening to
 * add once we have a stable public URL — left as a follow-up.
 *
 * Deploy: supabase functions deploy voice-forward --no-verify-jwt --project-ref dbasazrdbtigrdntaehb
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const XML_HEADERS = { 'Content-Type': 'text/xml; charset=utf-8' };

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return twiml(saySorry('This number does not accept calls.'));
  }

  try {
    const form = await req.formData();
    const to = String(form.get('To') ?? '');
    const from = String(form.get('From') ?? '');

    if (!to) {
      console.warn('voice-forward: missing To param');
      return twiml(saySorry('Could not route this call.'));
    }

    const { data: opNumber, error } = await supabase
      .from('frm_operator_numbers')
      .select('forward_to_e164, status')
      .eq('phone_e164', to)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      console.error('voice-forward lookup error:', error);
      return twiml(saySorry('Service error. Please try again later.'));
    }

    const forwardTo = opNumber?.forward_to_e164;
    if (!forwardTo) {
      console.log('voice-forward: no forward target for', to, 'caller', from);
      return twiml(
        saySorry(
          'The operator is not available for calls. Please send a text message instead.',
        ),
      );
    }

    // 30s ring, then hang up. callerId = the Twilio line so operator
    // recognizes it as a work call.
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Dial timeout="30" callerId="${escapeXml(to)}" answerOnBridge="true">` +
      `${escapeXml(forwardTo)}` +
      `</Dial>` +
      `</Response>`;
    return new Response(xml, { headers: XML_HEADERS });
  } catch (err) {
    console.error('voice-forward error:', err);
    return twiml(saySorry('Service error. Please try again later.'));
  }
});

function twiml(inner: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
  return new Response(xml, { headers: XML_HEADERS });
}

function saySorry(text: string) {
  return `<Say voice="Polly.Joanna">${escapeXml(text)}</Say><Hangup/>`;
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
