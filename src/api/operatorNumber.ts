/**
 * Operator phone number — fetch and provision.
 * Thin typed wrapper around the provision-number Edge Function.
 */

import { supabase } from '../lib/supabase';

export interface OperatorNumber {
  phone_e164: string;
  status: 'active' | 'released' | 'suspended';
  provisioned_at: string;
}

export async function fetchOperatorNumber(): Promise<OperatorNumber | null> {
  const { data, error } = await supabase
    .from('frm_operator_numbers')
    .select('phone_e164, status, provisioned_at')
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('fetchOperatorNumber:', error);
    return null;
  }
  return data;
}

export async function provisionOperatorNumber(areaCode = '613'): Promise<OperatorNumber> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Not authenticated');

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/provision-number`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ area_code: areaCode, country: 'CA' }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }

  const result = (await res.json()) as { phone_e164: string; reused: boolean };
  return {
    phone_e164: result.phone_e164,
    status: 'active',
    provisioned_at: new Date().toISOString(),
  };
}

export function formatPhoneUS(e164: string): string {
  // +16139001234 -> +1 (613) 900-1234
  const match = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (!match) return e164;
  return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
}
