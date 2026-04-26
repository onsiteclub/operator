/**
 * Auth Store — operator app shim.
 *
 * Timekeeper has a full-featured authStore (sign in/up, OTP, social).
 * Operator already handles auth via @onsite/auth at the app shell level.
 * For phase 1 we only need the bare minimum the ported timekeeper code
 * (dailyLogStore, syncStore, invoiceStore in later phases) expects:
 *
 *   useAuthStore.getState().getUserId() → string | null
 *
 * Both apps read the same Supabase session, so calling
 * supabase.auth.getUser() in both places agrees on identity.
 *
 * The cached `userId` is hydrated by `hydrateAuth()` (called once at boot
 * from app/_layout.tsx) and refreshed on every Supabase auth state change.
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface AuthState {
  userId: string | null;
  setUserId: (id: string | null) => void;
  getUserId: () => string | null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  setUserId: (id) => set({ userId: id }),
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
    useAuthStore.getState().setUserId(data.user?.id ?? null);
  } catch {
    useAuthStore.getState().setUserId(null);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setUserId(session?.user?.id ?? null);
  });
}
