/**
 * Event log shim — operator app version.
 *
 * Timekeeper has product analytics tracking through this module.
 * Operator skips that; the stubs keep timekeeper imports compiling
 * unchanged. If/when analytics is needed, replace this module without
 * touching call sites.
 */

export function trackEvent(_name: string, _properties?: Record<string, unknown>): void {
  // no-op
}

export function trackScreen(_name: string, _properties?: Record<string, unknown>): void {
  // no-op
}

export function trackError(_error: unknown, _context?: Record<string, unknown>): void {
  // no-op
}
