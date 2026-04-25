# Package Audit — operator_2

> Generated during Phase 0 scaffold. Verified against `packages/*/package.json`.

## Packages in monorepo

| Package | Present | Using | Reason |
|---------|---------|-------|--------|
| `@onsite/supabase` | yes | yes | Configured client, typed Database, auth helpers |
| `@onsite/auth` | yes | yes | Unified OnSite login, AuthProvider + useAuth hook |
| `@onsite/auth-ui` | yes | yes | Shared login screens (AuthFlow component) |
| `@onsite/shared` | yes | yes | Types, interfaces, enums shared across apps |
| `@onsite/framing` | yes | yes | Framing domain types/hooks (existing operator uses it) |
| `@onsite/ui` | yes | yes | Base components (Button, Card, Input) — native export |
| `@onsite/tokens` | yes | yes | Colors, spacing, typography, radii — all styling reads from here |
| `@onsite/offline` | yes | yes | SQLite wrapper + sync queue — essential for basement connectivity |
| `@onsite/hooks` | yes | yes | Shared React hooks (network state, app state) |
| `@onsite/utils` | yes | yes | Formatters, date helpers — sub-exports only (avoid cn.ts) |
| `@onsite/logger` | yes | yes | Structured logging |
| `@onsite/messaging` | **created** | yes | NEW — Twilio SMS + WhatsApp Cloud API adapters |
| `@onsite/ai` | yes | no | Parser runs server-side in Edge Function, not in app |
| `@onsite/voice` | yes | no | Text-only in v2 — audio explicitly descoped |
| `@onsite/calendar` | no | no | Does not exist in monorepo |
| `@onsite/agenda` | yes | no | No calendar/agenda surface in this app |
| `@onsite/timeline` | yes | no | Not in scope for v2 |
| `@onsite/sharing` | yes | no | No QR sharing in operator_2 |
| `@onsite/media` | yes | no | No media uploads in v2 |
| `@onsite/camera` | yes | no | No camera/photo in v2 |

## DB Schema Findings

The directive proposed creating 6 new tables. Investigation revealed **39 `frm_*` tables already exist**.
The correct approach is ALTER existing tables + create only `frm_patterns` (new).

| Directive Table | Existing Table | Action |
|----------------|---------------|--------|
| `frm_requests` | `frm_material_requests` | ALTER — add `raw_message`, `source`, `confidence`, `language_detected` |
| `frm_workers` | `frm_site_workers` | ALTER — add `phone_e164`, `trades[]`, `last_active_at`, `total_requests` |
| `frm_messages` | `frm_messages` | EXISTS — already has sender_type, content, AI fields |
| `frm_operator_state` | `frm_operator_assignments` + `frm_jobsites` | EXISTS — machine_down fields on jobsites |
| `frm_alerts` | `frm_warnings` | EXISTS — category, priority, sent_by, status |
| `frm_daily_reports` | `frm_ai_reports` | EXISTS — sections, metrics, period_start/end |
| `frm_patterns` | — | CREATE — new table for AI vocabulary learning |

## Notes

- `egl_sites` does not exist — the framing domain uses `frm_jobsites`
- `frm_jobsites` needs `tz` column for Phase 6 cron scheduling
- No JWT custom claims hook exists — Phase 1 must create one for operator/supervisor roles
- WhatsApp deferred — Twilio SMS ready, WhatsApp adapter is a stub
