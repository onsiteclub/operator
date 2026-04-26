/**
 * Auth Store - OnSite Operator
 *
 * Adapted from onsite-timekeeper. This is the **Onda A** version:
 * email/password sign-in + sign-up + profile completion only.
 *
 * Deferred:
 *   - OAuth (Google / Apple)        → Onda C
 *   - Phone OTP signup / reset      → Onda B
 *   - Account deletion / data wipe  → optional later
 *
 * The store keeps the same shape downstream consumers (dailyLogStore,
 * syncStore, invoiceStore) already rely on, so this is a drop-in
 * replacement for the earlier auth shim.
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

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    metadata?: { firstName: string; lastName: string },
  ) => Promise<{ success: boolean; needsConfirmation?: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  checkProfile: () => Promise<void>;
  updateProfile: (firstName: string, lastName: string) => Promise<{ success: boolean; error?: string }>;

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

    try {
      if (!isSupabaseConfigured()) {
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
        set({ error: error.message });
        return { success: false, error: error.message };
      }

      // Empty identities array signals a duplicate email signup.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return { success: false, error: 'already_registered' };
      }

      if (data.session) {
        set({ session: data.session, user: data.session.user, error: null });
        await get().checkProfile();
        return { success: true, needsConfirmation: false };
      }

      // Email confirmation required (no session yet).
      if (data.user && !data.session) {
        return { success: true, needsConfirmation: true };
      }

      return { success: false, error: 'Unknown error during sign up' };
    } catch (error) {
      const errorMsg = String(error);
      logger.error('auth', 'Sign up exception', { error: errorMsg });
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
