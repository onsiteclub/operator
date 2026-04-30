/**
 * Auth Store - OnSite Operator
 *
 * Ported VERBATIM from onsite-timekeeper. Two adaptations only:
 *   - removed `trackMetric` import (operator has no per-user analytics);
 *     the app_opens tracking call is replaced with a no-op block
 *   - dynamic imports of `bootstrap`/`locationStore`/`resetDatabase`
 *     stay wrapped in try/catch (operator stubs cover them)
 *
 * Same flow as timekeeper:
 *   - email/password sign-in + sign-up
 *   - profile completion (full_name in user_metadata + profiles row)
 *   - phone OTP verification on signup (parked session pattern)
 *   - password reset by phone OTP
 *   - Google + Apple social sign-in (native on iOS/Android, OAuth
 *     redirect on web)
 */

import { create } from 'zustand';
import { AppState, AppStateStatus } from 'react-native';
import { logger } from '../lib/logger';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { initDatabase } from '../lib/database';
import { setBackgroundUserId, clearBackgroundUserId } from '../lib/backgroundHelpers';
import { captureMessage } from '../lib/sentry';
import type { Session, User, Subscription } from '@supabase/supabase-js';

// ============================================
// MODULE-LEVEL SUBSCRIPTIONS (for cleanup)
// ============================================
let authSubscription: Subscription | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ============================================
// PENDING SESSION (uncommitted until phone OTP verified)
// ============================================
// Holds the Supabase session created by signUp() until the user completes
// phone verification. Session is NOT committed to the Zustand store while
// pending — this prevents isAuthenticated() from returning true during OTP.
// (Module refs for pending session/user removed — the new phone-first
// signup flow never produces a session until verifyOtp succeeds, so
// there's nothing to park. The pendingPhoneVerification flag in store
// state is enough for the onAuthStateChange guard to ignore stray
// SIGNED_IN events during the OTP step.)

// ============================================
// TYPES
// ============================================

export interface AuthState {
  // State
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  profileComplete: boolean;
  cachedFullName: string | null;

  // OTP State (Phone Verification)
  pendingPhoneVerification: boolean;
  pendingPasswordReset: boolean;
  pendingVerificationPhone: string | null;
  otpResendCount: number;
  otpResendCooldownEnd: number | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, metadata?: { firstName: string; lastName: string; phone?: string }) => Promise<{ success: boolean; needsConfirmation?: boolean; needsPhoneVerification?: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  signInWithApple: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
  refreshSession: () => Promise<void>;
  checkProfile: () => Promise<void>;
  updateProfile: (firstName: string, lastName: string) => Promise<{ success: boolean; error?: string }>;

  // OTP Actions
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  sendPhoneOtp: (phone: string) => Promise<{ error: string | null }>;
  resetPasswordWithPhone: (phone: string) => Promise<{ error: string | null }>;
  verifyResetOtp: (phone: string, token: string) => Promise<{ error: string | null }>;
  updatePasswordAfterReset: (newPassword: string) => Promise<{ error: string | null }>;
  clearOtpState: () => void;

  // Helpers
  getUserId: () => string | null;
  getUserEmail: () => string | null;
  getUserName: () => string | null;
  isAuthenticated: () => boolean;
}

