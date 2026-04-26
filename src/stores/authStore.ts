/**
 * Auth Store — operator app shim.
 *
 * Timekeeper has a full-featured authStore (sign in/up, OTP, social).
 * Operator already handles auth via @onsite/auth at the app shell level.
 * For the timesheet/invoice port we only need a couple of read-only
 * shapes that ported timekeeper code expects:
 *
 *   useAuthStore.getState().getUserId()    → string | null
 *   useAuthStore.getState().user           → User-like { id, email } | null
 *   useAuthStore.getState().cachedFullName → string | null  (XMP metadata)
 *
 * Both apps read the same Supabase session, so calling
 * supabase.auth.getUser() in both places agrees on identity.
 *
 * The cached values are hydrated by `hydrateAuth()` (called once at boot
 * from app/_layout.tsx) and refreshed on every Supabase auth state change.
 */

import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  userId: string | null;
  user: User | null;
  cachedFullName: string | null;
  setUserId: (id: string | null) => void;
  setUser: (user: User | null) => void;
  getUserId: () => string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  user: null,
  cachedFullName: null,
  setUserId: (id) => set({ userId: id }),
  setUser: (user) => {
    const meta = user?.user_metadata ?? {};
    const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim()
      || (user?.email ?? null);
    set({
      user,
      userId: user?.id ?? null,
      cachedFullName: fullName || null,
    });
  },
  getUserId: () => get().userId,
}));

let hydrated = false;

/**
 * Boot-time hydration — reads current Supabase session, caches user id,
 * and subscribes to auth state changes so the store stays current.
 * Idempotent.
 */
export async function hydrateAuth(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  try {
    const { data } = await supabase.auth.getUser();
    useAuthStore.getState().setUser(data.user ?? null);
  } catch {
    useAuthStore.getState().setUser(null);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setUser(session?.user ?? null);
  });
}
