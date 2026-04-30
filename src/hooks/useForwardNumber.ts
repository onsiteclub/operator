/**
 * useForwardNumber — fetch/save the personal cellphone that receives
 * inbound calls forwarded from the operator's Twilio line.
 *
 * Stored on frm_operator_numbers.forward_to_e164 (server-side, not
 * AsyncStorage) because the voice-forward Edge Function looks it up at
 * call time. The operator types it once in Settings, the Twilio webhook
 * reads it whenever a worker dials in.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizePhoneE164 } from '../lib/format';

export function useForwardNumber() {
  const [phone, setPhone] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const operatorId = authData.user?.id;
    if (!operatorId) {
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('frm_operator_numbers')
      .select('forward_to_e164')
      .eq('operator_id', operatorId)
      .eq('status', 'active')
      .order('provisioned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('useForwardNumber load:', error);
    }
    setPhone((data?.forward_to_e164 as string | null) ?? null);
    setLoaded(true);
  }, []);

  const save = useCallback(async (raw: string) => {
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const operatorId = authData.user?.id;
      if (!operatorId) throw new Error('Not signed in');

      const trimmed = raw.trim();
      const next = trimmed ? normalizePhoneE164(trimmed) : null;

      const { error } = await supabase
        .from('frm_operator_numbers')
        .update({ forward_to_e164: next })
        .eq('operator_id', operatorId)
        .eq('status', 'active');
      if (error) throw error;

      setPhone(next);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { phone, loaded, saving, save, reload: load };
}
