/**
 * Sentry shim — operator app version.
 *
 * Timekeeper has full Sentry integration. Operator skips that for now.
 * Stubs match the timekeeper signature so ported code compiles unchanged.
 */

interface CaptureOptions {
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

export function captureMessage(_message: string, _options?: CaptureOptions): void {
  // no-op
}

export function captureException(_error: unknown, _options?: CaptureOptions): void {
  // no-op
}

export function addSentryBreadcrumb(
  _category: string,
  _message: string,
  _data?: Record<string, unknown>,
): void {
  // no-op
}
