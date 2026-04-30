/**
 * Background helpers — operator stub.
 *
 * Timekeeper persists the current userId to native shared storage so
 * background tasks (geofencing, notifications) can correlate events.
 * Operator has none of those background tasks, so these are no-ops —
 * the auth store's signatures stay identical for ported code.
 */

export async function setBackgroundUserId(_userId: string): Promise<void> {
  // no-op
}

export async function clearBackgroundUserId(): Promise<void> {
  // no-op
}
