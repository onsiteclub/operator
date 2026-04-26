# Timesheet & Invoice — Implementation Plan

Plan for porting the timesheet + bi-weekly invoice system from `onsite-timekeeper` into `onsite-operator`. Captures every decision agreed before kickoff so future-us (or another agent) can pick this up cold.

---

## 1. Goals

The machinist needs to:

1. **Punch in/out** for each shift, transparently — by reusing the existing online/offline toggle in [app/(tabs)/machine.tsx](../app/(tabs)/machine.tsx). Tapping "Go online" in the morning starts a shift; tapping "Go offline (shift end)" closes it. No separate punch UI.
2. **See a banner** on the home screen ([app/(tabs)/index.tsx](../app/(tabs)/index.tsx)) reminding them to punch in, when they're offline during business hours (06:00–18:00).
3. **View a calendar of hours** inside the existing reports tab ([app/(tabs)/reports.tsx](../app/(tabs)/reports.tsx)) — month view with hours per day, tap a day to edit/add manual entry.
4. **Generate a bi-weekly invoice PDF** from a new `Invoice` tab — a 3-step wizard mirroring timekeeper: pick date range on calendar → pick client → confirm summary + hourly rate → generate PDF → share via OS sheet.

---

## 2. Architecture decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **SQLite-first with Supabase sync** | Matches timekeeper's proven model. Machinist on a noisy site stays functional offline; sync runs at boot, midnight, on network reconnect, and manually. |
| 2 | **Same Supabase project as operator** (`dbasazrdbtigrdntaehb`) | Confirmed. Timesheet tables (`daily_hours`, `business_profile`, `invoices`, `invoice_items`, `clients`) coexist with `frm_*` tables. RLS isolates per `user_id`. |
| 3 | **No services/products invoice flow** | This app only tracks operator hours. `ServicesWizard.tsx` is **not** copied. Hub becomes a single "Invoice by Hours" path. |
| 4 | **Auth deferred to a later phase** | Timekeeper has its own mature auth flow. We copy `authStore.ts` from timekeeper as-is — both apps read the same Supabase session via `supabase.auth.getUser()`, so they agree on identity without integration work. Auth unification across apps is a future concern. |
| 5 | **Reuse the online/offline toggle as punch source** | Single concept: "I'm working" = "machine is online". Trade-off: machinist cannot go offline for lunch without ending shift. Acceptable for v1. |
| 6 | **Keep `break_minutes` field in schema** even though UI won't expose break tracking | Forward-compat: avoids a future migration if break tracking is added. Default to 0. |
| 7 | **Invoice tab is new and separate** from reports | Mirrors timekeeper layout. Reports keeps queue stats; Invoice owns wizard + history. |
| 8 | **No services/products tables in Supabase migration** | Schema is hours-only. Even though `invoices` table has fields used by the services flow, we leave them nullable. |

---

## 3. App structure after port

```
app/(tabs)/
  index.tsx       — Requests              + offline-during-business-hours banner
  machine.tsx     — Machine status        + useShiftToggle hook (replaces useAutoLogToggle)
  reports.tsx     — Reports               + timesheet section (calendar + day modal)
  invoice.tsx     — NEW                     hourly wizard + PDF + share
app/
  business-profile.tsx  — NEW             setup screen (name, address, tax rate, default hourly rate)
  client-edit.tsx       — NEW             client address sheet (used by wizard step 2)
```

---

## 4. File copy inventory

### A. SQLite layer — `src/lib/database/`
- `core.ts` — strip schemas for `locations`, `location_audit`, `geofence_events`, `ai_event_log`, `ai_corrections`, `analytics_daily`. Rename DB to `onsite-operator.db`. Keep `daily_hours`, `business_profile`, `invoices`, `invoice_items`, `clients`, `error_log`.
- `daily.ts` — copy as-is. `addMinutesToDay()` is the function `useShiftToggle` calls on punch-out.
- `invoices.ts` — copy as-is.
- `clients.ts` — copy as-is.
- `businessProfile.ts` — copy as-is.
- `index.ts` — barrel re-export, prune deleted tables.

### B. Stores — `src/stores/`
- `dailyLogStore.ts` — copy as-is. **Remove** import of `locationStore`. Make `locationId` / `locationName` arguments to `startTracking` optional (`startTracking('manual', 'Operator')`).
- `businessProfileStore.ts` — copy as-is.
- `invoiceStore.ts` — copy as-is. Remove any references to services/products if any are unconditional (re-check at copy time).
- `syncStore.ts` — copy as-is. Strip `app_timekeeper_geofences` sync (location download).
- `snackbarStore.ts` — copy as-is.
- `authStore.ts` — copy as-is. Coexists with `@onsite/auth` since both read the same Supabase session.

