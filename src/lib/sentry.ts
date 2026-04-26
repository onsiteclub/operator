/**
 * Sentry shim — operator app version.
 *
 * Timekeeper has full Sentry integration. Operator skips that for now;
 * this stub keeps timekeeper imports compiling so we don't have to edit
 * every file that calls captureMessage / addSentryBreadcrumb.
 */

type Severity = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export function captureMessage(_message: string, _level?: Severity, _context?: unknown): void {
  // no-op
}

export function captureException(_error: unknown, _context?: unknown): void {
  // no-op
}

export function addSentryBreadcrumb(
  _category: string,
  _message: string,
  _data?: Record<string, unknown>,
): void {
  // no-op
}
