/**
 * Auth Store - OnSite Operator
 *
 * Ported from onsite-timekeeper. Through Onda B this covers:
 *   - email/password sign-in + sign-up
 *   - profile completion (full_name in user_metadata + profiles row)
 *   - phone OTP verification on signup (parked session pattern)
 *   - password reset by phone OTP
 *
 * Deferred:
 *   - OAuth (Google / Apple)       → Onda C
 *   - Account deletion / data wipe → optional later
 *
 * Twilio must be configured in this Supabase project for the OTP
 * paths to actually deliver SMS. Without it the supabase.auth.* calls
 * surface a clear error which the UI shows to the user.
 *
 * The store keeps the same shape downstream consumers (dailyLogStore,
 * syncStore, invoiceStore) rely on, so this stays a drop-in
 * replacement for the older shim.
 */

import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';
import type { Session, User, Subscription } from '@supabase/supabase-js';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

// ============================================
// MODULE-LEVEL SUBSCRIPTIONS (cleanup handles)
// ============================================

let authSubscription: Subscription | null = null;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

// ============================================
// PENDING SESSION (parked while phone OTP is being verified)
// ============================================
// signUp() with phone defers session commit until the OTP is verified.
// We keep the not-yet-committed session here in module scope so back-button
// or cold restart don't bypass verification: a regular getSession() call
// won't see this — only verifyPhoneOtp() promotes it into the store.
let _pendingSession: Session | null = null;
let _pendingUser: User | null = null;

// ============================================
// HELPERS
// ============================================

function isSupabaseConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  return url.length > 0 && key.length > 0;
}

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

  // OTP / phone verification state
  pendingPhoneVerification: boolean;
  pendingPasswordReset: boolean;
  pendingVerificationPhone: string | null;
  otpResendCount: number;
  otpResendCooldownEnd: number | null;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string; phone?: string },
  ) => Promise<{ success: boolean; needsConfirmation?: boolean; needsPhoneVerification?: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  checkProfile: () => Promise<void>;
  updateProfile: (firstName: string, lastName: string) => Promise<{ success: boolean; error?: string }>;

  // OTP / password reset
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
  session: null,
  user: null,
  isLoading: true,
  isInitialized: false,
  error: null,
  profileComplete: false,
  cachedFullName: null,

  pendingPhoneVerification: false,
  pendingPasswordReset: false,
  pendingVerificationPhone: null,
  otpResendCount: 0,
  otpResendCooldownEnd: null,

  initialize: async () => {
    logger.info('boot', 'Initializing auth store');
    set({ isLoading: true, error: null });

    try {
      if (!isSupabaseConfigured()) {
        logger.warn('auth', 'Supabase not configured — running in offline mode');
        set({ isLoading: false, isInitialized: true });
        return;
      }

      // Existing session?
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        logger.error('auth', 'Error getting session', { error: error.message });
        set({ isLoading: false, isInitialized: true, error: error.message });
        return;
      }

      if (session) {
        set({ session, user: session.user });
        // Resolve profile completeness for the gate.
        await get().checkProfile();
      }

      // Re-init safety: tear down old listeners before re-subscribing.
      if (authSubscription) {
        authSubscription.unsubscribe();
        authSubscription = null;
      }
      if (appStateSubscription) {
        appStateSubscription.remove();
        appStateSubscription = null;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        logger.info('auth', `Auth state change: ${event}`);

        if (event === 'SIGNED_IN' && newSession) {
          // Block session commit while phone OTP is pending — the signUp
          // flow parks the session in _pendingSession until verifyPhoneOtp().
          if (get().pendingPhoneVerification) {
            logger.info('auth', 'Ignoring SIGNED_IN during pending OTP');
            return;
          }
          set({ session: newSession, user: newSession.user, error: null });
          await get().checkProfile();
        }
        if (event === 'SIGNED_OUT') {
          set({ session: null, user: null, profileComplete: false, cachedFullName: null });
        }
        if (event === 'TOKEN_REFRESHED' && newSession) {
          set({ session: newSession, user: newSession.user });
        }
      });
      authSubscription = subscription;

      // Refresh session when the app foregrounds.
      appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
          void get().refreshSession();
        }
      });

      set({ isLoading: false, isInitialized: true });
    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Error initializing auth', { error: errorMsg });
      set({ isLoading: false, isInitialized: true, error: errorMsg });
    }
  },

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
        set({ isLoading: false, error: error.message });
        return { success: false, error: error.message };
      }

      if (data.session) {
        // Set session first; checkProfile may read it. Keep isLoading true so
        // the navigation guard doesn't fire before profileComplete is resolved.
        set({ session: data.session, user: data.session.user, error: null });
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

  signUp: async (email, password, metadata) => {
    // Don't flip global isLoading here — caller manages its own loading state
    // (avoids _layout re-renders that can remount the auth screen).
    set({ error: null });

    if (!email?.trim()) {
      return { success: false, error: 'Email is required' };
    }

    const phone = metadata?.phone;

    // Set pendingPhoneVerification BEFORE signUp call. The Supabase
    // SIGNED_IN event fires immediately on sign-up; without this flag the
    // auth gate would route the user past the OTP step into /(tabs).
    if (phone) {
      set({ pendingPhoneVerification: true, pendingVerificationPhone: phone });
    }

    try {
      if (!isSupabaseConfigured()) {
        if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: false, error: 'Supabase not configured' };
      }

      const signUpOptions: Record<string, unknown> = {};
      if (metadata) {
        signUpOptions.data = {
          first_name: metadata.firstName,
          last_name: metadata.lastName,
          full_name: `${metadata.firstName} ${metadata.lastName}`,
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: signUpOptions,
      });

      if (error) {
        logger.error('auth', 'Sign up error', { error: error.message });
        if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        set({ error: error.message });
        return { success: false, error: error.message };
      }

      // Empty identities array signals a duplicate email signup.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: false, error: 'already_registered' };
      }

      if (data.session) {
        // Phone provided → DEFER session commit until OTP is verified. Park
        // session/user in module refs so isAuthenticated() stays false and
        // back / cold-restart cannot bypass verification.
        if (phone) {
          _pendingSession = data.session;
          _pendingUser = data.session.user;
          set({ error: null });

          try {
            const { error: phoneError } = await supabase.auth.updateUser({ phone });
            if (phoneError) {
              logger.warn('auth', 'Phone OTP send failed after signup', { error: phoneError.message });
              _pendingSession = null;
              _pendingUser = null;
              try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
              set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
              return { success: false, error: phoneError.message };
            }
            return { success: true, needsPhoneVerification: true };
          } catch (e) {
            logger.warn('auth', 'Phone registration exception', { error: String(e) });
            _pendingSession = null;
            _pendingUser = null;
            try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* noop */ }
            set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
            return { success: false, error: String(e) };
          }
        }

        // No phone — commit session immediately.
        set({ session: data.session, user: data.session.user, error: null });
        await get().checkProfile();
        return { success: true, needsConfirmation: false };
      }

      // Email confirmation required (no session yet).
      if (data.user && !data.session) {
        if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
        return { success: true, needsConfirmation: true };
      }

      if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
      return { success: false, error: 'Unknown error during sign up' };
    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Sign up exception', { error: errorMsg });
      if (phone) set({ pendingPhoneVerification: false, pendingVerificationPhone: null });
      set({ error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  signOut: async () => {
    set({ isLoading: true });

    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      logger.error('auth', 'Sign out error', { error: String(error) });
    } finally {
      set({
        session: null,
        user: null,
        isLoading: false,
        error: null,
        profileComplete: false,
        cachedFullName: null,
      });
    }
  },

  refreshSession: async () => {
    if (!isSupabaseConfigured()) return;

    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) {
        const msg = error.message.toLowerCase();
        const isNetworkError = msg.includes('network') || msg.includes('fetch') || msg.includes('timeout');
        if (isNetworkError) {
          logger.warn('auth', 'Session refresh failed (network) — keeping session');
          return;
        }
        logger.warn('auth', 'Session refresh failed (token) — forcing re-login');
        set({ session: null, user: null, profileComplete: false, cachedFullName: null });
        return;
      }
      if (session) set({ session, user: session.user });
    } catch (error) {
      logger.error('auth', 'Session refresh exception (keeping session)', { error: String(error) });
    }
  },

  checkProfile: async () => {
    const user = get().user;
    if (!user || !isSupabaseConfigured()) {
      set({ profileComplete: false });
      return;
    }

    try {
      // Fast path: user_metadata
      const metadata = user.user_metadata;
      if (metadata?.full_name) {
        set({ profileComplete: true, cachedFullName: metadata.full_name });
        return;
      }

      // Fallback: profiles view
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single();

      if (!error && data?.full_name) {
        set({ profileComplete: true, cachedFullName: data.full_name });
        return;
      }

      // Last-resort: refresh user from Supabase (metadata may be stale).
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser?.user_metadata?.full_name) {
          set({
            user: freshUser,
            profileComplete: true,
            cachedFullName: freshUser.user_metadata.full_name,
          });
          return;
        }
      } catch {
        // ignored
      }

      set({ profileComplete: false, cachedFullName: null });
    } catch (error) {
      logger.error('auth', 'checkProfile failed', { error: String(error) });
      // Keep previous profileComplete on error — don't lock users out on a flaky network.
    }
  },

  updateProfile: async (firstName, lastName) => {
    const user = get().user;
    if (!user || !isSupabaseConfigured()) {
      return { success: false, error: 'Not authenticated' };
    }

    const fullName = `${firstName} ${lastName}`;

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, email: user.email, full_name: fullName },
          { onConflict: 'id' },
        );

      if (profileError) {
        logger.error('auth', 'Profile upsert failed', { error: profileError.message });
        return { success: false, error: profileError.message };
      }

      const { error: metaError } = await supabase.auth.updateUser({
        data: { first_name: firstName, last_name: lastName, full_name: fullName },
      });
      if (metaError) {
        logger.warn('auth', 'user_metadata update failed (profile saved anyway)', {
          error: metaError.message,
        });
      }

      // Refresh local user object so cachedFullName reflects the change.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) set({ session, user: session.user });

      set({ profileComplete: true, cachedFullName: fullName });
      return { success: true };
    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'updateProfile exception', { error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  // ============================================
  // PHONE OTP — signup verification
  // ============================================

  verifyPhoneOtp: async (phone, token) => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'phone_change',
      });
      if (error) {
        logger.warn('auth', 'Phone OTP verification failed', { error: error.message });
        return { error: error.message };
      }

      logger.info('auth', 'Phone verified successfully');

      // Promote the parked session into the store now that OTP is verified.
      if (_pendingSession && _pendingUser) {
        set({ session: _pendingSession, user: _pendingUser, error: null });
        _pendingSession = null;
        _pendingUser = null;
      }

      // Refresh user to capture latest metadata.
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) set({ user: freshUser });
      } catch {
        // keep existing user object
      }

      // Persist phone + full_name into the profiles row. The Supabase
      // on-signup trigger only writes id/email/phone/full_name from the
      // auth metadata; this upsert covers cases where the trigger missed
      // the metadata write or full_name was set later.
      const user = get().user;
      if (user) {
        const fullName = user.user_metadata?.full_name || null;
        try {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              email: user.email,
              phone,
              ...(fullName ? { full_name: fullName } : {}),
            },
            { onConflict: 'id' },
          );
        } catch (e) {
          logger.warn('auth', 'Failed to save profile after OTP', { error: String(e) });
        }
      }

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

    if (otpResendCount >= 3) {
      return { error: 'Maximum attempts reached. Contact support at contact@onsiteclub.ca' };
    }
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
      return { error: null };
    } catch (e) {
      logger.error('auth', 'sendPhoneOtp exception', { error: String(e) });
      return { error: 'Failed to send code. Please try again.' };
    }
  },

  // ============================================
  // PHONE OTP — password reset
  // ============================================

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
      // Successful verification establishes a session — required for the
      // updateUser({ password }) call in updatePasswordAfterReset.
      if (data.session) {
        set({ session: data.session, user: data.session.user });
      }
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
      set({
        pendingPasswordReset: false,
        pendingVerificationPhone: null,
        otpResendCount: 0,
        otpResendCooldownEnd: null,
      });
      return { error: null };
    } catch (e) {
      logger.error('auth', 'updatePasswordAfterReset exception', { error: String(e) });
      return { error: 'Failed to update password. Please try again.' };
    }
  },

  clearOtpState: () => {
    // Destroy any uncommitted Supabase session so a cold restart can't
    // bypass verification by hydrating it via getSession().
    if (_pendingSession) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => { /* best-effort */ });
      _pendingSession = null;
      _pendingUser = null;
    }
    set({
      pendingPhoneVerification: false,
      pendingPasswordReset: false,
      pendingVerificationPhone: null,
      otpResendCount: 0,
      otpResendCooldownEnd: null,
    });
  },

  getUserId: () => get().user?.id ?? null,
  getUserEmail: () => get().user?.email ?? null,
  getUserName: () => get().cachedFullName,
  isAuthenticated: () => !!get().session,
}));

/**
 * Boot-time hydration entry-point.
 * Kept for backwards compat with existing app/_layout.tsx call sites.
 */
export async function hydrateAuth(): Promise<void> {
  await useAuthStore.getState().initialize();
}
