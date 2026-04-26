/**
 * Lightweight logger shim — operator app version.
 *
 * Timekeeper has a richer logger with category filters and remote shipping.
 * For phase 1 we just need the same shape so timekeeper code compiles
 * unchanged. Debug/info are no-ops; warn/error pass through to console.
 */

type LogContext = Record<string, unknown> | undefined;

export const logger = {
  debug: (_category: string, _message: string, _context?: LogContext) => {},
  info: (_category: string, _message: string, _context?: LogContext) => {},
  warn: (category: string, message: string, context?: LogContext) => {
    if (context) console.warn(`[${category}] ${message}`, context);
    else console.warn(`[${category}] ${message}`);
  },
  error: (category: string, message: string, context?: LogContext) => {
    if (context) console.error(`[${category}] ${message}`, context);
    else console.error(`[${category}] ${message}`);
  },
};