### C. UI primitives — `src/components/`
- `Calendar.tsx` — copy as-is. Used by both timesheet (mode='single') and invoice wizard (mode='range').
- `ui/PressableOpacity.tsx`
- `ui/Button.tsx`
- `ui/HeaderRow.tsx`
- `ui/ModalOverlay.tsx`

### D. Invoice screens — `src/screens/invoice/`
- `InvoiceSummaryCard.tsx` — copy as-is (read-only mode used by wizard step 3, full mode by detail modal).
- `ClientEditSheet.tsx` — copy as-is.
- ❌ `ServicesWizard.tsx` — **do not copy** (no services concept).

### E. Helpers and PDF — `src/lib/`
- `format.ts` — copy as-is (`formatMoney`, `formatDuration`, `BREAK_PRESETS`).
- `timesheetPdf.ts` — copy as-is.
- `invoicePdf.ts` — copy as-is, keep `generateHoursReportHTML()`. Trim products/services HTML branch.
- `invoiceShare.ts` — copy as-is.
- `invoiceXmp.ts` — copy as-is (XMP metadata). Optional but cheap — keeps PDFs parsable by OnSite Ops downstream.

### F. Home screen helpers — `src/screens/home/`
- `helpers.ts` — copy as-is (`getMonthCalendarDays`, `getDayKey`, `isSameDay`, etc.).
- `hooks.ts` — port only the manual-entry portion (`openDayEdit`, `saveDayEdit`, `deleteDayLog`). Don't bring `useHomeScreen()` wholesale — most of it is GPS-coupled.

### G. App-level screens — `app/`
- `business-profile.tsx` — copy as-is.
- `client-edit.tsx` — copy as-is.
- `(tabs)/invoice.tsx` — copy and trim:
  - Remove the "Invoice by Services" branch from the hub (single button: "Invoice by Hours" — or skip the hub and go straight to wizard).
  - Replace any `useAutoLogToggle` reference with `useShiftToggle`.
  - 3863 lines today — expect ~2500 after trim.

### H. New / glue files
- `src/hooks/useShiftToggle.ts` — replaces timekeeper's `useAutoLogToggle`. Wraps the existing `useOperatorStore` setOnline/setOffline calls and additionally invokes `dailyLogStore.startTracking() / stopTracking()`. End-of-shift confirmation Alert.
- `supabase/migrations/0002_timesheet_tables.sql` — creates `daily_hours`, `business_profile`, `invoices`, `invoice_items`, `clients`. Adds RLS policies scoped by `auth.uid() = user_id`.

---

## 5. Schema migration (Supabase)

`supabase/migrations/0002_timesheet_tables.sql` will create:

```
daily_hours        (id, user_id, date, total_minutes, break_minutes, location_name,
                    location_id, verified, source, type, first_entry, last_exit,
                    notes, deleted_at, created_at, updated_at, synced_at)
business_profile   (id, user_id, business_name, address, city, region, postal_code,
                    phone, email, tax_rate, default_hourly_rate, logo_url, ...)
clients            (id, user_id, name, address, ...)
invoices           (id, user_id, client_id, period_start, period_end, hourly_rate,
                    tax_rate, total_minutes, total_amount, pdf_uri, status, ...)
invoice_items      (id, invoice_id, date, location_name, minutes, ...)
```

All scoped by `user_id` with RLS:
```sql
CREATE POLICY "user owns their rows"
  ON <table> FOR ALL
  USING (auth.uid() = user_id);
```

`break_minutes` kept on `daily_hours` (default 0) for forward compat — not exposed in UI.

---

## 6. Dependencies to add

| Package | Purpose |
|---|---|
| `expo-sqlite` | Local DB |
| `expo-print` | HTML → PDF |
| `expo-file-system` | PDF file handling |
| `expo-sharing` | OS share sheet |
| `pdf-lib` | XMP metadata injection |

`@react-native-community/netinfo` is already in `package.json`.

---

## 7. Glue work specific to operator

### 7.1 `useShiftToggle` (replaces `useAutoLogToggle`)

```ts
// src/hooks/useShiftToggle.ts
export function useShiftToggle() {
  const { isOnline, setOnline, setOffline } = useOperatorStore();
  const { startTracking, stopTracking, tracking } = useDailyLogStore();

  const toggle = useCallback((nextValue: boolean) => {
    if (nextValue) {
      setOnline();                                    // existing operator logic
      startTracking('manual', 'Operator');            // open shift
    } else {
      Alert.alert('End shift?', '...', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End shift', style: 'destructive', onPress: () => {
          setOffline('shift end');                    // existing operator logic
          stopTracking();                             // closes shift, writes daily_hours
        }},
      ]);
    }
  }, [setOnline, setOffline, startTracking, stopTracking]);

  return { isOn: isOnline && tracking.isTracking, toggle };
}
```

