/**
 * OnSite Club - Color Tokens (Enterprise Theme v3.0)
 *
 * Design direction: Professional, enterprise-grade, modern
 * Principles: Clean neutrals, utility green, muted amber accents
 *
 * Ratio: 85-90% neutrals / 8-12% green / 2-5% amber
 *
 * Timer states: idle = neutral, running = green, paused = amber
 * Tab bar: active = amber, inactive = iconMuted
 * Primary buttons = green filled, secondary = neutral outline
 */

export const colors = {
  // ============================================
  // NEUTRALS (Structure - 85-90%)
  // ============================================

  // Backgrounds
  background: '#F6F7F9',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary: '#F2F4F7',
  backgroundElevated: '#FFFFFF',

  // Surfaces
  surface: '#FFFFFF',
  surface2: '#F2F4F7',
  surfaceMuted: '#F6F7F9',

  // Text
  text: '#101828',
  textSecondary: '#667085',
  textTertiary: '#667085',
  textMuted: '#667085',

  // Icons
  iconMuted: '#98A2B3',

  // Borders
  border: '#E3E7EE',
  borderLight: '#F2F4F7',
  borderFocus: '#0F766E',

  // Base colors
  black: '#101828',
  white: '#FFFFFF',

  // ============================================
  // BRAND ACCENT - MUTED AMBER (2-5%)
  // ============================================

  primary: '#C58B1B',
  primaryStrong: '#A67516',
  primaryPressed: '#8F6513',
  primarySoft: '#FFF3D6',
  primaryLight: '#FFF3D6',
  primaryLine: '#F2D28B',
  primaryDark: '#A67516',

  amber: '#C58B1B',
  amberSoft: '#FFF3D6',
  amberLine: '#F2D28B',

  // ============================================
  // UTILITY GREEN (8-12%)
  // ============================================

  accent: '#0F766E',
  accentLight: '#14B8A6',
  accentSoft: '#D1FAE5',

  green: '#0F766E',
  greenSoft: '#D1FAE5',

  // ============================================
  // FEEDBACK / STATES
  // ============================================
  success: '#0F766E',
  successLight: '#14B8A6',
  successSoft: '#D1FAE5',

  warning: '#C58B1B',
  warningDark: '#A67516',
  warningSoft: '#FFF3D6',

  error: '#DC2626',
  errorLight: '#EF4444',
  errorSoft: 'rgba(220, 38, 38, 0.12)',

  info: '#3B82F6',
  infoDark: '#2563EB',

  // ============================================
  // TIMER STATES
  // ============================================

  timerIdle: '#98A2B3',
  timerActive: '#0F766E',
  timerPaused: '#C58B1B',
  timerBackground: '#FFFFFF',
  timerRing: 'rgba(15, 118, 110, 0.15)',
  timerRingTrack: '#E3E7EE',

  // ============================================
  // COMPONENT-SPECIFIC
  // ============================================

  card: '#FFFFFF',
  cardBorder: '#E3E7EE',
  cardPressed: '#F6F7F9',
  cardAccent: '#0F766E',

  tabBar: '#FFFFFF',
  tabBarBorder: '#E3E7EE',
  tabActive: '#C58B1B',
  tabInactive: '#98A2B3',

  header: '#F6F7F9',
  headerText: '#101828',

  input: '#F2F4F7',
  inputBorder: '#E3E7EE',
  inputPlaceholder: '#98A2B3',
  inputFocus: '#0F766E',

  buttonPrimary: '#0F766E',
  buttonPrimaryText: '#FFFFFF',
  buttonSecondary: '#FFFFFF',
  buttonSecondaryBorder: '#E3E7EE',
  buttonSecondaryText: '#101828',
  buttonDisabled: '#F2F4F7',
  buttonDisabledText: '#98A2B3',

  buttonDanger: '#DC2626',
  buttonDangerPressed: '#B91C1C',
  buttonDangerText: '#FFFFFF',

  mapCircle: 'rgba(15, 118, 110, 0.2)',
  mapCircleBorder: '#0F766E',

  badgeActive: '#0F766E',
  badgeActiveText: '#FFFFFF',
  badgeSuccess: '#0F766E',
  badgeWarning: '#C58B1B',
  badgeError: '#DC2626',
  badgeInfo: '#3B82F6',

  overlay: 'rgba(16, 24, 40, 0.6)',
  overlayLight: 'rgba(16, 24, 40, 0.4)',

  graphite: '#F6F7F9',
  steel: '#E3E7EE',
  graphBar: '#0F766E',
} as const;

/**
 * Helper to create color with opacity
 */
export function withOpacity(color: string, opacity: number): string {
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/, `${opacity})`);
  }

  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Location colors (for map circles)
 */
export const localColors = [
  '#F6C343',  // Yellow (primary)
  '#3B82F6',  // Blue
  '#16A34A',  // Green
  '#8B5CF6',  // Purple
  '#EC4899',  // Pink
  '#06B6D4',  // Cyan
  '#F97316',  // Orange
  '#14B8A6',  // Teal
];

export function getLocalColor(index: number): string {
  return localColors[index % localColors.length];
}

export function getRandomGeofenceColor(): string {
  const randomIndex = Math.floor(Math.random() * localColors.length);
  return localColors[randomIndex];
}

export type Colors = typeof colors;
