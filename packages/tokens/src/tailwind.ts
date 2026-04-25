/**
 * Tailwind CSS adapter for @onsite/tokens.
 *
 * Usage in tailwind.config.js:
 *   const { tailwindColors } = require('@onsite/tokens/tailwind');
 *   module.exports = { theme: { extend: { colors: tailwindColors } } };
 *
 * Then use: bg-onsite-bg, text-onsite-text, border-onsite-border, etc.
 */

import { colors } from './colors';

/** Flat color map for Tailwind extend.colors under 'onsite' key */
export const tailwindColors = {
  onsite: {
    bg: colors.background,
    'bg-secondary': colors.backgroundSecondary,
    'bg-tertiary': colors.backgroundTertiary,

    surface: colors.surface,
    'surface-muted': colors.surfaceMuted,

    text: colors.text,
    'text-secondary': colors.textSecondary,
    'text-muted': colors.textMuted,

    border: colors.border,
    'border-light': colors.borderLight,

    primary: colors.primary,
    'primary-strong': colors.primaryStrong,
    'primary-soft': colors.primarySoft,
    'primary-line': colors.primaryLine,

    accent: colors.accent,
    'accent-light': colors.accentLight,
    'accent-soft': colors.accentSoft,

    success: colors.success,
    'success-soft': colors.successSoft,
    warning: colors.warning,
    'warning-soft': colors.warningSoft,
    error: colors.error,
    'error-soft': 'rgba(220, 38, 38, 0.12)',
    info: colors.info,

    card: colors.card,
    'card-border': colors.cardBorder,

    'icon-muted': colors.iconMuted,
    overlay: colors.overlay,
  },
} as const;

/**
 * CSS custom properties derived from tokens.
 * Inject into :root {} or use with Tailwind CSS variables.
 */
export function getCSSVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value === 'string') {
      const cssKey = `--onsite-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      vars[cssKey] = value;
    }
  }
  return vars;
}

/**
 * Generate a CSS string with all variables for injection into <style> or globals.css.
 *
 * Returns:
 *   :root { --onsite-background: #F6F7F9; --onsite-text: #101828; ... }
 */
export function getCSSVariablesString(): string {
  const vars = getCSSVariables();
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}

/**
 * RGB tuples for PDF/Canvas rendering (jsPDF, etc.).
 * Usage: const [r, g, b] = rgbColors.primary;
 */
export const rgbColors = {
  primary: [197, 139, 27] as const,
  primaryStrong: [166, 117, 22] as const,
  accent: [15, 118, 110] as const,
  accentLight: [20, 184, 166] as const,
  text: [16, 24, 40] as const,
  textSecondary: [102, 112, 133] as const,
  textMuted: [102, 112, 133] as const,
  background: [246, 247, 249] as const,
  white: [255, 255, 255] as const,
  border: [227, 231, 238] as const,
  error: [220, 38, 38] as const,
  success: [15, 118, 110] as const,
  warning: [197, 139, 27] as const,
  info: [59, 130, 246] as const,
} as const;
