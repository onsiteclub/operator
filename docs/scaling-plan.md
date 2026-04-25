# Operator_2 — Scaling Plan

Multi-tenant SaaS roadmap for operator_2. Each operator signup auto-provisions
a dedicated phone number — no manual Twilio buys, no shared inbox confusion.

## The core architecture

```
Operator signs up in app
        ↓
Backend calls Twilio (or Telnyx) Number Provisioning API
        ↓
Provider returns fresh phone number (~5 seconds)
        ↓
Webhook auto-configured → points to request-ingest Edge Function
        ↓
Record saved in frm_operator_numbers
        ↓
App displays number: "Share +1 (613) 900-1234 with your crew"
        ↓
Workers SMS that number
        ↓
request-ingest uses the `To:` field to look up owning operator
        ↓
Request lands in correct operator's queue
```

The `To:` field in the Twilio webhook payload is what enables multi-tenant routing
on a single Edge Function. No changes needed to worker behavior.

## Phases

### Phase 1 — Shared number MVP (deprecated)

- One shared Twilio number, routing via worker phone → jobsite
- Only makes sense when a single site uses the system
- **Skipped.** Phase 2 implemented directly to avoid a migration later.

### Phase 2 — Auto-provisioning (CURRENT)

Implemented components:

- `frm_operator_numbers` table (migration `025_operator2_state_alerts_numbers.sql`)
- Edge Function `supabase/functions/provision-number/index.ts`
- `request-ingest` routes by `To:` field → `frm_operator_numbers.operator_id + site_id`
- App: `OperatorNumberCard` component on Machine screen
- `src/api/operatorNumber.ts` — typed client for provision + fetch

#### New table

```sql
CREATE TABLE frm_operator_numbers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  site_id         UUID REFERENCES frm_jobsites(id),
  phone_e164      TEXT UNIQUE NOT NULL,
  provider        TEXT DEFAULT 'twilio' CHECK (provider IN ('twilio','telnyx','bandwidth')),
  provider_sid    TEXT,              -- Twilio PN... SID for lifecycle ops
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','released','suspended')),
  monthly_cost    NUMERIC(10,4),
  provisioned_at  TIMESTAMPTZ DEFAULT now(),
  released_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX frm_operator_numbers_operator ON frm_operator_numbers(operator_id);
CREATE INDEX frm_operator_numbers_phone ON frm_operator_numbers(phone_e164);
```

#### New Edge Function: `provision-number`

Called during signup. Thin wrapper around the Twilio Number API.

```ts
// supabase/functions/provision-number/index.ts
Deno.serve(async (req) => {
  const { operator_id, area_code = '613' } = await req.json();

  // 1. Search available numbers
  const searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${SID}/AvailablePhoneNumbers/CA/Local.json?AreaCode=${area_code}&Limit=1`;
  const search = await fetch(searchUrl, { headers: { Authorization: `Basic ${creds}` } });
  const { available_phone_numbers } = await search.json();
  const number = available_phone_numbers[0].phone_number;

  // 2. Purchase with webhook pre-wired
  const buyUrl = `https://api.twilio.com/2010-04-01/Accounts/${SID}/IncomingPhoneNumbers.json`;
  const buy = await fetch(buyUrl, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      PhoneNumber: number,
      SmsUrl: `${SUPABASE_URL}/functions/v1/request-ingest`,
      SmsMethod: 'POST',
    }).toString(),
  });
  const purchased = await buy.json();

  // 3. Save to DB
  await supabase.from('frm_operator_numbers').insert({
    operator_id,
    phone_e164: purchased.phone_number,
    provider: 'twilio',
    provider_sid: purchased.sid,
    monthly_cost: 1.15,
  });

  return Response.json({ phone: purchased.phone_number });
});
```

#### Update: `request-ingest`

Replace the current worker-based routing with number-based routing:

```ts
// BEFORE (Phase 1)
const worker = await upsertWorker(phone);
const jobsiteId = worker.jobsite_id;  // single shared number

