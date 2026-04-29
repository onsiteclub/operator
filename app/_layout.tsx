/**
 * Root layout — boots the SQLite + auth + sync stack and gates routing
 * by auth state.
 *
 * Auth uses the local authStore (ported from onsite-timekeeper). The
 * @onsite/auth shared package is no longer wired in.
 *
 * Routing rules:
 *   - Loading              → ActivityIndicator
 *   - Unauthenticated      → /(auth)/login
 *   - Authenticated, no profile → /(auth)/complete-profile
 *   - Authenticated + profile   → /(tabs)
 */

import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@onsite/tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isLoading = useAuthStore((s) => s.isLoading);
  const profileComplete = useAuthStore((s) => s.profileComplete);
  const initAuth = useAuthStore((s) => s.initialize);

  const router = useRouter();
  const segments = useSegments();
  const hydrateOperator = useOperatorStore((s) => s.hydrate);
  const initDailyLog = useDailyLogStore((s) => s.initialize);
  const initSync = useSyncStore((s) => s.initialize);

  // Boot sequence: persisted operator state + SQLite + auth + daily log + sync.
  useEffect(() => {
    hydrateOperator();
    let teardownSync: (() => void) | undefined;
    (async () => {
      try {
        await initDatabase();
        await initAuth();
        await initDailyLog();
        teardownSync = await initSync();
      } catch (err) {
        console.error('[boot] init failed', err);
      }
    })();
    return () => {
      if (teardownSync) teardownSync();
    };
  }, [hydrateOperator, initAuth, initDailyLog, initSync]);

  // Auth gate: route based on session + profile state.
  useEffect(() => {
    if (!isInitialized || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onCompleteProfile = inAuthGroup && segments[1] === 'complete-profile';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    // Authenticated.
    if (!profileComplete) {
      if (!onCompleteProfile) router.replace('/(auth)/complete-profile');
      return;
    }

    // Authenticated + profile complete — leave auth group.
    if (inAuthGroup) router.replace('/(tabs)');
  }, [isInitialized, isLoading, session, profileComplete, segments, router]);

  if (!isInitialized) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
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
});
