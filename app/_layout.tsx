/**
 * Root layout — boots the SQLite + auth + sync stack and gates routing
 * by auth state. Navigation guard ported from onsite-timekeeper to
 * support the full auth flow (phone OTP, password reset, expired session
 * banner).
 *
 * Routing rules:
 *   - Boot                            → splash with logo + spinner
 *   - Phone OTP / password reset      → stay on (auth), skip redirects
 *   - Unauthenticated                 → /(auth)/login (with `expired=true`
 *                                        if user was previously logged in)
 *   - Authenticated, no profile       → /(auth)/complete-profile
 *   - Authenticated + profile         → /(tabs)
 */

import { useEffect, useRef, useState } from 'react';
import { View, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '../src/constants/colors';
import { useOperatorStore } from '../src/store/operator';
import { initDatabase } from '../src/lib/database';
import { useAuthStore } from '../src/stores/authStore';
import { useDailyLogStore } from '../src/stores/dailyLogStore';
import { useSyncStore } from '../src/stores/syncStore';
import { Snackbar } from '../src/components/ui/Snackbar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, retry: 2 },
  },
});

const logoOnsite = require('../assets/logo_onsite.png');

// Safety net: catch unhandled promise rejections that crash Android/Hermes
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).addEventListener === 'function') {
  (globalThis as any).addEventListener('unhandledrejection', (event: any) => {
    console.error('[boot] Unhandled promise rejection', String(event?.reason));
    event?.preventDefault?.();
  });
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <AppContent />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const authLoading = useAuthStore((s) => s.isLoading);
  const authInitialized = useAuthStore((s) => s.isInitialized);
  const profileComplete = useAuthStore((s) => s.profileComplete);
  const pendingPhoneVerification = useAuthStore((s) => s.pendingPhoneVerification);
  const pendingPasswordReset = useAuthStore((s) => s.pendingPasswordReset);
  const initAuth = useAuthStore((s) => s.initialize);

  const hydrateOperator = useOperatorStore((s) => s.hydrate);
  const initDailyLog = useDailyLogStore((s) => s.initialize);
  const initSync = useSyncStore((s) => s.initialize);

  const initRef = useRef(false);
  const userSessionRef = useRef<string | null>(null);

  // Boot sequence
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let teardownSync: (() => void) | undefined;
    (async () => {
      try {
        hydrateOperator();
        await initDatabase();
        await initAuth();
        await initDailyLog();
        teardownSync = await initSync();
      } catch (err) {
        console.error('[boot] init failed', err);
      } finally {
        setIsReady(true);
      }
    })();

    return () => {
      if (teardownSync) teardownSync();
    };
  }, [hydrateOperator, initAuth, initDailyLog, initSync]);

  // Track current user session id for the "expired" banner heuristic.
  useEffect(() => {
    const user = useAuthStore.getState().user;
    if (user && userSessionRef.current !== user.id) {
      userSessionRef.current = user.id;
    }
  }, [isAuthenticated]);

  // Navigation guard — ported from timekeeper.
  // setTimeout(0) defers replace() to next tick so <Stack> finishes mounting.
  // navigationState?.key can be truthy before the Stack registers — setTimeout(0)
  // ensures we run after React commits the layout (Stack mount).
  useEffect(() => {
    if (!isReady || authLoading || !navigationState?.key) return;

    // OTP: Skip all redirects while user is verifying phone or resetting password
    if (pendingPhoneVerification || pendingPasswordReset) return;

    const inAuthGroup = segments[0] === '(auth)';

    const timer = setTimeout(() => {
      if (!isAuthenticated && !inAuthGroup) {
        // Pass expired param if user was previously logged in (session expiry)
        const wasLoggedIn = userSessionRef.current !== null;
        if (wasLoggedIn) {
          router.replace({ pathname: '/(auth)/login', params: { expired: 'true' } });
        } else {
          router.replace('/(auth)/login');
        }
      } else if (isAuthenticated && !profileComplete && (segments as string[])[1] !== 'complete-profile') {
        router.replace('/(auth)/complete-profile');
      } else if (isAuthenticated && profileComplete && inAuthGroup) {
        router.replace('/(tabs)');
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isReady, authLoading, isAuthenticated, profileComplete, pendingPhoneVerification, pendingPasswordReset, segments, navigationState?.key, router]);

  // Use authInitialized (not authLoading) for the render guard.
  // authLoading flips during signIn/signUp, which would unmount AuthScreen
  // and cause state loss (step resets to 'login' → user loses signup progress).
  // authInitialized only flips false during initial bootstrap → safe full-screen splash.
  if (!isReady || !authInitialized) {
    return (
      <View style={styles.loading}>
        <Image source={logoOnsite} style={styles.splashLogo} resizeMode="contain" />
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Snackbar />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  splashLogo: {
    width: 180,
    height: 62,
    marginBottom: 32,
  },
});