// AFTER (Phase 2)
const toNumber = raw.To;              // operator's dedicated number
const { data: opNumber } = await supabase
  .from('frm_operator_numbers')
  .select('operator_id, site_id')
  .eq('phone_e164', toNumber)
  .eq('status', 'active')
  .maybeSingle();

if (!opNumber) return twimlResponse('Number not registered');

const worker = await upsertWorker(phone, opNumber.site_id);
const jobsiteId = opNumber.site_id;
```

#### New app screen: `settings/number.tsx`

Shows the operator's provisioned number with a copy button and share sheet.
Triggered automatically after signup if `frm_operator_numbers` has no row.

#### Cancellation / release

When operator cancels subscription, call Twilio `DELETE /IncomingPhoneNumbers/{sid}`
and flip `frm_operator_numbers.status = 'released'`. Prevents orphaned numbers.

**Cost: ~$1/operator/month, embedded in subscription.**

### Phase 3 — Provider migration (100+ operators)

At scale, Twilio becomes expensive. Migrate to Telnyx:

- Same provisioning API shape, different endpoints
- ~50% cheaper per number (~$0.50/month)
- ~30% cheaper per SMS (~$0.005 vs $0.0075)
- Drop-in replacement — the `provider` column in `frm_operator_numbers`
  already supports this

WhatsApp Business (Twilio Embedded Signup) becomes a paid upgrade path for
operators who want richer UX. Pricing is per-conversation, not per-message.

### Phase 4 — Wholesale (1000+ operators)

Evaluate Bandwidth. Requires enterprise contract (USD$10k+/year minimum) but
pricing drops another 50% at volume. TextNow, Google Voice, and most virtual
number apps sit on top of Bandwidth.

## Unit economics

Assuming $19/month subscription:

| Scale | Twilio cost/op | Margin | Notes |
|-------|----------------|--------|-------|
| 10 ops | $1.15 + ~$0.40 SMS | 92% | Comfortable |
| 100 ops | $1.15 + ~$0.75 SMS | 90% | Still Twilio |
| 500 ops | Migrate to Telnyx | 95% | ~$0.50/op |
| 5000 ops | Migrate to Bandwidth | 97% | Enterprise tier |

SMS volume estimate: 15 messages/day per operator (5 workers × 3 requests/day).

## WhatsApp in multi-tenant SaaS

Harder than SMS. Each number needs:
- Meta Business Manager verification (2-7 business days)
- Display Name approved (can be rejected)
- Dedicated number, cannot be shared across tenants

### Options

1. **Twilio Tech Providers Program + Embedded Signup**
   - Operator clicks "Connect WhatsApp", OAuth flow with Meta
   - Twilio manages the BSP relationship
   - Meta charges per conversation initiated

2. **360dialog Partner API**
   - Specialized in WhatsApp multi-tenant
   - Higher per-number cost, automated setup

3. **Skip WhatsApp until Phase 3**
   - Recommended. Not worth the complexity in v1/v2.

## What NOT to build now

- Number provisioning UI before there are paying operators
- WhatsApp multi-tenant before SMS is proven
- Provider abstraction layer before migrating providers once

Phase 1 is sufficient for pilot-scale validation. Revisit this doc when the
first 5 paying operators are onboarded.

## Triggers to move between phases

| From | To | Trigger |
|------|-----|---------|
| Phase 1 | Phase 2 | First paying operator signs up, OR second site added |
| Phase 2 | Phase 3 | Twilio monthly bill > $200 |
| Phase 3 | Phase 4 | Telnyx monthly bill > $5000 |

## Related code

- Current webhook: `supabase/functions/request-ingest/index.ts`
- Worker routing: `frm_site_workers.jobsite_id`
- Messaging Service SID env var: `TWILIO_MESSAGING_SERVICE_SID`
- EAS config: `apps/operator_2/eas.json`

## References

- Twilio Number Provisioning API: https://www.twilio.com/docs/phone-numbers/api
- Telnyx Numbers API: https://developers.telnyx.com/docs/numbers
- Bandwidth Wholesale: https://www.bandwidth.com/api/phone-numbers-api/
- Twilio Embedded Signup for WhatsApp: https://www.twilio.com/docs/whatsapp/tech-provider