### 7.2 Offline banner on home

In `app/(tabs)/index.tsx`, render a banner when:
- `!isOnline`, AND
- Local time is between `06:00` and `18:00`.

Banner text: "You're offline — open Machine to start your shift."

### 7.3 No auth bridge needed

Both `@onsite/auth` and timekeeper's `authStore` ultimately call `supabase.auth.getUser()`. They naturally agree on who the user is. We just copy `authStore.ts` and use it inside the timesheet code. No glue layer.

---

## 8. Known gotchas (must not regress)

| # | Gotcha | Mitigation |
|---|---|---|
| 1 | `new Date().toISOString().split('T')[0]` returns UTC and breaks at night in negative timezones | Always use `toLocalDateString()` from `core.ts:774` |
| 2 | Modal-chain freeze: closing one modal and opening another in the same tick freezes the app on Android+iOS | Android: `setTimeout(..., 350)`. iOS: use `onDismiss`. See `invoice.tsx:858-870`. |
| 3 | `expo-print` can hang >30s on low-end Android | Add explicit 30s timeout around `printToFileAsync()` |
| 4 | `due_date` overdue calc uses `'T23:59:59'` local-time suffix → drift across timezones | Already handled in `invoices.ts:62` — preserve as-is |
| 5 | Editing rate on a saved invoice updates totals but **not** the saved PDF | Add `regeneratePdf()` call after `updateInvoice()` |
| 6 | XMP injection can fail silently after PDF is created | Log a warning, share continues |
| 7 | Wizard rate override resets when navigating back through wizard steps | Inherent to `InvoiceSummaryCard` remount — accept for v1 |
| 8 | `useAuthStore.getUserId()` can return null mid-wizard if auth lost | Add a guard before each invoice-creating call |

---

## 9. Phased delivery

| Phase | Scope | Files touched | Commit |
|---|---|---|---|
| **1. Foundation** | SQLite init, schemas, `dailyLogStore` adapted, `authStore` copy, `syncStore` (without locations), `useShiftToggle`, machine.tsx wired. **No new UI.** Tracking works in background when toggle is flipped. | ~12 files | 1 |
| **2. Timesheet UI** | `Calendar` + `helpers.ts` + day modal embedded in `reports.tsx`. Offline banner on `index.tsx`. Manual entry edit/delete from day modal. | ~8 files | 1 |
| **3. Business profile** | `app/business-profile.tsx`, `businessProfileStore`, validators. Settings entry point to navigate there. | ~4 files | 1 |
| **4. Invoice wizard** | `app/(tabs)/invoice.tsx` (trimmed), `InvoiceSummaryCard`, `ClientEditSheet`, `app/client-edit.tsx`, PDF gen + share. | ~8 files | 1 |
| **5. Sync** | `supabase/migrations/0002_timesheet_tables.sql` + activate `syncStore` triggers (boot, midnight, network reconnect). Run migration in Supabase dashboard. | ~3 files + 1 SQL | 1 |

5 commits, each independently deployable. Each phase ends green on `npm run typecheck`.

---

## 10. Open questions to revisit during implementation

- **Machinist identity for `user_id`** — uses Supabase auth user id. Confirmed. If multiple machinists share one device with one Supabase login, all timesheets attribute to that user. Future enhancement: per-machinist sub-identity.
- **`break_minutes` UI** — kept in schema, hidden in v1 UI. Decision to revisit if biweekly review shows machinists wanting to log break.
- **PDF storage** — local file URI only (matches timekeeper). Sync uploads PDF separately later if needed.
- **Hub vs direct entry into wizard** — timekeeper has a hub with two buttons (Hours / Services). With Services removed, we either (a) keep the hub with one button or (b) skip the hub and go straight into wizard. Recommendation: (b) — saves a tap.

---

## 11. Reference: timekeeper file paths

Source for every copy operation:

```
c:\Dev\Onsite-club\onsite-timekeeper\
  src/lib/database/{core,daily,invoices,clients,businessProfile,index}.ts
  src/stores/{dailyLogStore,businessProfileStore,invoiceStore,syncStore,snackbarStore,authStore}.ts
  src/components/Calendar.tsx
  src/components/ui/{PressableOpacity,Button,HeaderRow,ModalOverlay}.tsx
  src/screens/invoice/{InvoiceSummaryCard,ClientEditSheet}.tsx
  src/screens/home/helpers.ts
  src/screens/home/hooks.ts                  ← partial port (manual entry only)
  src/lib/{format,timesheetPdf,invoicePdf,invoiceShare,invoiceXmp}.ts
  app/business-profile.tsx
  app/client-edit.tsx
  app/(tabs)/invoice.tsx                     ← copy + trim services
```
