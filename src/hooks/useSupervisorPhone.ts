/**
 * useSupervisorPhone — Zustand store for the contact number that
 * receives supervisor alerts (low fuel / broken / maintenance).
 *
 * Stored in AsyncStorage because this is a per-device setting for the
 * independent operator. No cross-device sync yet — if the user
 * reinstalls, they re-enter it. We store the E.164-normalized form so
 * the alert payload is always send-ready, and surface the original
 * digits for display formatting.
 *
 * IMPORTANT: This is a SHARED store — every component that calls the
 * hook subscribes to the same state. Saving in one screen (e.g.
 * Settings) immediately propagates to the other (e.g. Machine).
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePhoneE164 } from '../lib/format';

const KEY = 'onsite_operator.supervisor_phone';

interface SupervisorPhoneState {
  phone: string | null;
  loaded: boolean;
  hydrate: () => Promise<void>;
  save: (raw: string) => Promise<void>;
}

const useSupervisorPhoneStore = create<SupervisorPhoneState>((set) => ({
  phone: null,
  loaded: false,
  hydrate: async () => {
    const value = await AsyncStorage.getItem(KEY);
    set({ phone: value, loaded: true });
  },
  save: async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      await AsyncStorage.removeItem(KEY);
      set({ phone: null });
      return;
    }
    const e164 = normalizePhoneE164(trimmed);
    await AsyncStorage.setItem(KEY, e164);
    set({ phone: e164 });
  },
}));

let hydrated = false;

export function useSupervisorPhone() {
  const phone = useSupervisorPhoneStore((s) => s.phone);
  const loaded = useSupervisorPhoneStore((s) => s.loaded);
  const hydrate = useSupervisorPhoneStore((s) => s.hydrate);
  const save = useSupervisorPhoneStore((s) => s.save);

  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    hydrate();
  }, [hydrate]);

  return { phone, loaded, save };
}
