/**
 * @onsite/auth/mobile — React hook for Expo apps auth gate.
 *
 * Encapsulates: initAuthCore → check session → listen for changes.
 * Returns { isReady, isAuthenticated } for the app to handle routing.
 *
 * Usage in _layout.tsx:
 *   const { isReady, isAuthenticated } = useAuthGate(asyncStorage, supabase);
 */

import { useState, useEffect } from 'react';
import {
  initAuthCore,
  onAuthStateChange,
  getUserId,
  type StorageAdapter,
  type SupabaseAuthClient,
} from './core';

export interface AuthGateState {
  isReady: boolean;
  isAuthenticated: boolean;
}

/**
 * Hook that bootstraps auth and tracks session state.
 *
 * @param storage - AsyncStorage adapter (from createAuthStorage)
 * @param supabase - Supabase client (from createMobileClient)
 */
export function useAuthGate(
  storage: StorageAdapter,
  supabase: SupabaseAuthClient,
): AuthGateState {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function bootstrap() {
      try {
        initAuthCore(storage, supabase);

        const userId = await getUserId();
        setIsAuthenticated(!!userId);

        unsubscribe = onAuthStateChange((session: unknown) => {
          setIsAuthenticated(!!session);
        });
      } catch (e) {
        console.warn('[AuthGate] Auth init failed:', e);
      } finally {
        setIsReady(true);
      }
    }

    bootstrap();
    return () => {
      unsubscribe?.();
    };
  }, []);

  return { isReady, isAuthenticated };
}
