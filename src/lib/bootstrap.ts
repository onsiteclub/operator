/**
 * Bootstrap — operator stub.
 *
 * Timekeeper uses this module to wire up singleton listeners
 * (AppState, geofence callbacks, heartbeat). Operator doesn't need
 * any of those, so the symbols ported code expects are no-op stubs.
 */

export async function initializeListeners(): Promise<void> {
  // no-op
}

export async function onUserLogin(_userId: string): Promise<void> {
  // no-op
}

export async function onUserLogout(): Promise<void> {
  // no-op
}
