/**
 * Supabase Client - OnSite Operator
 *
 * Configuration with storage adapter compatible with React Native
 * (AsyncStorage) and Web (localStorage). Reads credentials from env or
 * Constants.expoConfig.extra (for EAS builds).
 */

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// 1. process.env - works in Expo Go with .env
// 2. Constants.expoConfig.extra - works in EAS Build
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.warn(
    '⚠️ Supabase credentials not configured!\n' +
    'For Expo Go: Create a .env file\n' +
    'For EAS Build: Add to app.json extra\n' +
    'EXPO_PUBLIC_SUPABASE_URL=your_url\n' +
    'EXPO_PUBLIC_SUPABASE_ANON_KEY=your_key'
  );
}

const customStorage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => {
        if (typeof window !== 'undefined') {
          return Promise.resolve(window.localStorage.getItem(key));
        }
        return Promise.resolve(null);
      },
      setItem: (key: string, value: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
        return Promise.resolve();
      },
    }
  : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web: needs to be true so the OAuth callback (Apple/Google → Supabase
    // callback → back to our origin with tokens in the URL hash) gets
    // parsed and the session is set. Mobile: native flows hand us the ID
    // token directly, no URL fragment to parse.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/**
 * Whether Supabase is configured (URL + anon key present).
 * Used by authStore to short-circuit when running offline-only.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}
