/**
 * @onsite/auth-ui — Shared types for auth screens.
 *
 * These types are platform-agnostic. Both native and web components use them.
 */

import type { UserRole } from '@onsite/auth';

/** Profile data collected during signup. */
export interface SignupProfile {
  firstName: string;
  lastName: string;
  /** Date of birth in YYYY-MM-DD format */
  dateOfBirth?: string;
  /** Trade/occupation (from ref_trades or free text) */
  trade?: string;
  /** Gender: male, female, or undeclared */
  gender?: 'male' | 'female' | 'undeclared';
  /** @deprecated Use firstName + lastName instead */
  name: string;
}

/** Configuration for the auth flow. */
export interface AuthFlowConfig {
  /** App name shown in the header (e.g., "Field", "Timekeeper", "Club") */
  appName: string;

  /** Official logo shown at the top of the auth screen. Replaces the icon circle when provided. */
  logo?: React.ReactNode;

  /** Custom icon for the brand circle. If omitted, shows first letter of appName. Ignored when logo is set. */
  icon?: React.ReactNode;

  /** Whether to show signup option. Default: false */
  showSignup?: boolean;

  /** Whether to show forgot password link. Default: true */
  showForgotPassword?: boolean;

  /** Default role for new signups. Default: 'worker' */
  defaultRole?: UserRole;

  /** Subtitle text shown below app name. Default: "Sign in to continue" */
  subtitle?: string;

  /** Footer text. Default: "OnSite Club — Built for the trades" */
  footer?: string;

  /** Legal links shown in signup mode */
  legal?: {
    termsUrl: string;
    privacyUrl: string;
  };

  /** Render props for icons (avoids hard dependency on @expo/vector-icons) */
  icons?: {
    email?: React.ReactNode;
    lock?: React.ReactNode;
    eyeOpen?: React.ReactNode;
    eyeClosed?: React.ReactNode;
  };

  /** Available trades for signup dropdown. If not provided, trade field shows as free text. */
  trades?: Array<{ id: string; name: string }>;
}

/** Callbacks for auth actions. Auto-wired from useAuth() if inside AuthProvider. */
export interface AuthFlowCallbacks {
  /** Sign in handler. Throw on error. */
  onSignIn?: (email: string, password: string) => Promise<void>;

  /** Sign up handler. Return { needsConfirmation } if email verification is needed. Throw on error. */
  onSignUp?: (
    email: string,
    password: string,
    profile: SignupProfile
  ) => Promise<{ needsConfirmation?: boolean }>;

  /** Forgot password handler. Throw on error. */
  onForgotPassword?: (email: string) => Promise<void>;

  /** Called after successful auth (sign in or sign up without confirmation). */
  onSuccess?: () => void;
}

/** Auth flow screen modes */
export type AuthScreenMode = 'login' | 'signup' | 'forgot-password' | 'email-sent';

/** Combined props for the full AuthFlow component */
export interface AuthFlowProps extends AuthFlowConfig, AuthFlowCallbacks {
  /** Starting screen. Default: 'login' */
  initialScreen?: 'login' | 'signup';

  /** Current authenticated user (if any). When set, AuthFlow returns null (already logged in). */
  user?: unknown;

  /** Whether auth state is still loading. Shows spinner when true. */
  authLoading?: boolean;
}