// ============================================
// STORE
// ============================================

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  session: null,
  user: null,
  isLoading: true,
  isInitialized: false,
  error: null,
  profileComplete: false,
  cachedFullName: null,

  // OTP initial state
  pendingPhoneVerification: false,
  pendingPasswordReset: false,
  pendingVerificationPhone: null,
  otpResendCount: 0,
  otpResendCooldownEnd: null,

  // ============================================
  // INITIALIZE
  // ============================================
  initialize: async () => {
    logger.info('boot', '🔐 Initializing auth store...');
    set({ isLoading: true, error: null });

    try {
      // Initialize database first
      await initDatabase();

      // Check if Supabase is configured
      if (!isSupabaseConfigured()) {
        logger.warn('auth', 'Supabase not configured - running in offline mode');
        set({ isLoading: false, isInitialized: true });
        return;
      }

      // Get existing session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        logger.error('auth', 'Error getting session', { error: error.message });
        set({ isLoading: false, isInitialized: true, error: error.message });
        return;
      }

      if (session) {
        logger.info('auth', `✅ Session found: ${__DEV__ ? session.user.email : 'user_' + session.user.id.slice(0, 8)}`);
        set({ session, user: session.user });

        // Set userId for background tasks (no-op in operator)
        await setBackgroundUserId(session.user.id);

        // operator: no per-user metrics tracking (timekeeper tracks app_opens here)
      } else {
        logger.info('auth', 'No active session');
      }

      // Clean up previous subscriptions (safety for re-init)
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
      }

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        logger.info('auth', `Auth state change: ${event}`);

        if (event === 'SIGNED_IN' && newSession) {
          // Block session commit while phone OTP is pending. The signUp flow
          // parks the session in _pendingSession until OTP is verified.
          if (get().pendingPhoneVerification) {
            logger.info('auth', 'Ignoring SIGNED_IN during pending OTP');
            return;
          }
          set({ session: newSession, user: newSession.user, error: null });
          await setBackgroundUserId(newSession.user.id);
        }

        if (event === 'SIGNED_OUT') {
          set({ session: null, user: null });
          await clearBackgroundUserId();
        }

        if (event === 'TOKEN_REFRESHED' && newSession) {
          set({ session: newSession, user: newSession.user });
        }
      });
      authSubscription = subscription;

      // Setup app state listener for session refresh only (not tracking)
      appStateSubscription = AppState.addEventListener('change', async (state: AppStateStatus) => {
        if (state === 'active') {
          // Refresh session when app becomes active
          await get().refreshSession();
        }
      });

      set({ isLoading: false, isInitialized: true });
      logger.info('boot', '✅ Auth store initialized');

    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Error initializing auth', { error: errorMsg });
      set({ isLoading: false, isInitialized: true, error: errorMsg });
    }
  },

  // ============================================
  // SIGN IN
  // ============================================
  signIn: async (email, password) => {
    set({ isLoading: true, error: null });

    try {
      if (!isSupabaseConfigured()) {
        set({ isLoading: false });
        return { success: false, error: 'Supabase not configured' };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        logger.error('auth', 'Sign in error', { error: error.message });
        captureMessage('Auth: sign-in failed', {
          level: 'info',
          tags: { security: 'auth' },
          extra: { reason: error.message.includes('Invalid') ? 'invalid_credentials' : 'auth_error' },
        });
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      if (data.session) {
        logger.info('auth', `✅ Signed in: ${__DEV__ ? data.session.user.email : 'user_' + data.session.user.id.slice(0, 8)}`);

        // Set session/user first (needed by checkProfile), but keep isLoading=true
        // so the navigation guard doesn't fire before profileComplete is resolved.
        set({
          session: data.session,
          user: data.session.user,
          error: null,
        });

        await setBackgroundUserId(data.session.user.id);

        // Check profile BEFORE clearing isLoading — prevents race condition
        // where navigation guard sees profileComplete=false and redirects
        // to complete-profile before checkProfile can resolve.
        await get().checkProfile();

        set({ isLoading: false });
        return { success: true };
      }

      set({ isLoading: false });
      return { success: false, error: 'No session returned' };

    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Sign in exception', { error: errorMsg });
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // SIGN UP
  // ============================================
  signUp: async (email, password, metadata?) => {
    // FIX: Don't set global isLoading here. The component manages its own
    // loading state via setIsLoading prop. Setting global isLoading triggers
    // _layout.tsx re-renders and navigation guard effects, which can cause
    // expo-router to remount the AuthScreen and reset step state to 'email'.
    set({ error: null });

    if (!email?.trim()) {
      logger.error('auth', 'Sign up attempted without email');
      return { success: false, error: 'Email is required' };
    }

    const phone = metadata?.phone;

    // CRITICAL: Set pendingPhoneVerification BEFORE signUp call.
    // This prevents the nav guard race condition: signUp triggers
    // onAuthStateChange SIGNED_IN → nav guard fires → redirects away
    // from AuthScreen before OTP step can show.
    if (phone) {
      set({ pendingPhoneVerification: true, pendingVerificationPhone: phone });
    }

    try {
      if (!isSupabaseConfigured()) {
        if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: false, error: 'Supabase not configured' };
      }

      // CRITICAL: this Supabase project is shared across multiple apps
      // (operator, checklist, invoicepass, …) and the email template
      // is project-global — branded "InvoicePass". Calling
      // `supabase.auth.signUp()` from the client would therefore send
      // a misleading "Confirm your email — InvoicePass" message to
      // operator customers, with a link defaulting to the first entry
      // of uri_allow_list (also invoicepass).
      //
      // Workaround: route signup through the signup-operator Edge
      // Function, which uses the admin API with `email_confirm: true`
      // — short-circuiting the entire confirmation-email flow. No
      // email of any kind is sent to operator customers. The user is
      // created with phone unconfirmed; we then sign them in with
      // password and verify the phone via the existing Twilio Verify
      // SMS round-trip. InvoicePass and other sibling apps are
      // untouched.
      if (!phone) {
        // The operator UX always collects a phone — guard explicitly
        // so we don't silently regress to email-only accounts.
        return { success: false, error: 'Phone is required' };
      }

      const { data: signupResp, error: signupErr } = await supabase.functions.invoke('signup-operator', {
        body: {
          email: email.trim().toLowerCase(),
          password,
          phone,
          firstName: metadata?.firstName,
          lastName: metadata?.lastName,
        },
      });

      if (signupErr) {
        logger.error('auth', 'signup-operator invoke failed', { error: signupErr.message });
        set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        // The functions client returns FunctionsHttpError for non-2xx; try
        // to surface the function's structured error code from the body.
        const ctxBody = (signupErr as { context?: { body?: unknown } }).context?.body;
        const fnError = typeof ctxBody === 'string'
          ? (() => { try { return JSON.parse(ctxBody); } catch { return null; } })()
          : ctxBody;
        const code = (fnError as { error?: string })?.error;
        if (code === 'already_registered') return { success: false, error: 'already_registered' };
        return { success: false, error: signupErr.message };
      }
      if ((signupResp as { error?: string })?.error === 'already_registered') {
        set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: false, error: 'already_registered' };
      }

      logger.info('auth', 'Account created via admin API; sending phone OTP');

      // Trigger Twilio Verify SMS for the phone we just attached. The
      // user was created with phone unconfirmed; signInWithOtp({ phone })
      // on an existing-with-phone user sends an SMS OTP that, when
      // verified, both confirms the phone and establishes the session.
      // No prior session is needed — we never call signInWithPassword
      // here, so the only auth event that fires is SIGNED_IN after
      // verifyOtp succeeds.
      //
      // pendingPhoneVerification is already set above; the
      // onAuthStateChange guard will block any spurious SIGNED_IN until
      // verifyPhoneOtp clears the flag.
      try {
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        });
        if (otpErr) {
          logger.warn('auth', 'Phone OTP send failed after signup', { error: otpErr.message });
          set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
          return { success: false, error: otpErr.message };
        }
        logger.info('auth', 'OTP sent to phone for verification');
        return { success: true, needsPhoneVerification: true };
      } catch (e) {
        logger.warn('auth', 'Phone registration exception', { error: String(e) });
        set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: false, error: String(e) };
      }
    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Sign up exception', { error: errorMsg });
      if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
      set({ error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // SIGN IN WITH GOOGLE (native)
  // ============================================
  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const { signInWithGoogle } = await import('../lib/oauth');
      const result = await signInWithGoogle();

      if (result.success) {
        // onAuthStateChange will commit session (pendingPhoneVerification=false
        // for OAuth flows, so the SIGNED_IN handler doesn't ignore it).
        await get().checkProfile();
        set({ isLoading: false });
        return result;
      }

      set({ isLoading: false, error: result.error ?? null });
      return result;
    } catch (e) {
      const errorMsg = String(e);
      logger.error('auth', 'signInWithGoogle exception', { error: errorMsg });
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // SIGN IN WITH APPLE (iOS native)
  // ============================================
  signInWithApple: async () => {
    set({ isLoading: true, error: null });
    try {
      const { signInWithApple } = await import('../lib/oauth');
      const result = await signInWithApple();

      if (result.success) {
        await get().checkProfile();
        set({ isLoading: false });
        return result;
      }

      set({ isLoading: false, error: result.error ?? null });
      return result;
    } catch (e) {
      const errorMsg = String(e);
      logger.error('auth', 'signInWithApple exception', { error: errorMsg });
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // SIGN OUT
  // ============================================
  signOut: async () => {
    set({ isLoading: true });

    try {
      // Clear Google cached credential so next sign-in shows account picker
      try {
        const { signOutFromGoogle } = await import('../lib/oauth');
        await signOutFromGoogle();
      } catch {
        // non-fatal — continue with Supabase signout
      }

      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }

      await clearBackgroundUserId();

      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
        profileComplete: false,
        cachedFullName: null,
        pendingPhoneVerification: false,
        pendingPasswordReset: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });

      logger.info('auth', '👋 Signed out');

    } catch (error) {
      logger.error('auth', 'Sign out error', { error: String(error) });

      // Force clear ALL state even on error (must match success path)
      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
        profileComplete: false,
        cachedFullName: null,
        pendingPhoneVerification: false,
        pendingPasswordReset: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });
    }
  },

  // ============================================
  // DELETE ACCOUNT
  // ============================================
  deleteAccount: async () => {
    set({ isLoading: true, error: null });

    try {
      logger.warn('auth', '🗑️ Account deletion initiated');

      // 1. Stop background tasks (no-op stub in operator)
      try {
        const { onUserLogout } = await import('../lib/bootstrap');
        await onUserLogout();
      } catch {
        // module may not exist — skip
      }

      // 2. Clear local SQLite data (operator may not export resetDatabase)
      try {
        const dbModule: any = await import('../lib/database');
        if (typeof dbModule.resetDatabase === 'function') {
          await dbModule.resetDatabase();
        }
      } catch {
        // best-effort — continue with remote delete
      }

      // 3. Call Supabase RPC to delete remote data + auth user
      if (isSupabaseConfigured()) {
        const { error } = await supabase.rpc('delete_user_account');
        if (error) {
          logger.error('auth', 'RPC delete_user_account failed', { error: error.message });
          // Continue anyway - local data is already cleared
        }
      }

      // 4. Clear background userId
      await clearBackgroundUserId();

      // 5. Clear auth state
      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
      });

      logger.info('auth', '✅ Account deleted successfully');
      return { success: true };

    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Account deletion failed', { error: errorMsg });
      set({ isLoading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // REFRESH SESSION
  // ============================================
  refreshSession: async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        const msg = error.message.toLowerCase();
        const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('timeout');

        if (isNetworkError) {
          // Network error — keep current session, don't force logout
          logger.warn('auth', 'Session refresh failed (network). Keeping session.', { error: error.message });
          return;
        }

        // Token error (expired, revoked, invalid) — force re-login
        logger.warn('auth', 'Session refresh failed (token). Forcing re-login.', { error: error.message });
        captureMessage('Session refresh: token invalid, forcing re-login', {
          level: 'warning',
          tags: { security: 'session' },
          extra: { error: error.message },
        });
        set({ session: null, user: null });
        return;
      }

      if (session) {
        set({ session, user: session.user });
      }
    } catch (error) {
      // Network-level exception (e.g. no connectivity) — keep session
      logger.error('auth', 'Session refresh exception (keeping session)', { error: String(error) });
    }
  },

  // ============================================
  // PROFILE
  // ============================================
  checkProfile: async () => {
    const user = get().user;
    if (!user || !isSupabaseConfigured()) {
      set({ profileComplete: false });
      return;
    }

    try {
      // First check user_metadata (fastest, no network)
      const metadata = user.user_metadata;
      if (metadata?.full_name) {
        set({ profileComplete: true, cachedFullName: metadata.full_name });
        return;
      }

      // Fallback: check profiles table in Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (!error && data?.full_name) {
        set({ profileComplete: true, cachedFullName: data.full_name });
        logger.info('auth', `Profile found: ${data.full_name}`);
        return;
      }

      // Last resort: refresh user from Supabase (metadata may be stale in store)
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser?.user_metadata?.full_name) {
          set({ user: freshUser, profileComplete: true, cachedFullName: freshUser.user_metadata.full_name });
          logger.info('auth', `Profile found after refresh: ${freshUser.user_metadata.full_name}`);
          return;
        }
      } catch {
        // Ignore refresh errors
      }

      set({ profileComplete: false, cachedFullName: null });
      logger.info('auth', 'Profile incomplete — name missing');
    } catch (error) {
      logger.error('auth', 'checkProfile failed', { error: String(error) });
      // On error, keep previous profileComplete state instead of forcing true.
      // If user was previously known to have a complete profile, they keep access.
      // If this is a fresh session (profileComplete=false), they'll be asked once online.
    }
  },

  updateProfile: async (firstName, lastName) => {
    const user = get().user;
    if (!user || !isSupabaseConfigured()) {
      return { success: false, error: 'Not authenticated' };
    }

    const fullName = `${firstName} ${lastName}`;

    try {
      // 1. Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: fullName,
        }, { onConflict: 'id' });

      if (profileError) {
        logger.error('auth', 'Profile upsert failed', { error: profileError.message });
        return { success: false, error: profileError.message };
      }

      // 2. Update user_metadata
      const { error: metaError } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      });

      if (metaError) {
        logger.warn('auth', 'user_metadata update failed (profile saved)', { error: metaError.message });
      }

      // 3. Refresh local user object
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        set({ session, user: session.user });
      }

      set({ profileComplete: true, cachedFullName: fullName });
      logger.info('auth', `Profile updated: ${fullName}`);
      return { success: true };
    } catch (error) {
      logger.error('auth', 'updateProfile failed', { error: String(error) });
      return { success: false, error: String(error) };
    }
  },

  // ============================================
  // OTP METHODS (Phone Verification)
  // ============================================

  verifyPhoneOtp: async (phone, token) => {
    try {
      // Type is 'sms' because admin createUser left the phone in the
      // unconfirmed state — this OTP is the initial confirmation of an
      // existing phone, not a phone change. (The previous flow used
      // signUp + updateUser({ phone }), which produced a 'phone_change'
      // token; that path is gone now.)
      const { data: verifyData, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) {
        logger.warn('auth', 'Phone OTP verification failed', { error: error.message });
        return { error: error.message };
      }

      logger.info('auth', 'Phone verified successfully');

      // Commit the session that verifyOtp returned. We must clear
      // pendingPhoneVerification BEFORE setting session/user, otherwise
      // the onAuthStateChange guard would still treat the SIGNED_IN
      // event from this verifyOtp as parked and ignore it.
      set({
        pendingPhoneVerification: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });

      if (verifyData?.session && verifyData?.user) {
        set({ session: verifyData.session, user: verifyData.user, error: null });
        await setBackgroundUserId(verifyData.user.id);
      }

      // Refresh user to get latest metadata (may have changed since signup)
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) {
          set({ user: freshUser });
        }
      } catch {
        // Continue with existing user object
      }

      // Save phone + full_name to profiles table
      // full_name was set in user_metadata during signup but the Supabase
      // trigger only creates profiles with id/email — so we must write it here
      const user = get().user;
      if (user) {
        const fullName = user.user_metadata?.full_name || null;
        try {
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            phone,
            ...(fullName ? { full_name: fullName } : {}),
          }, { onConflict: 'id' });
        } catch (e) {
          logger.warn('auth', 'Failed to save profile after OTP', { error: String(e) });
        }
      }

      // Complete the flow: check profile + clear OTP state
      await get().checkProfile();
      set({
        pendingPhoneVerification: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });

      return { error: null };
    } catch (e) {
      logger.error('auth', 'verifyPhoneOtp exception', { error: String(e) });
      return { error: 'Verification failed. Please try again.' };
    }
  },

  sendPhoneOtp: async (phone) => {
    const { otpResendCount, otpResendCooldownEnd } = get();

    // Enforce max 3 resends
    if (otpResendCount >= 3) {
      return { error: 'Maximum attempts reached. Contact support at contact@onsiteclub.ca' };
    }

    // Enforce 60s cooldown
    if (otpResendCooldownEnd && Date.now() < otpResendCooldownEnd) {
      const remaining = Math.ceil((otpResendCooldownEnd - Date.now()) / 1000);
      return { error: `Please wait ${remaining}s before resending` };
    }

    try {
      const { error } = await supabase.auth.updateUser({ phone });
      if (error) {
        logger.warn('auth', 'Resend OTP failed', { error: error.message });
        return { error: error.message };
      }

      set({
        otpResendCount: otpResendCount + 1,
        otpResendCooldownEnd: Date.now() + 60_000,
      });

      logger.info('auth', 'OTP resent successfully');
      return { error: null };
    } catch (e) {
      logger.error('auth', 'sendPhoneOtp exception', { error: String(e) });
      return { error: 'Failed to send code. Please try again.' };
    }
  },

  resetPasswordWithPhone: async (phone) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) {
        logger.warn('auth', 'Password reset OTP failed', { error: error.message });
        return { error: error.message };
      }

      set({
        pendingPasswordReset: true,
        pendingVerificationPhone: phone,
        otpResendCount: 0,
        otpResendCooldownEnd: Date.now() + 60_000,
      });

      logger.info('auth', 'Password reset OTP sent');
      return { error: null };
    } catch (e) {
      logger.error('auth', 'resetPasswordWithPhone exception', { error: String(e) });
      return { error: 'Failed to send reset code. Please try again.' };
    }
  },

  verifyResetOtp: async (phone, token) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) {
        logger.warn('auth', 'Reset OTP verification failed', { error: error.message });
        return { error: error.message };
      }

      // Session is established after successful verification
      if (data.session) {
        set({ session: data.session, user: data.session.user });
      }

      logger.info('auth', 'Reset OTP verified — session established');
      return { error: null };
    } catch (e) {
      logger.error('auth', 'verifyResetOtp exception', { error: String(e) });
      return { error: 'Verification failed. Please try again.' };
    }
  },

  updatePasswordAfterReset: async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        logger.warn('auth', 'Password update failed', { error: error.message });
        return { error: error.message };
      }

      // Clear OTP + password reset state
      set({
        pendingPasswordReset: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });

      logger.info('auth', 'Password updated successfully');
      return { error: null };
    } catch (e) {
      logger.error('auth', 'updatePasswordAfterReset exception', { error: String(e) });
      return { error: 'Failed to update password. Please try again.' };
    }
  },

  clearOtpState: () => {
    // Local sign-out as a belt-and-braces: in the new phone-first
    // signup flow no session exists pre-verification, but the password
    // reset flow does briefly create one between verifyResetOtp and
    // updatePasswordAfterReset — backing out at that point should drop
    // it so a cold restart can't hydrate via getSession().
    supabase.auth.signOut({ scope: 'local' }).catch(() => { /* best-effort */ });
    set({
      pendingPhoneVerification: false,
      pendingPasswordReset: false,
      pendingVerificationPhone: null,
      otpResendCount: 0,
      otpResendCooldownEnd: null,
    });
  },

  // ============================================
  // HELPERS (BACKWARD COMPATIBLE)
  // ============================================
  getUserId: () => {
    return get().user?.id || null;
  },

  getUserEmail: () => {
    return get().user?.email || null;
  },

  getUserName: () => {
    // Priority: cachedFullName (from profiles table) > user_metadata > email prefix
    const { user, cachedFullName } = get();
    if (!user) return null;

    if (cachedFullName) return cachedFullName;

    const metadata = user.user_metadata;
    if (metadata?.full_name) return metadata.full_name;
    if (metadata?.name) return metadata.name;
    if (metadata?.display_name) return metadata.display_name;

    if (user.email) return user.email.split('@')[0];
    return null;
  },

  isAuthenticated: () => {
    const state = get();
    // Block authentication while phone OTP verification is pending.
    // This prevents nav guard, login effects, and store init from firing
    // before the user completes phone verification.
    return !!state.session && !state.pendingPhoneVerification;
  },
}));
