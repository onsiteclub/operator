/**
 * useSupervisorPhone — local-only pref for the contact number that
 * receives supervisor alerts (low fuel / broken / maintenance).
 *
 * Stored in AsyncStorage because this is a per-device setting for the
 * independent operator. No cross-device sync yet — if the user
 * reinstalls, they re-enter it. We store the E.164-normalized form so
 * the alert payload is always send-ready, and surface the original
 * digits for display formatting.
 */

import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizePhoneE164 } from '../lib/format';

const KEY = 'onsite_operator.supervisor_phone';

export function useSupervisorPhone() {
  const [phone, setPhone] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY).then((value) => {
      if (!alive) return;
      setPhone(value);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  const save = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      await AsyncStorage.removeItem(KEY);
      setPhone(null);
      return;
    }
    const e164 = normalizePhoneE164(trimmed);
    await AsyncStorage.setItem(KEY, e164);
    setPhone(e164);
  }, []);

  return { phone, loaded, save };
}
