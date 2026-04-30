/**
 * OnSite Club - Color Tokens (v4.0 — Warm Amber)
 *
 * Design direction: Warm, worker-first, minimal
 * Principles: Warm neutrals, amber-only accent
 *
 * Ratio: 90% warm neutrals / 10% amber
 *
 * Timer states: idle = neutral, running = amber, paused = amber (dimmer)
 * Tab bar: active = dark text + amber dot, inactive = muted gray
 * Primary buttons = amber filled, secondary = neutral outline
 */

export const colors = {
  // ============================================
  // NEUTRALS (Structure - 90%)
  // ============================================

  // Backgrounds
  background: '#F5F5F4',           // Warm stone canvas
  backgroundSecondary: '#FFFFFF',  // Cards, modals
  backgroundTertiary: '#F5F5F4',   // Inputs, muted sections
  backgroundElevated: '#FFFFFF',   // Elevated elements

  // Surfaces
  surface: '#FFFFFF',              // Card background
  surface2: '#F5F5F4',             // Secondary surface
  surfaceMuted: '#F5F5F4',         // Input fields, placeholders

  // Dark surface (timer bar, total pill)
  darkSurface: '#2A2A2A',

  // Text
  text: '#1A1A1A',                 // Primary text
  textSecondary: '#888884',        // Labels, descriptions
  textTertiary: '#888884',         // Subtle text (alias)
  textMuted: '#888884',            // Muted text

  // Icons
  iconMuted: '#B0AFA9',            // Inactive icons, placeholders

  // Borders
  border: '#D1D0CE',               // Dividers, card borders
  borderLight: '#E5E5E3',          // Subtle borders
  borderFocus: '#C58B1B',          // Focus state (amber)

  // Base colors
  black: '#1A1A1A',                // For text
  white: '#FFFFFF',

  // ============================================
  // BRAND ACCENT - AMBER (10%)
  // ============================================

  // Amber (primary accent — buttons, active states, highlights)
  primary: '#C58B1B',              // Muted amber
  primaryStrong: '#A67516',        // Darker amber
  primaryPressed: '#8F6513',       // Pressed state
  primarySoft: '#FFF3D6',          // Soft amber background
  primaryLight: '#FFF3D6',         // Light amber tint
  primaryLine: '#F2D28B',          // Amber line/border
  primaryDark: '#A67516',          // Alias

  // Amber semantic aliases
  amber: '#C58B1B',
  amberSoft: '#FFF3D6',
  amberLine: '#F2D28B',

  // ============================================
  // UTILITY GREEN (kept for success feedback only)
  // ============================================

  // Green (success states only — NOT for primary UI)
  accent: '#C58B1B',               // Redirected to amber
  accentLight: '#D4A43A',          // Lighter amber
  accentSoft: '#FFF3D6',           // Soft amber background

  // Green semantic aliases (redirected to amber for consistency)
  green: '#16A34A',                // Pure green — only for success icons
  greenSoft: '#D1FAE5',            // Soft green — only for success bg

  // ============================================
  // FEEDBACK / STATES
  // ============================================
  success: '#16A34A',              // Green for success feedback
  successLight: '#22C55E',
  successSoft: '#D1FAE5',

  warning: '#C58B1B',              // Amber for warnings
  warningDark: '#A67516',
  warningSoft: '#FFF3D6',

  error: '#DC2626',                // Danger (red-600)
  errorLight: '#EF4444',
  errorSoft: 'rgba(220, 38, 38, 0.12)',

  info: '#3B82F6',                 // Blue (rare, links)
  infoDark: '#2563EB',

  // ============================================
  // TIMER STATES
  // ============================================

  // Timer (idle = neutral, running = amber, paused = amber dimmer)
  timerIdle: '#B0AFA9',            // Neutral gray
  timerActive: '#C58B1B',          // Amber for running
  timerPaused: '#D4A43A',          // Lighter amber for paused
  timerBackground: '#FFFFFF',
  timerRing: 'rgba(197, 139, 27, 0.15)',   // Amber ring (subtle)
  timerRingTrack: '#E5E5E3',       // Warm gray track

  // ============================================
  // COMPONENT-SPECIFIC
  // ============================================

  // Cards
  card: '#FFFFFF',
  cardBorder: '#D1D0CE',
  cardPressed: '#F5F5F4',
  cardAccent: '#C58B1B',           // Left accent bar (amber)

  // Tab Bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E5E3',
  tabActive: '#1A1A1A',            // Dark text for active tab
  tabActiveDot: '#C58B1B',         // Amber dot below active label
  tabInactive: '#9CA3AF',          // Muted gray for inactive

  // Header
  header: '#F5F5F4',
  headerText: '#1A1A1A',

  // Inputs
  input: '#F5F5F4',                // Warm stone
  inputBorder: '#D1D0CE',
  inputPlaceholder: '#B0AFA9',     // Warm muted
  inputFocus: '#C58B1B',           // Amber focus ring

  // Buttons (primary = amber, secondary = neutral outline)
  buttonPrimary: '#C58B1B',        // Amber filled
  buttonPrimaryText: '#FFFFFF',    // White text
  buttonSecondary: '#FFFFFF',      // Neutral surface
  buttonSecondaryBorder: '#D1D0CE', // Border
  buttonSecondaryText: '#888884',  // Muted text
  buttonDisabled: '#F5F5F4',       // Surface
  buttonDisabledText: '#B0AFA9',   // Muted

  // Danger button
  buttonDanger: '#DC2626',
  buttonDangerPressed: '#B91C1C',
  buttonDangerText: '#FFFFFF',

  // Map
  mapCircle: 'rgba(197, 139, 27, 0.2)',
  mapCircleBorder: '#C58B1B',

  // Badges
  badgeActive: '#C58B1B',          // Amber for ACTIVE
  badgeActiveText: '#FFFFFF',
  badgeSuccess: '#16A34A',
  badgeWarning: '#C58B1B',
  badgeError: '#DC2626',
  badgeInfo: '#3B82F6',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.4)',          // Standard modal overlay
  overlayHeavy: 'rgba(0, 0, 0, 0.6)',     // High-emphasis overlay
  overlayLight: 'rgba(26, 26, 26, 0.4)',

  // Graph styles
  graphite: '#F5F5F4',             // Background for graphs
  steel: '#E5E5E3',                // Grid lines
  graphBar: '#C58B1B',             // Bar chart color (amber)
  graphBarMuted: '#E5E5E3',        // Empty/no-data bar

  // ============================================
  // WIZARD & INVOICE
  // ============================================
  amberDark: '#D4A017',            // Invoice wizard accent, darker amber
  backgroundWarm: '#F5F5F0',       // Invoice/map warm background variant
  charcoal: '#2C2C2A',            // Dark buttons, wizard backgrounds
  amberSoftWarm: '#FFF8E7',       // Soft amber highlights
  borderWarm: '#D3D1C7',          // Warm gray borders, wizard stepper
  successTeal: '#1D9E75',         // Auto-log status teal
  amberMid: '#F59E0B',            // Amber-500 variant, day off tags
};

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
 * Spacing tokens
 */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  '3xl': 32,
  '4xl': 48,
};

/**
 * Border radius tokens
 */
export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

/**
 * Shadow tokens (soft elevation - neutral)
 */
export const shadows = {
  sm: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 4,
  },
};
