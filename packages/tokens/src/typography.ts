/**
 * OnSite Club - Typography Tokens (Enterprise Theme v3.0)
 */

import { colors } from './colors';

export const typography = {
  screenTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: colors.text,
    lineHeight: 34,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
  },
  timer: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.text,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  meta: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
} as const;
