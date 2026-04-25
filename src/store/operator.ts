/**
 * Operator Zustand store — persisted via AsyncStorage + synced to Supabase
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = '@operator_state';

interface OperatorState {
  isOnline: boolean;
  machineDownReason: string | null;
  availableSince: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setOnline: () => void;
  setOffline: (reason: string) => void;
}

async function persistAndSync(state: Pick<OperatorState, 'isOnline' | 'machineDownReason' | 'availableSince'>) {
  // Persist locally
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});

  // Sync to Supabase
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('frm_operator_state')
    .upsert({
      operator_id: user.id,
      status: state.isOnline ? 'online' : 'offline',
      reason: state.isOnline ? null : state.machineDownReason,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'operator_id' })
    .catch(() => {});
}

export const useOperatorStore = create<OperatorState>((set, get) => ({
  isOnline: true,
  machineDownReason: null,
  availableSince: new Date().toISOString(),
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({ ...saved, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setOnline: () => {
    const next = {
      isOnline: true,
      machineDownReason: null,
      availableSince: new Date().toISOString(),
    };
    set(next);
    persistAndSync(next);
  },

  setOffline: (reason) => {
    const next = {
      isOnline: false,
      machineDownReason: reason,
      availableSince: null,
    };
    set(next);
    persistAndSync(next);
  },
}));
