/**
 * OnSite Club - Spacing Tokens (Enterprise Theme v3.0)
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

/**
 * Shadow tokens (soft elevation - neutral)
 */
export const shadows = {
  sm: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  },
} as const;
